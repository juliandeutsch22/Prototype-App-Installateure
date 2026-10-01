/**
 * Die Regeln der Startseite (Testbericht 4.2, Nachtest 01.10.2026 Paket B) —
 * ohne Oberfläche, damit sie sich prüfen lassen.
 *
 *   1. Höchstens drei Einträge je Abschnitt, nach Dringlichkeit; darunter
 *      „und N weitere →“ auf die gefilterte Fachseite.
 *   2. Leere Abschnitte fallen weg; ist gar nichts zu tun, steht „Heute liegt
 *      nichts an“.
 *   3. Eine Zeile je Eintrag.
 *   4. Feste Reihenfolge je Rolle, höchstens vier Kennzahlen als Verweise.
 *   5. Keine Einträge, die einer anderen Rolle gehören.
 */

/** Wie dringend: Rot nur für Überfälliges. */
export type Ton = 'fehl' | 'warn' | 'leise' | 'ok' | 'info';

export interface Zeile {
  key: string;
  titel: string;
  detail?: string;
  status?: { text: string; ton: Ton };
  /** Wohin die Zeile führt. */
  to?: string;
}

export interface Abschnitt {
  key: string;
  titel: string;
  /** Wie viele es insgesamt sind — die Zeilen sind höchstens drei davon. */
  anzahl: number;
  zeilen: Zeile[];
  /** „und N weitere →“: auf die gefilterte Seite, oder an Ort und Stelle aufklappen. */
  weiter?: { to: string } | { aufklappen: Zeile[] };
}

export const JE_ABSCHNITT = 3;

/** Ein Abschnitt aus allen Einträgen — leer heißt: keiner. */
export function abschnitt(
  key: string,
  titel: string,
  alle: Zeile[],
  weiterTo?: string,
  aufklappen = false,
): Abschnitt | null {
  if (alle.length === 0) return null;
  const zeilen = alle.slice(0, JE_ABSCHNITT);
  const rest = alle.slice(JE_ABSCHNITT);
  return {
    key,
    titel,
    anzahl: alle.length,
    zeilen,
    weiter: rest.length === 0
      ? undefined
      : aufklappen || !weiterTo
        ? { aufklappen: rest }
        : { to: weiterTo },
  };
}

/** Nur die Abschnitte mit Inhalt, in der festen Reihenfolge der Rolle. */
export function mitInhalt(liste: (Abschnitt | null | undefined | false)[]): Abschnitt[] {
  return liste.filter((a): a is Abschnitt => !!a && a.anzahl > 0);
}

/** Wie viele Einträge alle Abschnitte zusammen haben — für „Handlungsbedarf · N“. */
export function summe(abschnitte: Abschnitt[]): number {
  return abschnitte.reduce((s, a) => s + a.anzahl, 0);
}
