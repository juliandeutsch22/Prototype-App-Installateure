import type { AppUser, TimeEntry } from '@/types';
import {
  calcWorkMin,
  fmtMin,
  getAustrianHolidayName,
  istGanztagsGutschrift,
  localDateStr,
  pflichtTage,
  tagesAnteil,
  tagesStatusName,
  tagessollStunden,
} from '@/lib/time';
import { freigestelltMin } from '@shared/arbeitszeit';
import { grenzText, type Grenzfall } from './arbeitszeitGrenzen';

/**
 * DIE TAGESAUSWERTUNG DER MITARBEITERÜBERSICHT (Runde 4, Auftrag 3.3.1).
 *
 * EINE STELLE für den Streifen, die Woche und das Seitenfenster. Bis Runde 4
 * stand diese Herleitung im Monatsraster (`MonatsRaster.tsx`) — frei
 * (Arbeitstage der Person, Feiertag, vor Eintritt), gebucht (Ist), abwesend,
 * das Soll des Tages (`pflichtTage`, `tagesAnteil`, `tagessollStunden`) und
 * fehlend (aus der Vollständigkeit, `calcCompleteness` bzw. derselben
 * `offeneWerktage`). Gerechnet wird hier nichts Neues: es sind dieselben
 * Funktionen in derselben Reihenfolge, nur einmal je Person und Zeitraum
 * statt je Zelle über alle Buchungen.
 *
 * WARUM EIN ZUSTAND JE TAG. Das Raster zeigte Klasse und Inhalt getrennt
 * (eine Klasse „frei“ mit Stunden darin am Samstag mit Notdienst). Der
 * Streifen hat nur eine Farbe je Feld; was man sieht, muss also EIN Wort
 * sein. Die Rangfolge ist die des Rasters, das zeigte, was in der Zelle
 * stand: fehlt vor gebucht vor abwesend vor frei. Der Test „alt gegen neu“
 * (`tests/unit/tagesauswertung.test.ts`) hält das Tag für Tag fest.
 */

export type TagesZustand = 'ok' | 'grenze' | 'fehlt' | 'weg' | 'frei' | 'zukunft';

export interface Tageswert {
  /** 'JJJJ-MM-TT' */
  tag: string;
  /** „Mi 07.10.“ */
  kurz: string;
  zustand: TagesZustand;
  /** Die Buchungen des Tages, nach Beginn sortiert. */
  eintraege: TimeEntry[];
  /** Gearbeitete Minuten (`calcWorkMin`), wie im Raster. */
  istMin: number;
  /** Die erste ganztägige oder stundenweise Abwesenheit des Tages. */
  abwesenheit: TimeEntry['status'] | null;
  feiertag: string | null;
  /** Wochenende der Person, Feiertag oder vor dem Eintritt — wie im Raster. */
  frei: boolean;
  /** Das Soll des Tages, wie es das Raster beim Darüberfahren nannte: nur für Pflichttage bis gestern. */
  sollMin: number | null;
  /**
   * Was dieser Tag zum „Soll bisher“ der Monatsauswertung beiträgt (in
   * Minuten, ungerundet): ein Pflichttag mit seinem Soll, OHNE die
   * Abwesenheiten, die `calcMonthStats` vom Soll abzieht (ganztägig
   * gutgeschrieben, stundenweise freigestellt). Summiert über den Monat ist
   * das `stats.sollMin` — das prüft `tests/unit/tagesauswertung.test.ts`.
   * Für die Summen der Woche (Auftrag 3.4).
   */
  sollImSaldoMin: number;
  /** Das Tagessoll des Tages, auch in der Zukunft — für „noch nichts gebucht · Soll …“. */
  tagessollMin: number | null;
  /** „07:00–11:30, 12:00–15:30“ oder null, wenn keine Buchung eine Uhrzeit trägt. */
  zeiten: string | null;
  /** Die Fälle der Arbeitszeitgrenzen, die an diesem Tag hängen (Tag, Nacht, Ruhezeit). */
  grenzen: Grenzfall[];
  /** Heute oder später. */
  offen: boolean;
}

