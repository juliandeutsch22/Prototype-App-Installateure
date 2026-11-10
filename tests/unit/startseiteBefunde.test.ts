import { describe, it, expect } from 'vitest';
import type { AppUser, EinkaufPosten, Freistellung, MaterialOrder, Vacation } from '@/types';
import type { Zeitkorrektur } from '@/lib/db/zeitkorrekturen';
import type { StartDaten, StartRolle } from '@/features/dashboard/start/laden';
import { startseite, type Umfeld } from '@/features/dashboard/start/aufbau';
import { andereEntscheiden, lieferungenHeute } from '@/features/dashboard/start/regeln';
import { THEMEN, angeboteneThemen } from '@/features/dashboard/start/einrichtung';
import { ZIEL } from '@/features/dashboard/start/ziele';
import { darfZiel } from '../links/linkziel';

/*
 * PRÜFBERICHT DER STARTSEITE (09.11.2026) — was dort stand und nicht hätte
 * stehen sollen, und was fehlte:
 *
 * 1. Der eigene Antrag stand unter „entscheiden“, obwohl jemand anderer
 *    entscheidet (Vier Augen; Menüzähler und Urlaubsseite ließen ihn weg).
 * 2. Eingetragene Urlaubsgenehmiger aus Projektleitung, Verwaltung oder
 *    Mitarbeitern sahen offene Anträge nie.
 * 3. Offene Korrekturanträge der Zeiterfassung fehlten.
 * 5. „Scheine“ und „Stunden nicht verrechnet“ ließen sich bei der Leitung
 *    nicht ausblenden.
 * 6. Lieferungen fürs Lager führten auf einen Filter, der sie nicht zeigt.
 */

const HEUTE = '2026-11-09';
const JETZT = Date.parse('2026-11-09T10:00:00+01:00');

const umfeld = (rolle: StartRolle, teil: Partial<Umfeld> = {}): Umfeld => ({
  rolle, heute: HEUTE, jetzt: JETZT, darf: () => true, urlaubEntscheiden: false, ich: 'ich', ...teil,
});

const urlaub = (id: string, userId: string, von = '2026-12-01'): Vacation => ({
  id, companyId: 'perl', userId, userName: `Person ${id}`, von, bis: von, tage: 1, status: 'Beantragt',
}) as Vacation;

const sonder = (id: string, userId: string, art: Freistellung['art']): Freistellung => ({
  id, companyId: 'perl', userId, userName: `Person ${id}`, art, von: '2026-11-20', bis: '2026-11-20', status: 'Beantragt',
}) as Freistellung;

const ANDERE = { urlaub: true, unbezahlt: true, sonderurlaub: true };
const NIEMAND = { urlaub: false, unbezahlt: false, sonderurlaub: false };

const zeilenVon = (s: ReturnType<typeof startseite>, key: string) =>
  s.abschnitte.find((a) => a.key === key)?.zeilen ?? [];
const alleZeilen = (s: ReturnType<typeof startseite>) => s.abschnitte.flatMap((a) => a.zeilen);

