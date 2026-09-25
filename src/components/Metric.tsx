import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Tone = 'default' | 'success' | 'danger' | 'warning' | 'brand';

interface MetricProps {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
  /**
   * Wohin ein Tipp auf die Kachel führt. Eine Zahl, hinter der Arbeit steht
   * („€ 800 überfällig"), ohne Weg dorthin, lässt einen suchen.
   */
  to?: string;
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
/*
 * AUF DEM TELEFON ZWEI SPALTEN, AB `sm` EINE REIHE.
 *
 * EIN ABGESCHNITTENER BETRAG IST NICHT UNSCHOEN, ER IST FALSCH. Bei drei
 * Kennzahlen nebeneinander blieben auf 390 px rund 95 Pixel je Spalte. „€ 22
 * 104,60" braucht 118 und stand deshalb als „€ 22 104…" da — was sich wie ein
 * anderer Betrag liest. Dasselbe bei „€ 7 488,…".
 *
 * Zwei Spalten geben jeder Zahl 163 Pixel; damit passt auch ein
 * fuenfstelliger Betrag. Die Trennstriche gibt es erst ab `sm`: in einem
 * Raster mit zwei Zeilen trennen sie nicht mehr, sie zerschneiden.
 */
export function MetricRow({ children }: { children: ReactNode }) {
  return (
    <div
      /*
        DREI KENNZAHLEN IN ZWEI SPALTEN LASSEN DIE DRITTE ALLEIN STEHEN — und
        das bleibt so. Gemeldet als „bricht komisch um"; nachgemessen ist es
        die einzige Anordnung, die trägt:

          DREI SPALTEN   Auf 375 px blieben je Kennzahl rund 105 px, und
                         „€ 22 104,60" braucht gemessen gut 110. Die Zahl
                         würde abgeschnitten — schlimmer als eine tiefstehende.
          COL-SPAN       Die letzte Kennzahl über beide Spalten zu ziehen war
                         der erste Versuch. Am Bildschirm ändert das NICHTS:
                         der Inhalt steht links, die gewonnene Breite bleibt
                         leer. Eine Klasse, die nichts tut, aber etwas
                         behauptet, ist schlimmer als keine.

        Was wirklich hilft, wäre eine andere Darstellung (Beschriftung links,
        Wert rechts, untereinander) — und das ist ein Umbau einer Leiste, die
        am 16.09. gerade erst ausgerichtet wurde. Nicht für diesen Anlass.
      */
      className={`grid grid-cols-2 gap-x-4 gap-y-3 sm:flex sm:items-stretch sm:gap-0 sm:divide-x sm:divide-line ${GUTER_RAND}`}
    >
      {children}
    </div>
  );
}

export default function Metric({ label, value, hint, tone = 'default', to }: MetricProps) {
  // min-w-0 ist hier entscheidend: ohne das weigert sich die Spalte zu
  // schrumpfen, und eine lange Zahl schiebt die Nachbarn aus der Reihe.
  const rahmen = 'min-w-0 sm:flex-1 sm:px-3 sm:first:pl-0 sm:last:pr-0';
  const inhalt = (
    <>
      <p className="section-label truncate">
        {label}
        {/* Das Zeichen sagt, dass es weitergeht — ohne Rahmen um die Zahl. */}
        {to && <span aria-hidden="true"> ›</span>}
      </p>
      {/* `font-bold` und nicht `font-extrabold`: von Poppins sind 400 bis 700
          geladen, und 800 rendert nachgemessen identisch zu 700. Das Wort
          „extrabold" versprach eine Stufe, die es in dieser App nicht gibt. */}
      {/*
        DREI STUFEN STATT ZWEI. Zwischen `sm` und `lg` steht die Leiste neben
        der 259 px breiten Seitenleiste und hat je Kennzahl nur rund 180 Pixel
        — „€ 22 104,60" bei 1,75 rem braucht 190 und wurde dort abgeschnitten.
        Mit 1,375 rem in der Mitte passt es, und am Schreibtisch bleibt die
        grosse Zahl gross.
      */}
      <p className={`mt-1 truncate text-lg font-bold sm:text-xl lg:text-2xl ${valueTone[tone]}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs leading-snug text-ink-muted">{hint}</p>}
    </>
  );
  if (to) {
    return (
      <Link
        to={to}
        className={`${rahmen} block rounded-sm hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand`}
      >
        {inhalt}
      </Link>
    );
  }
  return <div className={rahmen}>{inhalt}</div>;
}
