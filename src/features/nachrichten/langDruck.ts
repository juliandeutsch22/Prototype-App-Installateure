import { useCallback, useEffect, useRef } from 'react';
import type { MouseEvent, PointerEvent } from 'react';

/** So lange liegt der Finger, bis „lange gedrückt“ gilt — wie bei Apple und Android. */
export const LANG_MS = 500;
/** Wer den Finger weiter bewegt, blättert und drückt nicht — 10 px wie bei Apple (`allowableMovement`). */
const WACKELN_PX = 10;

/**
 * Der Tipp, mit dem das lange Drücken endet, löst nichts mehr aus — auch
 * nicht dort, wo inzwischen das Fenster liegt: sonst schlösse der Schleier
 * es im selben Moment wieder (im Browser gemessen, 11.11.2026). Geschluckt
 * wird genau ein Klick, bis kurz nach dem Loslassen.
 *
 * UND DAS `mousedown` DAVOR (11.11.2026). Chromium schickt beim Loslassen
 * eines langen Drucks noch ein `mousedown` hinterher; das nahm der Eingabe
 * den Fokus — am Telefon ging die Tastatur zu, die Ansicht änderte die Größe,
 * die Seite sprang (im Browser nachgestellt: `focusout` der Eingabe genau
 * beim Loslassen). Geschluckt, bleibt der Fokus, wo er war.
 */
function klickSchlucken() {
  let frist: number | null = null;
  const ende = () => {
    window.removeEventListener('click', weg, true);
    window.removeEventListener('mousedown', halten, true);
    window.removeEventListener('pointerup', los, true);
    if (frist !== null) window.clearTimeout(frist);
  };
  const weg = (e: Event) => { e.preventDefault(); e.stopPropagation(); ende(); };
  const halten = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
  const los = () => { if (frist === null) frist = window.setTimeout(ende, 400); };
  window.addEventListener('click', weg, true);
  window.addEventListener('mousedown', halten, true);
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
 *
 * ANDROID ZÄHLT SELBST (11.11.2026, „funktioniert noch nicht verlässlich“).
 * Android erkennt das lange Drücken nach seiner eigenen Frist und meldet es
 * als `contextmenu` — oft vor unseren 500 ms. Wer zuerst kam, gewann: mal
 * die Leiste, mal das System (ein markiertes Wort, ein Bildmenü, danach ein
 * abgebrochener Zeiger). Jetzt ist das `contextmenu` während eines Drucks
 * das lange Drücken selbst: die Leiste kommt sofort, das Systemmenü nicht.
 * iOS meldet keines; dort zählt weiter die eigene Frist.
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
      ausgeloest.current = false;
      if (e.pointerType !== 'touch') return;
      stopp();
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
      if (ausgeloest.current) { e.preventDefault(); return; }
      if (zeit.current === null) return;
      e.preventDefault();
      stopp();
      ausgeloest.current = true;
      klickSchlucken();
      lang();
    },
  }), [stopp]);
}
