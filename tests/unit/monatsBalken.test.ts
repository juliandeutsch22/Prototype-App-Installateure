import { describe, it, expect } from 'vitest';
import type { Abwesenheit } from '@/lib/db/vacations';
import type { Assignment, Termin } from '@/types';
import {
  artWort,
  balkenBilden,
  baustellenDesMonats,
  baustelleTag,
  beschriftet,
  lieferungOhneAnnahme,
  personTag,
  tagImBalken,
  type TagesEintrag,
} from '@/features/assignments/monatsBalken';
import { einsatzTeil, ruestZeile, vorschauInhalt, type TagesDaten } from '@/features/assignments/monatsVorschau';
import { monatsTage } from '@/features/assignments/planungKopf';
import type { Zelle } from '@/features/assignments/planTypen';

/*
  DIE BALKEN DES MONATS UND DIE VORSCHAU als reine Rechnung (Runde 4,
  Auftrag 5.1–5.3). Jede Prüfung hat eine Gegenprobe: was einen Balken
  trennt, und was ihn eben nicht trennt.
*/

const plan = (nummer: string): TagesEintrag => ({ schluessel: `e:${nummer}`, art: 'plan', text: nummer, lang: nummer, nummer });

describe('balkenBilden', () => {
  it('fasst aufeinanderfolgende Tage mit demselben Schlüssel zu EINEM Balken zusammen', () => {
    const { balken, bahnen } = balkenBilden(5, (i) => (i < 3 ? [plan('A')] : []));
    expect(balken).toEqual([expect.objectContaining({ schluessel: 'e:A', start: 0, ende: 2, bahn: 0 })]);
    expect(bahnen).toBe(1);
  });

  it('ein Tag ohne Eintrag beendet den Balken (Gegenprobe zur Zusammenfassung)', () => {
    const { balken } = balkenBilden(5, (i) => (i === 2 ? [] : [plan('A')]));
    expect(balken.map((b) => [b.start, b.ende])).toEqual([[0, 1], [3, 4]]);
  });

  it('eine andere Baustelle am Folgetag ist ein neuer Balken in derselben Bahn', () => {
    const { balken, bahnen } = balkenBilden(4, (i) => [plan(i < 2 ? 'A' : 'B')]);
    expect(balken.map((b) => [b.schluessel, b.start, b.ende, b.bahn])).toEqual([
      ['e:A', 0, 1, 0],
      ['e:B', 2, 3, 0],
    ]);
    expect(bahnen).toBe(1);
  });

  it('zwei Einsätze an einem Tag: eine zweite Bahn — gierig, nur so viele wie nötig', () => {
    // A Tag 0–3, B nur Tag 1, C Tag 5 (passt wieder in Bahn 0).
    const { balken, bahnen } = balkenBilden(6, (i) => [
      ...(i <= 3 ? [plan('A')] : []),
      ...(i === 1 ? [plan('B')] : []),
      ...(i === 5 ? [plan('C')] : []),
    ]);
    expect(Object.fromEntries(balken.map((b) => [b.schluessel, b.bahn]))).toEqual({ 'e:A': 0, 'e:B': 1, 'e:C': 0 });
    expect(bahnen).toBe(2);
  });

  it('dieselbe Baustelle zweimal am selben Tag (doppelte Zeile) bleibt ein Balken', () => {
    const { balken, bahnen } = balkenBilden(2, () => [plan('A'), plan('A')]);
    expect(balken).toHaveLength(1);
    expect(bahnen).toBe(1);
  });

  it('ohne Einträge: keine Balken, aber eine Bahn (die Zeile hat eine Höhe)', () => {
    expect(balkenBilden(31, () => [])).toEqual({ balken: [], bahnen: 1 });
  });
});

