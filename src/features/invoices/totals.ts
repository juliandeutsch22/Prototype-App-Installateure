import type { InvoiceDiscount } from '@/types';

/**
 * Was eine Zeile auf dem Beleg ist (Testbericht 30.09.2026, M18).
 *
 *   position  eine Leistung mit Menge und Preis — wie bisher
 *   titel     eine Überschrift über die folgenden Positionen („Bad“,
 *             „Heizraum“); auf dem Beleg mit der Summe ihrer Positionen
 *   text      ein Hinweis ohne Preis („Bauseits: Strom und Wasser“)
 *
 * Titel und Text tragen weder Menge noch Preis; sie zählen nie zur Summe.
 * Ohne Angabe ist eine Zeile eine Position — so liegen alle älteren.
 */
export type PositionsArt = 'position' | 'titel' | 'text';

export interface InvoicePosition {
  label: string;
  qty: number;
  unit: string;
  unitPrice: number;
  netto: number;
  art?: PositionsArt;
  /**
   * Nachlass auf diese eine Position in Prozent (M18), zwischen 0 und 100
   * ausschließlich. Der Einzelpreis bleibt der Listenpreis; das Netto der
   * Zeile ist schon nach Abzug. Der Rabatt über die ganze Rechnung kommt
   * danach, auf die Summe.
   */
  rabattProzent?: number | null;
  /** Woher die Zeile stammt, wenn sie aus dem Katalog kam — nur zum Nachsehen. */
  materialId?: string | null;
}

/** Trägt die Zeile Menge und Preis? Titel und Text nicht. */
export function istPreiszeile(p: Pick<InvoicePosition, 'art'>): boolean {
  return (p.art ?? 'position') === 'position';
}

/** Ein gültiger Positionsrabatt — sonst `null` (kein Rabatt). */
export function rabattAnteil(prozent: number | null | undefined): number | null {
  return prozent != null && Number.isFinite(prozent) && prozent > 0 && prozent < 100 ? prozent : null;
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

/** Nettobetrag einer Position — mit ihrem eigenen Rabatt, falls sie einen hat. */
export function positionNetto(qty: number, unitPrice: number, rabattProzent?: number | null): number {
  const rabatt = rabattAnteil(rabattProzent);
  return cent(qty * unitPrice * (rabatt ? 1 - rabatt / 100 : 1));
}

/** Das Netto einer Zeile: bei Titel und Text null, sonst Menge × Preis abzüglich Positionsrabatt. */
export function zeilenNetto(
  p: Pick<InvoicePosition, 'qty' | 'unitPrice' | 'art' | 'rabattProzent'>,
): number {
  return istPreiszeile(p) ? positionNetto(p.qty, p.unitPrice, p.rabattProzent) : 0;
}

/**
 * Die Summe jedes Titels: alle Positionen nach ihm bis zum nächsten Titel.
 * Schlüssel ist die Stelle des Titels in der Liste.
 */
export function titelSummen(positions: Pick<InvoicePosition, 'art' | 'netto'>[]): Map<number, number> {
  const summen = new Map<number, number>();
  let titel: number | null = null;
  positions.forEach((p, i) => {
    if (p.art === 'titel') {
      titel = i;
      summen.set(i, 0);
    } else if (titel !== null && istPreiszeile(p)) {
      summen.set(titel, cent((summen.get(titel) ?? 0) + (p.netto || 0)));
    }
  });
  return summen;
}

/** „Rabatt 5 %“ — wie der Positionsrabatt auf dem Beleg und in der Ansicht steht. */
export function positionsRabattText(prozent: number | null | undefined): string | null {
  const r = rabattAnteil(prozent);
  return r ? `abzüglich ${String(r).replace('.', ',')} % Rabatt` : null;
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
  positions: Pick<InvoicePosition, 'netto' | 'art'>[],
  vatRate: number,
  discount?: InvoiceDiscount | null,
): InvoiceTotals {
  // Titel und Text tragen kein Netto; mitgezählt würde ein versehentlich
  // gesetzter Betrag die Summe verfälschen.
  const subtotalNetto = cent(positions.reduce((s, p) => s + (istPreiszeile(p) ? p.netto || 0 : 0), 0));

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
