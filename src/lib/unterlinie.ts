import { DAUER, EASE, kannBewegen } from './bewegung';

/**
 * DIE UNTERLINIE GLEITET ZUM GEWÄHLTEN REITER (Plan 15.11.2026, B5).
 *
 * Reiter, Ansichten und Filter tragen ihre Markierung als Kante unten. Beim
 * Wechsel sprang sie: links aus, rechts an — dass beide Ansichten
 * zusammengehören, sagte nichts. Jetzt fährt ein Strich von der alten zur
 * neuen Stelle, und erst dort übernimmt die Kante des Reiters wieder.
 *
 * FÜR ALLE LEISTEN AN EINER STELLE: ein Beobachter über der App (`Layout`)
 * merkt, wenn in einer Leiste die Markierung wandert — `aria-current`
 * (Unterreiter), `aria-selected` (Reiter der Akten, `role="tab"`) oder die
 * Klasse `segment-an` (Ansichten und Filter). Keine Leiste muss dafür
 * etwas wissen.
 *
 * DER ENDZUSTAND BLEIBT DER ALTE. Die Kante gehört weiter dem Reiter; der
 * Strich liegt nur für die Dauer der Bewegung darüber (stumm, ohne
 * Klickfläche) und wird danach entfernt. Bei „Bewegung reduzieren“ entsteht
 * er gar nicht: die Kante wechselt sofort, wie bisher. Bewegt wird nur mit
 * `transform`.
 */

export const LEISTE_SELEKTOR = '.reiterleiste, .segment, .akten-bereiche, [role="tablist"]';
const AKTIV = '[aria-current="page"], [aria-selected="true"], .segment-an';

function leisteVon(el: Element): HTMLElement | null {
  return el.parentElement?.closest<HTMLElement>(LEISTE_SELEKTOR) ?? null;
}

/** War das Element vor der Änderung markiert? Aus dem alten Wert des geänderten Attributs. */
function warAktiv(e: MutationRecord): boolean {
  const alt = e.oldValue ?? '';
  if (e.attributeName === 'class') return /(^|\s)segment-an(\s|$)/.test(alt);
  if (e.attributeName === 'aria-current') return alt === 'page';
  return alt === 'true';
}

type Lage = { links: number; breite: number; unten: number };

/** Lage eines Rechtecks in der Leiste (die Leiste ist Bezugsrahmen, `lot-bewegung.css`). */
function lageIn(r: { left: number; width: number; bottom: number }, leiste: HTMLElement): Lage {
  const l = leiste.getBoundingClientRect();
  return { links: r.left - l.left + leiste.scrollLeft - leiste.clientLeft, breite: r.width, unten: r.bottom - l.top + leiste.scrollTop - leiste.clientTop };
}

/** Woran man dieselbe Leiste auf der nächsten Seite erkennt: ihre Reiter, in Reihenfolge. */
function kennung(leiste: HTMLElement): string {
  return [...leiste.children].filter((k) => !k.hasAttribute('data-unterlinie')).map((k) => k.textContent?.trim() ?? '').join('|');
}

function gleiten(leiste: HTMLElement, von: HTMLElement | DOMRect, zu: HTMLElement): void {
  const s = getComputedStyle(zu);
  const dicke = parseFloat(s.borderBottomWidth) || 0;
  if (!dicke) return;
  const a = lageIn(von instanceof HTMLElement ? von.getBoundingClientRect() : von, leiste);
  const b = lageIn(zu.getBoundingClientRect(), leiste);
  if (!b.breite || !a.breite) return;
  const strich = document.createElement('span');
  strich.setAttribute('data-unterlinie', '');
  strich.setAttribute('aria-hidden', 'true');
  Object.assign(strich.style, {
    position: 'absolute', left: `${b.links}px`, top: `${b.unten - dicke}px`, width: `${b.breite}px`, height: `${dicke}px`,
    background: s.borderBottomColor, pointerEvents: 'none', transformOrigin: 'left', zIndex: '1',
  });
  leiste.append(strich);
  // Der alte Reiter zeigt seine Kante nicht mehr, der neue noch nicht: es gibt genau einen Strich.
  const alt = von instanceof HTMLElement ? von : null;
  alt?.setAttribute('data-unterlinie-weg', '');
  zu.setAttribute('data-unterlinie-weg', '');
  const fahrt = strich.animate(
    [{ transform: `translateX(${a.links - b.links}px) scaleX(${a.breite / b.breite})` }, { transform: 'none' }],
    { duration: DAUER.zustand, easing: EASE, fill: 'forwards' },
  );
  const fertig = () => {
    alt?.removeAttribute('data-unterlinie-weg');
    zu.removeAttribute('data-unterlinie-weg');
    // Die Kante des Reiters blendet mit ihrem eigenen Übergang ein; solange deckt der Strich sie genau.
    setTimeout(() => strich.remove(), DAUER.zustand + 40);
  };
  fahrt.onfinish = fertig;
  fahrt.oncancel = fertig;
}

