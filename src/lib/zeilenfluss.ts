import { DAUER, EASE, kannBewegen, lagen, nachfolger, nachruecken } from './bewegung';

/**
 * ZEILEN GEHEN UND KOMMEN SICHTBAR (Plan 15.11.2026, B2 und B3).
 *
 * Eine gelöschte, erledigte oder ausgeblendete Zeile war im nächsten Bild
 * weg, die Nachbarn standen schon an ihrer Stelle — welche Zeile ging, sah
 * man nicht. Jetzt klappt sie zusammen, und die Nachbarn rücken nach.
 *
 * FÜR ALLE LISTEN AN EINER STELLE. Gebaut ist es nicht in jeder Seite,
 * sondern als Beobachter über der ganzen App (`Layout`): wo React eine
 * Zeile aus einer Liste nimmt, spielt er die Bewegung. Keine Seite muss
 * dafür einen Zustand „verschwindet gerade“ führen, und keine Seite kann
 * es vergessen.
 *
 * WIE, OHNE LAYOUT ZU BEWEGEN (`bewegung.ts`, Regel 1). Das Layout steht
 * sofort am Ziel — der Taktgeber misst EINMAL. Gezeigt wird der Weg so:
 *   - ein Abbild der gegangenen Zeile (stumm, nicht bedienbar, ohne
 *     Kennungen) liegt für die Dauer der Bewegung herausgenommen an ihrem
 *     alten Platz und klappt nach oben zusammen (`scaleY` und Deckkraft);
 *   - die Zeilen darunter starten optisch an ihrer alten Stelle und gleiten
 *     in derselben Zeit hinauf (`translateY`, FLIP). Gleiche Dauer und Kurve:
 *     die Unterkante des Abbilds und die Oberkante des Nachrückenden laufen
 *     gemeinsam, nichts überdeckt sich.
 * Die Alternative — die Zeile über `grid-template-rows` in der Höhe
 * zusammenschieben — änderte die Höhe des Blatts in jedem Bild; der
 * Taktgeber rechnete jedes Bild neu, und die Unterkante des Blatts sprang
 * Zelle um Zelle mit (gemessen in der Vorschau). Dazu bräuchte jede Seite
 * den Zwischenzustand.
 *
 * NUR WO ES ETWAS ERKLÄRT: höchstens drei Zeilen auf einmal (ein Filter,
 * der zwanzig Zeilen tauscht, ist kein „diese Zeile ging“), nicht in der
 * ersten Zeit nach einem Seitenwechsel und nie bei „Bewegung reduzieren“.
 *
 * DER FOKUS GEHT NICHT VERLOREN. Stand er in der gegangenen Zeile (der
 * Knopf „Löschen“), landete er bisher auf der Seite selbst; Tab begann von
 * vorn. Jetzt geht er auf die nächste Zeile (oder die vorige) — auch ohne
 * Bewegung.
 */

/** Was eine Zeile ist: die Arbeitszeilen der Listen und die Beiträge eines Gesprächs. `data-zeile` für Sonderfälle. */
export const ZEILE_SELEKTOR = 'li.zeile, li.nachricht, .arbeitszeile, [data-zeile]';

/** Höchstens so viele Zeilen je Liste und Bild — mehr ist ein Austausch, keine einzelne Änderung. */
const HOECHSTENS = 3;

/** Wo der Fokus hingeht: der erste bedienbare Halt einer Zeile. */
const HALT = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function istZeile(n: Node): n is HTMLElement {
  return n instanceof HTMLElement && n.matches(ZEILE_SELEKTOR) && !n.hasAttribute('data-geist');
}

/** Wo eine Bewegung endet: das Blatt, das Fenster — sonst die Inhaltsspalte. */
function grenzeVon(el: Element): Element | null {
  return el.closest('.karte, [role="dialog"], .blatt-inhalt, .fenster-inhalt, .inhalt');
}

let ruheBis = 0;
/** Nach einem Seitenwechsel eine Weile nichts bewegen: dort baut sich die ganze Seite auf. */
export function zeilenflussRuhe(ms = 600): void {
  ruheBis = performance.now() + ms;
}

