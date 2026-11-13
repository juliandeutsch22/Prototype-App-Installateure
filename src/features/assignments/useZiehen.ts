import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { zielAus, type Last, type Ziel } from './umplanen';

/*
  ZIEHEN UND ABLEGEN IM WOCHENPLAN (E88) — mit Zeiger-Ereignissen, nicht
  mit dem Ziehen des Browsers: das kennt keinen Finger, und Maus und Finger
  sollen denselben Weg gehen.

  - MAUS: Ziehen beginnt nach 6 px Bewegung bei gedrückter Taste. Ein Klick
    ohne Bewegung bleibt ein Klick (öffnet den Einsatz). Mit Alt beim
    Loslassen wird kopiert statt verschoben.
  - FINGER UND STIFT: erst nach langem Drücken (450 ms) — sonst wäre jedes
    Rollen durch den Plan ein Ziehen; das war der Grund, warum es am Tablet
    bisher kein Ziehen gab. Das lange Drücken hebt den Einsatz an und zeigt
    seine Leiste (`onAnheben`); wer dann bewegt, zieht, wer loslässt, hat die
    Leiste vor sich.
  - Escape bricht ab; danach geschieht nichts.

  Das Ziel ist die Zelle unter dem Zeiger (`data-ziel-tag`,
  `data-ziel-person`); sie trägt beim Darüberziehen `data-ziel-aktiv`.
*/

const MAUS_SCHWELLE = 6;
const FINGER_SCHWELLE = 10;
const LANGES_DRUECKEN = 450;

export interface Schatten {
  last: Last;
  x: number;
  y: number;
  kopieren: boolean;
}

export function useZiehen({
  onAblegen,
  onAnheben,
}: {
  onAblegen: (last: Last, ziel: Ziel, kopieren: boolean) => void;
  /** Langes Drücken mit dem Finger: die Leiste des Einsatzes zeigen. */
  onAnheben?: (last: Last) => void;
}) {
  const [schatten, setSchatten] = useState<Schatten | null>(null);
  const lauf = useRef<{
    last: Last;
    x0: number;
    y0: number;
    finger: boolean;
    angehoben: boolean;
    zieht: boolean;
    timer: number | null;
    ziel: HTMLElement | null;
  } | null>(null);
  const ablegenRef = useRef(onAblegen);
  const anhebenRef = useRef(onAnheben);
  ablegenRef.current = onAblegen;
  anhebenRef.current = onAnheben;

  const zielMarkieren = (el: HTMLElement | null) => {
    const l = lauf.current;
    if (!l || l.ziel === el) return;
    l.ziel?.removeAttribute('data-ziel-aktiv');
    el?.setAttribute('data-ziel-aktiv', '');
    l.ziel = el;
  };

  const ende = useCallback(() => {
    const l = lauf.current;
    if (l?.timer) window.clearTimeout(l.timer);
    l?.ziel?.removeAttribute('data-ziel-aktiv');
    lauf.current = null;
    document.documentElement.removeAttribute('data-zieht');
    setSchatten(null);
  }, []);

  useEffect(() => {
    // Der Finger hat angehoben: ab jetzt rollt die Seite nicht mehr mit, er zieht.
    const beruehrung = (e: TouchEvent) => {
      if (lauf.current?.angehoben && e.cancelable) e.preventDefault();
    };
    const bewegt = (e: PointerEvent) => {
      const l = lauf.current;
      if (!l) return;
      const weit = Math.hypot(e.clientX - l.x0, e.clientY - l.y0);
      if (!l.zieht) {
        if (l.finger && !l.angehoben) {
          // Bewegt vor dem langen Drücken: das ist Rollen, kein Ziehen.
          if (weit > FINGER_SCHWELLE) ende();
          return;
        }
        if (weit < (l.finger ? FINGER_SCHWELLE : MAUS_SCHWELLE)) return;
        l.zieht = true;
        document.documentElement.setAttribute('data-zieht', '');
      }
      const unter = document.elementFromPoint(e.clientX, e.clientY);
      zielMarkieren(unter?.closest<HTMLElement>('[data-ziel-tag][data-ziel-person]') ?? null);
      setSchatten({ last: l.last, x: e.clientX, y: e.clientY, kopieren: e.altKey });
    };
    const los = (e: PointerEvent) => {
      const l = lauf.current;
      if (!l) return;
      if (l.zieht) {
        const ziel = zielAus(document.elementFromPoint(e.clientX, e.clientY));
        // Der Klick, der nach dem Loslassen folgt, gehört zum Ziehen — nicht zum Einsatz darunter.
        const schlucken = (k: MouseEvent) => { k.stopPropagation(); k.preventDefault(); };
        window.addEventListener('click', schlucken, { capture: true, once: true });
        window.setTimeout(() => window.removeEventListener('click', schlucken, { capture: true }), 0);
        const { last } = l;
        ende();
        if (ziel) ablegenRef.current(last, ziel, e.altKey);
        return;
      }
      if (l.angehoben) {
        // Angehoben und losgelassen: die Leiste bleibt, der Klick öffnet nicht den Einsatz.
        const schlucken = (k: MouseEvent) => { k.stopPropagation(); k.preventDefault(); };
        window.addEventListener('click', schlucken, { capture: true, once: true });
        window.setTimeout(() => window.removeEventListener('click', schlucken, { capture: true }), 0);
      }
      ende();
    };
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && lauf.current) ende();
    };
    window.addEventListener('pointermove', bewegt);
    window.addEventListener('pointerup', los);
    window.addEventListener('pointercancel', ende);
    window.addEventListener('keydown', taste);
    window.addEventListener('touchmove', beruehrung, { passive: false });
    return () => {
      window.removeEventListener('pointermove', bewegt);
      window.removeEventListener('pointerup', los);
      window.removeEventListener('pointercancel', ende);
      window.removeEventListener('keydown', taste);
      window.removeEventListener('touchmove', beruehrung);
    };
  }, [ende]);

  /** Die Eigenschaften für das, was sich ziehen lässt. */
  const griff = useCallback(
    (last: Last) => ({
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
        if (e.button !== 0 || lauf.current) return;
        const finger = e.pointerType !== 'mouse';
        const l = {
          last, x0: e.clientX, y0: e.clientY, finger, angehoben: false, zieht: false, timer: null as number | null, ziel: null,
        };
        lauf.current = l;
        if (finger) {
          l.timer = window.setTimeout(() => {
            if (lauf.current !== l) return;
            l.angehoben = true;
            anhebenRef.current?.(last);
          }, LANGES_DRUECKEN);
        }
      },
      // Das Kontextmenü des langen Drückens würde den Finger festhalten.
      onContextMenu: (e: React.MouseEvent) => {
        if (lauf.current?.finger) e.preventDefault();
      },
      'data-ziehbar': '',
    }),
    [],
  );

  return { griff, schatten };
}
