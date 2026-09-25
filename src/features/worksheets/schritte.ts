import { useAbBreite } from '@/lib/useAbBreite';

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
