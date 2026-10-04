import type { AppUser, TimeEntry } from '@/types';
import { PETROL } from '@/lib/belegLayout';
import { calcWorkMin, calcMonthStats, groupProjectHours, type MonthStats } from '@/lib/time';
import { zuschlagszeit, kennzeichen } from './zuschlaege';
import { ueberstundenNachTagesgrenze } from './ueberstunden';
import type { Nachtzeit, UeberstundenRegel } from '@/lib/lohnregeln';
import { csvZelle } from '@/lib/csvZelle';
import { EINSTUFUNGEN, lehrjahr, type EinstufungDerPerson } from '@/lib/einstufung';

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

/*
  Die Produktfarbe Petrol (`--brand-fixed`). Hier stand #003366, das Marineblau
  einer älteren Fassung — das einzige Blau in der ganzen App (Prüflauf
  24.09.2026, C1).
*/
export const BRAND_RGB: [number, number, number] = PETROL;

/** Deutsche Dezimalzahl mit zwei Nachkommastellen. */
function num(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

/** Minuten als Dezimalstunden ("7,50"). */
export function hours(min: number): string {
  return num(min / 60);
}

/**
 * Eine Anzahl Tage für die CSV: ganze wie bisher („3"), sonst mit Komma
 * („4,5"). Halbe gibt es seit dem 24./31. Dezember, Bruchteile beim
 * anteiligen Anspruch — „4.5" mit Punkt liest ein österreichisches Excel als
 * Datum oder Text, und keine Summe ginge auf.
 */
function tage(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace('.', ',');
}

/** 'YYYY-MM-DD' -> '27.08.2026'. */
export function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * CSV-Feld absichern — Quoting und die Entschärfung von Formeln stehen in
 * `lib/csvZelle.ts`, gemeinsam mit den Rechnungsexporten.
 */
const cell = csvZelle;

function row(values: unknown[]): string {
  return values.map(cell).join(';');
}

/**
 * Löst den Download aus. Das BOM ist nötig, damit Excel die Datei als UTF-8
 * liest — ohne es werden Umlaute zerstört.
 */
export function downloadCsv(content: string, filename: string): void {
  // BOM als \uFEFF-Escape statt als unsichtbares Zeichen im Quelltext: sonst
  // sieht niemand, dass es da ist, und der nächste Editor frisst es.
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' });
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

/**
 * Die Lohnregeln des Betriebs (Paket 2c): Nachtzeit und Überstundenmodell.
 * Ohne Angabe 22–6 Uhr und Zeitkonto — die Ausleitung wie bisher.
 */
export interface Lohnregeln {
  nacht?: Nachtzeit;
  ueberstunden?: UeberstundenRegel;
}

const mitTagesgrenze = (l: Lohnregeln) => l.ueberstunden?.modell === 'tagesgrenze';

export interface UserWithEntries {
  user: AppUser;
  monthEntries: TimeEntry[];
  stats: MonthStats;
}

/* ------------------------------------------------------------------ */
/* 1) Monats-CSV über alle Mitarbeiter                                 */
/* ------------------------------------------------------------------ */

/** Die Einstufung ohne Lehrjahr — das steht in der eigenen Spalte daneben. */
function einstufungSpalte(u: EinstufungDerPerson): string {
  return u.einstufung ? EINSTUFUNGEN.find((s) => s.wert === u.einstufung)?.name ?? '' : '';
}

function lehrjahrSpalte(u: EinstufungDerPerson, tag: string): string | number {
  if (u.einstufung !== 'lehrling' || !u.lehrbeginn || !u.lehrzeitMonate) return '';
  return lehrjahr(u.lehrbeginn, u.lehrzeitMonate, tag);
}

/**
 * Monatsexport (Legacy:3803-3828): Detailzeilen, danach eine Zusammenfassung
 * je Mitarbeiter. Die drei Blöcke stehen bewusst in EINER Datei — so wie es
 * die Lohnverrechnung gewohnt ist.
 */
export function buildMonthCsv(
  rows: UserWithEntries[],
  year: number,
  month: number,
  halbeTage: boolean,
  lohn: Lohnregeln = {},
  /** Alle Buchungen des Monats, auch ohne Zeitkonto — für die Projektauswertung (M25). */
  projektEintraege?: TimeEntry[],
): string {
  const lines: string[] = [];

  lines.push(
    row([
      'Mitarbeiter', 'Datum', 'Status', 'Kunde/Baustelle', 'Projektnummer', 'Fahrzeug',
      'Startzeit', 'Endzeit', 'Pause(Min)', 'Wegzeit(Min)', 'Kommentar',
      'Arbeitszeit(Std)', 'Gesamtzeit(Std)',
      // Die Rechnung stellt aus genau diesen beiden Kennzeichen Positionen
      // mit Aufschlag zusammen. Fehlten sie hier, verrechnete der Betrieb
      // einen Zuschlag, den die Lohnverrechnung nie zu sehen bekommt.
      'Nacht', 'Notdienst',
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
        kennzeichen(e.isNightWork),
        kennzeichen(e.isEmergency),
      ]),
    );
  }

  lines.push('', 'Mitarbeiter-Zusammenfassung');
  lines.push(
    row([
      'Name', 'Ist(Std)', 'Soll(Std)', 'Saldo(Std)', 'Krank-Tage', 'Urlaub-Tage', 'Resturlaub',
      'Nacht(Std)', 'Notdienst(Std)', 'davon beides(Std)',
      // Hinten angehängt, nicht zwischen die Tage: eine Lohnverrechnung,
      // die die Spalten nach ihrer Stelle liest, bekäme sonst verschobene
      // Zahlen.
      'Zeitausgleich(Std)',
      // Kollektivvertrag: am 24./31.12. nach 12 Uhr 100 % Zuschlag. Steht
      // immer da, auch mit null — sonst hiesse eine fehlende Spalte etwas
      // anderes als eine leere.
      '24./31.12. ab 12 Uhr(Std)',
      // Nur beim Überstundenmodell „Tagesgrenze“ — und hinten angehängt,
      // damit die Spalten davor bleiben, wo sie waren.
      ...(mitTagesgrenze(lohn) ? ['Überstunden 50 %(Std)', 'Überstunden 100 %(Std)'] : []),
      // Seit 30.09.2026 (Testbericht 4.1), ganz hinten — die Stellen davor bleiben.
      'Einstufung', 'Lehrjahr', 'Berufsschule-Tage', 'Berufsschule(Std)',
      // Seit 04.10.2026 (Plan 10.3), wieder ganz hinten. Der unbezahlte Urlaub
      // steht eigens: ihn zieht die Lohnverrechnung ab, das Zeitkonto nicht.
      'Sonderurlaub-Tage', 'Pflegefreistellung-Tage', 'Freigestellt stundenweise(Std)', 'Unbezahlt-Tage',
    ]),
  );
  // Das Lehrjahr am letzten Tag des Monats: wechselt es mittendrin, gilt für die Abrechnung der neue Stand.
  const monatsletzter = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`;
  for (const { user, monthEntries, stats } of [...rows].sort((a, b) => a.user.name.localeCompare(b.user.name, 'de'))) {
    // „davon beides" ist keine Zierde: der Rohrbruch um zwei Uhr früh trägt
    // beide Kennzeichen. Wer Nacht und Notdienst addiert, zählt diese
    // Stunden doppelt — und sähe es der Datei nicht an.
    const z = zuschlagszeit(monthEntries, halbeTage, lohn.nacht);
    const ue = lohn.ueberstunden
      ? ueberstundenNachTagesgrenze(user, monthEntries, lohn.ueberstunden, halbeTage)
      : null;
    lines.push(
      row([
        user.name,
        hours(stats.istMin),
        hours(stats.sollMin),
        hours(stats.saldoMin),
        stats.krankDays,
        tage(stats.urlaubDays),
        tage(stats.urlaubRest),
        hours(z.nachtMin),
        hours(z.notdienstMin),
        hours(z.beidesMin),
        hours(stats.zaMin),
        hours(z.dezemberMin),
        ...(mitTagesgrenze(lohn) && ue ? [hours(ue.fuenfzigMin), hours(ue.hundertMin)] : []),
        einstufungSpalte(user),
        lehrjahrSpalte(user, monatsletzter),
        stats.berufsschuleDays,
        hours(stats.berufsschuleMin),
        stats.sonderurlaubDays,
        stats.pflegeDays,
        hours(stats.freigestelltMin),
        stats.unbezahltDays,
      ]),
    );
  }

  /*
    PROJEKTAUSWERTUNG — ALLE PERSONEN, WIE IN DER ÜBERSICHT (Testbericht
    30.09.2026, M25). Hier standen nur die Stunden der Zeilen oben, also nur
    von Personen mit Zeitkonto: PR-187 hatte in der Datei 25,50 Std, in der
    Oberfläche 38:33, eine andere Baustelle fehlte ganz. Jetzt zählen alle
    Buchungen des Monats (`projektEintraege`), getrennt nach Facharbeiter-
    und Helferstunden — dieselbe Rechnung wie `groupProjectHours`.
  */
  const projekte = groupProjectHours(
    projektEintraege ?? all.map(({ e }) => e),
  );
  if (projekte.length > 0) {
    lines.push('', 'Projektauswertung (alle Personen)');
    /*
      LEHRLINGSSTUNDEN AUSSERHALB DES BUDGETS hinten angehängt (Entscheidung
      03.10.2026): die ersten vier Spalten bleiben, wie sie ein Empfänger
      kennt; „Gesamt“ zählt alle Stunden der Baustelle.
    */
    lines.push(row(['Projektnummer', 'Facharbeiter(Std)', 'Helfer(Std)', 'Gesamt(Std)', 'Lehrling nicht im Budget(Std)']));
    for (const p of projekte) {
      // Die Nummer, wie sie gebucht wurde — der Gruppenschlüssel lässt den Vorsatz weg.
      const nummer = p.entries[0]?.projectNumber ?? p.projectNumber;
      lines.push(row([
        nummer,
        hours(p.fachMin),
        hours(p.helperMin),
        hours(p.fachMin + p.helperMin + p.lehrlingMin),
        hours(p.lehrlingMin),
      ]));
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
  halbeTage: boolean,
  lohn: Lohnregeln = {},
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
      'Pause(Min)', 'Wegzeit(Min)', 'Arbeitszeit(Std)', 'Nacht', 'Notdienst', 'Kommentar',
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
        kennzeichen(e.isNightWork),
        kennzeichen(e.isEmergency),
        e.comment ?? '',
      ]),
    );
  }

  lines.push('');
  lines.push(row(['Ist', `${hours(stats.istMin)} h`]));
  lines.push(row(['Soll', `${hours(stats.sollMin)} h`]));
  lines.push(row(['Saldo', `${hours(stats.saldoMin)} h`]));
  lines.push(row(['Krank', `${stats.krankDays} Tage`]));
  lines.push(row(['Urlaub (Monat)', `${tage(stats.urlaubDays)} Tage`]));
  lines.push(row([`Urlaub ${year} gesamt`, `${tage(stats.yearlyUrlaubDays)} Tage`]));
  lines.push(row(['Resturlaub', `${tage(stats.urlaubRest)} Tage`]));
  lines.push(row(['Zeitausgleich', `${hours(stats.zaMin)} h`]));
  if (stats.berufsschuleDays > 0) {
    lines.push(row(['Berufsschule', `${stats.berufsschuleDays} Tage (${hours(stats.berufsschuleMin)} h)`]));
  }
  if (stats.sonderurlaubDays > 0) lines.push(row(['Sonderurlaub', `${stats.sonderurlaubDays} Tage`]));
  if (stats.pflegeDays > 0) lines.push(row(['Pflegefreistellung', `${stats.pflegeDays} Tage`]));
  if (stats.freigestelltMin > 0) lines.push(row(['Stundenweise freigestellt', `${hours(stats.freigestelltMin)} h`]));
  if (stats.unbezahltDays > 0) lines.push(row(['Unbezahlter Urlaub', `${stats.unbezahltDays} Tage`]));

  /*
    ZUSCHLÄGE STEHEN IMMER DA, auch mit null Stunden. Der Block ist die
    Auskunft „für diesen Monat sind keine Zuschlagsstunden angefallen" — und
    die unterscheidet sich von „diese Datei kennt das Thema nicht", was
    vorher der Fall war und niemandem auffiel.
  */
  const z = zuschlagszeit(monthEntries, halbeTage, lohn.nacht);
  lines.push('');
  lines.push(row(['Nachtstunden', `${hours(z.nachtMin)} h`]));
  lines.push(row(['Notdienststunden', `${hours(z.notdienstMin)} h`]));
  lines.push(row(['davon beides', `${hours(z.beidesMin)} h`]));
  lines.push(row(['24./31.12. ab 12 Uhr', `${hours(z.dezemberMin)} h`]));
  if (lohn.ueberstunden && mitTagesgrenze(lohn)) {
    const ue = ueberstundenNachTagesgrenze(user, monthEntries, lohn.ueberstunden, halbeTage);
    lines.push(row(['Überstunden 50 %', `${hours(ue.fuenfzigMin)} h`]));
    lines.push(row(['Überstunden 100 %', `${hours(ue.hundertMin)} h`]));
  }

  return lines.join('\n');
}

export function userCsvFilename(user: AppUser, year: number, month: number): string {
  return `zeiterfassung_${safeName(user.name)}_${String(month + 1).padStart(2, '0')}-${year}.csv`;
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
