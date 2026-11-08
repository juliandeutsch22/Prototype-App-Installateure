import { useEffect, useState } from 'react';
import { AB_TABLET } from './breiten';

/*
  OHNE MEDIENABFRAGE DAS HANDY. Kennt die Umgebung `matchMedia` nicht (jsdom
  in den Komponententests, ein sehr alter Browser), gilt die schmale
  Anordnung — sie trägt auf jeder Breite.
*/
function abTabletJetzt(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(AB_TABLET).matches;
}

/**
 * Ist der Schirm mindestens so breit wie ein Tablet (760 px)? Dann stehen
 * zwei Blätter nebeneinander, am Handy zwei Seiten hintereinander — gezeichnet
 * wird nur die eine Anordnung (wie `useSchreibtisch`).
 */
export function useAbTablet(): boolean {
  const [breit, setBreit] = useState(abTabletJetzt);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const abfrage = window.matchMedia(AB_TABLET);
    const neu = () => setBreit(abfrage.matches);
    neu();
    if (abfrage.addEventListener) abfrage.addEventListener('change', neu);
    else abfrage.addListener?.(neu);
    return () => {
      if (abfrage.removeEventListener) abfrage.removeEventListener('change', neu);
      else abfrage.removeListener?.(neu);
    };
  }, []);
  return breit;
}
