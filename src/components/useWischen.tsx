import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useAmHandy } from '@/lib/breiten';

/**
 * WISCHEN AN DER ZEILE (Plan 15.11.2026, F15) — wie am iPhone.
 *
 * Nach links gewischt, schiebt sich die Zeile zur Seite und gibt rechts ihre
 * Aktion frei („Löschen“, „Aus Lager“); ein Tipp darauf tut, was der Knopf
 * an der Zeile oder im Fenster tut — mit denselben Rechten und derselben
 * Rückfrage, denn es IST derselbe Aufruf. Neue Aktionen entstehen hier
 * nicht: wischen ist ein kürzerer Weg, kein eigener.
 *
 * NUR AM HANDY UND NUR MIT DEM FINGER. Am Schreibtisch und mit der Maus
 * stehen die Aktionen an der Zeile. Senkrechtes Rollen bleibt nativ: erst
 * wenn die Bewegung nach 8 px eindeutig waagrecht ist, gehört sie der Zeile.
 *
 * BEDIENBAR OHNE WISCHEN. Zu ist die Aktionsfläche stumm (`inert`), damit
 * Tab und Vorlesehilfe sie nicht doppelt finden; dieselbe Aktion steht
 * immer auch anders erreichbar (Fenster, Knopf unter der Zeile).
 *
 * Bewegt wird nur `transform` (über `--wisch-x`, ohne neues Zeichnen durch
 * React je Bild); bei „Bewegung reduzieren“ springt die Zeile auf und zu.
 */
export interface WischAktion {
  text: string;
  /** Wofür, für die Vorlesehilfe („Eintrag vom 13.11.2026 löschen“). */
  name?: string;
  onClick: () => void;
  gefahr?: boolean;
}

const ABSICHT = 8;

// eslint-disable-next-line react-refresh/only-export-components
export function useWischen(zeile: RefObject<HTMLElement>, aktiv: boolean) {
  const amHandy = useAmHandy();
  const an = aktiv && amHandy;
  const [offen, setOffen] = useState(false);
  const offenRef = useRef(false);
  offenRef.current = offen;

  const setzen = useCallback((x: number, ziehen: boolean) => {
    const el = zeile.current;
    if (!el) return;
    el.style.setProperty('--wisch-x', `${x}px`);
    if (ziehen) el.setAttribute('data-wischt', '');
    else el.removeAttribute('data-wischt');
  }, [zeile]);

  const schliessen = useCallback(() => {
    setOffen(false);
    setzen(0, false);
  }, [setzen]);

  useEffect(() => {
    const el = zeile.current;
    if (!el || !an) return;
    const breite = () => el.querySelector<HTMLElement>(':scope > .wisch-aktionen')?.offsetWidth ?? 0;
    let start: { x: number; y: number; basis: number; achse: 'offen' | 'quer' | 'hoch' } | null = null;
    const anfang = (e: TouchEvent) => {
      if (e.touches.length !== 1) { start = null; return; }
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY, basis: offenRef.current ? -breite() : 0, achse: 'offen' };
    };
    const bewegen = (e: TouchEvent) => {
      if (!start || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (start.achse === 'offen' && Math.max(Math.abs(dx), Math.abs(dy)) >= ABSICHT) {
        start.achse = Math.abs(dx) > Math.abs(dy) ? 'quer' : 'hoch';
      }
      if (start.achse !== 'quer') return;
      if (e.cancelable) e.preventDefault();
      setzen(Math.min(0, Math.max(-breite() * 1.15, start.basis + dx)), true);
    };
    const ende = (e: TouchEvent) => {
      if (!start) return;
      const s = start;
      start = null;
      if (s.achse !== 'quer') return;
      const t = e.changedTouches[0];
      const x = s.basis + (t ? t.clientX - s.x : 0);
      const auf = x < -breite() / 2;
      setOffen(auf);
      setzen(auf ? -breite() : 0, false);
    };
    const abbruch = () => {
      start = null;
      setzen(offenRef.current ? -breite() : 0, false);
    };
    el.addEventListener('touchstart', anfang, { passive: true });
    el.addEventListener('touchmove', bewegen, { passive: false });
    el.addEventListener('touchend', ende);
    el.addEventListener('touchcancel', abbruch);
    return () => {
      el.removeEventListener('touchstart', anfang);
      el.removeEventListener('touchmove', bewegen);
      el.removeEventListener('touchend', ende);
      el.removeEventListener('touchcancel', abbruch);
    };
  }, [zeile, an, setzen]);

  // Ein Tipp neben die offene Zeile, oder Rollen, schließt sie — wie am iPhone.
  useEffect(() => {
    if (!offen) return;
    const anderswo = (e: Event) => {
      if (e.target instanceof Node && zeile.current?.contains(e.target)) return;
      schliessen();
    };
    document.addEventListener('touchstart', anderswo, { passive: true });
    document.addEventListener('pointerdown', anderswo);
    window.addEventListener('scroll', schliessen, { passive: true });
    return () => {
      document.removeEventListener('touchstart', anderswo);
      document.removeEventListener('pointerdown', anderswo);
      window.removeEventListener('scroll', schliessen);
    };
  }, [offen, schliessen, zeile]);

  return { an, offen, schliessen };
}

/** Die Aktionen hinter der Zeile — rechts außerhalb, sie fahren mit der Zeile herein. */
export function WischAktionen({ aktionen, offen, schliessen }: { aktionen: WischAktion[]; offen: boolean; schliessen: () => void }) {
  return (
    // `inert` als Text: React 18 kennt das Attribut noch nicht als Schalter.
    <div className="wisch-aktionen" aria-hidden={!offen} {...(offen ? {} : { inert: '' })}>
      {aktionen.map((a) => (
        <button
          key={a.text}
          type="button"
          className={a.gefahr ? 'wisch-knopf wisch-knopf-gefahr' : 'wisch-knopf'}
          aria-label={a.name}
          onClick={() => { schliessen(); a.onClick(); }}
        >
          {a.text}
        </button>
      ))}
    </div>
  );
}
