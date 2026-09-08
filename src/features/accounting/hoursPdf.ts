import jsPDF from 'jspdf';
import { firmenZeilen, logoZeichnen } from '@/lib/pdfBriefkopf';
import autoTable from 'jspdf-autotable';
import type { AppUser, Company, TimeEntry } from '@/types';
import { calcWorkMin } from '@/lib/time';
import { BRAND_RGB, fmtDate, hours } from './export';
import { zuschlagszeit, hatZuschlaege } from './zuschlaege';

/** „N", „ND" oder „N+ND" — leer, wenn kein Kennzeichen gesetzt ist. */
function zuschlagKuerzel(e: TimeEntry): string {
  const teile: string[] = [];
  if (e.isNightWork) teile.push('N');
  if (e.isEmergency) teile.push('ND');
  return teile.join('+');
}

/**
 * Der PDF-Stundennachweis, bewusst in einem EIGENEN Modul.
 *
 * jsPDF und autotable wiegen zusammen mehrere hundert Kilobyte. Sie lagen im
 * Hauptpaket, also lud sie jeder Monteur beim ersten Aufruf mit — obwohl nur
 * Buchhaltung und Geschaeftsfuehrung je einen Nachweis erzeugen, und die
 * sitzen im Buero am Kabel, nicht im Keller am Funkloch. Getrennt kann der
 * Aufrufer das Modul erst dann nachladen, wenn wirklich jemand auf
 * "Bericht fuer Zeitraum" drueckt.
 */

/**
 * Stundennachweis als PDF (Legacy:8244-8382). Anders als das CSV enthält der
 * Nachweis bewusst KEIN Soll und keinen Saldo — er belegt die geleisteten
 * Stunden eines Zeitraums und geht so auch an Kunden oder die Lohnverrechnung.
 */
export function generateHoursPdf(opts: {
  company: Company;
  user: AppUser;
  entries: TimeEntry[];
  from: string;
  to: string;
}): jsPDF {
  const { company, user, entries, from, to } = opts;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 15;
  const rightX = 195;

  doc.setFontSize(18).setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND_RGB);
  doc.text(company.name || 'Firma', margin, 20);

  doc.setFontSize(9).setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text('Zeiterfassung & Stundenübersicht', margin, 27);

  /*
    Hier steht die Anschrift RECHTS OBEN — genau dort, wo das Logo hin will.
    Sie rutscht deshalb um die Logohöhe nach unten, und die Trennlinie mit
    ihr. Ohne Logo sind das 0 mm: dann steht alles, wo es immer stand.
  */
  const logoH = logoZeichnen(doc, company, rightX, 14);
  firmenZeilen(company).forEach((z, i) =>
    doc.text(z, rightX, 20 + logoH + i * 5, { align: 'right' }),
  );

  doc.setDrawColor(...BRAND_RGB).setLineWidth(0.5);
  doc.line(margin, 30 + logoH, rightX, 30 + logoH);

  const meta: [string, string][] = [
    ['Mitarbeiter:', user.name],
    ['Zeitraum:', `${fmtDate(from)} – ${fmtDate(to)}`],
    ['Erstellt am:', new Date().toLocaleDateString('de-AT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })],
  ];
  doc.setFontSize(11).setTextColor(0, 0, 0);
  meta.forEach(([label, value], i) => {
    // Um dieselbe Logohöhe nach unten wie die Trennlinie darüber — sonst
    // schöbe sich der Kopf in die Angaben.
    const y = 38 + logoH + i * 7;
    doc.setFont('helvetica', 'bold').text(label, margin, y);
    doc.setFont('helvetica', 'normal').text(value, 55, y);
  });

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  let totalMin = 0;
  const body = sorted.map((e) => {
    const wm = calcWorkMin(e);
    totalMin += wm;
    return [
      fmtDate(e.date),
      e.status,
      e.projectNumber || '–',
      e.customerName || '–',
      e.startTime && e.endTime ? `${e.startTime}–${e.endTime}` : '–',
      wm > 0 ? `${hours(wm)} h` : '–',
      // Kurz, weil die Spalte schmal ist; die Legende steht im Summenblock.
      zuschlagKuerzel(e),
      e.comment || '',
    ];
  });

  autoTable(doc, {
    startY: 60 + logoH,
    head: [['Datum', 'Status', 'Projekt', 'Kunde/Baustelle', 'Zeit', 'Dauer', 'Zuschlag', 'Kommentar']],
    body,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: BRAND_RGB, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 20 },
      2: { cellWidth: 22 },
      3: { cellWidth: 32 },
      4: { cellWidth: 22 },
      5: { cellWidth: 16 },
      6: { cellWidth: 16 },
      7: { cellWidth: 'auto' },
    },
    didDrawPage: () => {
      doc.setFontSize(8).setTextColor(150);
      doc.text(`Seite ${doc.getCurrentPageInfo().pageNumber}`, rightX, 290, { align: 'right' });
    },
  });

  // Summenblock. Steht zu wenig Platz zur Verfügung, kommt eine neue Seite —
  // im Legacy lief der Block sonst über den Seitenrand hinaus.
  let y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  if (y > 265) {
    doc.addPage();
    y = 25;
  }
  doc.setDrawColor(...BRAND_RGB).setLineWidth(0.3);
  doc.line(margin, y, rightX, y);

  doc.setFontSize(10).setFont('helvetica', 'bold').setTextColor(0, 0, 0);
  doc.text(`Gesamtstunden: ${hours(totalMin)} h`, margin, y + 6);

  const krank = sorted.filter((e) => e.status === 'Krank').length;
  const urlaub = sorted.filter((e) => e.status === 'Urlaub').length;
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(100);
  if (krank) doc.text(`Krankenstandstage: ${krank}`, margin, y + 12);
  if (urlaub) doc.text(`Urlaubstage: ${urlaub}`, krank ? 60 : margin, y + 12);

  /*
    ZUSCHLAGSSTUNDEN, und nur wenn es welche gibt.

    Der Nachweis ging bisher an der Frage vorbei, obwohl die Rechnung aus
    denselben Kennzeichen Positionen mit Aufschlag bildet. Wer den Nachweis
    vorlegt, um Nacht- oder Notdienststunden geltend zu machen, hatte damit
    ein Blatt in der Hand, auf dem sie nicht vorkommen.

    Auf einem Nachweis mit null Zuschlagsstunden bliebe die Zeile dagegen
    Zierrat — anders als in der CSV, die die Lohnverrechnung maschinell
    liest und wo eine fehlende Spalte etwas anderes bedeutet als eine leere.
  */
  const z = zuschlagszeit(sorted);
  if (hatZuschlaege(z)) {
    const teile = [`Nacht: ${hours(z.nachtMin)} h`, `Notdienst: ${hours(z.notdienstMin)} h`];
    // Nacht und Notdienst schliessen einander nicht aus — ohne diesen
    // Zusatz addierte der Leser die beiden Zahlen und zählte doppelt.
    if (z.beidesMin > 0) teile.push(`davon beides: ${hours(z.beidesMin)} h`);
    doc.text(
      `Zuschlagsstunden (N = Nacht, ND = Notdienst) — ${teile.join(' · ')}`,
      margin,
      y + (krank || urlaub ? 18 : 12),
    );
  }

  return doc;
}

