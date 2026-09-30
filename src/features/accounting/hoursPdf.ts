import jsPDF from 'jspdf';
import { firmenZeilen, logoZeichnen } from '@/lib/pdfBriefkopf';
import autoTable from 'jspdf-autotable';
import type { AppUser, Company, TimeEntry } from '@/types';
import {
  calcWorkMin, dezemberHalbtage, tageGewicht, tagesAnteil, tagessollStunden, tageZahl, zeitausgleichMin,
} from '@/lib/time';
import { BRAND_RGB, fmtDate, hours } from './export';
import { FLAECHE, GRAU, TINTE } from '@/lib/belegLayout';
import { zuschlagszeit, hatZuschlaege } from './zuschlaege';
import { ueberstundenNachTagesgrenze } from './ueberstunden';
import { nachtzeitText, nachtzeitVon, ueberstundenRegelVon } from '@/lib/lohnregeln';

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
  doc.setTextColor(...GRAU);
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
  doc.setFontSize(11).setTextColor(...TINTE);
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
      // Die Spalte ist schmal; „ZA" erklärt die Summenzeile darunter.
      e.status === 'Zeitausgleich' ? 'ZA' : e.status,
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
    alternateRowStyles: { fillColor: FLAECHE },
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
      doc.setFontSize(8).setTextColor(...GRAU);
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

  doc.setFontSize(10).setFont('helvetica', 'bold').setTextColor(...TINTE);
  doc.text(`Gesamtstunden: ${hours(totalMin)} h`, margin, y + 6);

  const halbeTage = dezemberHalbtage(company);
  const krank = sorted.filter((e) => e.status === 'Krank').length;
  // Urlaub in dem, was er verbraucht: der 24. und 31.12. je einen halben Tag.
  const urlaub = tageGewicht(
    sorted.filter((e) => e.status === 'Urlaub').map((e) => e.date),
    halbeTage,
  );
  // Das Soll DIESES Tages — mit eigenem Tagessoll je Wochentag (M5) ein anderes.
  const zaMin = sorted.reduce(
    (s, e) => s + zeitausgleichMin(e, tagessollStunden(user, e.date) * tagesAnteil(e.date, halbeTage)),
    0,
  );
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRAU);
  const abwesend = [
    krank ? `Krankenstandstage: ${krank}` : '',
    urlaub ? `Urlaubstage: ${tageZahl(urlaub)}` : '',
    zaMin ? `Zeitausgleich (ZA): ${hours(zaMin)} h` : '',
  ].filter(Boolean);
  if (abwesend.length) doc.text(abwesend.join('    '), margin, y + 12);

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
  const nacht = nachtzeitVon(company);
  const z = zuschlagszeit(sorted, halbeTage, nacht);
  /*
    ÜBERSTUNDEN NUR BEIM MODELL „TAGESGRENZE“ (Paket 2c) — und nur, wenn es
    welche gibt, wie bei den Zuschlägen. Stunden, kein Geld.
  */
  const ue = ueberstundenNachTagesgrenze(user, sorted, ueberstundenRegelVon(company), halbeTage);
  if (ue.fuenfzigMin > 0 || ue.hundertMin > 0) {
    doc.text(
      `Überstunden — 50 %: ${hours(ue.fuenfzigMin)} h · 100 %: ${hours(ue.hundertMin)} h`,
      margin,
      y + (abwesend.length ? 18 : 12) + (hatZuschlaege(z) ? 6 : 0),
    );
  }
  if (hatZuschlaege(z)) {
    const teile = [`Nacht (${nachtzeitText(nacht, ' bis ')}): ${hours(z.nachtMin)} h`, `Notdienst: ${hours(z.notdienstMin)} h`];
    // Nacht und Notdienst schliessen einander nicht aus — ohne diesen
    // Zusatz addierte der Leser die beiden Zahlen und zählte doppelt.
    if (z.beidesMin > 0) teile.push(`davon beides: ${hours(z.beidesMin)} h`);
    if (z.dezemberMin > 0) teile.push(`24./31.12. ab 12 Uhr: ${hours(z.dezemberMin)} h`);
    doc.text(
      `Zuschlagsstunden (N = Nacht, ND = Notdienst) — ${teile.join(' · ')}`,
      margin,
      y + (abwesend.length ? 18 : 12),
    );
  }

  return doc;
}

