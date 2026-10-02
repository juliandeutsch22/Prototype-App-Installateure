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
    randMerken(leiste.current);
  }, [gewaehlt]);

  /*
    UND DIE LEISTE SAGT, DASS SIE WEITERGEHT (Nachtest 01.10.2026, U16): am
    Telefon war „Sätze und Kosten“ am rechten Rand abgeschnitten, ohne
    Hinweis, dass man wischen kann. Steht rechts (oder links) noch etwas,
    trägt die Leiste `data-mehr-rechts` (bzw. `-links`), und die Kante läuft
    dort weich aus (index.css).
  */
  useEffect(() => {
    const el = leiste.current;
    if (!el) return;
    const merken = () => randMerken(el);
    merken();
    el.addEventListener('scroll', merken, { passive: true });
    window.addEventListener('resize', merken);
    return () => {
      el.removeEventListener('scroll', merken);
      window.removeEventListener('resize', merken);
    };
  }, []);
  return leiste;
}

function randMerken(el: HTMLElement | null): void {
  if (!el) return;
  const rechts = el.scrollWidth - el.clientWidth - el.scrollLeft > 2;
  const links = el.scrollLeft > 2;
  if (rechts) el.setAttribute('data-mehr-rechts', '');
  else el.removeAttribute('data-mehr-rechts');
  if (links) el.setAttribute('data-mehr-links', '');
  else el.removeAttribute('data-mehr-links');
}
