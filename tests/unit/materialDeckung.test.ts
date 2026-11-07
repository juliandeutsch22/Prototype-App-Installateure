/**
 * DIE DECKUNGSRECHNUNG (M04b, E13) — eine Funktion für Formular, Woche,
 * Tag, Monat und Startseite.
 *
 * Geprüft wird die Mengensemantik der Bauplanung (K02): eine Menge deckt
 * nicht zwei Bedarfe, die eigene Liste zählt nicht gegen sich, bestellt,
 * zugesagt und vorhanden bleiben getrennt. Dazu die ERHALTUNG: wo die
 * bisherigen Rechnungen (`ruestFehlt`, `nochAnzufordern` aus
 * `ruestFehlmenge.ts`) richtig rechneten, kommt dieselbe Zahl heraus — ihr
 * Wortlaut steht unten als Referenz. Und der BEFUND der Monatsvorschau: wo
 * sie anders rechnete, zeigt der Test das richtige Ergebnis.
 */
import { describe, it, expect } from 'vitest';
import {
  deckeListe,
  deckungJeEinsatz,
  formularDeckung,
  tagZusammenfassen,
  zusammenfassen,
  MATERIAL_FEHLER,
  type DeckungsEingang,
} from '@/features/assignments/materialDeckung';
import { ruestZeile } from '@/features/assignments/monatsVorschau';
import { deckungAusRoh, type DeckungsDaten } from '@/lib/db/pg/materialdeckung';

const TAG = '2026-11-12';

/* ── Die bisherigen Rechnungen, Wort für Wort (ruestFehlmenge.ts bis M04a) ── */
function alteFehlt(menge: number, verfuegbar: number): number {
  return Math.max(0, Math.round((menge - Math.max(verfuegbar, 0)) * 1000) / 1000);
}
function alteNochAnzufordern(menge: number, angefordert: number, verfuegbar: number): number {
  return Math.max(0, Math.round((alteFehlt(menge, verfuegbar) - angefordert) * 1000) / 1000);
}
/** Die Monatsvorschau bis M04a: `frei` aus `lager_frei`, die eigene VOLLE Menge zurück. */
function alteMonatsZeile(positionen: { materialId?: string; menge: number }[], frei: Map<string, number>): number {
  const eigene = new Map<string, number>();
  for (const p of positionen) if (p.materialId) eigene.set(p.materialId, (eigene.get(p.materialId) ?? 0) + p.menge);
  return positionen.filter((p) => {
    if (!p.materialId || !frei.has(p.materialId)) return false;
    const da = frei.get(p.materialId)! + (eigene.get(p.materialId) ?? 0);
    return Math.max(0, p.menge - Math.max(da, 0)) > 0;
  }).length;
}

const eine = (p: Partial<DeckungsEingang> & { menge: number }, frei: number, extra: Partial<Parameters<typeof deckeListe>[1]> = {}) =>
  deckeListe([{ id: 'p1', materialId: 'm1', ...p }], { datum: TAG, freiVor: new Map([['m1', frei]]), ...extra })[0];

describe('Erhaltung: eine Liste ohne Wettbewerb rechnet wie `ruestFehlt` und `nochAnzufordern`', () => {
  /*
    Für die einzige Liste ist das Freie vor ihr genau, was das Formular
    bisher als „für diese Liste frei“ rechnete: `lager_frei.frei` plus der
    eigene Rest aus dem Regal.
  */
  const faelle: [menge: number, angefordert: number, frei: number][] = [
    [3, 0, 1], [3, 0, 5], [3, 2, 1], [5, 2, 1], [6, 0, 0], [6, 6, 0], [2.5, 0, 1], [4, 1, -3], [1, 0, 1],
  ];
  it.each(faelle)('Menge %s, angefordert %s, frei %s', (menge, angefordert, frei) => {
    const d = eine({ menge, angefordert }, frei);
    expect(d.imLagerFehlt).toBe(alteFehlt(menge, frei));
    expect(d.fehlt).toBe(alteNochAnzufordern(menge, angefordert, frei));
    expect(d.freiDavor).toBe(Math.max(frei, 0));
  });

  it('eine freie Zeile hat keinen Bestand — keine Fehlmenge, sondern „Bestand unbekannt“', () => {
    const [d] = deckeListe([{ id: 'f', menge: 3 }], { datum: TAG, freiVor: new Map() });
    expect(d).toMatchObject({ zustand: 'unbekannt', text: 'Bestand unbekannt', fehlt: 0, imLagerFehlt: 0 });
  });
});