describe('personTag — dieselbe Zelle wie die Woche', () => {
  const zelle = (z: Partial<Zelle>): Zelle => ({ baustellen: [], imUrlaub: false, abwesendText: null, ...z });
  const b = (nummer: string, name: string) => ({ nummer, name, helfer: false, zeit: null });

  it('eingeplant: Kurzname als Beschriftung, voller Name und Nummer für title', () => {
    expect(personTag(zelle({ baustellen: [b('B-1', 'CT Bau GmbH')] }), false)).toEqual([
      { schluessel: 'e:B-1', art: 'plan', text: 'CT Bau', lang: 'CT Bau GmbH (B-1)', nummer: 'B-1' },
    ]);
  });

  it('eingeteilt und ganztags weg: Bernstein mit „Kurzname – fehlt“ und eigenem Schlüssel', () => {
    const [e] = personTag(zelle({ baustellen: [b('B-1', 'Familie Huber')], imUrlaub: true, abwesendText: 'Krank' }), false);
    expect(e).toMatchObject({ schluessel: 'k:B-1', art: 'konflikt', text: 'Huber – fehlt' });
    expect(e.lang).toContain('eingeteilt, aber Krank');
    // Gegenprobe: derselbe Einsatz ohne Abwesenheit hat einen anderen Schlüssel — der Balken trennt sich.
    expect(personTag(zelle({ baustellen: [b('B-1', 'Familie Huber')] }), false)[0].schluessel).not.toBe(e.schluessel);
  });

  it('abwesend: grau mit der Art als Wort, ohne Grund „abwesend“ (die Datenbank entscheidet)', () => {
    expect(personTag(zelle({ imUrlaub: true, abwesendText: 'Urlaub' }), false)[0]).toMatchObject({ art: 'weg', text: 'Urlaub' });
    expect(personTag(zelle({ imUrlaub: true, abwesendText: 'abwesend' }), false)[0]).toMatchObject({ art: 'weg', text: 'abwesend' });
    expect(personTag(zelle({ imUrlaub: true, abwesendText: 'ZA' }), false)[0]).toMatchObject({ text: 'Zeitausgleich' });
  });

  it('stundenweise weg ist einplanbar: kein Balken (steht in der Vorschau)', () => {
    expect(personTag(zelle({ abwesendText: 'ZA 13:00–17:00' }), false)).toEqual([]);
  });

  it('Betriebsurlaub: grauer Balken — außer jemand ist eingeteilt', () => {
    expect(personTag(undefined, true)).toEqual([expect.objectContaining({ art: 'weg', text: 'Betriebsurlaub' })]);
    expect(personTag(zelle({ baustellen: [b('B-1', 'X')] }), true)[0].art).toBe('plan');
  });

  it('frei: nichts', () => {
    expect(personTag(undefined, false)).toEqual([]);
  });
});

