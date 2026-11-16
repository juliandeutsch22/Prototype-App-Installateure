import { describe, it, expect } from 'vitest';
import {
  abgleichen, namePasstZu, nichtZugeordnet, nummerImText, nummernImText, zuordnungFehler,
  type AbgleichRechnung,
} from '@/features/invoices/kontoauszugAbgleich';
import type { BankBuchung } from '@/features/invoices/kontoauszugLesen';

/*
  DER ABGLEICH (F13): Vorschläge mit denselben Regeln wie der Zahlungsdialog —
  Rechnungsnummer vor Betrag und Name, Skonto in der Frist, Teilzahlung,
  Mahnkosten nach dem Rest, Guthaben nicht vorgewählt, Sammelüberweisung,
  doppelt Erfasstes erkannt. Jeder Fall hat seine Gegenprobe: knapp daneben
  ergibt den anderen Vorschlag.
*/

const rechnung = (n: number, rest: Partial<AbgleichRechnung> = {}): AbgleichRechnung => ({
  id: `r${n}`,
  invoiceNumber: `RE-2026-${1000 + n}`,
  customerName: 'Maria Huber',
  invoiceDate: `2026-10-${String(n).padStart(2, '0')}`,
  totalBrutto: 120,
  bezahltBetrag: 0,
  paymentStatus: 'Offen',
  skontoBetrag: 0,
  mahnkostenBetrag: 0,
  mahnstufe: 0,
  ...rest,
});

let stelle = 0;
const buchung = (betrag: number, zweck: string, rest: Partial<BankBuchung> = {}) => ({
  buchung: { stelle: ++stelle, buchungstag: '2026-11-10', betrag, zweck, ...rest },
  kennung: `k${stelle}`.padEnd(64, '0'),
});

describe('Die Rechnungsnummer im Verwendungszweck', () => {
  it('findet sie ganz, mit anderen Trennern oder ohne', () => {
    expect(nummerImText('RE-2026-1001', 'RE-2026-1001 / B-2026-0007')).toBe(2);
    expect(nummerImText('RE-2026-1001', 're 2026 1001')).toBe(2);
    expect(nummerImText('RE-2026-1001', 'RE20261001')).toBe(2);
    expect(nummerImText('RE-2026-1001', 'Rechnung RE/2026/1001 danke')).toBe(2);
    expect(nummerImText('RE-2026-1001', 'Rechnung 2026-1001')).toBe(1);
  });
  it('Gegenprobe: eine längere Nummer oder ein anderes Jahr ist es nicht', () => {
    expect(nummerImText('RE-2026-1001', 'RE-2026-10012')).toBe(0);
    expect(nummerImText('RE-2026-1001', 'RE-2025-1001')).toBe(0);
    // Ein fremder Vorsatz davor: nur noch Jahr und Nummer — die schwächere Stufe.
    expect(nummerImText('RE-2026-1001', 'XRE-2026-1001')).toBe(1);
    expect(nummerImText('RE-2026-1001', '1001')).toBe(0);
  });
  it('Kandidaten für Nummern, die nicht unter den offenen sind', () => {
    expect(nummernImText('Zahlung RE 2026 1050 und 2026-1051', 'RE')).toEqual(
      ['RE-2026-1050', '2026-1050', 'RE-2026-1051', '2026-1051'],
    );
  });
});

describe('Der Name', () => {
  it('ein kennzeichnender Namensteil genügt; Füllwörter zählen nicht', () => {
    expect(namePasstZu('Maria Huber', { name: 'HUBER MARIA', zweck: '' })).toBe(true);
    expect(namePasstZu('Bau Meier GmbH', { zweck: 'Gutschrift MEIER GESMBH AT61…' })).toBe(true);
    expect(namePasstZu('Bau Meier GmbH', { name: 'Bau Gruber GmbH', zweck: '' })).toBe(false);
  });
});

