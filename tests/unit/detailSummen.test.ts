import { describe, it, expect } from 'vitest';
import { detailSummen } from '@/features/invoices/detailSummen';
import { summenZeilen } from '@/features/invoices/summenZeilen';
import { mitAbzug } from '@/features/invoices/vorrechnungen';
import { euroBetrag } from '@/lib/betrag';
import type { Vorrechnung } from '@/types';

/**
 * Nachtest 01.10.2026, N2: Die Detailansicht der Schlussrechnung RE-2026-1506
 * zeigte die Position über 5.000 € und darunter „Netto 3.500 €“, ohne die
 * Zeile „abzüglich RE-2026-1505“. Jetzt gliedert sie wie Vorschau und PDF —
 * und diese Prüfung hält die drei gegeneinander.
 */
const ANZAHLUNG: Vorrechnung = {
  invoiceId: 'a1', invoiceNumber: 'RE-2026-1505', invoiceDate: '2026-09-30', netto: 1500, vat: 300, brutto: 1800,
};
const GESAMT = { totalNetto: 5000, totalVat: 1000, totalBrutto: 6000 };
const summen = mitAbzug(GESAMT, [ANZAHLUNG]);
// So steht die Schlussrechnung gespeichert.
const gespeichert = {
  totalNetto: summen.totalNetto, totalVat: summen.totalVat, totalBrutto: summen.totalBrutto,
  gesamtNetto: summen.gesamtNetto, gesamtVat: summen.gesamtVat, gesamtBrutto: summen.gesamtBrutto,
  vorrechnungen: [ANZAHLUNG],
};

describe('N2 — Detailansicht der Schlussrechnung', () => {
  it('Gesamtleistung, Abzug der Anzahlung, Restforderung', () => {
    const z = detailSummen(gespeichert);
    expect(z.map((x) => [x.wort.replace(/\s+\(.*\)$/, ''), x.betrag])).toEqual([
      ['Gesamtleistung netto', 5000],
      ['Umsatzsteuer', 1000],
      ['Gesamtleistung brutto', 6000],
      ['abzüglich RE-2026-1505 vom 30.09.2026', 1800],
      ['Restforderung netto', 3500],
      ['Umsatzsteuer', 700],
      ['Restforderung brutto', 4200],
    ]);
    expect(z[3].wort).toMatch(/netto €.1.500,00 \+ USt €.300,00/);
  });

  it('stimmt mit dem PDF überein — Gesamtleistung, Abzug, Restforderung', () => {
    const pdf = summenZeilen({
      assembled: { discount: null, discountAmount: 0, subtotalNetto: 5000, ...GESAMT },
      vatRate: 0.2, rc: false, abzuege: [ANZAHLUNG], forderung: summen.totalBrutto,
    });
    const wert = (wort: string) => pdf.find((r) => r[3] === wort || r[0].startsWith(wort))?.[4];
    const detail = detailSummen(gespeichert);
    expect(wert('Gesamtleistung brutto')).toBe(euroBetrag(detail[2].betrag));
    expect(wert('abzüglich RE-2026-1505')).toBe(`- ${euroBetrag(detail[3].betrag)}`);
    expect(wert('Restforderung brutto')).toBe(euroBetrag(detail[6].betrag));
  });

  it('ohne Abzug wie bisher: Netto, USt, Brutto', () => {
    expect(detailSummen(GESAMT).map((z) => z.wort)).toEqual(['Netto', 'Umsatzsteuer', 'Brutto']);
  });

  it('rechnet die Gesamtleistung auch für Altbestand ohne gespeicherte Gesamtsummen', () => {
    const alt = { ...gespeichert, gesamtNetto: undefined, gesamtVat: undefined, gesamtBrutto: undefined };
    expect(detailSummen(alt)[2].betrag).toBe(6000);
  });
});

describe('N3 — Leistungszeitraum der Schlussrechnung aus der Anzahlung', () => {
  it('früheste Anzahlung von, späteste bis; stornierte und Einzelrechnungen zählen nicht', async () => {
    const { leistungAusVorrechnungen } = await import('@/features/invoices/vorrechnungen');
    expect(leistungAusVorrechnungen([
      { art: 'anzahlung', paymentStatus: 'Bezahlt', leistungVon: '2026-10-12', leistungBis: '2026-10-23' },
      { art: 'teil', paymentStatus: 'Offen', leistungVon: '2026-10-05', leistungBis: '2026-10-20' },
      { art: 'anzahlung', paymentStatus: 'Storniert', leistungVon: '2026-01-01', leistungBis: '2026-12-31' },
      { art: 'einzel', paymentStatus: 'Offen', leistungVon: '2026-09-01', leistungBis: '2026-11-30' },
    ])).toEqual({ von: '2026-10-05', bis: '2026-10-23' });
    expect(leistungAusVorrechnungen([{ art: 'anzahlung', paymentStatus: 'Offen' }])).toBeNull();
  });
});