describe('Sicht „Baustellen“ — ein Balken je gleicher Besetzung', () => {
  const a = (date: string, userId: string, userName: string): Assignment =>
    ({ id: `${date}${userId}`, companyId: 'c', date, projectNumber: 'B-1', userId, userName }) as Assignment;
  const name = (x: Pick<Assignment, 'userName'>) => x.userName ?? '';

  it('eine Person: „Max M.“, mehrere: „N Pers.“; wechselt die Besetzung, wechselt der Schlüssel', () => {
    const allein = baustelleTag([a('2026-10-05', 'u1', 'Max Mustermann')], [], '2026-10-05', name)[0];
    const zwei = baustelleTag([a('2026-10-06', 'u1', 'Max Mustermann'), a('2026-10-06', 'u2', 'Lena Pichler')], [], '2026-10-06', name)[0];
    expect(allein.text).toBe('Max M.');
    expect(zwei.text).toBe('2 Pers.');
    expect(zwei.lang).toBe('Max Mustermann, Lena Pichler');
    expect(allein.schluessel).not.toBe(zwei.schluessel);
    // Gegenprobe: dieselbe Besetzung in anderer Reihenfolge ist derselbe Balken.
    const umgekehrt = baustelleTag([a('2026-10-07', 'u2', 'Lena Pichler'), a('2026-10-07', 'u1', 'Max Mustermann')], [], '2026-10-07', name)[0];
    expect(umgekehrt.schluessel).toBe(zwei.schluessel);
  });

  it('fehlt jemand (ganztags weg), ist der Balken Bernstein — stundenweise nicht', () => {
    const krank: Abwesenheit[] = [{ userId: 'u1', von: '2026-10-05', bis: '2026-10-05', grund: 'Krank', zeiten: null }];
    const teils: Abwesenheit[] = [{ userId: 'u1', von: '2026-10-05', bis: '2026-10-05', grund: 'ZA', zeiten: '13:00–17:00' }];
    const e = [a('2026-10-05', 'u1', 'Max Mustermann')];
    expect(baustelleTag(e, krank, '2026-10-05', name)[0]).toMatchObject({ art: 'konflikt', lang: 'Max Mustermann – fehlt: Max Mustermann' });
    expect(baustelleTag(e, teils, '2026-10-05', name)[0].art).toBe('plan');
  });

  it('die Baustellen des Monats in der Reihenfolge der bisherigen Liste: erster Einsatztag, dann Name', () => {
    const e = [
      { ...a('2026-10-07', 'u1', 'X'), projectNumber: 'B-2' },
      a('2026-10-09', 'u1', 'X'),
      a('2026-10-05', 'u1', 'X'),
    ];
    const liste = baustellenDesMonats(e, (n) => (n === 'B-1' ? 'Zeta' : 'Alpha'));
    expect(liste.map((b) => [b.nummer, b.von, b.bis, b.tage.size])).toEqual([
      ['B-1', '2026-10-05', '2026-10-09', 2],
      ['B-2', '2026-10-07', '2026-10-07', 1],
    ]);
  });
});

describe('Lieferung ohne Annahme', () => {
  const t = (x: Partial<Termin>): Termin =>
    ({ id: 't', companyId: 'c', art: 'Lieferung', datum: '2026-10-05', projectNumber: 'B-1', teilnehmer: [], ...x }) as Termin;

  it('Lieferung an einer Baustelle, auf der an dem Tag niemand eingeteilt ist', () => {
    expect(lieferungOhneAnnahme(t({}), [])).toBe(true);
    expect(lieferungOhneAnnahme(t({}), [{ date: '2026-10-06', projectNumber: 'B-1' }])).toBe(true);
  });

  it('Gegenprobe: mit einem Einsatz dort, ohne Baustelle oder als andere Art nicht', () => {
    expect(lieferungOhneAnnahme(t({}), [{ date: '2026-10-05', projectNumber: 'B-1' }])).toBe(false);
    expect(lieferungOhneAnnahme(t({ projectNumber: null, customerId: 'k' }), [])).toBe(false);
    expect(lieferungOhneAnnahme(t({ art: 'Abnahme' }), [])).toBe(false);
  });
});

describe('Der Tag unter der Klickstelle', () => {
  it('start + floor((x − links) / breite × span), auf den Balken begrenzt', () => {
    const b = { start: 4, ende: 7 }; // vier Tage, 120 px breit ab x = 100
    expect(tagImBalken(b, { x: 100, links: 100, breite: 120 })).toBe(4);
    expect(tagImBalken(b, { x: 159, links: 100, breite: 120 })).toBe(5);
    expect(tagImBalken(b, { x: 219, links: 100, breite: 120 })).toBe(7);
    expect(tagImBalken(b, { x: 400, links: 100, breite: 120 })).toBe(7);
  });

  it('mit der Tastatur (ohne Klickstelle) der erste Tag', () => {
    expect(tagImBalken({ start: 4, ende: 7 }, null)).toBe(4);
  });
});

