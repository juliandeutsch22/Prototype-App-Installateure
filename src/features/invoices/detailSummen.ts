import type { Invoice } from '@/types';
import { euro } from '@/lib/betrag';

export interface SummenZeile {
  wort: string;
  betrag: number;
  /** Abgezogen — steht mit Minus da. */
  abzug?: boolean;
  /** Der Betrag, um den es geht: Brutto bzw. Restforderung. */
  betont?: boolean;
}

/**
 * Die Summen einer gespeicherten Rechnung, gegliedert wie auf dem Beleg
 * (Nachtest 01.10.2026, N2).
 *
 * Eine Schlussrechnung zeigt die GESAMTLEISTUNG, darunter jede abgezogene
 * Anzahlung mit Nummer, Datum, netto, USt und brutto, und erst dann die
 * Restforderung — wie Vorschau und PDF (`summenZeilen`). Die Detailansicht
 * zeigte vorher die Position über 5.000 € und darunter „Netto 3.500 €“ ohne
 * die Zeile dazwischen; das sah aus wie ein Rechenfehler.
 */
export function detailSummen(inv: Pick<Invoice, 'totalNetto' | 'totalVat' | 'totalBrutto' | 'vorrechnungen' | 'gesamtNetto' | 'gesamtVat' | 'gesamtBrutto'>): SummenZeile[] {
  const abzuege = inv.vorrechnungen ?? [];
  if (abzuege.length === 0) {
    return [
      { wort: 'Netto', betrag: inv.totalNetto },
      { wort: 'Umsatzsteuer', betrag: inv.totalVat },
      { wort: 'Brutto', betrag: inv.totalBrutto, betont: true },
    ];
  }
  const summe = (f: 'netto' | 'vat' | 'brutto') =>
    Math.round(abzuege.reduce((s, v) => s + v[f], 0) * 100) / 100;
  const gesamtNetto = inv.gesamtNetto ?? Math.round((inv.totalNetto + summe('netto')) * 100) / 100;
  const gesamtVat = inv.gesamtVat ?? Math.round((inv.totalVat + summe('vat')) * 100) / 100;
  const gesamtBrutto = inv.gesamtBrutto ?? Math.round((inv.totalBrutto + summe('brutto')) * 100) / 100;
  return [
    { wort: 'Gesamtleistung netto', betrag: gesamtNetto },
    { wort: 'Umsatzsteuer', betrag: gesamtVat },
    { wort: 'Gesamtleistung brutto', betrag: gesamtBrutto },
    ...abzuege.map((v) => ({
      wort: `abzüglich ${v.invoiceNumber} vom ${v.invoiceDate.split('-').reverse().join('.')} (netto ${euro(v.netto)} + USt ${euro(v.vat)})`,
      betrag: v.brutto,
      abzug: true,
    })),
    { wort: 'Restforderung netto', betrag: inv.totalNetto },
    { wort: 'Umsatzsteuer', betrag: inv.totalVat },
    { wort: 'Restforderung brutto', betrag: inv.totalBrutto, betont: true },
  ];
}

