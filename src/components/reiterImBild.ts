import { useEffect, useRef } from 'react';

/**
 * DER GEWÄHLTE REITER BLEIBT IM BILD — für jede Reiterleiste der App.
 *
 * Am Telefon laufen Reiterleisten seitlich und zeigen keine Scrollleiste
 * (index.css, `.reiterleiste`). Steht der gewählte Reiter außerhalb, sieht
 * niemand, wo er gerade ist. Deshalb wird er beim Öffnen und bei jedem
 * Wechsel ganz ins Bild geholt.
 *
 * NUR DIE LEISTE ROLLT, NIE DIE SEITE. Bis 03.10.2026 stand hier
 * `scrollIntoView({ inline: 'nearest', block: 'nearest' })`. Das rollt jeden
 * rollbaren Vorfahren mit — auch das Dokument. Gemeldet am 03.10.2026 aus
 * der Startbildschirm-App am iPhone: nach „Planung“ standen an der Kopfleiste
 * links und rechts dunkle Ecken, bis ein Reiter der unteren Leiste die Seite
 * wieder nach oben setzte. „Planung“ ist der einzige Reiter dieser Leiste mit
 * Unterreitern, und dieser Aufruf war das Einzige, das nur dort lief. Jetzt
 * wird nur `scrollLeft` der Leiste gesetzt, so weit wie nötig — dasselbe, was
 * `inline: 'nearest'` wollte, ohne die Seite anzufassen.
 *
 * Gesucht wird der Reiter mit `aria-selected="true"` (Reiter als Knöpfe)
 * oder `aria-current="page"` (Reiter als Links, siehe Unterreiter).
 */
export function useReiterImBild<T extends HTMLElement>(gewaehlt: unknown) {
  const leiste = useRef<T>(null);
  useEffect(() => {
    const el = leiste.current;
    const reiter = el?.querySelector<HTMLElement>('[aria-selected="true"], [aria-current="page"]');
    if (el && reiter) insBild(el, reiter);
    randMerken(el);
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

/** Den Reiter in der Leiste sichtbar machen — nur die Leiste rollt. */
export function insBild(leiste: HTMLElement, reiter: HTMLElement): void {
  const l = leiste.getBoundingClientRect();
  const r = reiter.getBoundingClientRect();
  if (r.left < l.left) leiste.scrollLeft -= l.left - r.left;
  else if (r.right > l.right) leiste.scrollLeft += r.right - l.right;
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