describe('Beschriftung erst ab 46 px', () => {
  it('rechnet mit der gemessenen Breite eines Tages, abzüglich des Rands', () => {
    expect(beschriftet(2, 25)).toBe(true); // 50 − 4 = 46
    expect(beschriftet(2, 24)).toBe(false); // 48 − 4 = 44
    expect(beschriftet(1, 45.7)).toBe(false); // 1.920 px, ein Tag
    expect(beschriftet(1, 60)).toBe(true);
  });

  it('vor der ersten Messung ohne Text', () => {
    expect(beschriftet(31, 0)).toBe(false);
  });
});

describe('artWort', () => {
  it('nur das Kürzel „ZA“ wird zum Wort, sonst bleibt die Art', () => {
    expect(artWort('ZA')).toBe('Zeitausgleich');
    expect(artWort('ZA 13:00–17:00')).toBe('Zeitausgleich 13:00–17:00');
    expect(artWort('Krank')).toBe('Krank');
    expect(artWort('Zahnarzt')).toBe('Zahnarzt');
    expect(artWort(null)).toBe('abwesend');
  });
});

/*
  JEDER EINSATZ ÜBER GENAU EINEN BALKENTAG (Abnahme 5.5): ein Monat mit
  Mehrtageseinsätzen, zwei Einsätzen an einem Tag, Abwesenheit mittendrin.
  Für jede Zeile der Einsätze gibt es in der Zeile der Person genau einen
  Balken dieser Baustelle, der den Tag abdeckt.
*/
describe('Abnahme 5.5 — jeder Einsatz liegt auf genau einem Balkentag', () => {
  const tage = monatsTage(2026, 9);
  const einsaetze: Assignment[] = [];
  const add = (date: string, userId: string, projectNumber: string) =>
    einsaetze.push({ id: `${date}${userId}${projectNumber}`, companyId: 'c', date, userId, projectNumber } as Assignment);
  for (const t of tage.slice(0, 20)) add(t, 'u1', 'B-1');
  for (const t of tage.slice(4, 9)) add(t, 'u1', 'B-2');
  for (const t of tage.filter((_, i) => i % 3 === 0)) add(t, 'u2', 'B-3');
  for (const t of tage.slice(10, 14)) add(t, 'u2', 'B-1');
  const urlaube: Abwesenheit[] = [{ userId: 'u1', von: tage[6], bis: tage[7], grund: 'Krank', zeiten: null }];

  /** Wie `WochenplanView` die Zellen rechnet. */
  function zellen(uid: string) {
    const m = new Map<string, Zelle>();
    for (const a of einsaetze.filter((x) => x.userId === uid)) {
      const z = m.get(a.date) ?? { baustellen: [], imUrlaub: false, abwesendText: null };
      z.baustellen.push({ nummer: a.projectNumber, name: a.projectNumber, helfer: false, zeit: null });
      m.set(a.date, z);
    }
    for (const v of urlaube.filter((x) => x.userId === uid)) {
      for (const t of tage) {
        if (v.von <= t && v.bis >= t) {
          const z = m.get(t) ?? { baustellen: [], imUrlaub: false, abwesendText: null };
          z.imUrlaub = true;
          z.abwesendText = v.grund;
          m.set(t, z);
        }
      }
    }
    return m;
  }

  it.each(['u1', 'u2'])('Person %s', (uid) => {
    const z = zellen(uid);
    const { balken } = balkenBilden(tage.length, (i) => personTag(z.get(tage[i]), false));
    for (const a of einsaetze.filter((x) => x.userId === uid)) {
      const i = tage.indexOf(a.date);
      const treffer = balken.filter((b) => b.nummer === a.projectNumber && b.start <= i && b.ende >= i);
      expect(treffer, `${a.date} ${a.projectNumber}`).toHaveLength(1);
    }
    // Gegenprobe: kein Balken deckt einen Tag ohne Einsatz dieser Baustelle.
    for (const b of balken.filter((x) => x.nummer)) {
      for (let i = b.start; i <= b.ende; i++) {
        expect(einsaetze.some((a) => a.userId === uid && a.date === tage[i] && a.projectNumber === b.nummer)).toBe(true);
      }
    }
  });
});

