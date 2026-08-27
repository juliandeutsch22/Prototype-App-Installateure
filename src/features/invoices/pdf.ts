import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Company, Project } from '@/types';
import { INVOICE_DEFAULTS, type AssembledInvoice } from './assemble';
import { calcWorkMin } from '@/lib/time';

const fmtEUR = (n: number) =>
  new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/** Minuten als Dezimalstunden mit Komma ("7,50"). */
const fmtHours = (min: number) => (min / 60).toFixed(2).replace('.', ',');

/** 'YYYY-MM-DD' -> '27.08.2026'. */
const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

/**
 * Erzeugt das Rechnungs-PDF (jsPDF + autotable, docs §4.5). Kopf-/Bankdaten
 * stammen aus dem companies-Dokument (ersetzen die hartkodierten Perl-Werte).
 */
export function generateInvoicePdf(opts: {
  company: Company;
  project: Pick<Project, 'customerName' | 'address' | 'projectNumber'>;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  assembled: AssembledInvoice;
  appendDetail?: boolean;
  vatRate?: number;
}) {
  const { company, project, invoiceNumber, invoiceDate, dueDate, assembled } = opts;
  const vatRate = opts.vatRate ?? INVOICE_DEFAULTS.vatRate;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 18;

  // Briefkopf
  doc.setFontSize(16).setFont('helvetica', 'bold');
  doc.text(company.name || 'Firma', margin, 22);
  doc.setFontSize(9).setFont('helvetica', 'normal');
  if (company.addressLine) doc.text(company.addressLine, margin, 28);
  if (company.contactLine) doc.text(company.contactLine, margin, 33);
  doc.setDrawColor(0, 51, 102).line(margin, 37, 210 - margin, 37);

  // Empfänger + Rechnungsdaten
  doc.setFontSize(11).setFont('helvetica', 'bold').text('Rechnung', margin, 50);
  doc.setFontSize(10).setFont('helvetica', 'normal');
  doc.text(project.customerName || '–', margin, 58);
  if (project.address) doc.text(project.address, margin, 63);

  const rightX = 210 - margin;
  doc.text(`Rechnungsnummer: ${invoiceNumber}`, rightX, 50, { align: 'right' });
  doc.text(`Rechnungsdatum: ${invoiceDate}`, rightX, 55, { align: 'right' });
  doc.text(`Zahlungsziel: ${dueDate}`, rightX, 60, { align: 'right' });
  doc.text(`Baustelle: ${project.projectNumber}`, rightX, 65, { align: 'right' });

  // Positionstabelle
  autoTable(doc, {
    startY: 72,
    head: [['Position', 'Menge', 'Einheit', 'EP €', 'Netto €']],
    body: assembled.positions.map((p) => [
      p.label,
      String(p.qty),
      p.unit,
      fmtEUR(p.unitPrice),
      fmtEUR(p.netto),
    ]),
    foot: [
      ['', '', '', 'Netto', fmtEUR(assembled.totalNetto)],
      ['', '', '', `USt. ${Math.round(vatRate * 100)}%`, fmtEUR(assembled.totalVat)],
      ['', '', '', 'Brutto', fmtEUR(assembled.totalBrutto)],
    ],
    headStyles: { fillColor: [0, 51, 102] },
    footStyles: { fontStyle: 'bold' },
    theme: 'grid',
  });

  // Zahlungshinweis + Bankdaten
  // @ts-expect-error lastAutoTable wird von autotable ergänzt
  let y = (doc.lastAutoTable?.finalY ?? 120) + 12;
  doc.setFontSize(9);
  // Betrag und Frist gehören in den Überweisungssatz — sonst muss der Kunde
  // sie sich aus der Tabelle zusammensuchen.
  doc.text(
    `Bitte überweisen Sie ${fmtEUR(assembled.totalBrutto)} € bis ${dueDate}` +
      (company.iban ? ` auf IBAN ${company.iban}${company.bic ? ` / BIC ${company.bic}` : ''}` : '') +
      '.',
    margin,
    y,
  );
  doc.text(`Verwendungszweck: ${invoiceNumber} / ${project.projectNumber}`, margin, (y += 5));

  // Fußzeile mit den Pflichtangaben, unten auf der Rechnungsseite.
  const footer = [company.vatId && `UID: ${company.vatId}`, company.companyRegister]
    .filter(Boolean)
    .join(' · ');
  if (footer) {
    doc.setFontSize(8).setTextColor(120);
    doc.text(footer, margin, 285);
    doc.setTextColor(0, 0, 0);
  }

  // Optionaler Leistungsnachweis (Seite 2)
  if (opts.appendDetail && assembled.entries.length) {
    doc.addPage();
    doc.setFontSize(12).setFont('helvetica', 'bold').text('Leistungsnachweis', margin, 22);
    const detail = [...assembled.entries].sort((a, b) => a.date.localeCompare(b.date));
    const totalMin = detail.reduce((s, e) => s + calcWorkMin(e), 0);
    autoTable(doc, {
      startY: 28,
      // Ohne die Stundenspalte ist ein Leistungsnachweis als Beleg wertlos —
      // der Kunde kann die Rechnungssumme sonst nicht nachvollziehen.
      head: [['Datum', 'Mitarbeiter', 'Typ', 'Tätigkeit / Notiz', 'Std.']],
      body: detail.map((e) => [
        fmtDate(e.date),
        e.userName ?? '',
        e.isHelper ? 'Helfer' : 'Fachkraft',
        (e.comment ?? '').slice(0, 60),
        fmtHours(calcWorkMin(e)),
      ]),
      foot: [['', '', '', 'Summe', fmtHours(totalMin)]],
      headStyles: { fillColor: [0, 51, 102] },
      footStyles: { fontStyle: 'bold' },
      columnStyles: { 4: { halign: 'right', cellWidth: 18 } },
      theme: 'grid',
    });
  }

  // Das Dokument wird zurückgegeben statt sofort gespeichert: nur so lässt
  // sich dieselbe Rechnung später erneut erzeugen und verschicken.
  return doc;
}

/** Erzeugt das PDF und startet den Download. */
export function downloadInvoicePdf(opts: Parameters<typeof generateInvoicePdf>[0]) {
  generateInvoicePdf(opts).save(`${opts.invoiceNumber}.pdf`);
}
