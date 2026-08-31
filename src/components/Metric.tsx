import type { ReactNode } from 'react';

type Tone = 'default' | 'success' | 'danger' | 'warning' | 'brand';

interface MetricProps {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
}

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
 */
export function MetricRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-stretch divide-x divide-line">{children}</div>
  );
}

export default function Metric({ label, value, hint, tone = 'default' }: MetricProps) {
  return (
    // min-w-0 ist hier entscheidend: ohne das weigert sich die Spalte zu
    // schrumpfen, und eine lange Zahl schiebt die Nachbarn aus der Reihe.
    <div className="min-w-0 flex-1 px-3 first:pl-0 last:pr-0">
      <p className="section-label truncate">{label}</p>
      <p className={`tnum mt-0.5 truncate text-lg font-extrabold sm:text-2xl ${valueTone[tone]}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs leading-snug text-ink-muted">{hint}</p>}
    </div>
  );
}
