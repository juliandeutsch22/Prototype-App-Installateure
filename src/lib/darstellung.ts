import { useCallback, useEffect, useState } from 'react';

/**
 * HELL, DUNKEL ODER WIE DAS GERÄT — eine Wahl dieses Geräts (V10, 13.11.2026).
 *
 * Hell bleibt Standard: draussen in der Sonne ist eine dunkle Oberfläche
 * schlechter lesbar, und ein Telefon, das abends von selbst umschaltet, hätte
 * die App auf der Baustelle am nächsten Morgen dunkel. Wer will, wählt unter
 * „Mein Konto → Darstellung und Bewegung“ ausdrücklich „Dunkel“ oder
 * „System“ — dann folgt die App der Einstellung des Geräts
 * (`prefers-color-scheme`), auch wenn sie sich während der Arbeit ändert.
 * Eine ausdrückliche Wahl hat immer Vorrang.
 *
 * Die Wahl gehört zum Gerät, nicht zur Person: sie bleibt beim Abmelden
 * (`speicher.ts` löscht nur, was einem Nutzer gehört). Gewechselt wird nur
 * ein Attribut am Wurzelelement — Formulare, Entwürfe, Timer, Fokus und
 * Rollposition bleiben, wie sie sind.
 */
export type Darstellung = 'hell' | 'dunkel' | 'system';

const SCHLUESSEL = 'senklot.darstellung';
const DUNKEL_ABFRAGE = '(prefers-color-scheme: dark)';

function lesen(): Darstellung {
  try {
    const wert = window.localStorage.getItem(SCHLUESSEL);
    return wert === 'dunkel' || wert === 'system' ? wert : 'hell';
  } catch {
    return 'hell';
  }
}

function geraetDunkel(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.(DUNKEL_ABFRAGE).matches;
  } catch {
    return false;
  }
}

/** Was tatsächlich gezeigt wird: „System“ aufgelöst nach der Einstellung des Geräts. */
export function wirksam(d: Darstellung): 'hell' | 'dunkel' {
  if (d === 'system') return geraetDunkel() ? 'dunkel' : 'hell';
  return d;
}

/*
  Der Statusbalken des Telefons trägt die Farbe des Grunds darunter: hell das
  warme Papier, dunkel der warme Grund — sonst säße ein fremder Riegel über
  der Kopfinsel.
*/
const STATUSBALKEN: Record<'hell' | 'dunkel', string> = { hell: '#f4f0e8', dunkel: '#211f1c' };

function anwenden(d: Darstellung): void {
  if (typeof document === 'undefined') return;
  const w = wirksam(d);
  if (w === 'dunkel') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', STATUSBALKEN[w]);
}

/** Beim Start, vor dem ersten Zeichnen — sonst blitzt die helle Fläche auf. */
export function darstellungAnwenden(): void {
  anwenden(lesen());
}

export function useDarstellung(): [Darstellung, (d: Darstellung) => void] {
  const [d, setD] = useState<Darstellung>(lesen);
  const setzen = useCallback((neu: Darstellung) => {
    try {
      if (neu === 'hell') window.localStorage.removeItem(SCHLUESSEL);
      else window.localStorage.setItem(SCHLUESSEL, neu);
    } catch {
      /* privates Fenster: dann gilt die Wahl nur bis zum Neuladen */
    }
    anwenden(neu);
    setD(neu);
  }, []);
  // Bei „System“ folgt die App dem Gerät auch während der Arbeit.
  useEffect(() => {
    if (d !== 'system' || typeof window === 'undefined' || !window.matchMedia) return;
    const abfrage = window.matchMedia(DUNKEL_ABFRAGE);
    const folgen = () => anwenden('system');
    abfrage.addEventListener?.('change', folgen);
    return () => abfrage.removeEventListener?.('change', folgen);
  }, [d]);
  return [d, setzen];
}
