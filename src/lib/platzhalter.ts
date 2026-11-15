import { DAUER, EASE, kannBewegen, lagen, nachfolger, nachruecken } from './bewegung';

/**
 * PLATZHALTER GEHEN IN INHALT ÜBER (Plan 15.11.2026, B8).
 *
 * Solange eine Liste lädt, stehen graue Balken (`SkeletonList`, `.lade-liste`).
 * Kamen die Daten, waren die Balken im nächsten Bild weg und der Inhalt stand
 * schlagartig da — mit anderer Höhe, und alles darunter sprang. Jetzt blendet
 * der Platzhalter aus, während der Inhalt einblendet, und was darunter im
 * selben Blatt steht, gleitet von seiner alten Stelle an die neue.
 *
 * Wie bei den Zeilen (B2) für alle Listen an einer Stelle: ein Beobachter
 * über der App, keine Seite muss etwas tun. Das Layout steht sofort am Ziel
 * (der Taktgeber misst einmal), gezeigt wird der Weg mit Deckkraft und
 * `transform`.
 *
 * NUR, WO MAN DEN PLATZHALTER GESEHEN HAT. Er erscheint erst nach 200 ms
 * (`index.css`, `.skeleton`) — ein schnelles Laden zeigt ihn nie, und dann
 * gibt es auch nichts überzublenden: der Inhalt steht einfach da. Bei
 * „Bewegung reduzieren“ ebenso.
 */

const PLATZHALTER = '.lade-liste';
/** So lange wartet ein Platzhalter, bevor er sichtbar wird (`.skeleton`, 200 ms Verzögerung). */
const UNSICHTBAR_MS = 200;

function grenzeVon(el: Element): Element | null {
  return el.closest('.karte, [role="dialog"], .blatt-inhalt, .fenster-inhalt, .inhalt');
}

/** Den Platzhalter einen Augenblick als stummes Bild an seinem alten Platz halten und ausblenden. */
function ausblenden(eltern: HTMLElement, platzhalter: HTMLElement, danach: Node | null, neu: HTMLElement[]): void {
  const geist = platzhalter.cloneNode(true) as HTMLElement;
  geist.classList.add('platzhalter-geist');
  geist.setAttribute('aria-hidden', 'true');
  geist.removeAttribute('role');
  geist.setAttribute('inert', '');
  for (const el of geist.querySelectorAll('[role]')) el.removeAttribute('role');
  geist.style.pointerEvents = 'none';
  // Zum Messen kurz an der alten Stelle im Fluss — vor dem Zeichnen, unsichtbar für den Nutzer.
  const anker = danach && danach.parentNode === eltern ? danach : neu[0] ?? null;
  const verborgen = neu.map((n) => [n, n.style.getPropertyValue('display'), n.style.getPropertyPriority('display')] as const);
  for (const n of neu) n.style.setProperty('display', 'none', 'important');
  eltern.insertBefore(geist, anker && anker.parentNode === eltern ? anker : null);
  const mit = nachfolger(geist, grenzeVon(eltern)).filter((el) => !neu.includes(el));
  const vorher = lagen(mit);
  const oben = geist.offsetTop;
  const links = geist.offsetLeft;
  const breite = geist.offsetWidth;
  for (const [n, wert, vorrang] of verborgen) {
    if (wert) n.style.setProperty('display', wert, vorrang);
    else n.style.removeProperty('display');
  }
  Object.assign(geist.style, { position: 'absolute', top: `${oben}px`, left: `${links}px`, width: `${breite}px`, margin: '0' });
  nachruecken(vorher, DAUER.zustand);
  const weg = geist.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DAUER.zustand, easing: EASE, fill: 'forwards' });
  weg.onfinish = () => geist.remove();
  weg.oncancel = () => geist.remove();
  for (const n of neu) n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DAUER.zustand, easing: EASE });
}

/** Den Übergang über `wurzel` halten, bis die Rückgabe aufgerufen wird. */
export function platzhalterHalten(wurzel: HTMLElement): () => void {
  if (typeof MutationObserver === 'undefined') return () => undefined;
  const seit = new WeakMap<Element, number>();
  const merken = (n: Node) => {
    if (!(n instanceof Element)) return;
    const jetzt = performance.now();
    if (n.matches(PLATZHALTER)) seit.set(n, jetzt);
    for (const p of n.querySelectorAll(PLATZHALTER)) seit.set(p, jetzt);
  };
  // Was schon steht, gilt als eben erschienen: so wird höchstens zu wenig übergeblendet, nie zu viel.
  merken(wurzel);
  const gesehen = (n: Element): boolean => {
    const p = n.matches(PLATZHALTER) ? n : n.querySelector(PLATZHALTER);
    const t = p ? seit.get(p) : undefined;
    return t !== undefined && performance.now() - t >= UNSICHTBAR_MS;
  };

  const beobachter = new MutationObserver((eintraege) => {
    // Je Elternteil sammeln: React nimmt den Platzhalter und setzt den Inhalt in zwei Einträgen.
    const je = new Map<HTMLElement, { weg: Array<{ n: HTMLElement; danach: Node | null }>; neu: HTMLElement[] }>();
    for (const e of eintraege) {
      if (e.type !== 'childList' || !(e.target instanceof HTMLElement) || !e.target.isConnected) continue;
      const eintrag = je.get(e.target) ?? { weg: [], neu: [] };
      for (const n of e.addedNodes) {
        if (!(n instanceof HTMLElement) || !n.isConnected || n.parentNode !== e.target) continue;
        merken(n);
        eintrag.neu.push(n);
      }
      for (const n of e.removedNodes) {
        if (n instanceof HTMLElement && !n.isConnected) eintrag.weg.push({ n, danach: e.nextSibling });
      }
      je.set(e.target, eintrag);
    }
    for (const [eltern, { weg, neu }] of je) {
      if (!neu.length || !weg.length || !kannBewegen(eltern)) continue;
      // Ein neuer Platzhalter für den alten ist kein Inhalt.
      if (neu.some((x) => x.matches(PLATZHALTER) || !!x.querySelector(PLATZHALTER))) continue;
      const alt = weg.find(({ n }) => (n.matches(PLATZHALTER) || !!n.querySelector(PLATZHALTER)) && gesehen(n));
      if (alt) ausblenden(eltern, alt.n, alt.danach, neu);
    }
  });
  beobachter.observe(wurzel, { childList: true, subtree: true });
  return () => beobachter.disconnect();
}
