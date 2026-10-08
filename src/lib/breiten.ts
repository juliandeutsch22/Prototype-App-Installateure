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