describe('K02: eine Menge deckt nicht zwei Bedarfe', () => {
  it('zwei Baustellen konkurrieren um dieselbe Menge — die frühere ist gedeckt, die spätere fehlt', () => {
    // Bestand 10; Montag 8, Freitag 8. Frei vor Montag 10, vor Freitag 10 − 8 = 2.
    const montag = eine({ menge: 8 }, 10);
    const freitag = eine({ menge: 8 }, 2);
    expect(montag).toMatchObject({ zustand: 'erledigt', text: 'gedeckt', fehlt: 0 });
    expect(freitag).toMatchObject({ zustand: 'achtung', text: 'fehlt 6', fehlt: 6 });
    // Summiert fehlt genau, was `lager_frei` unter null zeigt (10 − 16 = −6): verteilt, nicht neu gerechnet.
    expect(montag.fehlt + freitag.fehlt).toBe(6);
  });

  it('Gegenprobe: die bisherige Rechnung (alle Reservierungen gegen jede Liste) meldete beide', () => {
    const frei = 10 - 16;
    expect(alteFehlt(8, frei + 8)).toBe(6);
    expect(alteFehlt(8, frei + 8)).toBe(6);
  });

  it('Eigenreservierung ohne Doppelzählung: zwei Positionen desselben Artikels teilen das Freie', () => {
    const ps = deckeListe(
      [{ id: 'a', materialId: 'm1', menge: 3 }, { id: 'b', materialId: 'm1', menge: 3 }],
      { datum: TAG, freiVor: new Map([['m1', 5]]) },
    );
    expect(ps.map((p) => [p.zustand, p.fehlt])).toEqual([['erledigt', 0], ['achtung', 1]]);
    // Bisher sah jede Position die ganzen 5 — keine Fehlmenge, obwohl 6 gebraucht werden.
    expect(alteFehlt(3, 5)).toBe(0);
  });

  it('der Zulauf deckt nach demselben Vorrang: was eine frühere Liste nahm, ist weg', () => {
    const zulauf = new Map([['m1', [{ menge: 8, bestellt: true, termin: '2026-11-10' }]]]);
    // Bestand 0; zwei Listen zu je 6, für das Lager sind 8 bestellt.
    const erste = eine({ menge: 6 }, 0, { zulauf });
    const zweite = eine({ menge: 6 }, -6, { zulauf });
    expect(erste).toMatchObject({ zustand: 'laeuft', text: 'wird geliefert bis 10.11.', ausZulauf: 6, fehlt: 0 });
    expect(zweite).toMatchObject({ zustand: 'achtung', text: 'fehlt 4', ausZulauf: 2, fehlt: 4 });
  });
});

