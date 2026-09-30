/**
 * Die Anzahlungsrechnung — als Anteil vom Angebot (Testbericht 30.09.2026,
 * M20).
 *
 * WAS DER BERICHT FAND. Eine Anzahlung stand immer auf 0,00 € und wollte von
 * Hand ausgerechnet werden; der Leistungszeitraum blieb leer. Üblich ist eine
 * Vorgabe wie „30 % bei Auftrag", und auf die Anzahlungsrechnung gehört der
 * voraussichtliche Zeitraum der Leistung.
 *
 * WAS JETZT GILT.
 * - Mit angenommenem Angebot: der Betrag ist der Anteil von dessen Netto
 *   (nach Rabatt), auf den Cent gerundet. Die Zeile nennt Anteil, Angebot
 *   und dessen Datum: der Kunde erkennt, worauf er zahlt.
 * - Ohne Angebot bleibt die Zeile auf 0,00 €: die Null ist eine fehlende
 *   Entscheidung, kein Preis — wie bisher.
 * - Der Zeitraum kommt aus Beginn und Ende der Baustelle, nur wenn beides
 *   eingetragen ist. Ein halber Zeitraum wäre eine erfundene Angabe.
 *
 * Sie verbraucht weiterhin keine Belege: die Schlussrechnung zieht sie ab.
 */
import type { Project, Quote } from '@/types';
import type { AssembledInvoice } from './assemble';
import { calcTotals, cent, type InvoicePosition } from './totals';
import { datumAT } from '@/lib/datum';

/** Die übliche Vorgabe, wenn nichts anderes vereinbart ist. */
export const ANZAHLUNG_PROZENT_VORGABE = 30;

/** Ein Prozentsatz, der sich als Anteil lesen lässt — sonst `null`. */
export function anteilFehler(prozent: number | null | undefined): string | null {
  if (prozent == null || !Number.isFinite(prozent)) return 'Bitte einen Anteil in Prozent eintragen.';
  if (prozent <= 0 || prozent > 100) return 'Der Anteil liegt zwischen 0 und 100 %.';
  return null;
}

function prozentText(p: number): string {
  return p.toLocaleString('de-AT', { maximumFractionDigits: 2 });
}

export function anzahlungVorschau(args: {
  angebot: Pick<Quote, 'quoteNumber' | 'quoteDate' | 'totalNetto'> | null;
  prozent: number | null;
  baustelle: Pick<Project, 'startDate' | 'endDate'> | null | undefined;
  vatRate: number;
}): AssembledInvoice {
  const { angebot, prozent, baustelle, vatRate } = args;
  const mitAnteil = !!angebot && anteilFehler(prozent) === null;
  const betrag = mitAnteil ? cent((angebot!.totalNetto * prozent!) / 100) : 0;
  const zeile: InvoicePosition = {
    label: mitAnteil
      ? `Anzahlung ${prozentText(prozent!)} % auf Angebot ${angebot!.quoteNumber} vom ${datumAT(angebot!.quoteDate)}`
      : 'Anzahlung gemäß Vereinbarung',
    qty: 1,
    unit: 'Pauschale',
    unitPrice: betrag,
    netto: betrag,
  };
  const von = baustelle?.startDate?.trim();
  const bis = baustelle?.endDate?.trim();
  return {
    positions: [zeile],
    ...calcTotals([zeile], vatRate),
    discount: null,
    linkedEntries: [],
    linkedOrders: [],
    linkedWorkSheets: [],
    leistung: von && bis ? { von, bis } : null,
    materialOhnePreis: [],
    entries: [],
  };
}
