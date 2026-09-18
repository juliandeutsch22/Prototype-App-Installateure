import type { Invoice } from '@/types';
import { belegNummer, lfdNummerVon, PRAEFIX_VORGABE } from './praefixe';

/**
 * Rechnungsnummern — reine Rechenregeln, ohne Firestore.
 *
 * Bewusst ein eigenes Modul: die Vergabe ist der Teil des Rechnungswesens,
 * bei dem ein Fehler nicht auffällt und trotzdem teuer wird (zwei Rechnungen
 * mit derselben Nummer, oder Lücken im Kreis, die der Steuerberater erklären
 * lassen will). Getrennt vom Datenbankzugriff ist sie ohne Emulator prüfbar.
 */

/** Höchste bereits vergebene laufende Nummer, 0 wenn noch keine existiert. */
export function highestInvoiceSeq(existing: Pick<Invoice, 'invoiceNumber'>[]): number {
  let max = 0;
  for (const inv of existing) {
    const seq = invoiceSeqOf(inv.invoiceNumber ?? '');
    if (seq != null) max = Math.max(max, seq);
  }
  return max;
}

/**
 * Laufende Nummer aus 'RE-2026-1042' herauslösen; null, wenn keine da ist.
 *
 * LIEST DIE ZIFFERN AM ENDE, NICHT DEN VORSATZ — und genau das trägt über
 * einen Wechsel hinweg. Wer mitten im Jahr von `RE-` auf `R-` umstellt, hat
 * einen lückenlosen Zahlenkreis in zwei Schreibweisen; würde hier der Vorsatz
 * mitgeprüft, finge die Zählung wieder bei 1001 an und risse eine Lücke, die
 * der Steuerberater erklären lassen will.
 */
export function invoiceSeqOf(number: string): number | null {
  return lfdNummerVon(number);
}

/**
 * `RE-2026-1001` — der Vorsatz kommt vom BETRIEB, nicht aus dieser Datei.
 *
 * Er stand hier fest verdrahtet, und ein zweites Mal in
 * `db/pg/invoices.ts:reserveInvoiceNumber`. Zwei Quellen für dieselbe
 * Wahrheit: liefen sie auseinander, zeigte der Vorschlag eine andere Nummer
 * an, als die Rechnung danach trug.
 *
 * Die VORGABE steht hier trotzdem als Rückfall — ein Betrieb, der nichts
 * festgelegt hat, zählt weiter wie bisher. Sie in `PRAEFIX_VORGABE` zu holen
 * statt sie hinzuschreiben, hält sie an der einen Stelle.
 */
export function formatInvoiceNumber(
  seq: number,
  year = new Date().getFullYear(),
  praefix = PRAEFIX_VORGABE.rechnung,
): string {
  return belegNummer(praefix, year, seq);
}

/**
 * VORSCHLAG für die nächste Rechnungsnummer — nur zur Anzeige.
 *
 * Startet bei 1001, sofern noch nichts existiert — läuft aber NICHT auf 1000
 * hoch, wenn ein Betrieb bereits einen niedrigeren Nummernkreis nutzt: sonst
 * entstünden Lücken in der fortlaufenden Nummerierung, die steuerlich
 * begründet werden müssten.
 *
 * Verbindlich wird die Nummer erst durch `reserveInvoiceNumber`. Dieser
 * Vorschlag darf und wird veralten, sobald jemand anderes gleichzeitig
 * abrechnet.
 */
export function nextInvoiceNumber(
  existing: Pick<Invoice, 'invoiceNumber'>[],
  praefix = PRAEFIX_VORGABE.rechnung,
): string {
  const max = highestInvoiceSeq(existing);
  return formatInvoiceNumber(max > 0 ? max + 1 : 1001, new Date().getFullYear(), praefix);
}

/** Prüft, ob eine Nummer bereits vergeben ist (Stornos zählen mit). */
export function isInvoiceNumberTaken(
  existing: Pick<Invoice, 'invoiceNumber'>[] & { id?: string }[],
  number: string,
  exceptId?: string,
) {
  const n = number.trim().toLowerCase();
  return existing.some(
    (i) => i.invoiceNumber?.toLowerCase() === n && (i as { id?: string }).id !== exceptId,
  );
}

/**
 * Welche Nummer folgt auf `last`? Reine Entscheidung, damit sie prüfbar ist —
 * die Transaktion drumherum trägt nur Lesen und Schreiben bei.
 *
 * Wirft, wenn die gewünschte Nummer schon verbraucht ist. Der Fehlertext
 * nennt die nächste freie: wer eine Nummer von Hand setzt, will wissen,
 * welche stattdessen geht, und nicht bloß, dass es nicht ging.
 */
export function decideInvoiceSeq(
  last: number,
  desired?: number,
  year = new Date().getFullYear(),
  praefix = PRAEFIX_VORGABE.rechnung,
): number {
  if (desired == null) return last > 0 ? last + 1 : 1001;
  if (!Number.isInteger(desired) || desired < 1) {
    throw new Error('Eine Rechnungsnummer braucht eine ganze laufende Nummer.');
  }
  if (desired <= last) {
    throw new Error(
      `Die Nummer ${formatInvoiceNumber(desired, year, praefix)} ist bereits vergeben. ` +
        `Die nächste freie ist ${formatInvoiceNumber(last + 1, year, praefix)}.`,
    );
  }
  return desired;
}
