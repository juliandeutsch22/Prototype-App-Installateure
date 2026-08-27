import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { AppUser, Company, TimeEntry } from '@/types';
import { calcWorkMin, calcMonthStats, type MonthStats } from '@/lib/time';

/**
 * Exporte der Mitarbeiterübersicht (portiert aus Legacy:3776-3865 und
 * 8244-8429). Erlaubt für Buchhaltung/GF/Administrator — dieselbe Grenze wie
 * die Übersicht selbst.
 *
 * Bewusste Abweichungen vom Legacy, die dort Fehler waren:
 * - Datum durchgängig de-AT mit führender Null (27.08.2026). Das Legacy
 *   mischte de-DE ohne Null (27.8.2026) und de-AT je nach Export.
 * - Arbeitsminuten immer über calcWorkMin (auf 0 begrenzt). Eine der
 *   CSV-Varianten rechnete ohne Begrenzung und konnte negative Stunden
 *   ausgeben, wenn Ende vor Beginn lag.
 * - JEDES Feld wird escaped, nicht nur der Kommentar. Ein Semikolon im
 *   Kundennamen zerschoss im Legacy die ganze Datei.
 * - Briefkopf kommt aus dem companies-Dokument statt hartkodiert.
 */

const MONTHS = [
  'Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

const BRAND_RGB: [number, number, number] = [0, 51, 102];

/** Deutsche Dezimalzahl mit zwei Nachkommastellen. */
function num(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

/** Minuten als Dezimalstunden ("7,50"). */
function hours(min: number): string {
  return num(min / 60);
}

/** 'YYYY-MM-DD' -> '27.08.2026'. */
function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * CSV-Feld absichern. Trennzeichen ist das Semikolon (Excel im deutschen
 * Sprachraum); Felder mit Semikolon, Anführungszeichen oder Zeilenumbruch
 * werden gequotet, innere Anführungszeichen verdoppelt.
 */
function cell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(values: unknown[]): string {
  return values.map(cell).join(';');
}

/**
 * Löst den Download aus. Das BOM ist nötig, damit Excel die Datei als UTF-8
 * liest — ohne es werden Umlaute zerstört.
 */
export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([`﻿${content}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Dateinamen-tauglich, Umlaute bleiben erhalten. */
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_');
}

export interface UserWithEntries {
  user: AppUser;
  monthEntries: TimeEntry[];
  stats: MonthStats;
}

/* ------------------------------------------------------------------ */
/* 1) Monats-CSV über alle Mitarbeiter                                 */
/* ------------------------------------------------------------------ */

/**
 * Monatsexport (Legacy:3803-3828): Detailzeilen, danach eine Zusammenfassung
 * je Mitarbeiter. Die drei Blöcke stehen bewusst in EINER Datei — so wie es
 * die Lohnverrechnung gewohnt ist.
 */
export function buildMonthCsv(rows: UserWithEntries[], year: number, month: number): string {
  const lines: string[] = [];

  lines.push(
    row([
      'Mitarbeiter', 'Datum', 'Status', 'Kunde/Baustelle', 'Projektnummer', 'Fahrzeug',
      'Startzeit', 'Endzeit', 'Pause(Min)', 'Wegzeit(Min)', 'Kommentar',
      'Arbeitszeit(Std)', 'Gesamtzeit(Std)',
    ]),
  );

  const all = rows
    .flatMap(({ user, monthEntries }) => monthEntries.map((e) => ({ user, e })))
    .sort((a, b) => a.e.date.localeCompare(b.e.date));

  for (const { user, e } of all) {
    const wm = calcWorkMin(e);
    const travel = Number(e.travelTime ?? 0) || 0;
    lines.push(
      row([
        e.userName || user.name,
        fmtDate(e.date),
        e.status,
        e.customerName ?? '',
        e.projectNumber ?? '',
        e.vehiclePlate ?? '',
        e.startTime ?? '',
        e.endTime ?? '',
        e.breakDuration ?? 0,
        travel,
        e.comment ?? '',
        hours(wm),
        // Gesamtzeit schließt die Wegzeit ein — nur in diesem Export.
        hours(wm + travel),
      ]),
    );
  }

  lines.push('', 'Mitarbeiter-Zusammenfassung');
  lines.push(
    row(['Name', 'Ist(Std)', 'Soll(Std)', 'Saldo(Std)', 'Krank-Tage', 'Urlaub-Tage', 'Resturlaub']),
  );
  for (const { user, stats } of [...rows].sort((a, b) => a.user.name.localeCompare(b.user.name, 'de'))) {
    lines.push(
      row([
        user.name,
        hours(stats.istMin),
        hours(stats.sollMin),
        hours(stats.saldoMin),
        stats.krankDays,
        stats.urlaubDays,
        stats.urlaubRest,
      ]),
    );
  }

  // Projektauswertung: nur Fachkraftstunden, Helferzeit zählt nicht gegen
  // das Projektbudget (Legacy: calculateProjectHours).
  const byProject = new Map<string, number>();
  for (const { e } of all) {
    if (e.status !== 'Anwesend' || !e.projectNumber || e.isHelper) continue;
    const min = calcWorkMin(e);
    if (min <= 0) continue;
    byProject.set(e.projectNumber, (byProject.get(e.projectNumber) ?? 0) + min);
  }
  if (byProject.size > 0) {
    lines.push('', 'Projektauswertung (ohne Helferstunden)');
    lines.push(row(['Projektnummer', 'Gesamtstunden']));
    for (const key of [...byProject.keys()].sort()) {
      lines.push(row([key, hours(byProject.get(key) ?? 0)]));
    }
  }

  void year;
  void month;
  return lines.join('\n');
}

export function monthCsvFilename(year: number, month: number): string {
  return `zeiterfassung_${String(month + 1).padStart(2, '0')}-${year}.csv`;
}

/* ------------------------------------------------------------------ */
/* 2) CSV für einen Mitarbeiter                                        */
/* ------------------------------------------------------------------ */

/** Monatsexport eines einzelnen Mitarbeiters (Legacy:3830-3865). */
export function buildUserCsv(
  user: AppUser,
  monthEntries: TimeEntry[],
  stats: MonthStats,
  year: number,
  month: number,
): string {
  const lines: string[] = [];
  lines.push(row([`Zeiterfassung: ${user.name}`]));
  lines.push(row([`Monat: ${MONTHS[month]} ${year}`]));
  lines.push(
    row([`Wochensoll: ${stats.weeklyTarget} h · Jahresurlaub: ${stats.yearlyVacation} Tage`]),
  );
  lines.push('');
  lines.push(
    row([
      'Datum', 'Status', 'Kunde/Baustelle', 'Projektnummer', 'Startzeit', 'Endzeit',
      'Pause(Min)', 'Wegzeit(Min)', 'Arbeitszeit(Std)', 'Kommentar',
    ]),
  );

  for (const e of [...monthEntries].sort((a, b) => a.date.localeCompare(b.date))) {
    lines.push(
      row([
        fmtDate(e.date),
        e.status,
        e.customerName ?? '',
        e.projectNumber ?? '',
        e.startTime ?? '',
        e.endTime ?? '',
        e.breakDuration ?? 0,
        e.travelTime ?? 0,
        hours(calcWorkMin(e)),
        e.comment ?? '',
      ]),
    );
  }

  lines.push('');
  lines.push(row(['Ist', `${hours(stats.istMin)} h`]));
  lines.push(row(['Soll', `${hours(stats.sollMin)} h`]));
  lines.push(row(['Saldo', `${hours(stats.saldoMin)} h`]));
  lines.push(row(['Krank', `${stats.krankDays} Tage`]));
  lines.push(row(['Urlaub (Monat)', `${stats.urlaubDays} Tage`]));
  lines.push(row([`Urlaub ${year} gesamt`, `${stats.yearlyUrlaubDays} Tage`]));
  lines.push(row(['Resturlaub', `${stats.urlaubRest} Tage`]));

  return lines.join('\n');
}

export function userCsvFilename(user: AppUser, year: number, month: number): string {
  return `zeiterfassung_${safeName(user.name)}_${String(month + 1).padStart(2, '0')}-${year}.csv`;
}

/* ------------------------------------------------------------------ */
/* 3) PDF-Stundennachweis für einen freien Zeitraum                    */
/* ------------------------------------------------------------------ */

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
  if (company.addressLine) doc.text(company.addressLine, rightX, 20, { align: 'right' });
  if (company.contactLine) doc.text(company.contactLine, rightX, 25, { align: 'right' });

  doc.setDrawColor(...BRAND_RGB).setLineWidth(0.5);
  doc.line(margin, 30, rightX, 30);

  const meta: [string, string][] = [
    ['Mitarbeiter:', user.name],
    ['Zeitraum:', `${fmtDate(from)} – ${fmtDate(to)}`],
    ['Erstellt am:', new Date().toLocaleDateString('de-AT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })],
  ];
  doc.setFontSize(11).setTextColor(0, 0, 0);
  meta.forEach(([label, value], i) => {
    const y = 38 + i * 7;
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
      e.comment || '',
    ];
  });

  autoTable(doc, {
    startY: 60,
    head: [['Datum', 'Status', 'Projekt', 'Kunde/Baustelle', 'Zeit', 'Dauer', 'Kommentar']],
    body,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: BRAND_RGB, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 20 },
      2: { cellWidth: 22 },
      3: { cellWidth: 38 },
      4: { cellWidth: 22 },
      5: { cellWidth: 16 },
      6: { cellWidth: 'auto' },
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

  return doc;
}

export function hoursPdfFilename(user: AppUser, from: string, to: string): string {
  return `Stunden_${safeName(user.name)}_${from}_${to}.pdf`;
}

/* ------------------------------------------------------------------ */
/* 4) Projekt-CSV für einen Mitarbeiter und Zeitraum                   */
/* ------------------------------------------------------------------ */

/** Projektauswertung eines Mitarbeiters über einen Zeitraum (Legacy:8384-8429). */
export function buildUserProjectCsv(
  user: AppUser,
  entries: TimeEntry[],
  from: string,
  to: string,
): string {
  const relevant = entries.filter((e) => e.status === 'Anwesend' && e.projectNumber);

  const byProject = new Map<string, { customer: string; min: number; days: Set<string> }>();
  for (const e of relevant) {
    const key = e.projectNumber as string;
    const cur = byProject.get(key) ?? { customer: e.customerName ?? '', min: 0, days: new Set() };
    cur.min += calcWorkMin(e);
    cur.days.add(e.date);
    byProject.set(key, cur);
  }

  const lines: string[] = [];
  lines.push(row([`Projektauswertung: ${user.name}`]));
  lines.push(row([`Zeitraum: ${fmtDate(from)} – ${fmtDate(to)}`]));
  lines.push('');
  lines.push(row(['Projektnummer', 'Kunde/Baustelle', 'Einsatztage', 'Gesamtstunden']));

  let totalMin = 0;
  for (const key of [...byProject.keys()].sort()) {
    const p = byProject.get(key) as { customer: string; min: number; days: Set<string> };
    totalMin += p.min;
    lines.push(row([key, p.customer, p.days.size, hours(p.min)]));
  }

  lines.push('');
  // Einsatztage gesamt sind projektübergreifend distinkt: wer an einem Tag auf
  // zwei Baustellen war, zählt einmal. Die Spaltensumme oben ist deshalb höher.
  const uniqueDays = new Set(relevant.map((e) => e.date)).size;
  lines.push(row(['Gesamt', '', uniqueDays, hours(totalMin)]));

  return lines.join('\n');
}

export function userProjectCsvFilename(user: AppUser, from: string, to: string): string {
  return `Projekte_${safeName(user.name)}_${from}_${to}.csv`;
}

/** Hilfsfunktion für den Zeitraum-Export: Einträge eines Nutzers im Bereich. */
export function entriesInRange(entries: TimeEntry[], uid: string, from: string, to: string) {
  return entries
    .filter((e) => e.userId === uid && e.date >= from && e.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export { calcMonthStats };