describe('1 — der eigene Antrag (Vier Augen)', () => {
  const person = (uid: string, role: AppUser['role'], active = true) => ({ uid, role, active });

  it('wer sonst entscheidet: dieselbe Regel wie die Datenbank', () => {
    // Ohne eingetragene Genehmiger entscheidet die Buchhaltung mit.
    expect(andereEntscheiden([person('ich', 'Geschäftsführung'), person('b', 'Buchhaltung')], 'ich', []))
      .toEqual({ urlaub: true, unbezahlt: false, sonderurlaub: true });
    // Mit Genehmigern nur sie und die Spitze — die Buchhaltung nicht mehr.
    expect(andereEntscheiden([person('ich', 'Geschäftsführung'), person('b', 'Buchhaltung')], 'ich', ['pl']).urlaub).toBe(false);
    expect(andereEntscheiden([person('ich', 'Buchhaltung'), person('pl', 'Projektleiter')], 'ich', ['ich', 'pl']).urlaub).toBe(true);
    // Deaktivierte Konten entscheiden nicht.
    expect(andereEntscheiden([person('ich', 'Buchhaltung'), person('gf', 'Geschäftsführung', false)], 'ich', []))
      .toEqual(NIEMAND);
    // Die Spitze entscheidet alles, auch den unbezahlten Urlaub.
    expect(andereEntscheiden([person('ich', 'Buchhaltung'), person('gf', 'Administrator')], 'ich', [])).toEqual(ANDERE);
  });

  it('Buchhaltung: der eigene Urlaubs- und Sonderurlaubsantrag fehlt, solange jemand anderer entscheidet', () => {
    const d: StartDaten = {
      antraege: [urlaub('mein', 'ich'), urlaub('fremd', 'x')],
      freistellungen: [sonder('mein-s', 'ich', 'dienstverhinderung'), sonder('fremd-s', 'x', 'pflegefreistellung')],
      entscheidenAndere: ANDERE,
    };
    const s = startseite(d, umfeld('buchhaltung', { urlaubEntscheiden: true, freistellungBestaetigen: true }));
    expect(zeilenVon(s, 'urlaub').map((z) => z.key)).toEqual(['urlaub-fremd']);
    expect(zeilenVon(s, 'sonderurlaub').map((z) => z.key)).toEqual(['freistellung-fremd-s']);
  });

  it('Gleichbleiben: wer allein entscheidet, sieht seinen Antrag weiter — und ohne Auskunft bleibt er stehen', () => {
    const d: StartDaten = { antraege: [urlaub('mein', 'ich')], freistellungen: [sonder('mein-s', 'ich', 'dienstverhinderung')] };
    for (const entscheidenAndere of [NIEMAND, undefined]) {
      const s = startseite({ ...d, entscheidenAndere }, umfeld('buchhaltung', { urlaubEntscheiden: true, freistellungBestaetigen: true }));
      expect(zeilenVon(s, 'urlaub').map((z) => z.key)).toEqual(['urlaub-mein']);
      expect(zeilenVon(s, 'sonderurlaub').map((z) => z.key)).toEqual(['freistellung-mein-s']);
    }
  });

  it('Leitung: die Themen zählen den eigenen Antrag nicht mit — den unbezahlten nur, wenn eine zweite Spitze entscheidet', () => {
    const d: StartDaten = {
      antraege: [urlaub('mein', 'ich'), urlaub('fremd', 'x')],
      freistellungen: [sonder('mein-u', 'ich', 'unbezahlt'), sonder('fremd-s', 'x', 'dienstverhinderung')],
    };
    const u = umfeld('leitung', { urlaubEntscheiden: true, freistellungBestaetigen: true });
    const titel = (e: typeof ANDERE) => alleZeilen(startseite({ ...d, entscheidenAndere: e }, u)).map((z) => z.titel);
    expect(titel(ANDERE)).toEqual(expect.arrayContaining(['1 Urlaubsantrag', '1 Antrag auf Sonderurlaub']));
    // Nur die Buchhaltung daneben: über den eigenen unbezahlten Urlaub entscheidet sie nicht.
    expect(titel({ urlaub: true, unbezahlt: false, sonderurlaub: true })).toContain('2 Anträge auf Sonderurlaub');
    // Gleichbleiben: allein in der Leitung zählt alles wie bisher.
    expect(titel(NIEMAND)).toEqual(expect.arrayContaining(['2 Urlaubsanträge', '2 Anträge auf Sonderurlaub']));
  });
});

