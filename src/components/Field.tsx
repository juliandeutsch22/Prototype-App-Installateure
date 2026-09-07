import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';

const fieldBase =
  'min-h-touch rounded border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-muted focus:border-brand focus:ring-1 focus:ring-brand';

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
    <span className="flex items-baseline gap-1">
      <label htmlFor={id} className="text-sm font-medium text-ink">
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
        <span aria-hidden="true" className="text-danger">
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
      <span aria-hidden="true" className="text-danger">
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
    <div className="flex flex-col gap-1">
      <Beschriftung label={label} pflicht={pflicht} id={id} />
      <input
        id={id}
        aria-required={pflicht || undefined}
        className={`${fieldBase} ${className}`}
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
    <div className="flex flex-col gap-1">
      {label && <Beschriftung label={label} pflicht={pflicht} id={id} />}
      <select
        id={id}
        aria-required={pflicht || undefined}
        className={`${fieldBase} ${className}`}
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

/** Checkbox mit großem Touch-Ziel und einheitlichem Label. */
export function CheckboxField({ label, id, className = '', ...rest }: CheckboxFieldProps) {
  return (
    <label htmlFor={id} className="flex min-h-touch cursor-pointer items-center gap-3 text-base text-ink">
      <input id={id} type="checkbox" className={`h-5 w-5 rounded border-line accent-brand focus:ring-brand ${className}`} {...rest} />
      {label}
    </label>
  );
}

/** Responsives Formular-Raster: 1 Spalte mobil, mehrspaltig ab sm. */
export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  const map = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3' };
  return <div className={`grid grid-cols-1 gap-4 ${map[cols]}`}>{children}</div>;
}