describe('Ein Eingang mit Rechnungsnummer', () => {
  it('genau der offene Betrag gleicht aus und ist vorgewählt', () => {
    const [v] = abgleichen([buchung(120, 'RE-2026-1001')], [rechnung(1)]);
    expect(v).toMatchObject({ stufe: 'passt', teile: [{ rechnungId: 'r1', betrag: 120, skonto: 0, mahnkosten: 0 }] });
  });

  it('in der Skontofrist: Zahlung und Skonto', () => {
    const r = rechnung(1, { skontoProzent: 2, skontoBis: '2026-11-14' });
    const [v] = abgleichen([buchung(117.6, 'RE-2026-1001')], [r]);
    expect(v).toMatchObject({ stufe: 'passt', teile: [{ betrag: 117.6, skonto: 2.4 }] });
  });

  it('Gegenprobe: nach der Frist eine Teilzahlung — mit dem Hinweis auf den verpassten Skonto', () => {
    const r = rechnung(1, { skontoProzent: 2, skontoBis: '2026-11-05' });
    const [v] = abgleichen([buchung(117.6, 'RE-2026-1001')], [r]);
    expect(v.stufe).toBe('passt');
    expect(v.teile).toEqual([{ rechnungId: 'r1', betrag: 117.6, skonto: 0, mahnkosten: 0 }]);
    expect(v.hinweise.join(' ')).toMatch(/offen bleiben €\s2,40/);
    expect(v.hinweise.join(' ')).toMatch(/Skonto wäre bis 05\.11\.2026 möglich gewesen/);
  });

  it('Zahlbetrag ohne Rücklass gleicht den übrigen Teil aus, der Rücklass bleibt offen', () => {
    const r = rechnung(1, { totalBrutto: 1000, ruecklassBetrag: 50 });
    const [v] = abgleichen([buchung(950, 'RE-2026-1001')], [r]);
    expect(v).toMatchObject({ stufe: 'passt', teile: [{ betrag: 950, skonto: 0 }] });
    expect(v.hinweise[0]).toMatch(/Rücklass von €\s50,00 bleibt offen/);
  });

  it('mehr als offen nach einer Mahnung: Rechnung und Mahnkosten', () => {
    const r = rechnung(1, { mahnstufe: 2, mahnforderung: 13.16, paymentStatus: 'Überfällig' });
    const [v] = abgleichen([buchung(133.16, 'RE-2026-1001')], [r]);
    expect(v).toMatchObject({ stufe: 'passt', teile: [{ betrag: 120, skonto: 0, mahnkosten: 13.16 }] });
  });

  it('Gegenprobe: was über Rest und Mahnkosten hinausgeht, würde Guthaben — nicht vorgewählt', () => {
    const r = rechnung(1, { mahnstufe: 2, mahnforderung: 13.16 });
    const [v] = abgleichen([buchung(150, 'RE-2026-1001')], [r]);
    expect(v.stufe).toBe('pruefen');
    expect(v.teile).toEqual([{ rechnungId: 'r1', betrag: 136.84, skonto: 0, mahnkosten: 13.16 }]);
    expect(v.grund).toMatch(/€\s16,84 mehr .* Guthaben/);
  });

  it('auf eine schon bezahlte oder stornierte Rechnung: prüfen', () => {
    const bezahlt = rechnung(1, { bezahltBetrag: 120, paymentStatus: 'Bezahlt' });
    const storniert = rechnung(2, { paymentStatus: 'Storniert' });
    const [a, b] = abgleichen([buchung(120, 'RE-2026-1001'), buchung(120, 'RE-2026-1002')], [bezahlt, storniert]);
    expect(a.stufe).toBe('pruefen');
    expect(a.grund).toMatch(/schon bezahlt/);
    expect(b.stufe).toBe('pruefen');
    expect(b.grund).toMatch(/storniert/);
  });

  it('zwei Teilzahlungen in einer Datei: die zweite sieht den Rest nach der ersten', () => {
    const [a, b] = abgleichen([buchung(50, 'RE-2026-1001'), buchung(70, 'RE-2026-1001')], [rechnung(1)]);
    expect(a.hinweise[0]).toMatch(/offen bleiben €\s70,00/);
    expect(b).toMatchObject({ stufe: 'passt', grund: 'Gleicht RE-2026-1001 aus.' });
  });

  it('schon von Hand erfasst (gleiche Rechnung, gleicher Tag, gleicher Betrag): erledigt, nicht noch einmal', () => {
    const [v] = abgleichen([buchung(120, 'RE-2026-1001')], [rechnung(1)], [{ invoiceId: 'r1', datum: '2026-11-10', betrag: 120 }]);
    expect(v).toMatchObject({ stufe: 'erledigt', teile: [] });
  });

  it('Gegenprobe: ein erfasster Eingang an einem anderen Tag hält den Vorschlag nicht auf', () => {
    const [v] = abgleichen([buchung(120, 'RE-2026-1001')], [rechnung(1)], [{ invoiceId: 'r1', datum: '2026-11-09', betrag: 120 }]);
    expect(v.stufe).toBe('passt');
  });

  it('schon verbucht (dieselbe Bewegung): erledigt', () => {
    const e = buchung(120, 'RE-2026-1001');
    const [v] = abgleichen([e], [rechnung(1)], [], new Set([e.kennung]));
    expect(v).toMatchObject({ stufe: 'erledigt', grund: 'Diese Bewegung ist schon verbucht.' });
  });
});

