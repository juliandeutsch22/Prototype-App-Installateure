import type { Customer, Invoice } from '@/types';
import { invoiceSeqOf } from '@/lib/invoiceNumbers';

/**
 * Rechnungsausgangsbuch für den Steuerberater.
 *
 * WOZU. Bis hierher bekam der Steuerberater PDFs und tippte jede Rechnung ab.
 * Das kostet Geld, dauert, und jede Abtipperei ist eine Gelegenheit für einen
 * Zahlendreher — ausgerechnet bei den Zahlen, die in die Umsatzsteuervoranmeldung
 * gehen.
 *
 * WARUM EIN DOKUMENTIERTES CSV UND KEIN BMD- ODER DATEV-FORMAT. Beide haben
 * feste Spaltenlayouts mit Konten- und Steuerschlüsseln, die sich nach dem
 * Kontenplan der Kanzlei richten — welche Erlöskonten dieser Betrieb bebucht,
 * weiß nur der Steuerberater. Ein geratenes Format wäre schlimmer als keins:
 * es sieht importierbar aus und bucht auf die falschen Konten. Dieses CSV
 * enthält alle Felder, die BMD, RZL und DATEV für einen Import brauchen; die
 * Zuordnung zu Konten macht die Kanzlei einmal beim Einrichten.
 *
 * WAS BESONDERS WICHTIG IST:
 *
 *  - STORNIERTE RECHNUNGEN GEHEN MIT. Sie wegzulassen wäre der naheliegende
 *    Fehler: eine stornierte Rechnung ist kein Nichts, sondern ein Vorgang,
 *    der im Journal stehen muss. Ein Nummernkreis mit Lücken ist für jede
 *    Prüfung ein Befund.
 *  - DIE LÜCKENPRÜFUNG läuft mit und meldet fehlende Nummern, statt sie
 *    stillschweigend zu übergehen.
 *  - DIE UID-NUMMER kommt aus den Kundenstammdaten. Für Rechnungen an
 *    Unternehmen im EU-Ausland ist sie Pflichtangabe — vor den
 *    Kundenstammdaten gab es sie im System schlicht nicht.
 */

function num(n: number | undefined): string {
  return (n ?? 0).toFixed(2).replace('.', ',');
}

function prozent(anteil: number | undefined): string {
  return ((anteil ?? 0) * 100).toFixed(2).replace('.', ',');
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function cell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(values: unknown[]): string {
  return values.map(cell).join(';');
}

const KOPF = [
  'Rechnungsnummer',
  'Rechnungsdatum',
  'Fälligkeitsdatum',
  'Kunde',
  'UID-Nummer',
  'Baustelle',
  'Netto',
  'USt-Satz %',
  'USt-Betrag',
  'Brutto',
  'Zahlungsstatus',
  'Storniert',
  'Stornogrund',
];

export interface RechnungsExport {
  csv: string;
  anzahl: number;
  summeNetto: number;
  summeBrutto: number;
  /** Fehlende Nummern im Kreis — leer ist gut. */
  luecken: string[];
}

/**
 * Baut das Journal für einen Zeitraum.
 *
 * Sortiert nach Rechnungsnummer, nicht nach Datum: der Steuerberater prüft
 * den Nummernkreis, und der ist die eigentliche Ordnung eines
 * Rechnungsausgangsbuchs.
 */
export function buildInvoiceCsv(
  invoices: Invoice[],
  kunden: Customer[],
  von: string,
  bis: string,
): RechnungsExport {
  const imZeitraum = invoices
    .filter((i) => i.invoiceDate >= von && i.invoiceDate <= bis)
    .sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber, 'de'));

  // Die UID hängt am Kunden, die Rechnung trägt nur seinen Namen. Der
  // Abgleich läuft deshalb über den Namen — bei verknüpften Baustellen ist er
  // aus den Stammdaten kopiert und damit verlässlich gleich geschrieben.
  const uidNachName = new Map(
    kunden.filter((k) => k.vatId?.trim()).map((k) => [k.name.trim().toLowerCase(), k.vatId!.trim()]),
  );

  const zeilen = [row(KOPF)];
  let summeNetto = 0;
  let summeBrutto = 0;

  for (const i of imZeitraum) {
    const storniert = i.paymentStatus === 'Storniert';
    zeilen.push(
      row([
        i.invoiceNumber,
        fmtDate(i.invoiceDate),
        fmtDate(i.dueDate),
        i.customerName,
        uidNachName.get(i.customerName.trim().toLowerCase()) ?? '',
        i.projectNumber,
        num(i.totalNetto),
        prozent(i.vatRate),
        num(i.totalVat),
        num(i.totalBrutto),
        i.paymentStatus,
        storniert ? 'ja' : 'nein',
        i.cancellationNote ?? '',
      ]),
    );
    /**
     * Stornierte Rechnungen zählen NICHT in die Summen, stehen aber im
     * Journal. Beides zusammen ist der Punkt: der Vorgang bleibt sichtbar,
     * der Umsatz nicht.
     */
    if (!storniert) {
      summeNetto += i.totalNetto ?? 0;
      summeBrutto += i.totalBrutto ?? 0;
    }
  }

  // Summenzeile, damit sich der Export gegen die Voranmeldung abgleichen lässt.
  zeilen.push(row([]));
  zeilen.push(row(['Summe (ohne Storni)', '', '', '', '', '', num(summeNetto), '', '', num(summeBrutto)]));

  return {
    csv: zeilen.join('\n'),
    anzahl: imZeitraum.length,
    summeNetto,
    summeBrutto,
    luecken: findeLuecken(imZeitraum),
  };
}

/**
 * Fehlende Nummern im Kreis.
 *
 * Ein lückenhafter Nummernkreis ist bei jeder Prüfung ein Befund — entweder
 * fehlt eine Rechnung, oder sie wurde gelöscht statt storniert. Beides gehört
 * geklärt, BEVOR der Export in die Kanzlei geht. Die Prüfung läuft nur
 * innerhalb eines Jahres, weil der Kreis jährlich neu beginnt.
 */
export function findeLuecken(invoices: Invoice[]): string[] {
  const nachJahr = new Map<string, number[]>();
  for (const i of invoices) {
    const seq = invoiceSeqOf(i.invoiceNumber);
    if (seq == null) continue;
    const jahr = i.invoiceNumber.split('-')[1] ?? '';
    const liste = nachJahr.get(jahr) ?? [];
    liste.push(seq);
    nachJahr.set(jahr, liste);
  }

  const fehlend: string[] = [];
  for (const [jahr, nummern] of nachJahr) {
    const sortiert = [...new Set(nummern)].sort((a, b) => a - b);
    for (let n = sortiert[0]; n < sortiert[sortiert.length - 1]; n++) {
      if (!sortiert.includes(n)) {
        fehlend.push(`RE-${jahr}-${String(n).padStart(4, '0')}`);
      }
    }
  }
  return fehlend;
}

export function invoiceCsvFilename(von: string, bis: string): string {
  return `Rechnungsausgangsbuch_${von}_bis_${bis}.csv`;
}
