import type { Project } from '@/types';

/*
  „NOCH EINZUPLANEN“ ALS SCHUBLADE (E96, 17.11.2026). Die Ablage neben dem
  Raster wuchs mit ihrer Liste: 15 Baustellen zu drei Zeilen standen als
  1.300 px lange Spalte neben einem Raster von 400 px, und wer die unterste
  ziehen wollte, sah das Raster nicht mehr. Hier steht, was sich ohne Browser
  prüfen lässt: die Suche und das Merken des Einklappens.
*/

/** Ab so vielen Baustellen steht ein Suchfeld über der Liste — bis dahin sieht man alle auf einen Blick. */
export const ABLAGE_SUCHE_AB = 9;

/**
 * Baustellen, die zu einer Eingabe passen: jedes Wort muss in Kunde, Nummer
 * oder Kurzbezeichnung vorkommen, gleich wo und in welcher Schreibung
 * („hub bad“ findet „Familie Huber · Bad“, „0147“ die B-2026-0147).
 */
export function ablageTreffer<T extends Pick<Project, 'customerName' | 'projectNumber' | 'bezeichnung'>>(baustellen: T[], eingabe: string): T[] {
  const woerter = eingabe.toLocaleLowerCase('de').split(/\s+/).filter(Boolean);
  if (woerter.length === 0) return baustellen;
  return baustellen.filter((p) => {
    const text = [p.customerName, p.projectNumber, p.bezeichnung].filter(Boolean).join(' ').toLocaleLowerCase('de');
    return woerter.every((w) => text.includes(w));
  });
}

/*
  EINGEKLAPPT BLEIBT EINGEKLAPPT — je Person auf diesem Gerät. Wer die Woche
  in voller Breite will, soll nicht bei jedem Öffnen wieder einklappen. Im
  Speicher des Browsers, nicht in der Datenbank: es ist eine Ansicht, keine
  Angabe über die Person. Ohne Speicher (privates Fenster) ist sie offen.
*/
const schluessel = (uid: string) => `senklot.planung.ablageZu.${uid}`;

export function ablageZuLesen(uid: string): boolean {
  try {
    return window.localStorage.getItem(schluessel(uid)) === '1';
  } catch {
    return false;
  }
}

export function ablageZuMerken(uid: string, zu: boolean): void {
  try {
    if (zu) window.localStorage.setItem(schluessel(uid), '1');
    else window.localStorage.removeItem(schluessel(uid));
  } catch {
    // Kein Speicher: dann gilt es nur bis zum nächsten Öffnen.
  }
}