/*
  DIE VORSCHAU SAGT DASSELBE WIE DAS FORMULAR (Abnahme 5.5): Zeit und
  Aufgabe aus der ersten Zeile des Paars Tag × Baustelle, die Eingeteilten in
  der Reihenfolge der Zeilen, die Termine derselben Baustelle. Der
  Vergleich mit dem gezeichneten Seitenfenster steht im Komponententest.
*/
describe('Inhalt der Vorschau', () => {
  const tag = '2026-10-07';
  const zeile = (x: Partial<Assignment>): Assignment =>
    ({ id: Math.random().toString(36), companyId: 'c', date: tag, projectNumber: 'B-1', userId: 'u1', userName: 'Max Mustermann', ...x }) as Assignment;
  const daten = (x: Partial<TagesDaten> = {}): TagesDaten => ({ einsaetze: [], urlaube: [], termine: [], zu: null, zuFuer: () => false, ...x });
  const name = (a: Pick<Assignment, 'userName'>) => a.userName ?? '?';
  const projekt = () => ({ id: 'p1', customerName: 'CT Bau GmbH', bezeichnung: 'Haus 3', address: 'Industriestraße 4, 4050 Traun' });
  const bezug = () => 'Ort';

  it('ein Einsatz: Titel, Nummer, Zeit, Adresse, Mit dabei, Aufgabe, Termin, wer fehlt', () => {
    const e = [
      zeile({ zeitVon: '07:00', zeitBis: '15:30', comment: 'Bad rohinstallieren' }),
      zeile({ userId: 'u2', userName: 'Lena Pichler', asHelper: true, comment: 'anders' }),
      zeile({ userId: 'u3', userName: 'Jürgen Fasching' }),
    ];
    const urlaube: Abwesenheit[] = [{ userId: 'u3', von: tag, bis: tag, grund: 'Krank', zeiten: null }];
    const termine = [{ id: 't1', companyId: 'c', art: 'Lieferung', datum: tag, zeitVon: '08:00', zeitBis: '10:00', projectNumber: 'B-1', teilnehmer: [] } as Termin];
    const t = einsatzTeil(tag, 'B-1', daten({ einsaetze: e, urlaube, termine }), projekt(), name, 'u1');
    expect(t).toMatchObject({
      titel: 'Haus 3 · CT Bau GmbH',
      nummer: 'B-1',
      zeit: '07:00–15:30',
      adresse: 'Industriestraße 4, 4050 Traun',
      leuteName: 'Mit dabei',
      leute: 'Lena Pichler (Helfer), Jürgen Fasching (fehlt)',
      aufgabe: 'Bad rohinstallieren',
      projektId: 'p1',
    });
    expect(t.termine).toEqual([expect.stringMatching(/^Am selben Tag: Lieferung.*08:00–10:00$/)]);
    expect(t.fehlen).toEqual(['Jürgen Fasching ist an diesem Tag abwesend (Krank) – neu einteilen?']);
  });

  it('ohne sichtbaren Grund heißt es nur „abwesend“ — der Grund bleibt, wo die Datenbank ihn zurückhält', () => {
    const urlaube: Abwesenheit[] = [{ userId: 'u1', von: tag, bis: tag, grund: null, zeiten: null }];
    const t = einsatzTeil(tag, 'B-1', daten({ einsaetze: [zeile({})], urlaube }), projekt(), name);
    expect(t.fehlen).toEqual(['Max Mustermann ist an diesem Tag abwesend – neu einteilen?']);
  });

  it('ohne Uhrzeit „ganzer Tag, ohne Uhrzeit“; Adresse „…“ solange die Baustelle lädt, „–“ wenn es keine gibt', () => {
    expect(einsatzTeil(tag, 'B-1', daten({ einsaetze: [zeile({})] }), undefined, name).zeit).toBe('ganzer Tag, ohne Uhrzeit');
    expect(einsatzTeil(tag, 'B-1', daten({ einsaetze: [zeile({})] }), undefined, name).adresse).toBeUndefined();
    expect(einsatzTeil(tag, 'B-1', daten({ einsaetze: [zeile({})] }), null, name).adresse).toBeNull();
  });

  it('Person: der angeklickte Einsatz zuerst; frei mit Satz; Wochenende beim Namen', () => {
    const e = [zeile({ projectNumber: 'A-1' }), zeile({ projectNumber: 'B-1' })];
    const i = vorschauInhalt({ art: 'person', uid: 'u1', name: 'Max', tag, nummer: 'B-1' }, daten({ einsaetze: e }), projekt, name, bezug);
    expect(i.einsaetze.map((x) => x.nummer)).toEqual(['B-1', 'A-1']);
    expect(i.frei).toBeNull();
    const frei = vorschauInhalt({ art: 'person', uid: 'u1', name: 'Max', tag }, daten(), projekt, name, bezug);
    expect(frei.frei).toBe('Frei – noch kein Einsatz an diesem Tag.');
    const samstag = vorschauInhalt({ art: 'person', uid: 'u1', name: 'Max', tag: '2026-10-10' }, daten(), projekt, name, bezug);
    expect(samstag.frei).toBe('Samstag – kein Einsatz.');
    const feiertag = vorschauInhalt({ art: 'person', uid: 'u1', name: 'Max', tag: '2026-10-26' }, daten(), projekt, name, bezug);
    expect(feiertag.frei).toBe('Nationalfeiertag – kein Einsatz.');
    expect(feiertag.ueber).toBe('Montag, 26.10.2026 · Nationalfeiertag');
  });

  it('Person: Abwesenheit mit Zeitraum, Termine der Person, stundenweise als einplanbar', () => {
    const urlaube: Abwesenheit[] = [
      { userId: 'u1', von: '2026-10-05', bis: '2026-10-09', grund: 'Urlaub', zeiten: null },
      { userId: 'u2', von: tag, bis: tag, grund: 'ZA', zeiten: '13:00–17:00' },
    ];
    const termine = [
      { id: 't1', companyId: 'c', art: 'Besichtigung', datum: tag, teilnehmer: ['u1'], customerId: 'k' } as Termin,
      { id: 't2', companyId: 'c', art: 'Abnahme', datum: tag, teilnehmer: ['u9'], projectNumber: 'X' } as Termin,
    ];
    const max = vorschauInhalt({ art: 'person', uid: 'u1', name: 'Max', tag }, daten({ urlaube, termine }), projekt, name, bezug);
    expect(max.abwesenheiten).toEqual([{ titel: 'Urlaub', unter: '05.10.–09.10.' }]);
    expect(max.termine.map((t) => t.termin.id)).toEqual(['t1']);
    expect(max.frei).toBeNull();
    const lena = vorschauInhalt({ art: 'person', uid: 'u2', name: 'Lena', tag }, daten({ urlaube }), projekt, name, bezug);
    expect(lena.abwesenheiten).toEqual([{ titel: 'Zeitausgleich 13:00–17:00', unter: '07.10. · stundenweise, einplanbar' }]);
    expect(lena.frei).toBe('Frei – noch kein Einsatz an diesem Tag.');
  });

  it('Betriebsurlaub: als Abschnitt — außer für Ausgenommene', () => {
    const zu = daten({ zu: 'Weihnachten', zuFuer: (uid) => uid !== 'u2' });
    expect(vorschauInhalt({ art: 'person', uid: 'u1', name: 'Max', tag }, zu, projekt, name, bezug).abwesenheiten).toEqual([{ titel: 'Betriebsurlaub', unter: 'Weihnachten' }]);
    expect(vorschauInhalt({ art: 'person', uid: 'u2', name: 'Lena', tag }, zu, projekt, name, bezug).abwesenheiten).toEqual([]);
  });

  it('Baustelle: alle Eingeteilten; ohne Einsatz die Termine der Baustelle mit „niemand dort“', () => {
    const e = [zeile({}), zeile({ userId: 'u2', userName: 'Lena Pichler' })];
    const mit = vorschauInhalt({ art: 'baustelle', nummer: 'B-1', name: 'CT Bau GmbH', tag }, daten({ einsaetze: e }), projekt, name, bezug);
    expect(mit.titel).toBe('CT Bau');
    expect(mit.einsaetze[0]).toMatchObject({ leuteName: 'Eingeteilt', leute: 'Max Mustermann, Lena Pichler' });
    const lieferung = { id: 't1', companyId: 'c', art: 'Lieferung', datum: tag, projectNumber: 'B-1', teilnehmer: [] } as Termin;
    const ohne = vorschauInhalt({ art: 'baustelle', nummer: 'B-1', name: 'CT Bau GmbH', tag }, daten({ termine: [lieferung] }), projekt, name, bezug);
    expect(ohne.einsaetze).toEqual([]);
    expect(ohne.termine).toEqual([expect.objectContaining({ ohneAnnahme: true })]);
    expect(ohne.frei).toBeNull();
  });

  it('Tag: alle Baustellen, alle Termine, die Abwesenden mit Grund nach den Rechten', () => {
    const e = [zeile({ projectNumber: 'B-1' }), zeile({ projectNumber: 'A-1', userId: 'u2' })];
    const urlaube: Abwesenheit[] = [
      { userId: 'u3', von: tag, bis: tag, grund: 'Krank', zeiten: null },
      { userId: 'u4', von: tag, bis: tag, grund: null, zeiten: null },
    ];
    const leute = [{ uid: 'u3', name: 'Jürgen' }, { uid: 'u4', name: 'Erna' }];
    const i = vorschauInhalt({ art: 'tag', tag }, daten({ einsaetze: e, urlaube }), (n) => ({ id: n, customerName: n === 'A-1' ? 'Alpha' : 'Zeta' }), name, bezug, leute);
    expect(i.einsaetze.map((x) => x.nummer)).toEqual(['A-1', 'B-1']);
    expect(i.abwesend).toEqual(['Jürgen (Krank)', 'Erna']);
    expect(vorschauInhalt({ art: 'tag', tag }, daten(), projekt, name, bezug).frei).toBe('Nichts geplant.');
  });
});

