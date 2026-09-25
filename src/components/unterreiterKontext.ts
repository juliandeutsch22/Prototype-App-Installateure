import { createContext, type ReactNode } from 'react';

/**
 * Die Leiste der Unterreiter für den Seitenkopf der gerade gezeigten
 * Unterseite (siehe `Unterreiter.tsx`). `anmelden` sagt dem Unterreiter,
 * dass ein Seitenkopf die Leiste zeichnet — er lässt sie dann oben weg.
 */
export const UnterreiterKontext = createContext<{
  leiste: ReactNode;
  anmelden: () => () => void;
} | null>(null);