describe('Sammelüberweisung', () => {
  it('passt die Summe, gleicht sie jede Rechnung aus', () => {
    const [v] = abgleichen([buchung(240, 'RE-2026-1001 RE-2026-1002')], [rechnung(1), rechnung(2)]);
    expect(v.stufe).toBe('passt');
    expect(v.teile.map((t) => [t.rechnungId, t.betrag])).toEqual([['r1', 120], ['r2', 120]]);
  });
  it('mit Skonto auf beiden', () => {
    const s = { skontoProzent: 2, skontoBis: '2026-11-14' };
    const [v] = abgleichen([buchung(235.2, 'RE-2026-1001, RE-2026-1002')], [rechnung(1, s), rechnung(2, s)]);
    expect(v.stufe).toBe('passt');
    expect(v.teile.map((t) => [t.betrag, t.skonto])).toEqual([[117.6, 2.4], [117.6, 2.4]]);
  });
  it('Gegenprobe: passt die Summe nicht, der Reihe nach als Vorschlag zum Prüfen', () => {
    const [v] = abgleichen([buchung(200, 'RE-2026-1001 RE-2026-1002')], [rechnung(1), rechnung(2)]);
    expect(v.stufe).toBe('pruefen');
    expect(v.teile.map((t) => t.betrag)).toEqual([120, 80]);
  });
});

describe('Ohne Rechnungsnummer', () => {
  it('Betrag und Name eindeutig: Vorschlag zum Prüfen, nicht vorgewählt', () => {
    const andere = rechnung(2, { customerName: 'Bau Meier GmbH' });
    const [v] = abgleichen([buchung(120, 'Danke', { name: 'HUBER MARIA' })], [rechnung(1), andere]);
    expect(v.stufe).toBe('pruefen');
    expect(v.teile[0].rechnungId).toBe('r1');
    expect(v.grund).toMatch(/Betrag und Name passen/);
  });
  it('nur der Betrag, aber eindeutig: Vorschlag zum Prüfen', () => {
    const [v] = abgleichen([buchung(120, 'Danke', { name: 'Unbekannt' })], [rechnung(1), rechnung(2, { totalBrutto: 99 })]);
    expect(v.stufe).toBe('pruefen');
    expect(v.grund).toMatch(/nur der Betrag/);
  });
  it('Gegenprobe: mehrdeutig oder unbekannt bleibt ohne Zuordnung — sichtbar, nicht geraten', () => {
    const [a, b] = abgleichen(
      [buchung(120, 'Danke', { name: 'Unbekannt' }), buchung(55.55, 'Privat')],
      [rechnung(1), rechnung(2, { customerName: 'Bau Meier GmbH' })],
    );
    expect(a).toMatchObject({ stufe: 'offen', teile: [] });
    expect(a.grund).toMatch(/passt zu 2 offenen Rechnungen/);
    expect(b).toMatchObject({ stufe: 'offen', teile: [] });
  });
});

