import type { Company, Customer, Quote } from '@/types';
import {
  briefkopf,
  empfaenger,
  fusszeilen,
  GRAU,
  kopfdaten,
  nachTabelle,
  platzFuer,
  positionsTabelle,
  RAND,
  RECHTS,
  TABELLE_AB,
  TINTE,
  titel,
} from '@/lib/belegLayout';
import { summenZeilen } from '@/features/invoices/summenZeilen';

/**
 * Das Angebot als Beleg — im selben Layout wie die Rechnung.
 *
 * GEMELDET: „ein erstelltes Angebot kann man nicht als PDF herunterladen oder
 * überhaupt ansehen im Nachhinein". Das Angebot entstand, bekam eine Nummer
 * und einen Status — und liess sich weder dem Kunden schicken noch später
 * nachlesen. „Versendet" markierte einen Versand, den die App gar nicht
 * ermöglichte.
 *
 * WAS NICHT DRAUFSTEHT: die kalkulierten Stunden. Sie sind die Messlatte der
 * Budget-Ampel und damit eine interne Zahl; der Kunde bekommt Positionen und
 * Preise.
 *
 * jsPDF wird erst beim Erzeugen geladen, wie bei Mahnung und Schein.
 */

function fmtDatum(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso ?? '–';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export interface AngebotPdfOptionen {
  company: Company;
  quote: Quote;
  /**
   * Der Kunde aus den Stammdaten — für die Anschrift. Fehlt er (gelöscht,
   * nicht geladen), steht der Name aus dem Angebot da und als Anschrift der
   * Ort der Leistung.
   */
  kunde?: Pick<Customer, 'name' | 'address' | 'vatId'> | null;
}

export async function buildAngebotPdf(o: AngebotPdfOptionen) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const { company, quote: q } = o;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  /*
    DIE ANSCHRIFT DES KUNDEN, NICHT DER ORT DER LEISTUNG. Das Angebot geht an
    den, der beauftragt — gearbeitet wird oft woanders (die Wohnung der
    Mutter, das Zinshaus). Der Ort der Leistung steht deshalb eigens unter dem
    Titel.
  */
  const anschrift = o.kunde?.address?.trim() || q.address;
  briefkopf(doc, company);
  empfaenger(doc, company, {
    name: o.kunde?.name || q.customerName,
    adresse: anschrift,
    uid: o.kunde?.vatId,
  });
  kopfdaten(doc, [
    ['Angebotsnummer', q.quoteNumber],
    ['Angebotsdatum', fmtDatum(q.quoteDate)],
    ['Gültig bis', fmtDatum(q.validUntil)],
  ]);
  titel(doc, 'Angebot');

  let y = TABELLE_AB - 3;
  if (q.address?.trim() && q.address.trim() !== anschrift?.trim()) {
    doc.setFontSize(9).setTextColor(...GRAU);
    doc.text(`Ort der Leistung: ${q.address.trim()}`, RAND, y);
    y += 6;
  }
  doc.setFontSize(10).setTextColor(...TINTE);
  doc.text('Vielen Dank für Ihre Anfrage. Wir bieten Ihnen folgende Leistungen an:', RAND, y + 3);

  positionsTabelle(doc, autoTable, {
    positions: q.positions,
    fuss: summenZeilen({
      assembled: {
        discount: q.discount ?? null,
        discountAmount: q.discountAmount ?? 0,
        subtotalNetto: q.subtotalNetto,
        totalNetto: q.totalNetto,
        totalVat: q.totalVat,
        totalBrutto: q.totalBrutto,
      },
      vatRate: q.vatRate,
      rc: false,
      abzuege: [],
      forderung: q.totalBrutto,
    }),
    startY: y + 7,
  });

  const breite = RECHTS - RAND;
  y = nachTabelle(doc);
  doc.setFontSize(9.5).setFont('helvetica', 'normal').setTextColor(...TINTE);

  if (q.notes?.trim()) {
    const zeilen = doc.splitTextToSize(q.notes.trim(), breite) as string[];
    y = platzFuer(doc, y, zeilen.length * 5 + 7);
    doc.setFont('helvetica', 'bold').text('Anmerkungen', RAND, y);
    doc.setFont('helvetica', 'normal').text(zeilen, RAND, y + 6);
    y += 6 + zeilen.length * 5 + 5;
  }

  const schluss = doc.splitTextToSize(
    `Dieses Angebot ist gültig bis ${fmtDatum(q.validUntil)}. ` +
      'Wir freuen uns auf Ihren Auftrag.',
    breite,
  ) as string[];
  y = platzFuer(doc, y, schluss.length * 5);
  doc.text(schluss, RAND, y);

  fusszeilen(doc, company);
  return doc;
}

/** Ein sprechender Dateiname — nicht „download.pdf" im Ordner des Kunden. */
export function angebotDateiname(q: Pick<Quote, 'quoteNumber'>): string {
  return `Angebot_${q.quoteNumber}.pdf`;
}

/** Erzeugen und herunterladen. */
export async function downloadAngebotPdf(o: AngebotPdfOptionen): Promise<void> {
  (await buildAngebotPdf(o)).save(angebotDateiname(o.quote));
}
