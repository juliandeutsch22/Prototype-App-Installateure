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
 * Die Abrechnungsart im Schriftfeld: das Wort und, wo es lang ist, ein Zusatz
 * darunter. „Einheitspreis nach Aufmaß“ passte in keiner Breite in ein Feld
 * und lief ins Nachbarfeld (Auftrag 03.11.2026); „nach Aufmaß“ steht deshalb
 * in der kleinen Zeile darunter, wie „nicht festgelegt“ unter „offen“.
 */
export function abrechnungKurz(a: Abrechnungsart | undefined | null): { wert: string; zusatz?: string } {
  if ((a ?? 'Regie') === 'Einheitspreis') return { wert: 'Einheitspreis', zusatz: 'nach Aufmaß' };
  return { wert: abrechnungText(a) };
}

/**
 * Sind die Stunden der Scheine Grundlage der Rechnung? Nur bei Regie; bei
 * Pauschal und Einheitspreis belegen sie nur, DASS gearbeitet wurde.
 */
export function stundenSindGrundlage(a: Abrechnungsart | undefined | null): boolean {
  return (a ?? 'Regie') === 'Regie';
}