describe('2 — eingetragene Urlaubsgenehmiger', () => {
  const d: StartDaten = { antraege: [urlaub('a', 'x'), urlaub('mein', 'ich')], entscheidenAndere: ANDERE };

  it.each(['monteur', 'verwaltung', 'projektleitung'] as const)('%s: die offenen Anträge stehen da — ohne den eigenen', (rolle) => {
    const s = startseite(d, umfeld(rolle, { urlaubEntscheiden: true }));
    expect(zeilenVon(s, 'urlaub').map((z) => z.key)).toEqual(['urlaub-a']);
    expect(zeilenVon(s, 'urlaub')[0].to).toBe(ZIEL.urlaubsantraege);
  });

  it.each(['monteur', 'verwaltung', 'projektleitung'] as const)('Gegenprobe %s: wer nicht entscheidet, sieht keine', (rolle) => {
    expect(startseite(d, umfeld(rolle)).abschnitte.find((a) => a.key === 'urlaub')).toBeUndefined();
  });

  it('lässt sich ausblenden — und steht dann gesammelt unter „ausgeblendet“', () => {
    const s = startseite(d, umfeld('verwaltung', { urlaubEntscheiden: true, aus: new Set(['urlaub']) }));
    expect(s.abschnitte.find((a) => a.key === 'urlaub')).toBeUndefined();
    expect(s.ausgeblendet.map((a) => a.key)).toEqual(['urlaub']);
    for (const r of ['monteur', 'verwaltung', 'projektleitung'] as const) {
      expect(THEMEN[r].map((t) => t.key)).toContain('urlaub');
    }
  });

  it('der Bogen bietet „Urlaubsanträge“ nur dem an, der entscheidet — und „Korrekturanträge“ nur mit ihrem Schalter', () => {
    expect(angeboteneThemen('monteur', { urlaubEntscheiden: false, korrekturen: false }).map((t) => t.key)).not.toContain('urlaub');
    expect(angeboteneThemen('monteur', { urlaubEntscheiden: true, korrekturen: false }).map((t) => t.key)).toContain('urlaub');
    expect(angeboteneThemen('buchhaltung', { urlaubEntscheiden: true, korrekturen: false }).map((t) => t.key)).not.toContain('korrektur');
    expect(angeboteneThemen('buchhaltung', { urlaubEntscheiden: true, korrekturen: true }).map((t) => t.key)).toContain('korrektur');
    // Gleichbleiben: alles andere steht wie bisher im Bogen.
    expect(angeboteneThemen('leitung', { urlaubEntscheiden: true, korrekturen: true })).toEqual(THEMEN.leitung);
  });
});

describe('3 — offene Korrekturanträge', () => {
  const antrag = (id: string, name: string, angelegt: string, stand: Zeitkorrektur['stand'] = 'offen'): Zeitkorrektur => ({
    id, companyId: 'perl', userId: `u-${id}`, eintragId: `e-${id}`, datum: '2026-11-03', stand,
    wunsch: 'Arzttermin, Ende falsch', vorher: { user_name: name }, angelegtAm: Date.parse(angelegt),
  });
  const offen = [antrag('k2', 'Anna', '2026-11-08T09:00:00Z'), antrag('k1', 'Max', '2026-11-05T09:00:00Z'), antrag('k3', 'Eva', '2026-11-01T09:00:00Z', 'abgelehnt')];

  it('Buchhaltung: ein Abschnitt, der älteste zuerst, jede Zeile öffnet ihren Antrag — der Wunsch steht nicht da', () => {
    const s = startseite({ korrekturen: offen }, umfeld('buchhaltung'));
    const ab = s.abschnitte.find((a) => a.key === 'korrektur')!;
    expect(ab.titel).toBe('Korrekturanträge');
    expect(ab.zeilen.map((z) => [z.titel, z.to])).toEqual([['Max', '/time?korrektur=k1'], ['Anna', '/time?korrektur=k2']]);
    expect(ab.zeilen[0].detail).toBe('Buchung vom 03.11.2026 · angefragt 05.11.');
    expect(JSON.stringify(s)).not.toMatch(/Arzt/);
  });

  it('Leitung: ein Thema unter „Heute“ — ein Antrag direkt, mehrere auf die Zeiterfassung', () => {
    const zwei = alleZeilen(startseite({ korrekturen: offen }, umfeld('leitung'))).find((z) => z.key === 'korrektur')!;
    expect(zwei).toMatchObject({ titel: '2 Korrekturanträge', detail: 'ältester: Max, Buchung vom 03.11.', to: '/time' });
    const einer = alleZeilen(startseite({ korrekturen: offen.slice(0, 1) }, umfeld('leitung'))).find((z) => z.key === 'korrektur')!;
    expect(einer).toMatchObject({ titel: '1 Korrekturantrag', to: '/time?korrektur=k2' });
  });

  it('Gegenprobe: ohne offene Anträge (oder nicht geladen) nichts', () => {
    for (const d of [{}, { korrekturen: [offen[2]] }]) {
      expect(startseite(d, umfeld('buchhaltung')).abschnitte.find((a) => a.key === 'korrektur')).toBeUndefined();
      expect(alleZeilen(startseite(d, umfeld('leitung'))).find((z) => z.key === 'korrektur')).toBeUndefined();
    }
  });

  it('das Ziel ist eine Seite, die Buchhaltung und Spitze betreten — Abschnitt und Thema stehen im Katalog', () => {
    for (const rolle of ['Buchhaltung', 'Geschäftsführung', 'Administrator'] as const) {
      expect(darfZiel(rolle, ZIEL.zeitKorrektur('k1'))).toEqual({ ok: true });
    }
    expect(THEMEN.buchhaltung.map((t) => t.key)).toContain('korrektur');
    expect(THEMEN.leitung.map((t) => t.key)).toContain('korrektur');
  });
});

