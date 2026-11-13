import { createContext, useContext, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * DER TITEL WANDERT BEIM ROLLEN IN DIE KOPFZEILE (D11, E86).
 *
 * Am Handy steht der Seitentitel groß über dem Inhalt. Rollt er unter die
 * Kopfzeile, wüsste man auf einer langen Akte nicht mehr, wo man ist; dann
 * steht er klein in der Kopfzeile, wo sonst der Betrieb steht — wie die
 * Titelleiste am iPhone. Ab dem Tablet gibt es keine Kopfzeile; dort steht
 * die Navigation daneben und sagt es.
 */
type Melden = (titel: string | null) => void;

export const KopfTitelKontext = createContext<Melden | null>(null);

/** Raster des Zeichentischs (E33): der Titel endet auf einer seiner Linien. */
const RASTER = 24;
/** Mindestens so viel Luft um den Titel — je eine halbe Linie oben und unten. */
const MIN_LUFT = 12;

/**
 * Meldet den Titel der Seite, solange er unter der Kopfzeile verschwunden ist,
 * und hält ihn am Handy auf dem Raster: Ein 28-px-Titel hat 36 px Zeilen, ein-
 * zeilig 48 px samt Luft, zweizeilig 96 — das Polster rechnet das aus, sonst
 * stünde jedes Blatt darunter um eine halbe Zelle versetzt.
 */
export function useKopfTitel(h1: RefObject<HTMLHeadingElement | null>, satz: RefObject<HTMLElement | null>, titel: string | null) {
  const melden = useContext(KopfTitelKontext);
  const zuletzt = useRef<string | null>(null);

  useLayoutEffect(() => {
    const el = h1.current;
    const innen = satz.current;
    if (!el || !innen) return;
    const rechnen = () => {
      const hoehe = innen.getBoundingClientRect().height;
      if (!hoehe) return;
      const gesamt = Math.ceil((hoehe + MIN_LUFT) / RASTER) * RASTER;
      el.style.setProperty('--titel-luft', `${(gesamt - hoehe) / 2}px`);
    };
    rechnen();
    if (typeof ResizeObserver === 'undefined') return;
    const beobachter = new ResizeObserver(rechnen);
    beobachter.observe(innen);
    return () => beobachter.disconnect();
  }, [h1, satz]);

  useEffect(() => {
    const el = h1.current;
    // Ein Kopf in einem Fenster oder Dialog ist nicht der Kopf der Seite.
    if (!melden || !titel || !el || el.closest('[role="dialog"], .fenster')) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const kopf = document.querySelector('.kopfzeile');
    const oben = kopf ? kopf.getBoundingClientRect().height : 0;
    const beobachter = new IntersectionObserver(([e]) => {
      const weg = !e.isIntersecting && e.boundingClientRect.top < oben;
      const neu = weg ? titel : null;
      if (neu === zuletzt.current) return;
      zuletzt.current = neu;
      melden(neu);
    }, { rootMargin: `-${Math.round(oben)}px 0px 0px 0px` });
    beobachter.observe(el);
    return () => {
      beobachter.disconnect();
      if (zuletzt.current) melden(null);
      zuletzt.current = null;
    };
  }, [melden, titel, h1]);
}