describe('Die Zuordnung von Hand', () => {
  const b = { betrag: 100 };
  it('was nicht zugeordnet ist, bleibt sichtbar', () => {
    expect(nichtZugeordnet(b, [{ rechnungId: 'r1', betrag: 60, skonto: 5, mahnkosten: 10 }])).toBe(30);
  });
  it('mehr als eingegangen, ohne Rechnung, doppelt oder leer wird nicht angenommen', () => {
    expect(zuordnungFehler(b, [{ rechnungId: 'r1', betrag: 90, skonto: 0, mahnkosten: 20 }])).toMatch(/mehr als eingegangen/);
    expect(zuordnungFehler(b, [{ rechnungId: '', betrag: 10, skonto: 0, mahnkosten: 0 }])).toMatch(/Rechnung wählen/);
    expect(zuordnungFehler(b, [
      { rechnungId: 'r1', betrag: 10, skonto: 0, mahnkosten: 0 }, { rechnungId: 'r1', betrag: 10, skonto: 0, mahnkosten: 0 },
    ])).toMatch(/nur einmal/);
    expect(zuordnungFehler(b, [{ rechnungId: 'r1', betrag: 0, skonto: 0, mahnkosten: 0 }])).toMatch(/ohne Betrag/);
  });
  it('Skonto zählt nicht als Geld: 100 € Eingang mit 2 € Skonto geht', () => {
    expect(zuordnungFehler(b, [{ rechnungId: 'r1', betrag: 100, skonto: 2, mahnkosten: 0 }])).toBeNull();
  });
});

