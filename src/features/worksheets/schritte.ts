import { useEffect, useState } from 'react';

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

/** Ab hier eine Seite statt Schritten — dieselbe Grenze wie Tailwinds `lg`. */
const BREIT = '(min-width: 1024px)';

function breitJetzt(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(BREIT).matches
    : false;
}

/**
 * Steht der Schein als eine Seite da (Schreibtisch) oder als Schritte?
 *
 * Gelesen beim ersten Zeichnen, nicht erst im Effekt — sonst sähe der
 * Schreibtisch für einen Augenblick die Schritte und sprang dann um.
 */
export function useEineSeite(): boolean {
  const [breit, setBreit] = useState(breitJetzt);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const abfrage = window.matchMedia(BREIT);
    const neu = () => setBreit(abfrage.matches);
    neu();
    if (abfrage.addEventListener) abfrage.addEventListener('change', neu);
    else abfrage.addListener(neu);
    return () => {
      if (abfrage.removeEventListener) abfrage.removeEventListener('change', neu);
      else abfrage.removeListener(neu);
    };
  }, []);
  return breit;
}
