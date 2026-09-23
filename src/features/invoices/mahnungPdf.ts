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
  const rand = RAND;
  const rechts = RECHTS;
  const text = TEXTE[o.stufe];

  // Briefkopf, Empfänger und Kopfdaten — dieselben wie auf der Rechnung.
  briefkopf(doc, o.company);
  empfaenger(doc, o.company, { name: o.invoice.customerName, adresse: o.adresse, uid: o.kundenUid });
  kopfdaten(doc, [
    ['Datum', fmtDatum(o.datum)],
    ['Rechnung', o.invoice.invoiceNumber],
    ['Baustelle', o.invoice.projectNumber],
  ]);
  titel(doc, text.titel);

  const breite = rechts - rand;
  /** Text umbrechen, schreiben und die Zeile danach zurückgeben. */
  const absatz = (inhalt: string, y: number, zeilenhoehe = 5): number => {
    const zeilen = doc.splitTextToSize(inhalt, breite) as string[];
    doc.text(zeilen, rand, y);
    return y + zeilen.length * zeilenhoehe;
  };

  let y = TABELLE_AB + 4;
  doc.setFontSize(10).setTextColor(...TINTE);
  doc.text('Sehr geehrte Damen und Herren,', rand, y);
  y = absatz(text.anrede, y + 7) + 5;

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
    // Ein ASCII-Minus: das typografische „−" fehlt in der Standardschrift des
    // PDFs, und jsPDF schrieb die ganze Zeile dann als Zeichensalat.
    zeilen.push(['Bereits bezahlt', `- ${fmtEUR(stand.bezahlt)} €`]);
  }
  if (spesen > 0) zeilen.push(['Mahnspesen', `${fmtEUR(spesen)} €`]);

  // Beträge rechtsbündig untereinander, damit man sie nachrechnen kann.
  const betragX = rand + 110;
  for (const [k, v] of zeilen) {
    doc.setFont('helvetica', 'normal').setTextColor(...GRAU).text(k, rand, y);
    doc.setTextColor(...TINTE).text(v, betragX, y, { align: 'right' });
    y += 6;
  }

  doc.setDrawColor(...TINTE).setLineWidth(0.35).line(rand, y - 3.5, betragX, y - 3.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Offener Betrag', rand, y + 1);
  doc.text(`${fmtEUR(stand.rest + spesen)} €`, betragX, y + 1, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  y += 12;

  y = absatz(text.frist(fmtDatum(o.frist)), y) + 5;

  if (o.company.iban) {
    y = absatz(
      `Bankverbindung: IBAN ${o.company.iban}` +
        (o.company.bic ? ` / BIC ${o.company.bic}` : '') +
        (o.company.bankName ? ` (${o.company.bankName})` : ''),
      y,
    );
  }
  doc.text(`Verwendungszweck: ${o.invoice.invoiceNumber}`, rand, y);
  y += 12;

  /*
    DER SATZ ZUR ÜBERSCHNEIDUNG gehört auf jede Mahnung.

    Zwischen dem Ausdrucken und dem Eintreffen liegen Tage, und in dieser Zeit
    zahlen die meisten. Ohne diesen Satz bekommt jemand eine Mahnung für etwas,
    das er längst überwiesen hat — und ruft verärgert an.
  */
  doc.setFontSize(9).setTextColor(...GRAU);
  absatz(
    'Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie es ' +
      'bitte als gegenstandslos.',
    y,
    4.5,
  );
  doc.setTextColor(...TINTE).setFontSize(10);

  // Fusszeile mit Bank und Pflichtangaben — wie auf der Rechnung.
  fusszeilen(doc, o.company);

  return doc.output('blob');
}

/** Ein sprechender Dateiname — nicht „download.pdf" im Ordner des Kunden. */
export function mahnungDateiname(inv: Invoice, stufe: Mahnstufe): string {
  const wort = stufe === 1 ? 'Zahlungserinnerung' : stufe === 2 ? 'Mahnung' : 'Letzte_Mahnung';
  return `${wort}_${inv.invoiceNumber}.pdf`;
}
