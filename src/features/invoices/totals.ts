import type { InvoiceDiscount } from '@/types';

export interface InvoicePosition {
  label: string;
  qty: number;
  unit: string;
  unitPrice: number;
  netto: number;
}

export interface InvoiceTotals {
  /** Summe der Positionen, vor Rabatt. */
  subtotalNetto: number;
  /** Abzug in Euro — immer positiv oder null. */
  discountAmount: number;
  /** Nach Rabatt; Bemessungsgrundlage der Umsatzsteuer. */
  totalNetto: number;
  totalVat: number;
  totalBrutto: number;
}

/** Auf Cent runden. Ohne das schleppt jede Multiplikation Nachkommastellen mit. */
export function cent(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Nettobetrag einer Position. */
export function positionNetto(qty: number, unitPrice: number): number {
  return cent(qty * unitPrice);
}

/**
 * Summen einer Rechnung, inklusive Rabatt.
 *
 * Der Rabatt wird auf das NETTO gerechnet, nicht auf das Brutto: die
 * Umsatzsteuer bemisst sich am tatsächlich vereinbarten Entgelt (§ 4 UStG),
 * und das ist der Betrag nach Abzug. Rechnete man ihn vom Brutto ab, stünde
 * auf der Rechnung eine Steuer, die nie geschuldet wurde.
 *
 * Der Abzug wird gedeckelt: mehr als die Rechnungssumme kann kein Rabatt
 * sein. Ohne die Grenze ergäbe ein vertippter Betrag ein negatives Netto und
 * damit eine Gutschrift, die niemand gewollt hat.
 */
export function calcTotals(
  positions: Pick<InvoicePosition, 'netto'>[],
  vatRate: number,
  discount?: InvoiceDiscount | null,
): InvoiceTotals {
  const subtotalNetto = cent(positions.reduce((s, p) => s + (p.netto || 0), 0));

  let discountAmount = 0;
  if (discount && discount.value > 0) {
    discountAmount =
      discount.mode === 'percent'
        ? cent(subtotalNetto * (Math.min(discount.value, 100) / 100))
        : cent(discount.value);
    discountAmount = Math.min(discountAmount, subtotalNetto);
  }

  const totalNetto = cent(subtotalNetto - discountAmount);
  const totalVat = cent(totalNetto * vatRate);
  const totalBrutto = cent(totalNetto + totalVat);

  return { subtotalNetto, discountAmount, totalNetto, totalVat, totalBrutto };
}

/** 'Rabatt 5 %' bzw. 'Rabatt' — Beschriftung der Abzugszeile. */
export function discountLabel(d: InvoiceDiscount): string {
  const name = d.label?.trim() || 'Rabatt';
  return d.mode === 'percent'
    ? `${name} ${String(d.value).replace('.', ',')} %`
    : name;
}
