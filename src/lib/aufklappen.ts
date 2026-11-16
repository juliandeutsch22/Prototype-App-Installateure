import { DAUER, EASE, kannBewegen, lagen, nachfolger, nachruecken } from './bewegung';

/**
 * AUFKLAPPEN: DIE HÖHE GLEITET (Plan 15.11.2026, B10).
 *
 * „Weitere Angaben“ (`<details>`), die Wochen der Zeiterfassung (`Abschnitt`)
 * und die Erklärungen im Fluss (`InfoHint`) klappten in einem Bild auf und
 * zu: der Inhalt stand da (oder war weg), alles darunter sprang. Der Pfeil
 * drehte schon. Jetzt gleitet, was darunter steht, von seiner alten an die
 * neue Stelle; der Inhalt blendet von oben ein, beim Zuklappen klappt ein
 * stummes Abbild nach oben zusammen.
 *
 * Wie bei den Zeilen (B2): das Layout steht in einem Schritt am Ziel, der
 * Weg ist nur `transform` und Deckkraft — der Taktgeber misst einmal, und
 * kein Blatt wird verschoben (`bewegung.ts`). Ein Beobachter über der App
 * (`Layout`); keine Seite muss etwas tun.
 *
 * WAS ZÄHLT: `<details>` (am `summary`) und Knöpfe, die mit `aria-expanded`
 * und `aria-controls` einen Inhalt im Fluss steuern. Menüs (`aria-haspopup`)
 * nicht — die schweben über der Seite und blenden selbst ein.
 */

const AUSLOESER = 'details > summary, button[aria-expanded][aria-controls]:not([aria-haspopup])';

function grenzeVon(el: Element): Element | null {
  return el.closest('.karte, [role="dialog"], .blatt-inhalt, .fenster-inhalt, .inhalt');
}

/** Der Block, unter dem der Inhalt erscheint: das `<details>`, die Abschnittszeile, sonst der Knopf. */
function ankerVon(ausloeser: Element): HTMLElement {
  if (ausloeser.matches('summary')) return ausloeser.parentElement as HTMLElement;
  return (ausloeser.closest('.abschnitt') ?? ausloeser) as HTMLElement;
}

function inhaltVon(ausloeser: Element): HTMLElement | null {
  if (ausloeser.matches('summary')) {
    const d = ausloeser.parentElement as HTMLDetailsElement;
    return d.open ? ([...d.children].find((k) => k !== ausloeser) as HTMLElement | undefined) ?? null : null;
  }
  const id = ausloeser.getAttribute('aria-controls');
  const el = id ? document.getElementById(id) : null;
  return el && el.getClientRects().length ? el : null;
}

/** Ein stummes Abbild des zugeklappten Inhalts an seinem alten Platz, das nach oben zusammenklappt. */
function abbildZuklappen(inhalt: HTMLElement, oben: number, links: number, breite: number, eltern: HTMLElement, danach: Node | null): void {
  const geist = inhalt.cloneNode(true) as HTMLElement;
  geist.removeAttribute('id');
  for (const el of geist.querySelectorAll('[id]')) el.removeAttribute('id');
  geist.setAttribute('aria-hidden', 'true');
  geist.setAttribute('inert', '');
  geist.setAttribute('data-geist', '');
  Object.assign(geist.style, {
    position: 'absolute', top: `${oben}px`, left: `${links}px`, width: `${breite}px`, margin: '0', pointerEvents: 'none', transformOrigin: 'top',
    display: 'block',
  });
  eltern.insertBefore(geist, danach && danach.parentNode === eltern ? danach : null);
  const a = geist.animate(
    [{ transform: 'scaleY(1)', opacity: 1 }, { transform: 'scaleY(0)', opacity: 0 }],
    { duration: DAUER.zustand, easing: EASE, fill: 'forwards' },
  );
  a.onfinish = () => geist.remove();
  a.oncancel = () => geist.remove();
}

/** Den Beobachter über `wurzel` halten, bis die Rückgabe aufgerufen wird. */
export function aufklappenHalten(wurzel: HTMLElement): () => void {
  const tipp = (e: Event) => {
    const ausloeser = e.target instanceof Element ? e.target.closest(AUSLOESER) : null;
    if (!ausloeser || !wurzel.contains(ausloeser) || !kannBewegen(ausloeser)) return;
    const anker = ankerVon(ausloeser);
    const grenze = grenzeVon(anker);
    const offen = inhaltVon(ausloeser);
    const mit = nachfolger(anker, grenze).filter((el) => el !== offen);
    const vorher = lagen(mit);
    // Zuklappen: Lage und Bild des Inhalts jetzt festhalten — gleich ist er weg.
    const alt = offen
      ? { el: offen, oben: offen.offsetTop, links: offen.offsetLeft, breite: offen.offsetWidth, eltern: offen.parentElement, danach: offen.nextSibling }
      : null;
    const abbild = alt ? (alt.el.cloneNode(true) as HTMLElement) : null;
    requestAnimationFrame(() => {
      const jetzt = inhaltVon(ausloeser);
      if (alt && abbild && !jetzt && alt.eltern?.isConnected) {
        abbildZuklappen(abbild, alt.oben, alt.links, alt.breite, alt.eltern, alt.danach?.isConnected ? alt.danach : null);
      }
      if (!alt && jetzt) {
        jetzt.animate(
          [{ opacity: 0, transform: 'translateY(-0.5rem)' }, { opacity: 1, transform: 'none' }],
          { duration: DAUER.zustand, easing: EASE },
        );
      }
      nachruecken(vorher, DAUER.zustand);
    });
  };
  wurzel.addEventListener('click', tipp, true);
  return () => wurzel.removeEventListener('click', tipp, true);
}
