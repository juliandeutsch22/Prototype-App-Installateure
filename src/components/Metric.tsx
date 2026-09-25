import { Children, Fragment, type ReactNode } from 'react';
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


const wertKlasse: Record<Tone, string> = {
  default: 'kennzahl-wert',
  success: 'kennzahl-wert-gut',
  danger: 'kennzahl-wert-gefahr',
  warning: 'kennzahl-wert-warnung',
  brand: 'kennzahl-wert-marke',
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
 * Karte fast die ganze Breite einnimmt, umso mehr. `.kennzahlen` trägt
 * dasselbe Maß wie `.karte-inhalt` (index.css), und
 * `tests/components/Metric.test.tsx` hält die beiden zusammen.
 *
 * SEIT DER LINIE (docs/design/linie.md) WIEDER EINE KARTE — aber EINE für
 * die ganze Leiste, nicht eine je Zahl: auf dem Grund steht nichts frei,
 * Zahlen stehen in einer weißen Fläche. Fläche, Rundung und Schatten wie
 * `.karte`, der Innenabstand wie `.karte-inhalt`; Reihe, Trennstriche und
 * die zwei Spalten am Telefon bleiben. Deshalb gehört die Leiste NICHT in
 * eine Karte — dort stünde eine Karte in der Karte.
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
      className="kennzahlen"
    >
      {/*
        DIE TRENNLINIE IST EIN EIGENES ELEMENT, kein „jede außer der ersten“.
        Positionsabhängige Selektoren (`divide-x`, `first:pl-0`) hängen das
        Aussehen einer Kennzahl an ihre Stelle in der Leiste; hier setzt die
        Leiste die Linie selbst zwischen zwei Kennzahlen. `Children.toArray`
        lässt ausgeblendete (`false`, `null`) weg — sonst stünde eine Linie
        vor einer Kennzahl, die gar nicht da ist.
      */}
      {Children.toArray(children).map((kind, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="kennzahl-trenner" aria-hidden="true" />}
          {kind}
        </Fragment>
      ))}
    </div>
  );
}

export default function Metric({ label, value, hint, tone = 'default', to }: MetricProps) {
  // `min-width: 0` in `.kennzahl` ist hier entscheidend: ohne das weigert
  // sich die Spalte zu schrumpfen, und eine lange Zahl schiebt die Nachbarn
  // aus der Reihe.
  const inhalt = (
    <>
      <p className="kennzahl-name">
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
      <p className={wertKlasse[tone]}>
        {value}
      </p>
      {hint && <p className="kennzahl-hinweis">{hint}</p>}
    </>
  );
  if (to) {
    return (
      <Link to={to} className="kennzahl-link">
        {inhalt}
      </Link>
    );
  }
  return <div className="kennzahl">{inhalt}</div>;
}
