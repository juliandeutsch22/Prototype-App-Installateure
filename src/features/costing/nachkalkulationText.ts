import type { Stand } from '@/components/Badge';
import type { Nachkalkulation } from './nachkalkulation';

/** Was Zeile und Seitenfenster der Nachkalkulation gleich sagen — an einer Stelle. */

/*
  DAS ZEICHEN ZUM TON (Planlinie B3). `margenTon` ist Geschäftslogik und
  bleibt, wie sie ist; nur „ruht“ — kein Erlös hinterlegt — bekäme als
  Zeichen den Kreis mit Haken, und der hieße „erledigt“. Ohne Erlös ist noch
  nichts beurteilt: der leere Kreis sagt das.
*/
export const zeichenVon = (ton: Stand): Stand => (ton === 'ruht' ? 'offen' : ton);

/** Prozent mit Komma — überall sonst schreibt die App deutsch. */
export const fmtProzent = (n: number) =>
  `${new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 }).format(n)} %`;

/** Woher der Erlös kommt — in der Zeile kurz, im Fenster mit der Zahl der Rechnungen. */
export function erloesHerkunft(k: Nachkalkulation): string {
  if (k.erloesQuelle === 'Rechnungen') return 'Erlös aus Rechnungen';
  if (k.erloesQuelle === 'Angebot') return 'Erlös aus dem Angebot — noch nicht verrechnet';
  return 'kein Erlös hinterlegt';
}

/** „3 Artikel ohne Einkaufspreis“ — was die Zeile statt der ganzen Liste sagt. */
export function lueckenKurz(anzahl: number): string {
  return anzahl === 1 ? '1 Artikel ohne Einkaufspreis' : `${anzahl} Artikel ohne Einkaufspreis`;
}

