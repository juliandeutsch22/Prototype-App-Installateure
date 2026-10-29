import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/** Die Position je Eintrag im Verlauf — nur für diese Sitzung im Speicher. */
const positionen = new Map<string, number>();

/**
 * NEUE SEITEN STARTEN OBEN, „ZURÜCK“ KEHRT DORTHIN ZURÜCK, WO MAN WAR
 * (Testbericht 30.09.2026, M2).
 *
 * Vorher blieb die Scrollposition beim Seitenwechsel stehen: wer in einer
 * langen Liste weit unten eine Akte öffnete, landete mitten in der Akte.
 * Filter, Suche und Ansichten derselben Seite ändern dagegen nur die
 * Abfrageparameter: dabei bleibt die aktuelle Position erhalten.
 *
 * Ein Sprungziel (`#…`) behält der Browser selbst. Beim Zurückgehen lädt die
 * Seite ihre Daten oft erst nach; die Position wird deshalb einige Bilder
 * lang nachgezogen, bis die Seite lang genug ist.
 */
export default function Seitenposition() {
  const ort = useLocation();
  const art = useNavigationType();
  const vorigerPfad = useRef<string | null>(null);

  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  }, []);

  useLayoutEffect(() => {
    const schluessel = ort.key;
    const gleicheSeite = vorigerPfad.current === ort.pathname;
    vorigerPfad.current = ort.pathname;
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
    } else if (!ort.hash && !gleicheSeite) {
      window.scrollTo(0, 0);
    }
    const merken = () => positionen.set(schluessel, window.scrollY);
    // Auch ohne nachfolgenden Scroll-Event bekommt der neue Verlaufseintrag
    // die aktuelle Position (Filter und Ansichten ändern nur die Abfrage).
    merken();
    window.addEventListener('scroll', merken, { passive: true });
    return () => {
      abbrechen = true;
      window.removeEventListener('scroll', merken);
    };
  }, [ort.key, ort.pathname, ort.hash, art]);

  return null;
}
