import { describe, it, expect } from 'vitest';
import { mahnungInhalt } from '@/features/invoices/mahnungPdf';
import {
  hoechsteMahnkosten, letzteMahnforderung, mahnforderungRechnen, mahnkostenVorschlag, mahnspesenBefund, verzugszinsen,
} from '@/features/invoices/mahnung';
import { zahlstand } from '@/features/invoices/zahlstand';
import type { Company, Invoice, Mahnung } from '@/types';

/**
 * Mahnspesen und Zinsen: EIN Modell für Einstellung, Schreiben und
 * Verbuchung (Durchsicht 15.11.2026, G3).
 *
 * Vorher drei Modelle. Nachgestellt (Szenario aus der Analyse): Spesen
 * 5/10/15 €, Rechnung 1.000 €. Nach Mahnung 2 zahlt der Kunde 500 € und die
 * Mahnkosten; Mahnung 3 fordert den Rest, die Spesen ihrer Stufe und Zinsen
 * wieder ab dem Zahlungsziel auf den heutigen Rest. Zahlt er genau das, ließ
 * die Verbuchung nur „letzte Mahnung minus alle bisherigen Mahnkosten“ zu —
 * der Rest wurde Guthaben, und der Dialog schlug eine Rückzahlung vor.
 * Gegenprobe: vor der Änderung ist die erste Prüfung rot.
 */

const firma = {
  id: 'perl', name: 'Perl Installationen GmbH',
  rates: { mahnspesen: [5, 10, 15], mahnspesenVerbraucher: [5, 10, 15] },
} as unknown as Company;

const rechnung = (bezahlt: number): Invoice => ({
  companyId: 'perl', invoiceNumber: 'RE-2026-1001', projectNumber: 'B-1', customerName: 'Familie Huber',
  invoiceDate: '2026-02-15', dueDate: '2026-03-01', totalNetto: 1000 / 1.2, totalVat: 1000 - 1000 / 1.2,
  totalBrutto: 1000, vatRate: 0.2, paymentStatus: bezahlt > 0 ? 'Teilbezahlt' : 'Überfällig',
  bezahltBetrag: bezahlt, createdAt: 0,
}) as Invoice;

function schreiben(stufe: 1 | 2 | 3, datum: string, bezahlt: number, frueher: Mahnung[], zahlungen: { datum: string; betrag: number; art: string }[]) {
  const inv = rechnung(bezahlt);
  const zinsen = verzugszinsen({
    stufe, rest: zahlstand(inv).rest, faellig: inv.dueDate, bis: datum, unternehmer: false,
    zahlungen: zahlungen.filter((z) => z.art !== 'Mahnkosten'),
  });
  return mahnungInhalt({
    company: firma, invoice: inv, stufe, datum, frist: datum, zinsen, unternehmer: false, frueher,
    mahnkostenBezahlt: zahlungen.filter((z) => z.art === 'Mahnkosten').reduce((s, z) => s + z.betrag, 0),
  });
}

const alsMahnung = (inhalt: Mahnung['inhalt']): Mahnung => ({
  id: `m${inhalt.stufe}`, companyId: 'perl', invoiceId: 'r1', stufe: inhalt.stufe, datum: inhalt.datum,
  frist: inhalt.frist, spesen: inhalt.kosten, inhalt,
});

describe('Mahnkosten nach einem Modell (G3)', () => {
  const m1 = schreiben(1, '2026-03-15', 0, [], []);
  const m2 = schreiben(2, '2026-04-01', 0, [alsMahnung(m1)], []);
  // Am 10.04. zahlt der Kunde 500 € auf die Rechnung und, was Mahnung 2 an Mahnkosten fordert.
  const eingaenge = [
    { datum: '2026-04-10', betrag: 500, art: 'Überweisung' },
    { datum: '2026-04-10', betrag: m2.forderung!, art: 'Mahnkosten' },
  ];
  const m3 = schreiben(3, '2026-05-01', 500, [alsMahnung(m1), alsMahnung(m2)], eingaenge);

  it('zahlt der Kunde genau, was Mahnung 3 verlangt, entsteht kein Guthaben', () => {
    const forderung = letzteMahnforderung([alsMahnung(m1), alsMahnung(m2), alsMahnung(m3)], { mahnstufe: 3, mahnspesen: m3.kosten });
    const mahnkostenOffen = forderung - m2.forderung!;
    const rest = zahlstand(rechnung(500)).rest;
    const aufMahnkosten = mahnkostenVorschlag(m3.offen, rest, mahnkostenOffen);
    // Was über den Rest hinausgeht, ist genau die offene Mahnforderung — nichts bleibt übrig.
    expect(aufMahnkosten).toBeCloseTo(m3.offen - rest, 2);
    expect(rest + aufMahnkosten).toBeCloseTo(m3.offen, 2);
  });

  it('das Schreiben fordert die Spesen früherer Stufen mit und nennt Bezahltes', () => {
    expect(m2.kostenFrueher).toBe(5);
    expect(m2.forderung).toBeCloseTo(5 + 10 + m2.zinsen!, 2);
    expect(m3.kostenFrueher).toBe(15);
    expect(m3.mahnkostenBezahlt).toBe(m2.forderung);
    expect(m3.zeilen.map(([k]) => k)).toEqual(expect.arrayContaining([
      'Mahnspesen früherer Schreiben', 'Mahnspesen', 'Bereits bezahlte Mahnspesen und Zinsen',
    ]));
    expect(m3.offen).toBeCloseTo(500 + m3.forderung! - m2.forderung!, 2);
  });

  it('die Zinsen laufen je Tag auf den Betrag, der an ihm offen war', () => {
    // 1.000 € vom 02.03. bis 09.04. (39 Tage), 500 € vom 10.04. bis 01.05. (22 Tage), je 4 %.
    expect(m3.zinsen).toBeCloseTo(Math.round((1000 * 0.04 * 39 / 365 + 500 * 0.04 * 22 / 365) * 100) / 100, 2);
  });

  it('die Einstellung rechnet dieselbe Höchstsumme wie die Schreiben', () => {
    expect(hoechsteMahnkosten(firma.rates as never, false)).toBe(30);
    expect(mahnspesenBefund({ mahnspesen: [10, 15, 20] } as never).firmaZuViel).toBe(45);
    // Pauschale nach § 458 UGB: einmal je Rechnung.
    expect(hoechsteMahnkosten({ pauschale458: true } as never, true)).toBe(40);
  });

  // Bleibt gleich: ohne Teilzahlung und ohne frühere Kosten wie bisher.
  it('ohne Zahlungen: dieselben Zinsen wie bisher', () => {
    const ohne = verzugszinsen({ stufe: 2, rest: 1000, faellig: '2026-03-01', bis: '2026-04-01', unternehmer: false });
    const leer = verzugszinsen({ stufe: 2, rest: 1000, faellig: '2026-03-01', bis: '2026-04-01', unternehmer: false, zahlungen: [] });
    expect(leer).toEqual(ohne);
    expect(ohne).toMatchObject({ art: 'berechnet', tage: 31, betrag: 3.4 });
    expect(mahnforderungRechnen({ kosten: 10, frueher: [], zinsen: 3.4, bezahlt: 0 }))
      .toEqual({ kosten: 10, kostenFrueher: 0, zinsen: 3.4, forderung: 13.4, bezahlt: 0, offen: 13.4 });
  });
});
