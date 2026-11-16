import { useLayoutEffect, useRef, type RefObject } from 'react';
import { DAUER, EASE, kannBewegen } from './bewegung';

/**
 * DER ARBEITSTAG WECHSELT WEICH (Plan 15.11.2026, B7).
 *
 * Start, Pause, Weiter und Stopp tauschen Fläche, Uhr und Knöpfe. Die
 * Fläche ging schon weich über (`background-color`, 160 ms), Schrift und
 * Knöpfe aber sprangen sofort: gemessen standen beim Start rund 20 ms helle
 * Schrift auf noch heller Fläche, danach Grau auf Grau. Jetzt blendet der
 * Inhalt in derselben Zeit ein, in der die Fläche dunkel wird, und die
 * Knöpfe des neuen Zustands kommen aus einer leichten Verkleinerung — der
 * Knopf „wird zum nächsten“.
 *
 * Der Zustand selbst gilt sofort (E90); die Bewegung läuft nur auf der
 * Darstellung, die Knöpfe sind die ganze Zeit bedienbar. Beim ersten Zeichnen
 * und bei „Bewegung reduzieren“ nichts.
 */
export function useZustandswechsel(ref: RefObject<HTMLElement>, stand: string, knoepfe: string): void {
  const vorher = useRef(stand);
  useLayoutEffect(() => {
    if (vorher.current === stand) return;
    vorher.current = stand;
    const el = ref.current;
    if (!kannBewegen(el)) return;
    const neu = new Set(el.querySelectorAll(knoepfe));
    for (const k of el.children) {
      if (neu.has(k)) continue;
      k.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DAUER.zustand, easing: EASE });
    }
    for (const k of neu) {
      k.animate([{ opacity: 0, transform: 'scale(0.88)' }, { opacity: 1, transform: 'none' }], { duration: DAUER.bestaetigt, easing: EASE });
    }
  }, [ref, stand, knoepfe]);
}
