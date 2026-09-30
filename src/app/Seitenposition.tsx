import { useEffect, useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/** Die Position je Eintrag im Verlauf — nur für diese Sitzung im Speicher. */
const positionen = new Map<string, number>();

/**
 * NEUE SEITEN STARTEN OBEN, „ZURÜCK“ KEHRT DORTHIN ZURÜCK, WO MAN WAR
 * (Testbericht 30.09.2026, M2).
 *
 * Vorher blieb die Scrollposition beim Seitenwechsel stehen: wer in einer
 * langen Liste weit unten eine Akte öffnete, landete mitten in der Akte.
 *
 * Ein Sprungziel (`#…`) behält der Browser selbst. Beim Zurückgehen lädt die
 * Seite ihre Daten oft erst nach; die Position wird deshalb einige Bilder
 * lang nachgezogen, bis die Seite lang genug ist.
 */
export default function Seitenposition() {
  const ort = useLocation();
  const art = useNavigationType();

  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  }, []);

  useLayoutEffect(() => {
    const schluessel = ort.key;
    let abbrechen = false;
    if (art === 'POP' && positionen.has(schluessel)) {
      const ziel = positionen.get(schluessel) ?? 0;
      let versuche = 0;
      const nachziehen = () => {
        if (abbrechen) return;
        window.scrollTo(0, ziel);
        if (Math.abs(window.scrollY - ziel) > 2 && versuche++ < 40) requestAnimationFrame(nachziehen);
      };
      nachziehen();
    } else if (!ort.hash) {
      window.scrollTo(0, 0);
    }
    const merken = () => positionen.set(schluessel, window.scrollY);
    window.addEventListener('scroll', merken, { passive: true });
    return () => {
      abbrechen = true;
      window.removeEventListener('scroll', merken);
    };
  }, [ort.key, ort.hash, art]);

  return null;
}