describe('Bestellt, zugesagt und vorhanden bleiben getrennt', () => {
  const anf = (x: Partial<NonNullable<DeckungsEingang['anf']>>) => ({
    angefordert: 0, abgeholt: 0, bereit: 0, bestellt: 0, termin: null, terminOffen: false, aufListe: 0, offen: 0, ...x,
  });

  it('Teilabholung: der abgeholte Teil ist gedeckt, das Regal deckt nur den Rest', () => {
    expect(eine({ menge: 6, anf: anf({ angefordert: 2, abgeholt: 2 }) }, 4)).toMatchObject({ zustand: 'erledigt', fehlt: 0, ausRegal: 4 });
    expect(eine({ menge: 6, anf: anf({ angefordert: 2, abgeholt: 2 }) }, 3)).toMatchObject({ zustand: 'achtung', fehlt: 1 });
  });

  it('Storno: ist die Anforderung gelöscht, reserviert die Position wieder ganz', () => {
    expect(eine({ menge: 6, anf: anf({ angefordert: 6, bereit: 6 }) }, 0)).toMatchObject({ zustand: 'erledigt', fehlt: 0 });
    expect(eine({ menge: 6 }, 0)).toMatchObject({ zustand: 'achtung', fehlt: 6 });
  });

  it('Retoure: zurückgegebene Ware erhöht das Freie — aus „fehlt“ wird „gedeckt“', () => {
    expect(eine({ menge: 4 }, 1).zustand).toBe('achtung');
    expect(eine({ menge: 4 }, 1 + 3).zustand).toBe('erledigt');
  });

  it('unbekannter Liefertermin: läuft, mit Text', () => {
    const d = eine({ menge: 2, anf: anf({ angefordert: 2, bestellt: 2, terminOffen: true }) }, 0);
    expect(d).toMatchObject({ zustand: 'laeuft', text: 'bestellt, Liefertermin unbekannt', terminUnbekannt: true });
    expect(zusammenfassen([d])?.text).toBe('Material bestellt, Liefertermin unbekannt');
  });

  it('Liefertermin nach dem Einsatztag: Achtung', () => {
    const d = eine({ menge: 2, anf: anf({ angefordert: 2, bestellt: 2, termin: '2026-11-14' }) }, 0);
    expect(d).toMatchObject({ zustand: 'achtung', text: 'Lieferung erst am 14.11.' });
  });

  it('rechtzeitig bestellt: läuft bis zum spätesten Termin', () => {
    const ps = deckeListe(
      [
        { id: 'a', materialId: 'm1', menge: 2, anf: anf({ angefordert: 2, bestellt: 2, termin: '2026-11-10' }) },
        { id: 'b', materialId: 'm2', menge: 1, anf: anf({ angefordert: 1, bestellt: 1, termin: '2026-11-11' }) },
      ],
      { datum: TAG, freiVor: new Map() },
    );
    expect(zusammenfassen(ps)).toMatchObject({ zustand: 'laeuft', text: 'Material wird geliefert bis 11.11.' });
  });

  it('angefordert, aber noch nicht bestellt: offen — auch auf der Einkaufsliste für das Lager', () => {
    expect(eine({ menge: 2, anf: anf({ angefordert: 2, offen: 2 }) }, 0)).toMatchObject({ zustand: 'offen', text: 'angefordert, noch nicht bestellt' });
    const zulauf = new Map([['m1', [{ menge: 5, bestellt: false, termin: null }]]]);
    expect(eine({ menge: 2 }, 0, { zulauf })).toMatchObject({ zustand: 'offen', text: 'auf der Einkaufsliste, noch nicht bestellt', fehlt: 0 });
  });

  it('ein Katalogartikel, der nicht im Lager geführt wird, nennt die zu bestellende Menge', () => {
    const d = eine({ menge: 3 }, 0, { lagerartikel: new Map([['m1', false]]) });
    expect(d).toMatchObject({ zustand: 'achtung', text: 'nicht im Lager geführt – 3 zu bestellen', fehlt: 3, nichtGefuehrt: true });
  });

  it('eingeladen ist gedeckt und nimmt dem Regal nichts mehr', () => {
    const ps = deckeListe(
      [{ id: 'a', materialId: 'm1', menge: 4, gebucht: true }, { id: 'b', materialId: 'm1', menge: 2 }],
      { datum: TAG, freiVor: new Map([['m1', 2]]) },
    );
    expect(ps.map((p) => [p.zustand, p.text])).toEqual([['erledigt', 'eingeladen'], ['erledigt', 'gedeckt']]);
  });
});

