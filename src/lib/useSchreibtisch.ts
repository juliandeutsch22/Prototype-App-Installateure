import { useEffect, useState } from 'react';
import { AB_SCHREIBTISCH } from './breiten';

/** Ab hier Tabellen statt Zeilen — dieselbe Grenze wie Tailwinds `lg`. */
const BREIT = AB_SCHREIBTISCH;

/*
  OHNE MEDIENABFRAGE DIE ZEILEN. Kennt die Umgebung `matchMedia` nicht (jsdom
  in den Komponententests, ein sehr alter Browser), stehen die Listen so da,
  wie sie immer dastanden — als Zeilen. Die Tabelle ist eine Anordnung für
  breite Schirme; wo sich die Breite nicht erfragen lässt, sind die Zeilen
  der sichere Stand, denn sie tragen auf jeder Breite.
*/
function breitJetzt(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(BREIT).matches;
}

/**
 * Steht eine Liste als Tabelle da (Schreibtisch, ab 1024 px) oder als
 * Zeilen (Telefon und Tablet)? Designlinie „Fassung 3", Seitentyp B.
 *
 * WARUM NICHT BEIDE UND CSS BLENDET AUS. Dann stünde jeder Knopf zweimal im
 * Dokument — für Vorlesehilfen, für die Tastatur und für jede Prüfung, die
 * einen Knopf beim Namen sucht. Gezeichnet wird deshalb nur die eine
 * Darstellung, beide aus denselben Daten und mit denselben Handlern.
 *
 * Gelesen beim ersten Zeichnen, nicht erst im Effekt — sonst sähe der
 * Schreibtisch für einen Augenblick die Zeilen und spränge dann um.
 */
export function useSchreibtisch(): boolean {
  const [breit, setBreit] = useState(breitJetzt);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const abfrage = window.matchMedia(BREIT);
    const neu = () => setBreit(abfrage.matches);
    neu();
    // Ältere Safari kennen nur addListener.
    if (abfrage.addEventListener) abfrage.addEventListener('change', neu);
    else abfrage.addListener?.(neu);
    return () => {
      if (abfrage.removeEventListener) abfrage.removeEventListener('change', neu);
      else abfrage.removeListener?.(neu);
    };
  }, []);
  return breit;
}
