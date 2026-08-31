import type { Invoice } from '@/types';

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

/** Laufende Nummer aus 'RE-2026-1042' herauslösen; null, wenn keine da ist. */
export function invoiceSeqOf(number: string): number | null {
  const m = /(\d+)$/.exec(number.trim());
  return m ? Number(m[1]) : null;
}

export function formatInvoiceNumber(seq: number, year = new Date().getFullYear()): string {
  return `RE-${year}-${String(seq).padStart(4, '0')}`;
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
export function nextInvoiceNumber(existing: Pick<Invoice, 'invoiceNumber'>[]): string {
  const max = highestInvoiceSeq(existing);
  return formatInvoiceNumber(max > 0 ? max + 1 : 1001);
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
): number {
  if (desired == null) return last > 0 ? last + 1 : 1001;
  if (!Number.isInteger(desired) || desired < 1) {
    throw new Error('Eine Rechnungsnummer braucht eine ganze laufende Nummer.');
  }
  if (desired <= last) {
    throw new Error(
      `Die Nummer ${formatInvoiceNumber(desired, year)} ist bereits vergeben. ` +
        `Die nächste freie ist ${formatInvoiceNumber(last + 1, year)}.`,
    );
  }
  return desired;
}
