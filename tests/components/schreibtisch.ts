import { afterEach } from 'vitest';

/**
 * Den Schreibtisch nachstellen: die Medienabfrage für `lg` trifft zu.
 *
 * jsdom kennt kein `matchMedia` — ohne diesen Ersatz zeigt jede Ansicht ihre
 * Telefonform (siehe `useAbBreite`). Im `describe` einmal
 * `const schreibtisch = mitSchreibtisch();`, im Test `schreibtisch()` VOR dem
 * Zeichnen; nach jedem Test ist der alte Stand wieder da.
 */
export function mitSchreibtisch(): () => void {
  const vorher = window.matchMedia;
  afterEach(() => {
    window.matchMedia = vorher;
  });
  return () => {
    window.matchMedia = ((q: string) => ({
      matches: true,
      media: q,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  };
}
