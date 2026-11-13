import { useEffect, useState } from 'react';

/**
 * Die drei Breiten der Linie „Lot“ — dieselben Grenzen wie in
 * `tailwind.config.js` (`md`, `lg`) und `src/styles/lot.css`. Wo der Code
 * selbst nach der Breite fragt, fragt er hier, damit Stil und Verhalten nicht
 * an verschiedenen Stellen umschalten.
 *
 *   Handy         bis 759 px
 *   Tablet        760 bis 1.199 px
 *   Schreibtisch  ab 1.200 px
 */
export const AB_TABLET = '(min-width: 760px)';
export const AB_SCHREIBTISCH = '(min-width: 1200px)';

/**
 * Steht die Seite in Handy-Breite (bis 759 px)? Für Verhalten, das sich nicht
 * mit Stil allein umschalten lässt — etwa ein Formular, das am Handy als
 * Blatt von unten kommt und ab dem Tablet auf der Seite steht (C6, E90):
 * zweimal dasselbe Formular im DOM hätte zwei Stände.
 *
 * Ohne Medienabfrage (jsdom, sehr alte Browser): nein — dann steht alles so
 * da, wie es immer dastand. Gelesen beim ersten Zeichnen, damit nichts
 * umspringt.
 */
export function useAmHandy(): boolean {
  const frage = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !window.matchMedia(AB_TABLET).matches;
  const [handy, setHandy] = useState(frage);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const abfrage = window.matchMedia(AB_TABLET);
    const neu = () => setHandy(!abfrage.matches);
    neu();
    // Ältere Safari kennen nur addListener.
    if (abfrage.addEventListener) abfrage.addEventListener('change', neu);
    else abfrage.addListener?.(neu);
    return () => {
      if (abfrage.removeEventListener) abfrage.removeEventListener('change', neu);
      else abfrage.removeListener?.(neu);
    };
  }, []);
  return handy;
}
