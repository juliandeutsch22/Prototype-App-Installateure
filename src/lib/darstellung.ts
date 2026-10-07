import { useCallback, useState } from 'react';

/**
 * HELL ODER DUNKEL — eine Wahl dieses Geräts (Linie „Lot“, Protokoll 0.2).
 *
 * Hell ist Standard, UNABHÄNGIG VON DER SYSTEMEINSTELLUNG: draussen in der
 * Sonne ist eine dunkle Oberfläche schlechter lesbar, und ein Telefon, das
 * abends von selbst umschaltet, hätte die App auf der Baustelle am nächsten
 * Morgen dunkel. Dunkel gibt es nur auf ausdrückliche Wahl.
 *
 * Die Wahl gehört zum Gerät, nicht zur Person: sie bleibt beim Abmelden
 * (`speicher.ts` löscht nur, was einem Nutzer gehört).
 */
export type Darstellung = 'hell' | 'dunkel';

const SCHLUESSEL = 'senklot.darstellung';

function lesen(): Darstellung {
  try {
    return window.localStorage.getItem(SCHLUESSEL) === 'dunkel' ? 'dunkel' : 'hell';
  } catch {
    return 'hell';
  }
}

function anwenden(d: Darstellung): void {
  if (typeof document === 'undefined') return;
  if (d === 'dunkel') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
}

/** Beim Start, vor dem ersten Zeichnen — sonst blitzt die helle Fläche auf. */
export function darstellungAnwenden(): void {
  anwenden(lesen());
}

export function useDarstellung(): [Darstellung, (d: Darstellung) => void] {
  const [d, setD] = useState<Darstellung>(lesen);
  const setzen = useCallback((neu: Darstellung) => {
    try {
      if (neu === 'dunkel') window.localStorage.setItem(SCHLUESSEL, 'dunkel');
      else window.localStorage.removeItem(SCHLUESSEL);
    } catch {
      /* privates Fenster: dann gilt die Wahl nur bis zum Neuladen */
    }
    anwenden(neu);
    setD(neu);
  }, []);
  return [d, setzen];
}
