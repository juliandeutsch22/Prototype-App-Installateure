import type { ReactNode } from 'react';

type Tone = 'default' | 'success' | 'danger' | 'warning' | 'brand';

interface MetricProps {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
}

/**
 * Die seitliche Polsterung, mit der die Leiste mit dem Karteninhalt fluchtet.
 *
 * SIE STEHT HIER ALS EIN WERT, damit es nicht zwei gibt. `Card` polstert
 * seinen Körper mit `px-4`; weicht diese Zeile davon ab, versetzt sich die
 * ganze Leiste gegen alles darunter — und das fällt beim Schreiben nicht auf,
 * sondern erst dem, der die Seite ansieht.
 */
export const GUTER_RAND = 'px-4';

const valueTone: Record<Tone, string> = {
  default: 'text-ink',
  success: 'text-success',
  danger: 'text-danger',
  warning: 'text-warning',
  brand: 'text-brand',
};

/**
 * Kennzahlen-Leiste am Kopf einer Ansicht.
 *
 * Die Zahlen standen bisher in eigenen Karten mit Rahmen, Polsterung und
 * Symbolkreis. Auf dem Telefon stapelten sie sich dadurch untereinander und
 * belegten mehr als ein Drittel des Bildschirms, bevor der eigentliche Inhalt
 * begann. Und sie sind gar keine Karten: eine Karte umschliesst einen Bereich,
 * den man betritt — hier stehen drei Zahlen zur Orientierung, mehr nicht.
 *
 * Jetzt eine Leiste ohne Rahmen, in EINER Reihe, durch dünne Striche getrennt.
 * Die Symbole sind entfallen; sie trugen nichts bei, was die Beschriftung
 * nicht schon sagte, und kosteten die Breite, die den Zahlen fehlte. Der Ton
 * lebt weiter in der Farbe der Zahl.
 *
 * SIE FLUCHTET MIT DEM KARTENINHALT, nicht mit der Kartenkante. Ohne Rahmen
 * hat die Leiste keine eigene Polsterung — die erste Beschriftung stand
 * deshalb genau dort, wo die KANTE der Karte darunter liegt, und damit
 * sechzehn Bildpunkte links neben deren Titel. Zwei Beschriftungen
 * untereinander, die knapp nicht übereinander stehen, sehen nicht nach einer
 * Entscheidung aus, sondern nach einem Versehen; auf dem Telefon, wo die
 * Karte fast die ganze Breite einnimmt, umso mehr. `GUTER_RAND` ist dasselbe
 * Mass wie am Kartenkörper, und `tests/components/Metric.test.tsx` hält die
 * beiden zusammen.
 */
export function MetricRow({ children }: { children: ReactNode }) {
  return (
    <div className={`flex items-stretch divide-x divide-line ${GUTER_RAND}`}>{children}</div>
  );
}

export default function Metric({ label, value, hint, tone = 'default' }: MetricProps) {
  return (
    // min-w-0 ist hier entscheidend: ohne das weigert sich die Spalte zu
    // schrumpfen, und eine lange Zahl schiebt die Nachbarn aus der Reihe.
    <div className="min-w-0 flex-1 px-3 first:pl-0 last:pr-0">
      <p className="section-label truncate">{label}</p>
      <p className={`tnum mt-1 truncate text-lg font-extrabold sm:text-2xl ${valueTone[tone]}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs leading-snug text-ink-muted">{hint}</p>}
    </div>
  );
}
