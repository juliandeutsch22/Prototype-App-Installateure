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
   * Wohin ein Tipp auf den Eintrag führt. Eine Zahl, hinter der Arbeit steht
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
  /**
   * Nur ab dem Tablet (E86): am Handy steht dieselbe Zahl schon an anderer
   * Stelle der Seite (etwa als Zähler über der Liste) und wäre doppelt.
   */
  nurBreit?: boolean;
}

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
  danger: 'lage-wert-rot',
  warning: 'lage-wert-warn',
  brand: '',
};

/**
 * DER STAND EINER SEITE (E22 Startseite, E23 alle Seiten, E24 im Seitenkopf).
 *
 * Bis zum 25.10.2026 eine Leiste großer Kacheln über der Liste, dann eine
 * Zeile zwischen zwei Linien. Jetzt steht er im Seitenkopf (`PageHeader`,
 * `stand`) als ruhige Zeile — dieselben Zahlen, dieselben Ziele. Wo eine
 * Karte ein Ergebnis zählt (Probelauf eines Imports), steht dieselbe Zeile
 * in der Karte. Gestaltung in `lot.css` (`.lage-*`).
 *
 * DER ZUSATZ IST FÜR WAS SICH ÄNDERT: wie viele Rechnungen, seit wann
 * unvollständig, was nicht geladen werden konnte. Was nur erklärt, was die
 * Zahl bedeutet, steht in der Hilfe der Seite — dauerhaft auf der Seite
 * machte es den Kopf zu einem Absatz.
 */
/**
 * IST DER WERT NULL? (D1, E86) Am Handy steht der Stand als schmale Zeile;
 * dort treten Nullen zurück, damit das, was zählt, auffällt. Eine Ziffer
 * muss dabei sein: „—“ heißt „nichts festgelegt“, nicht null.
 */
function istNullWert(value: ReactNode): boolean {
  if (typeof value === 'number') return value === 0;
  if (typeof value !== 'string') return false;
  return /\d/.test(value) && !/[1-9]/.test(value);
}

export function MetricRow({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul className="lage-zeile" aria-label={label}>
      {children}
    </ul>
  );
}

export default function Metric({ label, value, hint, tone = 'default', to, bereit, zusatzMuster = 'auf die 00 zuletzt', nurBreit = false }: MetricProps) {
  // Ohne Angabe bleibt die Kennzahl, wie sie war — kein Platzhalter, kein Einblenden.
  const mitLaden = bereit !== undefined;
  const fertig = bereit ?? true;
  /*
    Die Leerzeichen zwischen den Teilen sind für Vorlesehilfe und Suche da:
    ohne sie hieße der Verweis „Offen€ 500,00“. Im Raster zeichnen sie nichts.
  */
  const inhalt = (
    <>
      <span className="lage-name">{label}</span>{' '}
      {/* Ein Wort ohne Ziffer („Pauschal“, „Aktiv“) ist nichts Gemessenes — im Schriftfeld nicht in Mono (Planlinie, E30). */}
      <span className={`lage-wert ${typeof value === 'string' && !/\d/.test(value) ? 'lage-wert-wort ' : ''}${fertig && istNullWert(value) ? 'lage-wert-null ' : ''}${fertig ? valueTone[tone] : ''}`}>
        {mitLaden ? <Wert bereit={fertig} muster="€ 00 000,00">{value}</Wert> : value}
      </span>
      {/* Der Zusatz rechnet aus derselben Grundlage — bis dahin ein Platzhalter in seiner Zeile. */}
      {hint && (
        <>
          {' '}
          <span className="lage-zusatz">
            {mitLaden ? <Wert bereit={fertig} muster={zusatzMuster}>{hint}</Wert> : hint}
          </span>
        </>
      )}
    </>
  );
  /*
    AM HANDY EINE RUHIGE LISTE (E86): was null ist oder noch lädt, steht dort
    nicht; was eine Warnung trägt, wird ein Hinweis. Die Klassen sagen es dem
    Stil — ab dem Tablet bleibt das Schriftfeld, wie es ist.
  */
  const klassen = ['lage-punkt'];
  if (!fertig) klassen.push('lage-punkt-laedt');
  else if (istNullWert(value)) klassen.push('lage-punkt-null');
  else if (tone === 'danger' || tone === 'warning') klassen.push('lage-punkt-achtung');
  if (nurBreit) klassen.push('lage-punkt-breit');
  return (
    <li className={klassen.join(' ')}>
      {to ? (
        <Link to={to} className="lage-eintrag">
          {inhalt}
        </Link>
      ) : (
        <div className="lage-eintrag">{inhalt}</div>
      )}
    </li>
  );
}
