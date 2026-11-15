import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Company } from '@/types';
import { firmenZeilen, logoZeichnen } from '@/lib/pdfBriefkopf';
import { FLAECHE, GRAU, TINTE } from '@/lib/belegLayout';
import { nachtArbeitMin, nachtzeitText, nachtzeitVon } from '@/lib/lohnregeln';
import { BRAND_RGB, fmtDate, hours, stundenSpalte } from './export';
import { minutenJeSatz, type NachweisZeile } from './baustellenNachweis';

/**
 * DER STUNDENNACHWEIS EINER BAUSTELLE ODER EINES KUNDEN als PDF (F12).
 *
 * Für den Kunden: wer wann wie lange auf seiner Baustelle gearbeitet hat,
 * mit dem Satz der Buchung und den Zuschlagskennzeichen — dieselben, aus
 * denen die Rechnung ihre Positionen bildet. Was auf das Blatt kommt,
 * entscheidet `nachweisZeilen`; hier wird nur gesetzt.
 *
 * Eigenes Modul wie `hoursPdf.ts`: jsPDF lädt erst, wer ein Blatt erzeugt.
 */
export function generateBaustellenNachweisPdf(opts: {
  company: Company;
  /** „Baustelle PR-2026-014“ oder „Kunde Huber GmbH“ — die erste Angabe im Kopf. */
  bezug: [string, string];
  /** Weitere Angaben im Kopf, z. B. Kunde und Anschrift der Baustelle. */
  angaben?: [string, string][];
  zeilen: readonly NachweisZeile[];
  /** Mehr als eine Baustelle (Nachweis des Kunden): dann steht die Nummer je Zeile. */
  mitBaustelle: boolean;
  von: string;
  bis: string;
}): jsPDF {
  const { company, bezug, angaben = [], zeilen, mitBaustelle, von, bis } = opts;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 15;
  const rightX = 195;
  const nacht = nachtzeitVon(company);

  doc.setFontSize(18).setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND_RGB);
  doc.text(company.name || 'Firma', margin, 20);
  doc.setFontSize(9).setFont('helvetica', 'normal');
  doc.setTextColor(...GRAU);
  doc.text('Stundennachweis', margin, 27);
  const logoH = logoZeichnen(doc, company, rightX, 14);
  firmenZeilen(company).forEach((z, i) => doc.text(z, rightX, 20 + logoH + i * 5, { align: 'right' }));
  doc.setDrawColor(...BRAND_RGB).setLineWidth(0.5);
  doc.line(margin, 30 + logoH, rightX, 30 + logoH);

  const meta: [string, string][] = [
    bezug,
    ...angaben.filter(([, w]) => !!w.trim()),
    ['Zeitraum:', `${fmtDate(von)} – ${fmtDate(bis)}`],
    ['Erstellt am:', new Date().toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })],
  ];
  doc.setFontSize(11).setTextColor(...TINTE);
  meta.forEach(([label, wert], i) => {
    const y = 38 + logoH + i * 7;
    doc.setFont('helvetica', 'bold').text(label, margin, y);
    doc.setFont('helvetica', 'normal').text(wert, 55, y);
  });

  // Die Spalte „Std“ geht auf die Gesamtstunden darunter auf (Z8).
  const stunden = stundenSpalte(zeilen.map((z) => z.minuten));
  const body = zeilen.map(({ eintrag: e, einstufung }, i) => [
    fmtDate(e.date),
    e.userName ?? '',
    ...(mitBaustelle ? [e.projectNumber ?? ''] : []),
    e.startTime && e.endTime ? `${e.startTime}–${e.endTime}` : '–',
    e.breakDuration ? `${e.breakDuration} min` : '–',
    stunden[i],
    einstufung,
    [nachtArbeitMin(e, nacht) > 0 ? 'N' : '', e.isEmergency ? 'ND' : ''].filter(Boolean).join('+'),
    e.comment ?? '',
  ]);
  autoTable(doc, {
    startY: 38 + logoH + meta.length * 7 + 2,
    head: [['Datum', 'Mitarbeiter', ...(mitBaustelle ? ['Baustelle'] : []), 'Zeit', 'Pause', 'Std', 'Einstufung', 'Zuschlag', 'Tätigkeit']],
    body,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: BRAND_RGB, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: FLAECHE },
    didDrawPage: () => {
      doc.setFontSize(8).setTextColor(...GRAU);
      doc.text(`Seite ${doc.getCurrentPageInfo().pageNumber}`, rightX, 290, { align: 'right' });
    },
  });

  let y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  if (y > 260) {
    doc.addPage();
    y = 25;
  }
  doc.setDrawColor(...BRAND_RGB).setLineWidth(0.3);
  doc.line(margin, y, rightX, y);
  const gesamt = zeilen.reduce((s, z) => s + z.minuten, 0);
  doc.setFontSize(10).setFont('helvetica', 'bold').setTextColor(...TINTE);
  doc.text(`Gesamtstunden: ${hours(gesamt)} h`, margin, y + 6);
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRAU);
  const jeSatz = minutenJeSatz(zeilen);
  // Quer gerundet: die Einstufungen gehen auf die Gesamtstunden auf (Z8).
  const jeSatzText = stundenSpalte(jeSatz.map((s) => s.minuten));
  doc.text(jeSatz.map((s, i) => `${s.satz}: ${jeSatzText[i]} h`).join('    '), margin, y + 12);
  doc.text(
    `Nur Arbeitszeit auf ${mitBaustelle ? 'diesen Baustellen' : 'dieser Baustelle'} — ohne Abwesenheiten und andere Aufträge. ` +
      `Zuschlag: N = Nacht (${nachtzeitText(nacht, ' bis ')}), ND = Notdienst.`,
    margin,
    y + 18,
  );
  return doc;
}
