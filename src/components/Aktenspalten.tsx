import { Fragment, type ReactNode } from 'react';
import { useSchreibtisch } from '@/lib/useSchreibtisch';

/**
 * Die Karten einer Akte — am Telefon untereinander, am Schreibtisch in zwei
 * Spalten (Designlinie „Fassung 3", Seitentyp C: links 7, rechts 5).
 *
 * AM TELEFON BLEIBT DIE REIHENFOLGE, die die Akte immer hatte (`telefon`).
 * Zwei Spalten in einem Raster hätten auf dem Telefon erst die ganze linke,
 * dann die ganze rechte Spalte gezeigt — die Stammdaten wären von oben nach
 * unten gerutscht. Deshalb ordnet diese Komponente dieselben Karten je nach
 * Breite an; gezeichnet wird jede genau einmal.
 */
export default function Aktenspalten({
  telefon,
  links,
  rechts,
}: {
  telefon: ReactNode[];
  links: ReactNode[];
  rechts: ReactNode[];
}) {
  const breit = useSchreibtisch();
  // Der Schlüssel ist der Platz in der Liste, nicht in der gefilterten:
  // blendet sich eine Karte aus, behalten die übrigen ihren Zustand.
  const reihe = (karten: ReactNode[]) =>
    karten.map((k, i) => (k ? <Fragment key={i}>{k}</Fragment> : null));
  // Bleibt eine Seite leer (etwa ohne Recht auf „Zugang"), stünde daneben
  // eine leere Spalte. Dann lieber einspaltig in der Telefon-Reihenfolge.
  if (!breit || !links.some(Boolean) || !rechts.some(Boolean)) return <>{reihe(telefon)}</>;
  return (
    <div className="zwei-spalten">
      <div className="spalte">{reihe(links)}</div>
      <div className="spalte">{reihe(rechts)}</div>
    </div>
  );
}
