import { useEffect, useRef } from 'react';

/**
 * DER GEWÄHLTE REITER BLEIBT IM BILD — für jede Reiterleiste der App.
 *
 * Am Telefon laufen Reiterleisten seitlich und zeigen keine Scrollleiste
 * (index.css, `.reiterleiste`). Steht der gewählte Reiter außerhalb, sieht
 * niemand, wo er gerade ist. Deshalb wird er beim Öffnen und bei jedem
 * Wechsel ganz ins Bild geholt.
 *
 * `inline: 'nearest'` rollt nur so weit wie nötig, `block: 'nearest'` lässt
 * die Seite senkrecht stehen, `behavior: 'auto'` springt ohne Gleiten. Das
 * `?.` vor dem Aufruf, weil jsdom `scrollIntoView` nicht kennt.
 *
 * Gesucht wird der Reiter mit `aria-selected="true"` (Reiter als Knöpfe)
 * oder `aria-current="page"` (Reiter als Links, siehe Unterreiter).
 */
export function useReiterImBild<T extends HTMLElement>(gewaehlt: unknown) {
  const leiste = useRef<T>(null);
  useEffect(() => {
    leiste.current
      ?.querySelector('[aria-selected="true"], [aria-current="page"]')
      ?.scrollIntoView?.({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
  }, [gewaehlt]);
  return leiste;
}