describe('Zusammengefasst — je Einsatz und je Tag, mit Text', () => {
  it('das Schlimmste bestimmt; ohne Positionen nichts', () => {
    expect(zusammenfassen([])).toBeNull();
    const ps = deckeListe(
      [{ id: 'a', materialId: 'm1', menge: 1 }, { id: 'b', materialId: 'm2', menge: 5 }, { id: 'c', menge: 1 }],
      { datum: TAG, freiVor: new Map([['m1', 3], ['m2', 1]]) },
    );
    expect(zusammenfassen(ps)).toEqual({ zustand: 'achtung', text: 'Material fehlt: 1 Position', achtung: 1 });
    expect(zusammenfassen(ps.slice(0, 1))?.text).toBe('Material bereit');
    expect(zusammenfassen([ps[0], ps[2]])?.text).toBe('Material bereit, 1 ohne Lagerbestand');
    expect(zusammenfassen([ps[2]])?.text).toBe('Material: Bestand unbekannt');
  });

  it('ein Tag zählt die Einsätze', () => {
    const fehlt = { zustand: 'achtung' as const, text: 'x', achtung: 2 };
    const bereit = { zustand: 'erledigt' as const, text: 'x', achtung: 0 };
    expect(tagZusammenfassen([])).toBeNull();
    expect(tagZusammenfassen([fehlt, bereit, null])?.text).toBe('Material fehlt bei 1 Einsatz');
    expect(tagZusammenfassen([bereit, bereit])?.text).toBe('Material für alle Einsätze bereit');
    expect(tagZusammenfassen([bereit, MATERIAL_FEHLER])?.zustand).toBe('fehler');
  });
});

/* Die Antwort der Datenbank für einen Tag mit zwei Listen, wie `materialdeckung` sie gibt. */
const ROH = {
  heute: '2026-11-08',
  listen: [
    {
      id: 'l-montag', datum: TAG, baustelle: '2026-001', frei_vor: { m1: 10 },
      positionen: [{ id: 'p1', material: 'm1', menge: 8, gebucht: false, anf: null }],
    },
    {
      id: 'l-freitag', datum: TAG, baustelle: '2026-002', frei_vor: { m1: 2, m2: 0 },
      positionen: [
        { id: 'p1', material: 'm1', menge: 8, gebucht: false, anf: null },
        { id: 'p2', material: 'm2', menge: 2, gebucht: false,
          anf: { angefordert: 2, abgeholt: 0, bereit: 0, bestellt: 2, termin: null, termin_offen: true, auf_liste: 0, offen: 0 } },
        { id: 'p3', material: null, menge: 1, gebucht: false, anf: null },
      ],
    },
  ],
  lagerartikel: { m1: true, m2: true },
  zulauf: {},
  fuer: { liste: 'l-freitag', frei_vor: { m1: 2, m2: 0 } },
};

describe('Dieselbe Zahl in Woche, Monat und Formular', () => {
  const daten: DeckungsDaten = deckungAusRoh(ROH);

  it('liest die Antwort der Datenbank', () => {
    expect(daten.listen[1].positionen[1].anf).toMatchObject({ bestellt: 2, terminOffen: true });
    expect(daten.listen[1].positionen[2].materialId).toBeUndefined();
    expect(daten.fuer).toEqual({ liste: 'l-freitag', freiVor: new Map([['m1', 2], ['m2', 0]]) });
  });

  it('Woche (je Einsatz), Monat (Zeile) und Formular nennen dieselbe Fehlmenge', () => {
    const je = deckungJeEinsatz(daten);
    const woche = je.get(`${TAG}|2026-002`)!;
    expect(woche.lage).toEqual({ zustand: 'achtung', text: 'Material fehlt: 1 Position', achtung: 1 });
    expect(je.get(`${TAG}|2026-001`)!.lage?.text).toBe('Material bereit');

    const monat = ruestZeile(ROH.listen[1].positionen, woche);
    expect(monat).toBe('3 Positionen · 1 mit Fehlmenge');

    const formular = formularDeckung(
      TAG,
      [{ id: 'p1', materialId: 'm1', menge: 8 }, { id: 'p2', materialId: 'm2', menge: 2, angefordert: 2 }, { id: 'p3', menge: 1 }],
      daten,
      () => undefined,
    );
    expect([...formular.values()].filter((d) => d.zustand === 'achtung')).toHaveLength(woche.lage!.achtung);
    expect(formular.get('p2')).toMatchObject({ zustand: 'laeuft', text: 'bestellt, Liefertermin unbekannt' });
  });

  it('Monatszeile ohne Deckung nennt nur die Positionen', () => {
    expect(ruestZeile(ROH.listen[1].positionen, null)).toBe('3 Positionen');
    expect(ruestZeile([], null)).toBe('keine');
    expect(ruestZeile(undefined, null)).toBe('keine');
  });
});

