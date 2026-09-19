import { firmenZeilen, logoZeichnen } from '@/lib/pdfBriefkopf';
import { TEXTE, spesenFuer, type Mahnstufe } from './mahnung';
import { zahlstand } from './zahlstand';
import type { Company, Invoice } from '@/types';

/**
 * Die Mahnung als Beleg.
 *
 * WARUM EIN EIGENES DOKUMENT und nicht ein Vermerk auf der Rechnung: die
 * Rechnung ist bereits beim Kunden. Ein zweites Blatt mit derselben Nummer,
 * aber anderem Inhalt wäre ein Widerspruch in seinen Unterlagen — und der
 * Beleg, den sein Steuerberater bucht, soll genau einer sein.
 *
 * DIE MAHNUNG NENNT DIE RECHNUNG, ersetzt sie aber nicht: Nummer, Datum,
 * ursprüngliches Zahlungsziel und Betrag stehen darauf, damit der Kunde ohne
 * Suchen weiss, worum es geht.
 *
 * KEINE UMSATZSTEUER. Eine Mahnung ist keine Leistung; sie fordert nur, was
 * die Rechnung bereits ausgewiesen hat. Auch die Mahnspesen sind kein Entgelt
 * für eine Leistung, sondern Schadenersatz — sie tragen deshalb keine Steuer.
 * Stünde hier eine, schuldete der Betrieb sie kraft Rechnungslegung.
 *
 * jsPDF wird dynamisch geladen — wie beim Handwerksschein: die Bibliothek
 * wiegt mehrere hundert Kilobyte und gehört nicht in das Paket, das jeder
 * Monteur beim Anmelden zieht.
 */