/** Das Abbild einer gegangenen Zeile: stumm, nicht bedienbar, ohne Kennungen (keine doppelten `id`). */
function abbild(zeile: HTMLElement): HTMLElement {
  const g = zeile.cloneNode(true) as HTMLElement;
  g.setAttribute('data-geist', '');
  g.setAttribute('aria-hidden', 'true');
  g.setAttribute('inert', '');
  g.removeAttribute('id');
  for (const el of g.querySelectorAll('[id]')) el.removeAttribute('id');
  g.style.pointerEvents = 'none';
  return g;
}

/** B2: die gegangene Zeile klappt an ihrem alten Platz zusammen, die Nachbarn rücken nach. */
function zusammenklappen(liste: HTMLElement, zeile: HTMLElement, danach: Node | null): void {
  const geist = abbild(zeile);
  liste.insertBefore(geist, danach && danach.parentNode === liste ? danach : null);
  const mit = nachfolger(geist, grenzeVon(liste));
  const vorher = lagen(mit);
  const oben = geist.offsetTop;
  const links = geist.offsetLeft;
  const breite = geist.offsetWidth;
  Object.assign(geist.style, {
    position: 'absolute', top: `${oben}px`, left: `${links}px`, width: `${breite}px`, margin: '0', zIndex: '0',
  });
  geist.style.transformOrigin = 'top';
  nachruecken(vorher, DAUER.zustand);
  const a = geist.animate(
    [{ transform: 'scaleY(1)', opacity: 1 }, { transform: 'scaleY(0)', opacity: 0 }],
    { duration: DAUER.zustand, easing: EASE, fill: 'forwards' },
  );
  const weg = () => geist.remove();
  a.onfinish = weg;
  a.oncancel = weg;
}

/** Den Fokus aus einer gegangenen Zeile auf die nächste (oder vorige) setzen. */
function fokusRetten(zeile: HTMLElement, liste: HTMLElement, danach: Node | null, davor: Node | null, zuletzt: Element | null): void {
  if (!zuletzt || !zeile.contains(zuletzt)) return;
  const aktiv = document.activeElement;
  if (aktiv && aktiv !== document.body && aktiv.isConnected) return;
  const kandidaten = [danach, davor].filter((n): n is HTMLElement => istZeile(n as Node) && (n as Node).parentNode === liste);
  for (const k of kandidaten) {
    const halt = k.matches(HALT) ? k : k.querySelector<HTMLElement>(HALT);
    if (halt) {
      halt.focus({ preventScroll: true });
      return;
    }
  }
}

/**
 * Den Fluss über `wurzel` halten, bis die Rückgabe aufgerufen wird.
 * Ohne `MutationObserver` (sehr alte Browser) tut er nichts.
 */
export function zeilenflussHalten(wurzel: HTMLElement): () => void {
  if (typeof MutationObserver === 'undefined') return () => undefined;
  let zuletzt: Element | null = null;
  const fokus = (e: FocusEvent) => { zuletzt = e.target instanceof Element ? e.target : null; };
  wurzel.addEventListener('focusin', fokus);
  zeilenflussRuhe();

  const beobachter = new MutationObserver((eintraege) => {
    // Je Liste sammeln: was ging, und wo es stand.
    const je = new Map<HTMLElement, Array<{ zeile: HTMLElement; danach: Node | null; davor: Node | null }>>();
    for (const e of eintraege) {
      if (e.type !== 'childList' || !(e.target instanceof HTMLElement) || !e.target.isConnected) continue;
      for (const n of e.removedNodes) {
        // Noch (oder wieder) eingehängt: React hat die Zeile nur umgestellt.
        if (!istZeile(n) || n.isConnected) continue;
        const liste = e.target;
        if (!je.has(liste)) je.set(liste, []);
        je.get(liste)!.push({ zeile: n, danach: e.nextSibling, davor: e.previousSibling });
      }
    }
    if (!je.size) return;
    const bewegen = performance.now() >= ruheBis && !document.hidden;
    for (const [liste, gegangen] of je) {
      for (const g of gegangen) fokusRetten(g.zeile, liste, g.danach, g.davor, zuletzt);
      if (!bewegen || gegangen.length > HOECHSTENS || !kannBewegen(liste)) continue;
      for (const g of gegangen) zusammenklappen(liste, g.zeile, g.danach);
    }
  });
  beobachter.observe(wurzel, { childList: true, subtree: true });
  return () => {
    beobachter.disconnect();
    wurzel.removeEventListener('focusin', fokus);
  };
}
