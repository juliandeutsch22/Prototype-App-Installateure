import { useCallback, useEffect, useRef } from 'react';
import type { MouseEvent, PointerEvent } from 'react';

/** So lange liegt der Finger, bis „lange gedrückt“ gilt — wie bei Apple und Android. */
export const LANG_MS = 500;
/** Wer den Finger weiter bewegt, blättert und drückt nicht. */
const WACKELN_PX = 8;

/**
 * Der Tipp, mit dem das lange Drücken endet, löst nichts mehr aus — auch
 * nicht dort, wo inzwischen das Fenster liegt: sonst schlösse der Schleier
 * es im selben Moment wieder (im Browser gemessen, 11.11.2026). Geschluckt
 * wird genau ein Klick, bis kurz nach dem Loslassen.
 */
function klickSchlucken() {
  let frist: number | null = null;
  const ende = () => {
    window.removeEventListener('click', weg, true);
    window.removeEventListener('pointerup', los, true);
    if (frist !== null) window.clearTimeout(frist);
  };
  const weg = (e: Event) => { e.preventDefault(); e.stopPropagation(); ende(); };
  const los = () => { if (frist === null) frist = window.setTimeout(ende, 400); };
  window.addEventListener('click', weg, true);
  window.addEventListener('pointerup', los, true);
}

/**
 * LANGES DRÜCKEN MIT DEM FINGER (E77, 11.11.2026). Am Handy und Tablet gibt
 * es kein Darüberfahren; die Möglichkeiten einer Nachricht kommen mit
 * langem Drücken. Ein kurzer Tipp tut nichts — so öffnet sich beim Blättern
 * nicht aus Versehen ein Fenster. Maus und Stift sind ausgenommen: sie haben
 * die Leiste beim Darüberfahren.
 *
 * Ein Zeitgeber für das ganze Gespräch (es drückt immer nur ein Finger);
 * `fuer` gibt die Griffe für eine Stelle.
 */
export function useLangDruck() {
  const zeit = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const ausgeloest = useRef(false);

  const stopp = useCallback(() => {
    if (zeit.current !== null) window.clearTimeout(zeit.current);
    zeit.current = null;
    start.current = null;
  }, []);
  useEffect(() => stopp, [stopp]);

  return useCallback((lang: () => void) => ({
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      stopp();
      ausgeloest.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      zeit.current = window.setTimeout(() => {
        zeit.current = null;
        ausgeloest.current = true;
        klickSchlucken();
        lang();
      }, LANG_MS);
    },
    onPointerMove: (e: PointerEvent) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > WACKELN_PX) stopp();
    },
    onPointerUp: stopp,
    onPointerCancel: stopp,
    // Android öffnet beim langen Drücken sein eigenes Menü (Text markieren) — das hier ersetzt es.
    onContextMenu: (e: MouseEvent) => {
      if (ausgeloest.current || zeit.current !== null) e.preventDefault();
    },
  }), [stopp]);
}
