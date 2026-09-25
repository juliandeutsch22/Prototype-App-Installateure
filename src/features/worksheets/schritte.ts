import { AB_TABELLE, useAbBreite } from '@/lib/useAbBreite';

/**
 * Die Schritte des Handwerksscheins und die Frage, ob sie überhaupt als
 * Schritte dastehen — Anzeige und Begründung in `Schrittfolge.tsx`.
 */

export type Schritt = 1 | 2 | 3 | 4;

export const SCHRITTE: ReadonlyArray<{ nr: Schritt; name: string }> = [
  { nr: 1, name: 'Zeiten' },
  { nr: 2, name: 'Material' },
  { nr: 3, name: 'Fotos' },
  { nr: 4, name: 'Unterschrift' },
];

/**
 * Steht der Schein als eine Seite da (Schreibtisch) oder als Schritte?
 *
 * Ab derselben Grenze wie Tailwinds `lg` — über die gemeinsame Breitenweiche,
 * die auch die Listen der Büro-Ansichten in Tabellen umschaltet.
 */
export function useEineSeite(): boolean {
  return useAbBreite();
}

/**
 * Zwei Spalten und Tabellen (Mockup S. 8) erst ab 1280 px — dieselbe Grenze
 * wie die Tabellen und zweispaltigen Akten der übrigen Ansichten (Linie, 1
 * und 4). Neben der Seitenleiste blieben auf 1024 px für die Zeitentabelle
 * mit sechs Spalten gut 400 px; darunter steht der Schein als eine Spalte
 * mit nummerierten Karten.
 */
export function useZweiSpalten(): boolean {
  return useAbBreite(AB_TABELLE);
}