describe('5 — nicht verrechnet lässt sich bei der Leitung ausblenden', () => {
  it('„scheine“ und „stunden“ stehen im Katalog der Leitung und gehen in „ausgeblendet“', () => {
    expect(THEMEN.leitung.map((t) => t.key)).toEqual(expect.arrayContaining(['scheine', 'stunden']));
    const d: StartDaten = {
      unverrechnet: [{ schein: { id: 's1', customerName: 'Huber', projectNumber: 'B-1', datum: '2026-11-01' }, tage: 8 }],
      offeneStunden: [{ stunden: { projectNumber: 'B-2', kunde: 'Maier', minuten: 120, aeltester: '2026-11-02' }, tage: 7 }],
    };
    const s = startseite(d, umfeld('leitung', { aus: new Set(['scheine', 'stunden']) }));
    expect(alleZeilen(s).map((z) => z.key)).not.toContain('scheine');
    expect(alleZeilen(s).map((z) => z.key)).not.toContain('stunden');
    expect(s.ausgeblendet.flatMap((a) => a.zeilen).map((z) => z.key).sort()).toEqual(['scheine', 'stunden']);
  });
});

describe('6 — Lieferungen von heute', () => {
  const bestellt = { bestelltAm: Date.parse('2026-11-02T08:00:00Z'), liefertermin: HEUTE };
  const anf: MaterialOrder = {
    id: 'a1', companyId: 'perl', materialId: null, materialName: 'Rohr', quantity: 2, status: 'In Bearbeitung',
    transactionType: 'order', userId: 'm', userName: 'Max', projectNumber: 'B-1', ...bestellt,
  } as MaterialOrder;
  const posten: EinkaufPosten = { id: 'p1', companyId: 'perl', materialName: 'Fitting', menge: 10, einheit: 'Stk', ...bestellt } as EinkaufPosten;

  it('Material fürs Lager führt in den Einkauf, die Anforderung bleibt beim Filter', () => {
    const zeilen = lieferungenHeute([anf], [posten], HEUTE);
    expect(zeilen.map((z) => [z.key, z.to])).toEqual([
      ['lief-a-a1', '/anforderungen?filter=lieferung-heute'],
      ['lief-p-p1', '/anforderungen?reiter=einkauf'],
    ]);
    expect(darfZiel('Verwaltung', ZIEL.einkauf)).toEqual({ ok: true });
  });

  it('Verwaltung: mit Lagermaterial führt „Heute“ in den Einkauf — nur mit Anforderungen wie bisher auf den Filter', () => {
    const mit = startseite({ orders: [anf], lagerPosten: [posten] }, umfeld('verwaltung'));
    expect(mit.heute).toMatchObject({ art: 'liste', verweis: { to: ZIEL.einkauf, text: 'Einkauf' } });
    const ohne = startseite({ orders: [anf], lagerPosten: [] }, umfeld('verwaltung'));
    expect(ohne.heute).toMatchObject({ art: 'liste', verweis: { to: '/anforderungen?filter=lieferung-heute', text: 'Anforderungen' } });
  });

  it('Leitung ohne Verwaltung: das Thema führt dorthin, wo alle erwarteten Lieferungen stehen', () => {
    const ziel = (lagerPosten: EinkaufPosten[]) =>
      alleZeilen(startseite({ orders: [anf], lagerPosten, hatVerwaltung: false }, umfeld('leitung'))).find((z) => z.key === 'lieferung-heute')?.to;
    expect(ziel([posten])).toBe(ZIEL.einkauf);
    expect(ziel([])).toBe('/anforderungen?filter=lieferung-heute');
  });
});
