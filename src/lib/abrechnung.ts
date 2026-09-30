import type { Abrechnungsart } from '@/types';

/**
 * Die Abrechnungsarten einer Baustelle, mit dem Wort, das Menschen lesen
 * (Testbericht 30.09.2026, M16).
 */
export const ABRECHNUNGSARTEN: { wert: Abrechnungsart; text: string }[] = [
  { wert: 'Pauschal', text: 'Pauschal' },
  { wert: 'Regie', text: 'Regie' },
  { wert: 'Einheitspreis', text: 'Einheitspreis nach Aufmaß' },
];

/** Das Wort zur Abrechnungsart; ohne Angabe gilt Regie. */
export function abrechnungText(a: Abrechnungsart | undefined | null): string {
  return ABRECHNUNGSARTEN.find((x) => x.wert === (a ?? 'Regie'))?.text ?? 'Regie';
}

/**
 * Sind die Stunden der Scheine Grundlage der Rechnung? Nur bei Regie; bei
 * Pauschal und Einheitspreis belegen sie nur, DASS gearbeitet wurde.
 */
export function stundenSindGrundlage(a: Abrechnungsart | undefined | null): boolean {
  return (a ?? 'Regie') === 'Regie';
}
