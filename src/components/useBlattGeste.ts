import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';

const FELD = 'input, textarea, select, button, a, [contenteditable="true"], canvas, [role="slider"]';
const ABSICHT = 8;

type Geste = {
  art: 'pointer' | 'touch'; id: number; x: number; y: number; zeit: number;
  achse: 'offen' | 'ziehen' | 'seitlich' | 'scrollen';
  darfZiehen: boolean; darfSeitlich: boolean;
};

/** Nur eigene breite Tabellen/Leisten dürfen seitlich rollen, nicht das Blatt. */
function seitlichRollbar(ziel: EventTarget | null, inhalt: HTMLElement | null): boolean {
  let el = ziel instanceof Element ? ziel : null;
  while (el && el !== inhalt) {
    if (/(auto|scroll)/.test(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 1) return true;
    el = el.parentElement;
  }
  return false;
}

/** Richtungsgebundene Wischgeste. Native Inhaltsscrolls und Abbrüche schließen nie. */
export function useBlattGeste({ open, aktiv, blatt, inhalt, onClose }: {
  open: boolean; aktiv: boolean;
  blatt: RefObject<HTMLDivElement>; inhalt: RefObject<HTMLDivElement>;
  onClose: () => void;
}) {
  const aktuell = useRef({ open, aktiv, onClose });
  aktuell.current = { open, aktiv, onClose };
  const geste = useRef<Geste | null>(null);
  const hoehe = useRef(0);
  const [dy, setDy] = useState(0);
  const [zieht, setZieht] = useState(false);
  const [losgelassen, setLosgelassen] = useState(false);

  const abbrechen = useCallback(() => {
    geste.current = null;
    setZieht(false);
    if (aktuell.current.open) setDy(0);
  }, []);

  useLayoutEffect(() => {
    geste.current = null;
    setZieht(false);
    if (open) setDy(0);
  }, [open, aktiv]);

  useLayoutEffect(() => {
    if (!losgelassen) return;
    // Der Aufrufer darf das Schließen ablehnen, etwa während des Speicherns.
    // Dann kehrt das Blatt zurück, statt unsichtbar und gesperrt zu bleiben.
    if (open) setDy(0);
    setLosgelassen(false);
  }, [open, losgelassen]);

  const beginnen = useCallback((art: Geste['art'], id: number, x: number, y: number, zeit: number, ziel: EventTarget | null, amGriff: boolean) => {
    if (!aktuell.current.open || !aktuell.current.aktiv || geste.current) return;
    const auswahl = window.getSelection();
    const textauswahlHier = auswahl?.isCollapsed === false && inhalt.current?.contains(auswahl.anchorNode);
    if (!amGriff && ziel instanceof Element && (ziel.closest(FELD) || textauswahlHier)) return;
    hoehe.current = blatt.current?.getBoundingClientRect().height ?? 0;
    geste.current = {
      art, id, x, y, zeit, achse: 'offen',
      darfZiehen: amGriff || (inhalt.current?.scrollTop ?? 0) <= 0,
      darfSeitlich: !amGriff && seitlichRollbar(ziel, inhalt.current),
    };
  }, [blatt, inhalt]);

  const bewegen = useCallback((x: number, y: number) => {
    const g = geste.current;
    if (!g || !aktuell.current.open) return;
    const dx = x - g.x, d = y - g.y;
    if (g.achse === 'offen' && Math.max(Math.abs(dx), Math.abs(d)) >= ABSICHT) {
      g.achse = Math.abs(dx) > Math.abs(d) ? 'seitlich' : d > 0 && g.darfZiehen ? 'ziehen' : 'scrollen';
    }
    if (g.achse === 'ziehen') {
      setZieht(true);
      setDy(Math.max(0, d));
    }
    return g.achse;
  }, []);

  const beenden = useCallback((y: number, zeit: number) => {
    const g = geste.current;
    if (!g) return;
    geste.current = null;
    setZieht(false);
    const d = y - g.y;
    if (aktuell.current.open && g.achse === 'ziehen' && (d > 90 || (d > 12 && d / Math.max(zeit - g.zeit, 1) > 0.5))) {
      setLosgelassen(true);
      aktuell.current.onClose();
    } else if (aktuell.current.open) setDy(0);
  }, []);

  // React delegiert Touchmove passiv. Nur die erkannte Abwärtsgeste und eine
  // unerwünschte Seitwärtsgeste werden hier vor der nativen Scrollübernahme
  // abgefangen. Tabellen, Textfelder, Aufwärtsscroll und Pinch-Zoom bleiben nativ.
  useEffect(() => {
    const el = inhalt.current;
    if (!open || !aktiv || !el) return;
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) { abbrechen(); return; }
      const t = e.touches[0];
      beginnen('touch', t.identifier, t.clientX, t.clientY, e.timeStamp, e.target, false);
    };
    const move = (e: TouchEvent) => {
      const g = geste.current;
      if (!g || g.art !== 'touch') return;
      if (e.touches.length !== 1) { abbrechen(); return; }
      const t = e.touches[0];
      if (t.identifier !== g.id) { abbrechen(); return; }
      const achse = bewegen(t.clientX, t.clientY);
      if (achse === 'ziehen' || (achse === 'seitlich' && !g.darfSeitlich)) {
        if (e.cancelable) e.preventDefault();
        else if (achse === 'ziehen') abbrechen();
      }
    };
    const end = (e: TouchEvent) => {
      const g = geste.current;
      if (!g || g.art !== 'touch') return;
      const t = Array.from(e.changedTouches).find(t => t.identifier === g.id);
      if (t) beenden(t.clientY, e.timeStamp);
      else abbrechen();
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', abbrechen);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', abbrechen);
    };
  }, [open, aktiv, inhalt, beginnen, bewegen, beenden, abbrechen]);

  return {
    dy: !open && dy > 0 ? Math.max(dy, hoehe.current + 16) : dy,
    zieht,
    beginn(e: PointerEvent, amGriff: boolean) {
      if (e.isPrimary === false || e.button !== 0 || (e.pointerType === 'touch' && !amGriff)) return;
      beginnen('pointer', e.pointerId, e.clientX, e.clientY, e.timeStamp, e.target, amGriff);
    },
    bewegung(e: PointerEvent<HTMLDivElement>) {
      const g = geste.current;
      if (!g || g.art !== 'pointer' || g.id !== e.pointerId) return;
      if (bewegen(e.clientX, e.clientY) === 'ziehen') {
        e.preventDefault();
        // Touch besitzt meist bereits eine implizite Capture am Griff. Ein
        // Übertragen auf das Fenster löste dort lostpointercapture aus und
        // würde die gerade begonnene Geste irrtümlich abbrechen.
        const gefangen = e.currentTarget.hasPointerCapture?.(e.pointerId)
          || (e.target instanceof Element && e.target.hasPointerCapture?.(e.pointerId));
        if (e.isTrusted && !gefangen) e.currentTarget.setPointerCapture?.(e.pointerId);
      }
    },
    ende(e: PointerEvent) {
      const g = geste.current;
      if (g?.art === 'pointer' && g.id === e.pointerId) beenden(e.clientY, e.timeStamp);
    },
    abbruch(e: PointerEvent) {
      const g = geste.current;
      if (g?.art === 'pointer' && g.id === e.pointerId) abbrechen();
    },
  };
}