describe('Befund: die Monatsvorschau rechnete anders (bis M04a)', () => {
  it('meldete die frühere von zwei konkurrierenden Listen als Fehlmenge — richtig ist: gedeckt', () => {
    // lager_frei: 10 − 8 − 8 = −6; die Vorschau zählte die eigene Menge zurück: −6 + 8 = 2 < 8.
    expect(alteMonatsZeile([{ materialId: 'm1', menge: 8 }], new Map([['m1', -6]]))).toBe(1);
    const montag = deckungJeEinsatz(deckungAusRoh(ROH)).get(`${TAG}|2026-001`)!;
    expect(ruestZeile(ROH.listen[0].positionen, montag)).toBe('1 Position');
  });

  it('sah nicht, dass eine Anforderung erst nach dem Einsatztag geliefert wird — richtig ist: Fehlmenge', () => {
    // Bestand 0, die Position ganz über eine Anforderung: sie reserviert nichts, frei 0, die Vorschau sah 0 + 2.
    expect(alteMonatsZeile([{ materialId: 'm1', menge: 2 }], new Map([['m1', 0]]))).toBe(0);
    const ps = deckeListe(
      [{ id: 'a', materialId: 'm1', menge: 2,
         anf: { angefordert: 2, abgeholt: 0, bereit: 0, bestellt: 2, termin: '2026-11-20', terminOffen: false, aufListe: 0, offen: 0 } }],
      { datum: TAG, freiVor: new Map([['m1', 0]]) },
    );
    expect(ruestZeile([{}], { positionen: ps })).toBe('1 Position · 1 mit Fehlmenge');
  });

  it('zählte die volle Menge statt des Restes aus dem Regal zurück — mit Anforderung zu viel frei', () => {
    // Bestand 4, Menge 6, 2 über eine noch nicht bestellte Anforderung; eine spätere Liste reserviert 4.
    // lager_frei: 4 − 4 − 4 = −4; die Vorschau: −4 + 6 = 2 → „fehlt 4“, gezählt.
    expect(alteMonatsZeile([{ materialId: 'm1', menge: 6 }], new Map([['m1', -4]]))).toBe(1);
    // Richtig: vor dieser Liste ist alles frei (die andere ist später) — 4 aus dem Regal, 2 angefordert.
    const d = eine({ menge: 6, angefordert: 2 }, 4);
    expect(d).toMatchObject({ zustand: 'offen', fehlt: 0 });
  });
});

describe('Formular ohne Antwort der Datenbank', () => {
  it('rechnet mit dem Bestand des Artikels — wie bisher ohne `lager_frei`', () => {
    const d = formularDeckung(TAG, [{ id: 'p', materialId: 'm1', menge: 3 }], null, () => ({ id: 'm1', stock: 1 }));
    expect(d.get('p')).toMatchObject({ imLagerFehlt: 2, fehlt: 2, zustand: 'achtung' });
    expect(alteFehlt(3, 1)).toBe(2);
  });

  it('ein gespeicherter Stand gilt nur, solange die Position denselben Artikel trägt', () => {
    const daten = deckungAusRoh(ROH);
    const d = formularDeckung(TAG, [{ id: 'p2', materialId: 'm1', menge: 2 }], daten, () => undefined);
    // p2 trug m2 mit bestellter Anforderung; jetzt m1 ohne Anforderung: das Regal (frei 2) deckt.
    expect(d.get('p2')).toMatchObject({ zustand: 'erledigt', fehlt: 0 });
  });
});