describe('Rüstliste in einer Zeile — dieselbe Fehlmenge wie im Formular', () => {
  const heute = '2026-10-07';
  const frei = new Map([
    ['m1', { frei: 4 }],
    ['m2', { frei: -2 }],
  ]);

  it('keine Liste oder leer: „keine“', () => {
    expect(ruestZeile(undefined, frei, heute, heute)).toBe('keine');
    expect(ruestZeile([], frei, heute, heute)).toBe('keine');
  });

  it('ab heute zählt die eigene gespeicherte Menge wieder dazu — sie reserviert sich nicht selbst weg', () => {
    // frei 4, eigene 6 → verfügbar 10: 6 reichen.
    expect(ruestZeile([{ materialId: 'm1', menge: 6 }], frei, heute, heute)).toBe('1 Position');
    // Gegenprobe: für einen vergangenen Tag gilt nur das Freie (4 < 6).
    expect(ruestZeile([{ materialId: 'm1', menge: 6 }], frei, '2026-10-01', heute)).toBe('1 Position · 1 mit Fehlmenge');
  });

  it('Fehlmenge nur bei Katalogartikeln; eine freie Zeile hat keinen Bestand', () => {
    expect(ruestZeile([{ menge: 3 }, { materialId: 'm2', menge: 1 }, { materialId: 'unbekannt', menge: 9 }], frei, '2026-10-01', heute)).toBe(
      '3 Positionen · 1 mit Fehlmenge',
    );
  });

  it('ohne Lagerstand nur die Zahl der Positionen — keine geratene Fehlmenge', () => {
    expect(ruestZeile([{ materialId: 'm2', menge: 1 }], null, heute, heute)).toBe('1 Position');
  });
});
