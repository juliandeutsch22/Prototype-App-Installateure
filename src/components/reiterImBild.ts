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

/*
  KEIN HALBES WORT AM RAND (D6, E86). Die Kante lief auf den letzten 12 %
  aus — „Sätz“ stand davor noch satt da, abgeschnitten mitten im Wort. Jetzt
  beginnt das Ausblenden dort, wo der erste angeschnittene Reiter beginnt:
  was satt steht, steht ganz da, und was blass wird, sagt „hier geht es
  weiter“. Links ebenso, bis zum Ende des letzten angeschnittenen.
*/
function randMerken(el: HTMLElement | null): void {
  if (!el) return;
  const rechts = el.scrollWidth - el.clientWidth - el.scrollLeft > 2;
  const links = el.scrollLeft > 2;
  if (rechts) el.setAttribute('data-mehr-rechts', '');
  else el.removeAttribute('data-mehr-rechts');
  if (links) el.setAttribute('data-mehr-links', '');
  else el.removeAttribute('data-mehr-links');
  const l = el.getBoundingClientRect();
  if (!l.width) return;
  const reiter = Array.from(el.children) as HTMLElement[];
  const angeschnittenRechts = rechts ? reiter.find((r) => r.getBoundingClientRect().right > l.right + 1) : undefined;
  const angeschnittenLinks = links ? [...reiter].reverse().find((r) => r.getBoundingClientRect().left < l.left - 1) : undefined;
  const anteil = (px: number) => `${Math.min(100, Math.max(0, Math.round((px / l.width) * 100)))}%`;
  if (angeschnittenRechts) el.style.setProperty('--mehr-ab', anteil(angeschnittenRechts.getBoundingClientRect().left - l.left));
  else el.style.removeProperty('--mehr-ab');
  if (angeschnittenLinks) el.style.setProperty('--mehr-bis', anteil(angeschnittenLinks.getBoundingClientRect().right - l.left));
  else el.style.removeProperty('--mehr-bis');
}
