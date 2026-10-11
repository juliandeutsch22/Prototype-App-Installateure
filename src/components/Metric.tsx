import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Wert } from './Wert';

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
  /**
   * Ist die Grundlage der Zahl ganz geladen? Ohne steht ein Platzhalter in
   * Zeilenhöhe statt eines Werts, der nur so aussieht wie einer (Analyse
   * 10.10.2026). Fehlt die Angabe, gilt die Zahl als fertig.
   */
  bereit?: boolean;
  /**
   * Die Form des Zusatzes, solange er lädt. Ein Zusatz, der am Telefon auf
   * zwei Zeilen bricht, braucht einen Platzhalter, der es auch tut — sonst
   * schiebt er beim Eintreffen alles darunter um eine Zeile (Zeiterfassung,
   * Messung 11.10.2026).
   */
  zusatzMuster?: string;
}

/**
 * Die seitliche Polsterung des Kartenkörpers (`Card`), an der die
 * Kennzahlen fluchten.
 *
 * SIE STEHT HIER ALS EIN WERT, damit es nicht zwei gibt. Die Leiste ist seit
 * der Designlinie „Fassung 3" ein eigener Kasten mit Rand; ihre Kante fluchtet
 * mit der Kante der Karte darunter, die Polsterung jeder Kennzahl
 * (`.kennzahl`, 1 rem in index.css) mit deren Körper (`px-4`). Weicht eines
 * davon ab, versetzen sich die Beschriftungen gegen alles darunter —
 * `tests/components/Metric.test.tsx` hält die beiden zusammen.
 */
export const GUTER_RAND = 'px-4';

/*
 * DIE FARBE DES WERTS. Die Linie ist ruhig: Zahlen stehen in Tinte, rot nur
 * „Überfällig" (`danger`). `warning` bleibt, weil dahinter eine Tatsache
 * steht, die jemand ansehen muss (knapper Bestand, negativer Resturlaub).
 * `success` und `brand` färbten gute Nachrichten ein — eine grüne 24 neben
 * einer schwarzen 10 sagt nichts, was die Beschriftung nicht sagt.
 */
const valueTone: Record<Tone, string> = {
  default: '',
  success: '',
  danger: 'text-danger',
  warning: 'text-warning',
  brand: '',
};

/**
 * Kennzahlen-Leiste am Kopf einer Ansicht (Designlinie „Fassung 3",
 * `.kennzahlen`): EINE Leiste mit Rand und Trennlinien, keine Einzelkacheln.
 *
 * Am Telefon zwei Spalten, ab 1024 px vier. EIN ABGESCHNITTENER BETRAG IST
 * NICHT UNSCHÖN, ER IST FALSCH — drei Spalten auf 375 px liessen je Zahl
 * rund 105 px, und „€ 22 104,60" braucht gut 110. Zwei Spalten geben jeder
 * Zahl die Hälfte der Breite.
 *
 * In einer Karte ist die Leiste kein zweiter Kasten, sondern eine Reihe mit
 * Trennstrichen (index.css, `.karte-koerper > .kennzahlen`).
 */
export function MetricRow({ children }: { children: ReactNode }) {
  return <div className="kennzahlen">{children}</div>;
}

export default function Metric({ label, value, hint, tone = 'default', to, bereit, zusatzMuster = 'auf die 00 zuletzt' }: MetricProps) {
  // Ohne Angabe bleibt die Kennzahl, wie sie war — kein Rahmen, kein Einblenden.
  const mitLaden = bereit !== undefined;
  const fertig = bereit ?? true;
  const inhalt = (
    <>
      <p className="kennzahl-name truncate">
        {label}
        {/* Das Zeichen sagt, dass es weitergeht — ohne Rahmen um die Zahl. */}
        {to && <span aria-hidden="true"> ›</span>}
      </p>
      {/* 600 und nie fett: die Zahl steht über allem anderen in der Leiste
          durch ihre Grösse, nicht durch ihr Gewicht (Linie § 5). */}
      <p className={`kennzahl-wert ${fertig ? valueTone[tone] : ''}`}>
        {mitLaden ? <Wert bereit={fertig} muster="€ 00 000,00">{value}</Wert> : value}
      </p>
      {/* Der Zusatz rechnet aus derselben Grundlage — bis dahin ein Platzhalter in seiner Zeile. */}
      {hint && (
        <p className="kennzahl-zusatz leading-snug">
          {mitLaden ? <Wert bereit={fertig} muster={zusatzMuster}>{hint}</Wert> : hint}
        </p>
      )}
    </>
  );
  if (to) {
    return (
      <Link
        to={to}
        className="kennzahl block hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
      >
        {inhalt}
      </Link>
    );
  }
  return <div className="kennzahl">{inhalt}</div>;
}
