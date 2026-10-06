import { stornoBelegTag } from './stornoBelegTag';
import {
  briefkopf,
  empfaenger,
  fusszeilen,
  GRAU,
  kopfdaten,
  RAND,
  RECHTS,
  TABELLE_AB,
  TINTE,
  titel,
} from '@/lib/belegLayout';
import { RC_HINWEIS } from './reverseCharge';
import { zahlstand } from './zahlstand';
import type { Company, Invoice, RechnungsArt } from '@/types';
import { euroBetrag } from '@/lib/betrag';

/**
 * Die Stornorechnung als Beleg (offene Punkte B7).
 *
 * EIN EIGENES BLATT, KEINE NEGATIVE KOPIE DER RECHNUNG. Die Rechnung liegt
 * beim Kunden; was er braucht, ist ein zweiter Beleg mit eigener Nummer, der
 * sagt, welche Rechnung in welcher Höhe aufgehoben ist. Die Positionen noch
 * einmal mit Minus davor nachzudrucken, sagte dasselbe länger — und die
 * Rabattzeilen stünden mit doppeltem Vorzeichen da.
 *
 * DIE BETRÄGE SIND DIE DER RECHNUNG, mit umgekehrtem Vorzeichen: was sie
 * gefordert hat (bei einer Schlussrechnung also nach Abzug der
 * Vorrechnungen). Dieselben Zahlen bucht der BMD-Export als Storno.
 *
 * DAS DATUM IST DER TAG DES STORNOS — derselbe, an dem Ausgangsbuch und
 * BMD-Export den Storno führen.
 */

const ART: Record<RechnungsArt, string> = {
  einzel: 'Rechnung',
  anzahlung: 'Anzahlungsrechnung',
  teil: 'Teilrechnung',
  schluss: 'Schlussrechnung',
};

function fmtDatum(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso ?? '–';
  const [j, m, t] = iso.split('-');
  return `${t}.${m}.${j}`;
}

/** Der Kalendertag eines Zeitpunkts in Wien — so, wie der Storno gebucht wird. */
export function stornoTag(ms: number): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date(ms));
}

export interface StornoOptionen {
  company: Company;
  invoice: Invoice;
  /** Die Nummer der Stornorechnung. */
  nummer: string;
}

