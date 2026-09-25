import { useEffect, useState } from 'react';

/**
 * Die eine Breitenweiche der App: ist das Fenster mindestens so breit wie
 * Tailwinds `lg` (1024 px)?
 *
 * Gebraucht, wo eine Ansicht am Schreibtisch eine ANDERE Form hat als am
 * Telefon — die Listen als Tabelle, der Handwerksschein als eine Seite statt
 * Schritten. Beide Formen mit `hidden lg:block` nebeneinander ins DOM zu
 * legen, hiesse: jede Zeile, jeder Knopf stünde zweimal da, und Vorlesehilfe
 * wie Tests fänden alles doppelt. Deshalb entscheidet diese Abfrage, und es
 * steht genau eine Form im DOM.
 *
 * OHNE `matchMedia` (jsdom, sehr alte Browser) gilt: nicht breit. Dann steht
 * die Listenform da, die überall funktioniert.
 */
export const AB_SCHREIBTISCH = 1024;

/**
 * Ab hier werden die Büro-Listen zur Tabelle — eine Stufe später als der
 * Schreibtisch. Neben der Seitenleiste blieben auf 1024 px rund 660 px für
 * fünf bis sieben Spalten: Namen brachen mitten im Wort, die Knöpfe der
 * Anforderungen standen übereinander. Ab 1280 px (auch die Fenstergrösse der
 * Browserwege) steht jede Spalte ruhig. Dieselbe Grenze wie die zweispaltigen
 * Akten.
 */
export const AB_TABELLE = 1280;

function abfrageFuer(ab: number): string {
  return `(min-width: ${ab}px)`;
}

function trifftZu(ab: number): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(abfrageFuer(ab)).matches
    : false;
}

/**
 * Gelesen beim ersten Zeichnen, nicht erst im Effekt — sonst sähe der
 * Schreibtisch für einen Augenblick die Telefonform und spränge dann um.
 * Danach folgt der Wert jeder Änderung der Fensterbreite.
 */
export function useAbBreite(ab: number = AB_SCHREIBTISCH): boolean {
  const [breit, setBreit] = useState(() => trifftZu(ab));
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const abfrage = window.matchMedia(abfrageFuer(ab));
    const neu = () => setBreit(abfrage.matches);
    neu();
    // `addListener` für Safari vor 14, das `addEventListener` hier nicht kennt.
    if (abfrage.addEventListener) abfrage.addEventListener('change', neu);
    else abfrage.addListener(neu);
    return () => {
      if (abfrage.removeEventListener) abfrage.removeEventListener('change', neu);
      else abfrage.removeListener(neu);
    };
  }, [ab]);
  return breit;
}