/*
  ABBUCHUNGEN (Nacharbeit F13): eine Rückzahlung gehört zu einem Guthaben
  (überzahlt oder storniert und bezahlt) und wird gebucht wie im
  Zahlungsdialog — als negativer Eingang. Vorgewählt nur über die Nummer;
  was kein Guthaben betrifft, ist „nicht Rechnungen betreffend“.
*/
describe('Abbuchungen', () => {
  const ab = (betrag: number, zweck: string, rest: Partial<BankBuchung> = {}) => buchung(betrag, zweck, { ausgang: true, ...rest });
  const ueberzahlt = (n: number, mehr: number, rest: Partial<AbgleichRechnung> = {}) =>
    rechnung(n, { bezahltBetrag: 120 + mehr, paymentStatus: 'Überzahlt', ...rest });

  it('Nummer im Zweck, genau das Guthaben: Rückzahlung, vorgewählt', () => {
    const [v] = abgleichen([ab(30, 'Rückzahlung RE-2026-1001')], [ueberzahlt(1, 30)]);
    expect(v).toMatchObject({ stufe: 'passt', teile: [{ rechnungId: 'r1', betrag: 0, skonto: 0, mahnkosten: 0, rueckzahlung: 30 }] });
  });

  it('über die Nummer der Stornorechnung: das Guthaben der stornierten Rechnung', () => {
    const storniert = rechnung(1, { paymentStatus: 'Storniert', bezahltBetrag: 120, stornoNummer: 'RE-2026-1050' });
    const [v] = abgleichen([ab(120, 'Gutschrift zu RE-2026-1050')], [storniert]);
    expect(v).toMatchObject({ stufe: 'passt', teile: [{ rueckzahlung: 120 }] });
  });

  it('weniger als das Guthaben: Teil zurück, mit Hinweis; mehr: prüfen, Rest ohne Zuordnung', () => {
    const [a] = abgleichen([ab(10, 'RE-2026-1001')], [ueberzahlt(1, 30)]);
    expect(a.stufe).toBe('passt');
    expect(a.hinweise[0]).toMatch(/Guthaben bleibt €\s20,00/);
    const [b] = abgleichen([ab(50, 'RE-2026-1001')], [ueberzahlt(1, 30)]);
    expect(b).toMatchObject({ stufe: 'pruefen', teile: [{ rueckzahlung: 30 }] });
    expect(b.hinweise[0]).toMatch(/€\s20,00 bleiben ohne Zuordnung/);
  });

  it('Gegenprobe: Nummer im Zweck, aber kein Guthaben — keine Rückzahlung zu buchen', () => {
    const [v] = abgleichen([ab(30, 'RE-2026-1001')], [rechnung(1)]);
    expect(v).toMatchObject({ stufe: 'offen', teile: [] });
  });

  it('ohne Nummer: Betrag und Name eines Guthabens — prüfen; sonst nicht Rechnungen betreffend', () => {
    const [a, b] = abgleichen(
      [ab(30, 'Danke', { name: 'Maria Huber' }), ab(1450, 'Rechnung 4711 Großhandel', { name: 'Frauenthal Handel' })],
      [ueberzahlt(1, 30)],
    );
    expect(a).toMatchObject({ stufe: 'pruefen', teile: [{ rueckzahlung: 30 }] });
    expect(a.grund).toMatch(/Betrag und Name passen/);
    expect(b).toMatchObject({ stufe: 'fremd', teile: [] });
  });

  it('schon erfasste Rückzahlung (gleiche Rechnung, Tag, Betrag) und schon verbuchte Bewegung: erledigt', () => {
    const [a] = abgleichen([ab(30, 'RE-2026-1001')], [ueberzahlt(1, 30)], [{ invoiceId: 'r1', datum: '2026-11-10', betrag: -30 }]);
    expect(a.stufe).toBe('erledigt');
    const e = ab(30, 'RE-2026-1001');
    const [b] = abgleichen([e], [ueberzahlt(1, 30)], [], new Set([e.kennung]));
    expect(b.stufe).toBe('erledigt');
  });

  it('ein Eingang und eine Rückzahlung derselben Datei greifen ineinander', () => {
    // Erst 150 € auf eine 120-€-Rechnung (Guthaben 30), dann die Rückzahlung der 30 €.
    const [ein, aus] = abgleichen(
      [buchung(150, 'RE-2026-1001'), ab(30, 'RE-2026-1001', { buchungstag: '2026-11-12' })],
      [rechnung(1)],
    );
    expect(ein.stufe).toBe('pruefen');
    expect(aus).toMatchObject({ stufe: 'passt', teile: [{ rueckzahlung: 30 }] });
  });

  it('Zuordnung von Hand: nur Rückzahlungen, nicht mehr als das Guthaben', () => {
    const r = ueberzahlt(1, 30);
    expect(zuordnungFehler({ betrag: 40, ausgang: true }, [{ rechnungId: 'r1', betrag: 0, skonto: 0, mahnkosten: 0, rueckzahlung: 40 }], [r]))
      .toMatch(/€\s30,00 Guthaben/);
    expect(zuordnungFehler({ betrag: 40, ausgang: true }, [{ rechnungId: 'r1', betrag: 40, skonto: 0, mahnkosten: 0 }], [r]))
      .toMatch(/Rückzahlung/);
    expect(zuordnungFehler({ betrag: 40, ausgang: true }, [{ rechnungId: 'r1', betrag: 0, skonto: 0, mahnkosten: 0, rueckzahlung: 30 }], [r])).toBeNull();
    expect(nichtZugeordnet({ betrag: 40, ausgang: true }, [{ rechnungId: 'r1', betrag: 0, skonto: 0, mahnkosten: 0, rueckzahlung: 30 }])).toBe(10);
    // Bleibt gleich: beim Eingang ist eine Rückzahlung kein Teil.
    expect(zuordnungFehler({ betrag: 40 }, [{ rechnungId: 'r1', betrag: 0, skonto: 0, mahnkosten: 0, rueckzahlung: 10 }])).toMatch(/Abbuchung/);
  });
});