const fmtEUR = (n: number) =>
  new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function fmtDatum(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso ?? '–';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export interface MahnungOptionen {
  company: Company;
  invoice: Invoice;
  stufe: Mahnstufe;
  /** Der Tag, an dem gemahnt wird. */
  datum: string;
  /** Die neue Frist. */
  frist: string;
  /** Anschrift des Kunden, wie sie auf der Rechnung stand. */
  adresse?: string;
  /** UID des Kunden, falls bekannt. */
  kundenUid?: string;
}

export async function buildMahnungPdf(o: MahnungOptionen): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const rand = 18;
  const rechts = 210 - rand;
  const text = TEXTE[o.stufe];

  // Briefkopf — derselbe wie auf Rechnung und Schein.
  logoZeichnen(doc, o.company, rechts, 18);
  doc.setFontSize(16).setFont('helvetica', 'bold');
  doc.text(o.company.name || 'Firma', rand, 22);
  doc.setFontSize(9).setFont('helvetica', 'normal');
  firmenZeilen(o.company).forEach((z, i) => doc.text(z, rand, 28 + i * 5));
  doc.setDrawColor(0, 51, 102).line(rand, 37, rechts, 37);

  // Empfänger
  doc.setFontSize(11).setFont('helvetica', 'bold').text(text.titel, rand, 50);
  doc.setFontSize(10).setFont('helvetica', 'normal');
  doc.text(o.invoice.customerName || '–', rand, 58);
  if (o.adresse) doc.text(o.adresse, rand, 63);
  if (o.kundenUid?.trim()) doc.text(`UID: ${o.kundenUid.trim()}`, rand, o.adresse ? 68 : 63);

  doc.text(`Datum: ${fmtDatum(o.datum)}`, rechts, 50, { align: 'right' });
  doc.text(`Rechnung: ${o.invoice.invoiceNumber}`, rechts, 55, { align: 'right' });
  doc.text(`Baustelle: ${o.invoice.projectNumber}`, rechts, 60, { align: 'right' });

  let y = 82;
  doc.setFontSize(10);
  doc.text('Sehr geehrte Damen und Herren,', rand, y);
  y += 7;
  doc.text(text.anrede, rand, y, { maxWidth: rechts - rand });
  y += 14;

  /*
    DIE ZAHLEN ALS BLOCK, nicht im Fliesstext.

    Wer eine Mahnung bekommt, sucht drei Dinge: worum es geht, wie viel und
    bis wann. Im Satz versteckt muss er sie zusammenklauben; als Block stehen
    sie da.
  */
  const spesen = spesenFuer(o.stufe, o.company.rates?.mahnspesen);
  const stand = zahlstand(o.invoice);
  const zeilen: [string, string][] = [
    ['Rechnungsdatum', fmtDatum(o.invoice.invoiceDate)],
    ['Ursprüngliches Zahlungsziel', fmtDatum(o.invoice.dueDate)],
    ['Rechnungsbetrag', `${fmtEUR(o.invoice.totalBrutto)} €`],
  ];
  /*
    TEILZAHLUNGEN GEHÖREN AUF DIE MAHNUNG, und zwar als eigene Zeile.

    Der Kunde, der 400 von 1.000 € überwiesen hat, prüft als Erstes, ob der
    Betrieb seine Zahlung überhaupt bemerkt hat. Stünde nur der Restbetrag da,
    sähe die Mahnung aus wie eine über eine andere, kleinere Rechnung; stünde
    nur das Brutto da, wäre sie schlicht falsch. Beides zusammen mit dem
    Abzug dazwischen ist die einzige Fassung, die er nachrechnen kann.
  */
  if (stand.bezahlt > 0) {
    zeilen.push(['Bereits bezahlt', `− ${fmtEUR(stand.bezahlt)} €`]);
  }
  if (spesen > 0) zeilen.push(['Mahnspesen', `${fmtEUR(spesen)} €`]);

  for (const [k, v] of zeilen) {
    doc.setFont('helvetica', 'normal').text(`${k}:`, rand, y);
    doc.text(v, rand + 70, y);
    y += 6;
  }

  doc.setFont('helvetica', 'bold');
  doc.text('Offener Betrag:', rand, y);
  doc.text(`${fmtEUR(stand.rest + spesen)} €`, rand + 70, y);
  doc.setFont('helvetica', 'normal');
  y += 12;

  doc.text(text.frist(fmtDatum(o.frist)), rand, y, { maxWidth: rechts - rand });
  y += 12;

  if (o.company.iban) {
    doc.text(
      `Bankverbindung: IBAN ${o.company.iban}` +
        (o.company.bic ? ` / BIC ${o.company.bic}` : '') +
        (o.company.bankName ? ` (${o.company.bankName})` : ''),
      rand,
      y,
      { maxWidth: rechts - rand },
    );
    y += 6;
  }
  doc.text(`Verwendungszweck: ${o.invoice.invoiceNumber}`, rand, y);
  y += 12;

  /*
    DER SATZ ZUR ÜBERSCHNEIDUNG gehört auf jede Mahnung.

    Zwischen dem Ausdrucken und dem Eintreffen liegen Tage, und in dieser Zeit
    zahlen die meisten. Ohne diesen Satz bekommt jemand eine Mahnung für etwas,
    das er längst überwiesen hat — und ruft verärgert an.
  */
  doc.setFontSize(9).setTextColor(110, 110, 110);
  doc.text(
    'Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie es ' +
      'bitte als gegenstandslos.',
    rand,
    y,
    { maxWidth: rechts - rand },
  );
  doc.setTextColor(0, 0, 0).setFontSize(10);

  // Fusszeile mit den Pflichtangaben — wie auf der Rechnung.
  const fuss = [o.company.vatId && `UID: ${o.company.vatId}`, o.company.companyRegister]
    .filter(Boolean)
    .join(' · ');
  if (fuss) {
    doc.setFontSize(8).setTextColor(120);
    doc.text(fuss, rand, 285);
  }

  return doc.output('blob');
}

/** Ein sprechender Dateiname — nicht „download.pdf" im Ordner des Kunden. */
export function mahnungDateiname(inv: Invoice, stufe: Mahnstufe): string {
  const wort = stufe === 1 ? 'Zahlungserinnerung' : stufe === 2 ? 'Mahnung' : 'Letzte_Mahnung';
  return `${wort}_${inv.invoiceNumber}.pdf`;
}
