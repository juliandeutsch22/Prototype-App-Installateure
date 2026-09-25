import { useEffect, useRef, type RefObject } from 'react';

/**
 * Die Fokusfalle für modale Dialoge.
 *
 * `aria-modal="true"` VERSPRICHT der Vorlesehilfe, dass es hinter dem Dialog
 * nichts zu bedienen gibt. Gehalten hat das bisher keiner der Dialoge: Tab
 * wanderte aus dem Dialog in die Seite dahinter, die man nicht sieht, und
 * das Blatt von unten holte den Fokus gar nicht erst hinein (Prüflauf
 * 25.09.2026, P4-05). Hier steht das EINMAL, statt in jedem Dialog anders.
 *
 * Was die Falle tut:
 * - Tab und Shift+Tab kreisen im Behälter: nach dem letzten Element kommt
 *   das erste, vor dem ersten das letzte.
 * - Steht der Fokus beim Tab noch draussen (oder auf dem Behälter selbst),
 *   geht er zum ersten bzw. letzten Element drinnen.
 * - Auf Wunsch holt sie den Fokus beim Öffnen hinein und gibt ihn beim
 *   Schliessen dem zurück, der ihn vorher hatte — meist dem Auslöser.
 *
 * GESTAPELT: liegt ein Dialog über einem anderen (eine Rückfrage aus einem
 * Blatt heraus), fängt nur der oberste. Sonst kämpften zwei Fallen um
 * dieselbe Taste.
 *
 * Sichtbar ändert sich nichts. Wird der Behälter selbst fokussiert, braucht
 * er `tabIndex={-1}` und `focus-visible:outline-none` — sonst zöge der
 * Tastaturfokus einen Rahmen um das ganze Blatt.
 */

interface Optionen {
  /**
   * Den Fokus beim Öffnen hineinholen: `'behaelter'` fokussiert den Behälter
   * selbst (die Vorlesehilfe nennt dann den Dialog, und der nächste Tab
   * landet auf dem ersten Element). Ohne Angabe bleibt der Fokus, wo er ist
   * — für Dialoge, die ihn schon selbst setzen (`autoFocus`).
   */
  hineinHolen?: 'behaelter';
  /** Den Fokus beim Schliessen an das Element zurückgeben, das ihn vorher hatte. */
  zurueckGeben?: boolean;
}

/** Die offenen Fallen, die zuletzt geöffnete zuoberst. */
const stapel: RefObject<HTMLElement>[] = [];

const FOKUSSIERBAR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]',
  '[contenteditable="true"]',
].join(',');

/**
 * Ist das Element zu sehen? Im Browser über `checkVisibility` (erfasst auch
 * ausgeblendete Vorfahren); wo es das nicht gibt, reicht die eigene
 * `display`-Angabe.
 */
export function sichtbar(el: HTMLElement): boolean {
  const pruefen = (el as HTMLElement & {
    checkVisibility?: (o?: Record<string, boolean>) => boolean;
  }).checkVisibility;
  if (typeof pruefen === 'function') {
    return pruefen.call(el, { checkVisibilityCSS: true, visibilityProperty: true });
  }
  return getComputedStyle(el).display !== 'none';
}

/** Was im Behälter per Tab erreichbar ist, in Dokumentreihenfolge. */
export function tabZiele(behaelter: HTMLElement): HTMLElement[] {
  return Array.from(behaelter.querySelectorAll<HTMLElement>(FOKUSSIERBAR)).filter(
    (el) => el.tabIndex >= 0 && !el.closest('[aria-hidden="true"]') && sichtbar(el),
  );
}

export function useFokusFalle(
  behaelter: RefObject<HTMLElement>,
  aktiv: boolean,
  { hineinHolen, zurueckGeben = false }: Optionen = {},
): void {
  // Die Optionen gelten, wie sie beim Öffnen standen — ein neues Objekt bei
  // jedem Zeichnen soll die Falle nicht auf- und wieder zumachen.
  const optionen = useRef({ hineinHolen, zurueckGeben });
  optionen.current = { hineinHolen, zurueckGeben };

  useEffect(() => {
    if (!aktiv) return;
    const vorher = document.activeElement as HTMLElement | null;
    stapel.push(behaelter);

    const box = behaelter.current;
    if (box && optionen.current.hineinHolen === 'behaelter' && !box.contains(document.activeElement)) {
      box.focus();
    }

    const taste = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || stapel[stapel.length - 1] !== behaelter) return;
      const b = behaelter.current;
      if (!b) return;
      const ziele = tabZiele(b);
      if (ziele.length === 0) {
        // Nichts zu bedienen: der Fokus bleibt im Dialog.
        e.preventDefault();
        b.focus();
        return;
      }
      const erstes = ziele[0];
      const letztes = ziele[ziele.length - 1];
      const jetzt = document.activeElement as HTMLElement | null;
      const drin = jetzt ? ziele.indexOf(jetzt) : -1;
      if (drin === -1) {
        e.preventDefault();
        (e.shiftKey ? letztes : erstes).focus();
      } else if (e.shiftKey && jetzt === erstes) {
        e.preventDefault();
        letztes.focus();
      } else if (!e.shiftKey && jetzt === letztes) {
        e.preventDefault();
        erstes.focus();
      }
    };
    document.addEventListener('keydown', taste);

    return () => {
      document.removeEventListener('keydown', taste);
      const i = stapel.lastIndexOf(behaelter);
      if (i !== -1) stapel.splice(i, 1);
      if (optionen.current.zurueckGeben && vorher && vorher !== document.body && vorher.isConnected) {
        vorher.focus();
      }
    };
  }, [aktiv, behaelter]);
}