export async function buildStornoPdf(o: StornoOptionen): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const inv = o.invoice;
  const art = ART[inv.art ?? 'einzel'];
  /*
    DAS DATUM IST DER TAG DER AUSSTELLUNG (Testbericht 30.09.2026, H6). Bis
    hierher trug der Beleg den Tag des Stornos — wurde er später ausgestellt,
    stand eine höhere Nummer mit älterem Datum im Kreis (RE-2026-1503 vom
    25.09. hinter RE-2026-1502 vom 30.09.). Der Tag des Stornos steht jetzt im
    Text. Ohne `stornoAm` wird der Beleg gerade ausgestellt: dann ist es heute.
  */
  // Runde 3, M7: dieselbe Quelle wie Liste, Ausgangsbuch, BMD-Stapel und Archiv.
  const datum = stornoBelegTag({ stornoAm: inv.stornoAm ?? Date.now(), cancelledAt: inv.cancelledAt })!;
  const storniertAm = inv.cancelledAt != null ? stornoTag(inv.cancelledAt) : undefined;

  briefkopf(doc, o.company);
  empfaenger(doc, o.company, { name: inv.customerName, adresse: inv.address, uid: inv.customerVatId });
  const kopf: [string, string][] = [
    ['Stornorechnung', o.nummer],
    ['Datum', fmtDatum(datum)],
    [`Zu ${art}`, inv.invoiceNumber],
    [`${art} vom`, fmtDatum(inv.invoiceDate)],
    ['Baustelle', inv.projectNumber],
  ];
  if (inv.leistungVon && inv.leistungBis) {
    kopf.push(
      inv.leistungVon === inv.leistungBis
        ? ['Leistungsdatum', fmtDatum(inv.leistungVon)]
        : ['Leistungszeitraum', `${fmtDatum(inv.leistungVon)} – ${fmtDatum(inv.leistungBis)}`],
    );
  }
  kopfdaten(doc, kopf);
  titel(doc, 'Stornorechnung');

  const breite = RECHTS - RAND;
  const absatz = (inhalt: string, y: number, zeilenhoehe = 5): number => {
    const zeilen = doc.splitTextToSize(inhalt, breite) as string[];
    doc.text(zeilen, RAND, y);
    return y + zeilen.length * zeilenhoehe;
  };

  let y = TABELLE_AB + 4;
  doc.setFontSize(10).setTextColor(...TINTE);
  y = absatz(
    `Hiermit stornieren wir die ${art} ${inv.invoiceNumber} vom ${fmtDatum(inv.invoiceDate)} in voller Höhe.`
      + (storniertAm && storniertAm !== datum ? ` Der Storno wurde am ${fmtDatum(storniertAm)} erfasst.` : ''),
    y,
  );
  // Die Bestellnummer der Rechnung, damit der Kunde den Storno derselben Bestellung zuordnet.
  if (inv.bestellnummer?.trim()) {
    y = absatz(`Ihre Bestellnummer: ${inv.bestellnummer.trim()}`, y + 1);
  }
  if (inv.cancellationNote?.trim()) {
    y = absatz(`Grund: ${inv.cancellationNote.trim()}`, y + 1);
  }
  y += 6;

  /*
    DIE BETRÄGE ALS BLOCK, rechtsbündig. Ein ASCII-Minus: das typografische
    „−" fehlt in der Standardschrift des PDFs (siehe `mahnungPdf.ts`).
  */
  const minus = (n: number) => `- ${euroBetrag(Math.abs(n))} €`;
  const rc = !!inv.reverseCharge;
  const zeilen: [string, string][] = [
    ['Netto', minus(inv.totalNetto)],
    rc
      ? ['Umsatzsteuer', 'Übergang der Steuerschuld']
      : [`USt. ${Math.round((inv.vatRate ?? 0.2) * 100)}%`, minus(inv.totalVat)],
  ];
  const betragX = RAND + 110;
  for (const [k, v] of zeilen) {
    doc.setFont('helvetica', 'normal').setTextColor(...GRAU).text(k, RAND, y);
    doc.setTextColor(...TINTE).text(v, betragX, y, { align: 'right' });
    y += 6;
  }
  doc.setDrawColor(...TINTE).setLineWidth(0.35).line(RAND, y - 3.5, betragX, y - 3.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Stornobetrag', RAND, y + 1);
  doc.text(minus(inv.totalBrutto), betragX, y + 1, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  y += 12;

  if (inv.vorrechnungen?.length) {
    y = absatz(
      `Die auf dieser ${art} verrechneten Vorrechnungen (${inv.vorrechnungen
        .map((v) => v.invoiceNumber)
        .join(', ')}) bleiben bestehen und werden wieder als nicht verrechnet geführt.`,
      y,
    ) + 3;
  }

  const bezahlt = zahlstand(inv).bezahlt;
  y = absatz(
    bezahlt > 0
      ? `Bereits bezahlte ${euroBetrag(bezahlt)} € erstatten wir Ihnen oder verrechnen sie mit einer neuen Rechnung.`
      : `Die Forderung aus der ${art} ${inv.invoiceNumber} entfällt.`,
    y,
  );

  // Derselbe Steuerhinweis wie auf der Rechnung — der Storno berichtigt sie.
  const hinweis = rc ? RC_HINWEIS : (inv.steuerbefreiung ?? '').trim();
  if (hinweis) {
    doc.setFont('helvetica', 'bold');
    y = absatz(hinweis, y + 6);
    doc.setFont('helvetica', 'normal');
  }

  fusszeilen(doc, o.company);
  return doc.output('blob');
}

/** Ein sprechender Dateiname. */
export function stornoDateiname(nummer: string): string {
  return `Stornorechnung_${nummer}.pdf`;
}
