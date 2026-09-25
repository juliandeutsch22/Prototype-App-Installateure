import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';

/*
 * DAS AUSSEHEN STEHT IN `.feld` (index.css, „Gemeinsame Bausteine“) — eine
 * Klasse für Eingabe und Auswahl. Was darin steht und warum:
 *
 * `max-width: 100%` UND `min-width: 0` GEHOEREN ZUR GRUNDAUSSTATTUNG.
 *
 * Die Breite eines `<select>` richtet sich nach seiner LAENGSTEN OPTION. In
 * der Einsatzplanung steht dort „Wohnungseigentümergemeinschaft Hauptstraße
 * 112–118 (B-2026-0147)" — das Feld wurde damit breiter als das Telefon, zog
 * die Karte mit auf und schob gemessen 195 Pixel aus dem Bild. Ein globaler
 * Wortumbruch hilft dagegen NICHT: Optionen brechen nicht um.
 *
 * `max-w-full` deckelt das Feld auf die Breite seines Behaelters, ohne es wie
 * `w-full` zu zwingen, ihn auszufuellen — das haette die Felder gesprengt, die
 * absichtlich schmal in einer Kartenkopfzeile stehen. `min-w-0` erlaubt
 * zusaetzlich das Schrumpfen, wo ein Feld in einer Flex-Zeile sitzt.
 */
const FELD = 'feld';

/**
 * Pflichtfelder kennzeichnen — der Stern und was daran hängt.
 *
 * WOZU. Aus dem Betrieb: „bei allen Eingaben sollten Pflichtfelder
 * gekennzeichnet werden." Vorher erfuhr man erst nach dem Absenden, dass
 * etwas fehlt — bei einem Formular mit acht Feldern heisst das: ausfüllen,
 * abschicken, Fehlermeldung lesen, suchen. Der Stern beantwortet die Frage
 * vorher.
 *
 * DER STERN IST NICHT DIE GANZE KENNZEICHNUNG. Er ist Farbe und Form, also
 * für einen Vorleser nichts. Die zweite Hälfte steht am Feld selbst:
 * `aria-required`, das jede Sprachausgabe als „Pflichtfeld" ansagt.
 *
 * ER STEHT AUSDRÜCKLICH NICHT IM ZUGÄNGLICHEN NAMEN. Ein zusätzliches
 * „(Pflichtfeld)" im Label wäre naheliegend und doppelt gemoppelt: die
 * Ansage käme zweimal, und der Name des Feldes hiesse nicht mehr „Von",
 * sondern „Von (Pflichtfeld)" — womit jeder Verweis darauf, in der App wie im
 * Test, eine Zeichenkette suchen müsste, die nichts benennt.
 *
 * DER STERN DARF NICHT LÜGEN. Er gehört an genau die Felder, deren Fehlen das
 * Formular tatsächlich zurückweist — ein Stern an einem Feld, das man leer
 * lassen kann, ist genauso irreführend wie ein fehlender an einem, das man
 * nicht leer lassen darf. Deshalb wird `required` NICHT mitgesetzt: die
 * Prüfung des Browsers käme mit eigenen Meldungen in einer anderen Sprache
 * und einer anderen Reihenfolge als die der App.
 */
function Beschriftung({ label, pflicht, id }: { label: string; pflicht?: boolean; id: string }) {
  return (
    <span className="feld-beschriftung">
      <label htmlFor={id} className="feld-name">
        {label}
      </label>
      {/*
        DER STERN STEHT NEBEN DEM LABEL, NICHT DARIN.

        Im Label wäre er Teil von dessen Text — das Feld hiesse dann „Von *"
        statt „Von". Für den Vorleser fängt `aria-hidden` das ab, für alles
        andere nicht: jede Suche nach der Beschriftung, in der App wie im
        Test, müsste ab dann den Stern mitraten. Fünfzehn bestehende Tests
        haben genau das gemeldet, als er noch drinstand.
      */}
      {pflicht && (
        <span aria-hidden="true" className="feld-pflicht">
          *
        </span>
      )}
    </span>
  );
}

/**
 * Die Erklärung des Sterns, einmal je Formular.
 *
 * Ein Zeichen, das nirgends erklärt wird, ist eine Vermutung. Steht unter dem
 * Formular, nicht darüber: wer ausfüllt, liest von oben nach unten und
 * braucht die Erklärung erst, wenn ihm der Stern zum ersten Mal begegnet ist.
 */
export function Pflichthinweis() {
  return (
    <p className="text-sm text-ink-muted">
      <span aria-hidden="true" className="feld-pflicht">
        *
      </span>{' '}
      Pflichtfeld
    </p>
  );
}

interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
  /** Ohne dieses Feld weist das Formular ab — sichtbar als Stern. */
  pflicht?: boolean;
}

/** Beschriftetes Eingabefeld — Label ist Pflicht (Barrierearmut). */
export function InputField({ label, id, pflicht, className = '', ...rest }: InputFieldProps) {
  return (
    <div className="feld-block">
      <Beschriftung label={label} pflicht={pflicht} id={id} />
      <input
        id={id}
        aria-required={pflicht || undefined}
        className={className ? `${FELD} ${className}` : FELD}
        {...rest}
      />
    </div>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  id: string;
  /** Ohne eine Wahl weist das Formular ab — sichtbar als Stern. */
  pflicht?: boolean;
  children: ReactNode;
}

export function SelectField({
  label,
  id,
  pflicht,
  className = '',
  children,
  ...rest
}: SelectFieldProps) {
  return (
    <div className="feld-block">
      {label && <Beschriftung label={label} pflicht={pflicht} id={id} />}
      <select
        id={id}
        aria-required={pflicht || undefined}
        className={className ? `${FELD} ${className}` : FELD}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
}

interface CheckboxFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  id: string;
}

/**
 * Checkbox mit großem Touch-Ziel und einheitlichem Label.
 *
 * Das Aussehen steckt in `.kaestchen` (index.css) und nicht hier: es gibt
 * sieben weitere Kästchen in der App, die nicht durch diesen Baustein laufen
 * — eine Klasse ist die einzige Fassung, die alle acht gleich hält.
 */
export function CheckboxField({ label, id, className = '', ...rest }: CheckboxFieldProps) {
  return (
    <label htmlFor={id} className="kaestchen-zeile">
      <input id={id} type="checkbox" className={className ? `kaestchen ${className}` : 'kaestchen'} {...rest} />
      {label}
    </label>
  );
}

/*
 * WÖRTLICH AUSGESCHRIEBEN, nicht `feldraster-${cols}`: Tailwind behält aus
 * `@layer components` nur Klassen, die im Quelltext als ganzes Wort stehen —
 * eine zusammengesetzte fehlte im Stylesheet, und das Raster fiel auf eine
 * Spalte zurück.
 */
const RASTER = { 1: 'feldraster-1', 2: 'feldraster-2', 3: 'feldraster-3' } as const;

/** Responsives Formular-Raster: 1 Spalte mobil, mehrspaltig ab sm. */
export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  return <div className={RASTER[cols]}>{children}</div>;
}
