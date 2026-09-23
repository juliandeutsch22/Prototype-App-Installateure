import type { Company } from '@/types';
import {
  briefkopf,
  empfaenger,
  fmtMenge,
  fusszeilen,
  kopfdaten,
  nachTabelle,
  platzFuer,
  RAND,
  TABELLE_AB,
  TABELLENSTIL,
  TINTE,
  titel,
} from '@/lib/belegLayout';
import type { EinkaufsZeile } from './einkauf';

/**
 * Die Bestellung beim Grosshändler als Beleg — im Layout von Rechnung und
 * Angebot.
 *
 * OHNE PREISE, mit Absicht. Was der Artikel kostet, sagt der Grosshändler —
 * aus seinem Katalog, zu den ausgehandelten Konditionen. Ein Preis aus
 * unserem Stamm auf der Bestellung wäre bestenfalls veraltet und schlimmstens
 * das, was er dann berechnet.
 *
 * jsPDF wird erst beim Erzeugen geladen, wie bei allen Belegen.
 */

export interface BestellungPdfOptionen {
  company: Company;
  grosshaendler: { name: string; customerNumber?: string | null; contactLine?: string | null };
  zeilen: EinkaufsZeile[];
  /** TT.MM.JJJJ */
  datum: string;
  besteller?: string;
}

export async function buildBestellungPdf(o: BestellungPdfOptionen) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  briefkopf(doc, o.company);
  empfaenger(doc, o.company, {
    name: o.grosshaendler.name,
    // Die Kontaktzeile steht, wo sonst die Anschrift stünde — mehr führt
    // der Stamm vom Grosshändler nicht, und sie sagt dem Vertreter, wer gemeint ist.
    adresse: o.grosshaendler.contactLine ?? undefined,
  });
  const kopf: [string, string][] = [['Datum', o.datum]];
  if (o.grosshaendler.customerNumber?.trim()) {
    kopf.push(['Kundennummer', o.grosshaendler.customerNumber.trim()]);
  }
  if (o.besteller?.trim()) kopf.push(['Bestellt von', o.besteller.trim()]);
  kopfdaten(doc, kopf);
  titel(doc, 'Bestellung');

  doc.setFontSize(10).setTextColor(...TINTE);
  doc.text('Wir bestellen folgende Artikel:', RAND, TABELLE_AB);

  autoTable(doc, {
    ...TABELLENSTIL,
    startY: TABELLE_AB + 4,
    head: [['Pos.', 'Art.-Nr.', 'Bezeichnung', 'Menge', 'Einheit', 'Kommission']],
    body: o.zeilen.map((z, i) => [
      String(i + 1),
      z.artikelnummer ?? '',
      z.bezeichnung,
      fmtMenge(z.menge),
      z.einheit ?? '',
      z.kommissionen.join(', '),
    ]),
    columnStyles: {
      0: { cellWidth: 11, halign: 'right' },
      1: { cellWidth: 28 },
      3: { cellWidth: 17, halign: 'right' },
      4: { cellWidth: 17 },
      5: { cellWidth: 32 },
    },
    didParseCell: (d) => {
      if (d.section === 'head' && (d.column.index === 0 || d.column.index === 3)) {
        d.cell.styles.halign = 'right';
      }
    },
  });

  let y = nachTabelle(doc);
  y = platzFuer(doc, y, 12);
  doc.setFontSize(9.5).setFont('helvetica', 'normal').setTextColor(...TINTE);
  doc.text('Bitte um kurze Bestätigung mit Liefertermin. Vielen Dank.', RAND, y);

  fusszeilen(doc, o.company);
  return doc;
}

/** „Bestellung_Grosshaendler_2026-09-24.pdf" — erkennbar im Download-Ordner. */
export function bestellungDateiname(grosshaendler: string, isoDatum: string): string {
  const name = grosshaendler.trim().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'Grosshaendler';
  return `Bestellung_${name}_${isoDatum}.pdf`;
}

export async function downloadBestellungPdf(o: BestellungPdfOptionen & { isoDatum: string }) {
  (await buildBestellungPdf(o)).save(bestellungDateiname(o.grosshaendler.name, o.isoDatum));
}
