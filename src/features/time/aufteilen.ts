import type { TimeEntry } from '@/types';
import { leseZahl } from '@/lib/zahl';
import { normProjectNumber } from '@/lib/time';

/**
 * EINE BUCHUNG AUF MEHRERE BAUSTELLEN AUFTEILEN (10.10.2026) — die Rechnung
 * dazu, ohne Oberfläche. Die Datenbank (`public.zeit_aufteilen`) prüft
 * dasselbe noch einmal; hier steht es, damit die Maske es sagt, bevor
 * gespeichert wird, und damit sie zeigt, welche Uhrzeiten entstehen.
 *
 * DER TAG BLEIBT DERSELBE: die Buchung behält Beginn, Pause und den Rest der
 * Zeit; die weiteren Baustellen schliessen in der angegebenen Reihenfolge
 * lückenlos an und enden zusammen zur alten Endzeit.
 *
 * ÜBER MITTERNACHT (A10, 24.10.2026): eine Nachtschicht teilt sich genauso.
 * Ein Teil, der vor Mitternacht beginnt, bleibt am Tag der Buchung (auch
 * wenn er danach endet); ein Teil, der ab Mitternacht beginnt, steht am
 * Folgetag — dort liegt er auch auf der Uhr.
 */

export interface AufteilZeile {
  projectNumber: string;
  /** Wie getippt: „2“, „1,5“ oder „1:30“. Leer heisst: diese Zeile zählt nicht. */
  stunden: string;
}

export interface Teil {
  projectNumber: string;
  minuten: number;
}

function minuten(hhmm?: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Minuten ab Mitternacht des Buchungstags als Uhrzeit — ab 24 Std. wieder von vorn (Folgetag). */
const uhr = (min: number) => {
  const m = min % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Warum sich diese Buchung nicht aufteilen lässt — oder `null`. */
export function aufteilenGeht(
  e: Pick<TimeEntry, 'status' | 'startTime' | 'endTime' | 'isBilled'>,
): string | null {
  if (e.status !== 'Anwesend') return 'Aufteilen lässt sich nur gearbeitete Zeit.';
  const von = minuten(e.startTime);
  const bis = minuten(e.endTime);
  if (von === null || bis === null) return 'Aufteilen lässt sich nur eine Buchung mit Von und Bis.';
  if (bis === von) return 'Von und Bis sind gleich — die Buchung hat keine Zeit.';
  if (e.isBilled) return 'Die Buchung ist schon verrechnet.';
  return null;
}

/** Stunden aus der Eingabe in Minuten: „2“, „1,5“, „1.5“ oder „1:30“. Leer ist `null` ohne Fehler. */
export function stundenAusEingabe(text: string): { min: number | null; fehler: string | null } {
  const t = text.trim();
  if (t === '') return { min: null, fehler: null };
  const hm = /^(\d{1,2}):([0-5]\d)$/.exec(t);
  const dezimal = hm ? null : leseZahl(t).wert;
  const min = hm ? Number(hm[1]) * 60 + Number(hm[2]) : dezimal !== null ? Math.round(dezimal * 60) : NaN;
  if (!Number.isFinite(min)) return { min: null, fehler: `„${t}“ sind keine Stunden — etwa „2“, „1,5“ oder „1:30“.` };
  if (min < 1) return { min: null, fehler: 'Die Stunden einer Baustelle müssen mehr als null sein.' };
  return { min, fehler: null };
}

export interface Aufteilung {
  /** Was an die Datenbank geht — nur Zeilen mit Stunden. */
  teile: Teil[];
  /** Was auf der gebuchten Baustelle bleibt, in Minuten (Arbeitszeit ohne Pause). */
  rest: number;
  /** Die entstehenden Uhrzeiten, die gebuchte Baustelle zuerst. */
  plan: Array<{
    projectNumber: string; von: string; bis: string; minuten: number;
    /** Der Teil beginnt ab Mitternacht und steht am Folgetag. */
    folgetag?: true;
  }>;
  fehler: string | null;
}

export function aufteilung(
  e: Pick<TimeEntry, 'startTime' | 'endTime' | 'breakDuration' | 'projectNumber'>,
  zeilen: AufteilZeile[],
): Aufteilung {
  const von = minuten(e.startTime) ?? 0;
  const ende = minuten(e.endTime) ?? 0;
  // Über Mitternacht: das Ende liegt am Folgetag (wie `calcWorkMin` es liest).
  const bis = ende < von ? ende + 1440 : ende;
  const pause = Number(e.breakDuration ?? 0) || 0;
  const arbeit = bis - von - pause;
  const teile: Teil[] = [];
  const gesehen = new Set([normProjectNumber(e.projectNumber)]);
  let fehler: string | null = null;

  for (const z of zeilen) {
    const s = stundenAusEingabe(z.stunden);
    // Eine Zeile ohne Stunden ist ein Vorschlag, den niemand gebraucht hat.
    if (s.min === null && !s.fehler) continue;
    const nr = z.projectNumber.trim();
    if (s.fehler) fehler ??= s.fehler;
    else if (!nr) fehler ??= 'Zu jeden Stunden gehört eine Baustelle.';
    else if (gesehen.has(normProjectNumber(nr))) fehler ??= `Baustelle ${nr} steht doppelt — eine Baustelle bekommt ihre Stunden in einer Zeile.`;
    else {
      gesehen.add(normProjectNumber(nr));
      teile.push({ projectNumber: nr, minuten: s.min! });
    }
  }

  const rest = arbeit - teile.reduce((s, t) => s + t.minuten, 0);
  if (!fehler && teile.length === 0) fehler = 'Bei mindestens einer weiteren Baustelle die Stunden angeben.';
  if (!fehler && rest < 1) fehler = 'Für die gebuchte Baustelle bleibt keine Zeit — die Teile sind zusammen so lang wie der Tag oder länger.';

  const plan: Aufteilung['plan'] = [];
  if (rest >= 1) {
    let pos = von + pause + rest;
    plan.push({ projectNumber: e.projectNumber ?? '', von: uhr(von), bis: uhr(pos), minuten: rest });
    for (const t of teile) {
      plan.push({
        projectNumber: t.projectNumber, von: uhr(pos), bis: uhr(pos + t.minuten), minuten: t.minuten,
        ...(pos >= 1440 ? { folgetag: true as const } : {}),
      });
      pos += t.minuten;
    }
  }
  return { teile, rest, plan, fehler };
}