const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** „Mi 07.10.“ */
export function tagKurz(iso: string): string {
  return `${WOCHENTAGE[new Date(`${iso}T00:00:00`).getDay()]} ${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
}

/** Die Kurzform des Wochentags: „Mi“. */
export function wochentagKurz(iso: string): string {
  return WOCHENTAGE[new Date(`${iso}T00:00:00`).getDay()];
}

/** Alle Kalendertage eines Monats (0-basiert) als 'JJJJ-MM-TT'. */
export function tageDesMonats(jahr: number, monat: number): string[] {
  const letzter = new Date(jahr, monat + 1, 0).getDate();
  return Array.from({ length: letzter }, (_, i) => localDateStr(new Date(jahr, monat, i + 1)));
}

/** `n` Tage nach `iso` (auch negativ). */
export function plusTage(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

/** Der Montag der Woche, in der `iso` liegt. */
export function montagDerWoche(iso: string): string {
  const wt = new Date(`${iso}T00:00:00`).getDay();
  return plusTage(iso, wt === 0 ? -6 : 1 - wt);
}

/** Die sieben Tage ab einem Montag. */
export function tageDerWoche(montag: string): string[] {
  return Array.from({ length: 7 }, (_, i) => plusTage(montag, i));
}

/** „8:00“ statt „08:00“ — in einem Feld oder Tooltip zählt jedes Zeichen (wie im Raster). */
export function kurzeZeit(min: number): string {
  return fmtMin(min).replace(/^(-?)0(\d:)/, '$1$2');
}

/**
 * Die Art einer Abwesenheit als Wort (Auftrag 3.3.1: keine Kürzel mehr).
 * Dieselben Wörter, die das Raster beim Darüberfahren nannte.
 */
export function artWort(status: TimeEntry['status']): string {
  return tagesStatusName(status);
}

/** Fälle, die an EINEM Tag hängen. Wochenfälle hängen am Montag und betreffen die ganze Woche. */
export function istTagesfall(f: Pick<Grenzfall, 'art'>): boolean {
  return f.art === 'tag' || f.art === 'nacht' || f.art === 'ruhezeit';
}

/**
 * Die Tage eines Zeitraums für EINE Person.
 *
 * @param eintraege die Buchungen der Person (mindestens die des Zeitraums; andere werden übergangen)
 * @param tage      die Kalendertage, aufsteigend
 * @param fehlend   die Tage ohne Buchung, wie die Vollständigkeit sie meldet
 * @param heute     'JJJJ-MM-TT'
 * @param grenzen   die Fälle der Arbeitszeitgrenzen dieser Person (alle Arten; hier zählen die Tagesfälle)
 */
export function tagesauswertung({
  user,
  eintraege,
  tage,
  fehlend,
  halbeTage,
  heute,
  grenzen = [],
}: {
  user: Pick<AppUser, 'workDays' | 'appStartDate' | 'weeklyTargetHours' | 'tagessoll'>;
  eintraege: readonly TimeEntry[];
  tage: readonly string[];
  fehlend: Iterable<string>;
  halbeTage: boolean;
  heute: string;
  grenzen?: readonly Grenzfall[];
}): Tageswert[] {
  if (tage.length === 0) return [];
  const workDays = user.workDays && user.workDays.length ? user.workDays : [1, 2, 3, 4, 5];
  const pflicht = new Set(
    pflichtTage(user, new Date(`${tage[0]}T00:00:00`), new Date(`${tage[tage.length - 1]}T00:00:00`)),
  );
  const fehlt = new Set(fehlend);
  // EINMAL nach Tagen ordnen, statt je Feld über alle Buchungen zu filtern (25 × 31 Felder).
  const jeTag = new Map<string, TimeEntry[]>();
  for (const e of eintraege) {
    const liste = jeTag.get(e.date);
    if (liste) liste.push(e);
    else jeTag.set(e.date, [e]);
  }
  const faelleJeTag = new Map<string, Grenzfall[]>();
  for (const f of grenzen) {
    if (!istTagesfall(f)) continue;
    faelleJeTag.set(f.bezug, [...(faelleJeTag.get(f.bezug) ?? []), f]);
  }

  return tage.map((tag) => {
    const datum = new Date(`${tag}T00:00:00`);
    const feiertag = getAustrianHolidayName(datum);
    const frei = !workDays.includes(datum.getDay()) || !!feiertag || (!!user.appStartDate && tag < user.appStartDate);
    const amTag = [...(jeTag.get(tag) ?? [])].sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
    const istMin = amTag.reduce((s, e) => s + calcWorkMin(e), 0);
    const abwesend = amTag.find((e) => e.status !== 'Anwesend');
    const anteil = tagesAnteil(tag, halbeTage);
    const tagessollMin = frei ? null : Math.round(anteil * tagessollStunden(user, tag) * 60);
    const imSoll = pflicht.has(tag);
    const sollMin = imSoll ? Math.round(anteil * tagessollStunden(user, tag) * 60) : null;
    /*
      WIE `calcMonthStats` DAS SOLL BILDET: ein Pflichttag mit seinem Soll,
      ausser er ist ganztägig gutgeschrieben (Krank, Urlaub, Berufsschule …);
      stundenweise Freistellung zieht ihre Minuten ab. Ungerundet — die
      Monatsauswertung rundet einmal am Ende, die Woche auch.
    */
    const gutgeschrieben = amTag.some((e) => istGanztagsGutschrift(e));
    const sollImSaldoMin = !imSoll || gutgeschrieben
      ? 0
      : anteil * tagessollStunden(user, tag) * 60 - amTag.reduce((s, e) => s + freigestelltMin(e), 0);
    const mitZeit = amTag.filter((e) => e.startTime && e.endTime);
    const grenzenAmTag = amTag.length > 0 ? faelleJeTag.get(tag) ?? [] : [];

    let zustand: TagesZustand;
    if (fehlt.has(tag)) zustand = 'fehlt';
    else if (grenzenAmTag.length > 0) zustand = 'grenze';
    else if (istMin > 0) zustand = 'ok';
    else if (abwesend) zustand = 'weg';
    else if (amTag.length > 0) zustand = 'ok';
    else if (frei) zustand = 'frei';
    else zustand = 'zukunft';

    return {
      tag,
      kurz: tagKurz(tag),
      zustand,
      eintraege: amTag,
      istMin,
      abwesenheit: abwesend ? abwesend.status : null,
      feiertag,
      frei,
      sollMin,
      sollImSaldoMin,
      tagessollMin,
      zeiten: mitZeit.length > 0 ? mitZeit.map((e) => `${e.startTime}–${e.endTime}`).join(', ') : null,
      grenzen: grenzenAmTag,
      offen: tag >= heute,
    };
  });
}

/**
 * Was beim Darüberfahren steht — und als `aria-label` am Feld (Auftrag
 * 3.3.1): „Mi 07.10. · 07:00–11:30, 12:00–15:30 · 8:00 Std. · Soll 8:00“,
 * bei einem Grenzfall dessen Text dahinter.
 */
export function tippText(t: Tageswert): string {
  const teile: string[] = [t.kurz];
  if (t.feiertag) teile.push(t.feiertag);
  if (t.zustand === 'fehlt') teile.push('keine Buchung');
  if (t.zustand === 'zukunft' && !t.frei) teile.push(t.offen ? 'noch nichts gebucht' : 'keine Buchung');
  if (t.zustand === 'frei' && !t.feiertag) teile.push('frei');
  if (t.zeiten) teile.push(t.zeiten);
  else if (t.eintraege.length > 1 && t.istMin > 0) teile.push(`${t.eintraege.length} Buchungen`);
  if (t.istMin > 0) teile.push(`${kurzeZeit(t.istMin)} Std.`);
  for (const e of t.eintraege) if (e.status !== 'Anwesend') teile.push(artWort(e.status));
  if (t.sollMin !== null) teile.push(`Soll ${kurzeZeit(t.sollMin)}`);
  for (const f of t.grenzen) teile.push(grenzText(f).titel);
  return teile.filter(Boolean).join(' · ');
}

/** Die Summen über einige Tage (Woche): Gebucht, Soll bisher, Saldo — aus denselben Tageswerten. */
export function summeDerTage(werte: readonly Tageswert[]): { istMin: number; sollMin: number; saldoMin: number } {
  const istMin = werte.reduce((s, t) => s + t.istMin, 0);
  const sollMin = Math.round(Math.max(0, werte.reduce((s, t) => s + t.sollImSaldoMin, 0)));
  return { istMin, sollMin, saldoMin: istMin - sollMin };
}

/** „Tage ohne Buchung“ dieser Tage. */
export function fehlendeTage(werte: readonly Tageswert[]): Tageswert[] {
  return werte.filter((t) => t.zustand === 'fehlt');
}
