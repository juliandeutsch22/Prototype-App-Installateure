import { abschnitt, type Abschnitt, type Zeile } from './abschnitte';

/**
 * GESCHÄFTSFÜHRUNG UND ADMINISTRATOR: eine Zeile je THEMA (Skizze 05).
 *
 * „Alles Obige, zusammengefasst nach Dringlichkeit“: aus jedem Abschnitt der
 * anderen Rollen wird eine Zeile mit Anzahl und dem wichtigsten Detail; die
 * Zeile führt auf die gefilterte Fachseite. Drei Abschnitte — Dringend,
 * Heute, Diese Woche —, je höchstens drei Themen. „und N weitere“ klappt
 * die übrigen Themen an Ort und Stelle auf (Abnahme 01.10.2026): sie
 * stammen von verschiedenen Fachseiten, eine gemeinsame gibt es nicht.
 */

export type Dringlichkeit = 'ueberfaellig' | 'heute' | 'woche';

export interface Thema extends Zeile {
  wann: Dringlichkeit;
}

export function themenAbschnitte(themen: (Thema | null | false | undefined)[]): Abschnitt[] {
  const da = themen.filter((t): t is Thema => !!t);
  const teil = (wann: Dringlichkeit): Zeile[] =>
    da.filter((t) => t.wann === wann).map((t) => ({ key: t.key, titel: t.titel, detail: t.detail, status: t.status, to: t.to }));
  return [
    /*
      „Dringend“, nicht „Überfällig“ (Runde 3, G6): daneben steht die
      Kennzahl „Überfällig“ für Rechnungen. Unter derselben Überschrift
      standen hier auch Baustellen über dem Endtermin und fehlende
      Buchungen — man las „Überfällig“ zweimal und meinte Verschiedenes.
    */
    abschnitt('t-ueberfaellig', 'Dringend', teil('ueberfaellig'), undefined, true),
    abschnitt('t-heute', 'Heute', teil('heute'), undefined, true),
    abschnitt('t-woche', 'Diese Woche', teil('woche'), undefined, true),
  ].filter((a): a is Abschnitt => !!a);
}

/** „1 Einsatz unbesetzt“ / „3 Einsätze unbesetzt“ */
export function anzahl(n: number, eins: string, mehr: string): string {
  return `${n} ${n === 1 ? eins : mehr}`;
}