/**
 * Den Beobachter über `wurzel` halten, bis die Rückgabe aufgerufen wird.
 *
 * ZWEI FÄLLE. Meist bleibt die Leiste stehen und nur die Markierung wandert
 * (Attribute). Die Unterreiter dagegen zeichnet der Seitenkopf der jeweiligen
 * Unterseite (`UnterreiterLeiste`): beim Wechsel kommt eine neue Leiste mit
 * denselben Reitern. Dafür merkt sich ein Tipp auf einen Reiter, wo die
 * Markierung gerade stand; erscheint gleich darauf dieselbe Leiste neu, fährt
 * der Strich von dort.
 */
export function unterlinieHalten(wurzel: HTMLElement): () => void {
  if (typeof MutationObserver === 'undefined') return () => undefined;
  let gemerkt: { kennung: string; lage: DOMRect; bis: number } | null = null;
  const tipp = (e: Event) => {
    const reiter = e.target instanceof Element ? e.target.closest('a, button, [role="tab"]') : null;
    const leiste = reiter ? leisteVon(reiter) : null;
    const aktiv = leiste?.querySelector<HTMLElement>(AKTIV);
    gemerkt = leiste && aktiv && leisteVon(aktiv) === leiste
      ? { kennung: kennung(leiste), lage: aktiv.getBoundingClientRect(), bis: performance.now() + 1500 }
      : null;
  };
  wurzel.addEventListener('click', tipp, true);
  const beobachter = new MutationObserver((eintraege) => {
    const je = new Map<HTMLElement, { von: HTMLElement | null; zu: HTMLElement | null }>();
    for (const e of eintraege) {
      if (e.type === 'childList') {
        if (!gemerkt || performance.now() > gemerkt.bis) continue;
        for (const n of e.addedNodes) {
          if (!(n instanceof HTMLElement)) continue;
          const leiste = n.matches(LEISTE_SELEKTOR) ? n : n.querySelector<HTMLElement>(LEISTE_SELEKTOR);
          if (!leiste?.isConnected || kennung(leiste) !== gemerkt.kennung) continue;
          const zu = leiste.querySelector<HTMLElement>(AKTIV);
          const lage = gemerkt.lage;
          gemerkt = null;
          if (zu && kannBewegen(leiste)) gleiten(leiste, lage, zu);
          break;
        }
        continue;
      }
      const el = e.target;
      if (!(el instanceof HTMLElement) || !el.isConnected) continue;
      const leiste = leisteVon(el);
      if (!leiste) continue;
      const jetzt = el.matches(AKTIV);
      const vorher = warAktiv(e);
      if (jetzt === vorher) continue;
      const eintrag = je.get(leiste) ?? { von: null, zu: null };
      if (vorher && !jetzt) eintrag.von = el;
      if (jetzt && !vorher) eintrag.zu = el;
      je.set(leiste, eintrag);
    }
    for (const [leiste, { von, zu }] of je) {
      if (von && zu && von !== zu && kannBewegen(leiste)) {
        gemerkt = null;
        gleiten(leiste, von, zu);
      }
    }
  });
  beobachter.observe(wurzel, {
    subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'aria-current', 'aria-selected'],
  });
  return () => {
    beobachter.disconnect();
    wurzel.removeEventListener('click', tipp, true);
  };
}
