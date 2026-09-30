import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { InputField } from './Field';
import { leseZahl, zahlAlsText } from '@/lib/zahl';

type Basis = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'inputMode'>;

/**
 * EIN FELD FÜR BETRÄGE UND MENGEN (Testbericht 30.09.2026, M15).
 *
 * Text statt `type="number"`: ein Zahlenfeld des Browsers liefert bei
 * „7.500,50“ einen leeren Wert, und daraus wurde 0 — still. Hier bleibt der
 * Text, wie er getippt wurde, gelesen wird mit `leseZahl`, und was sich nicht
 * eindeutig lesen lässt, steht unter dem Feld. Gemeldet wird nach dem
 * Verlassen des Feldes, nicht bei jedem Tastendruck — „7.“ ist auf dem Weg
 * zu „7.500,50“ kein Fehler.
 *
 * Der Wert bleibt TEXT beim Aufrufer; zur Zahl wird er beim Speichern mit
 * `leseZahl`/`zahlOder`. So geht keine Eingabe verloren, die noch nicht fertig ist.
 */
export default function ZahlFeld({
  id,
  label,
  value,
  onChange,
  pflicht,
  negativ,
  ...rest
}: Basis & {
  id: string;
  label: string;
  value: string | number;
  onChange: (text: string) => void;
  pflicht?: boolean;
  /** Negative Werte zulassen (etwa eine Rückzahlung). */
  negativ?: boolean;
}) {
  const [verlassen, setVerlassen] = useState(false);
  const fehler = verlassen ? leseZahl(String(value ?? ''), { negativ }).fehler : null;
  return (
    <div>
      <InputField
        id={id}
        label={label}
        pflicht={pflicht}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={String(value ?? '')}
        data-zahl={negativ ? 'negativ' : ''}
        aria-invalid={fehler ? true : undefined}
        aria-describedby={fehler ? `${id}-fehler` : undefined}
        {...rest}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          setVerlassen(true);
          rest.onBlur?.(e);
        }}
      />
      {fehler && (
        <p id={`${id}-fehler`} className="mt-1 text-sm text-danger" aria-live="polite">
          {fehler}
        </p>
      )}
    </div>
  );
}

/**
 * Dasselbe ohne Beschriftung — für Tabellenzellen (Positionen), die ihre
 * Beschriftung über `aria-label` tragen.
 */
export function ZahlEingabe({
  value,
  onChange,
  negativ,
  className = '',
  ...rest
}: Basis & {
  value: string | number;
  onChange: (text: string) => void;
  negativ?: boolean;
}) {
  const [verlassen, setVerlassen] = useState(false);
  const fehler = verlassen ? leseZahl(String(value ?? ''), { negativ }).fehler : null;
  return (
    <>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={String(value ?? '')}
        data-zahl={negativ ? 'negativ' : ''}
        aria-invalid={fehler ? true : undefined}
        title={fehler ?? undefined}
        className={`${className} ${fehler ? 'border-danger' : ''}`}
        {...rest}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          setVerlassen(true);
          rest.onBlur?.(e);
        }}
      />
      {fehler && <span className="mt-1 block text-xs text-danger">{fehler}</span>}
    </>
  );
}

/**
 * Eine Tabellenzelle für eine Zahl, die der Aufrufer als ZAHL hält (etwa die
 * Positionen einer Rechnung). Der getippte Text bleibt hier stehen, bis er
 * lesbar ist; erst dann geht die Zahl hinaus. Ändert sich die Zahl von aussen
 * (Neuaufbau der Vorschau), folgt der Text.
 */
export function ZahlZelle({
  wert,
  onWert,
  negativ,
  ...rest
}: Basis & {
  wert: number;
  onWert: (n: number) => void;
  negativ?: boolean;
}) {
  const [text, setText] = useState(zahlAlsText(wert));
  useEffect(() => {
    if (leseZahl(text, { negativ }).wert !== wert) setText(zahlAlsText(wert));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wert]);
  return (
    <ZahlEingabe
      {...rest}
      negativ={negativ}
      value={text}
      onChange={(t) => {
        setText(t);
        const g = leseZahl(t, { negativ });
        if (g.fehler === null) onWert(g.wert ?? 0);
      }}
    />
  );
}

/**
 * Das beschriftete Feld für eine Zahl, die der Aufrufer als ZAHL hält (etwa
 * die Sätze eines Betriebs). Wie `ZahlZelle`: der Text bleibt stehen, bis er
 * lesbar ist — sonst würde aus „65,“ sofort „65“, und „65,5“ liesse sich
 * nicht tippen. Leer geht als `null` hinaus.
 */
export function ZahlWertFeld({
  id,
  label,
  wert,
  onWert,
  negativ,
  pflicht,
  leerAls = null,
  ...rest
}: Basis & {
  id: string;
  label: string;
  wert: number | null | undefined;
  onWert: (n: number | null) => void;
  negativ?: boolean;
  pflicht?: boolean;
  /**
   * Welche Zahl der Aufrufer aus einem leeren Feld macht (etwa 0 bei einer
   * Menge). Dann springt ein geleertes Feld nicht auf „0“ zurück, während
   * jemand noch tippt.
   */
  leerAls?: number | null;
}) {
  const [text, setText] = useState(zahlAlsText(wert ?? null));
  useEffect(() => {
    if ((leseZahl(text, { negativ }).wert ?? leerAls) !== (wert ?? null)) setText(zahlAlsText(wert ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wert]);
  return (
    <ZahlFeld
      {...rest}
      id={id}
      label={label}
      pflicht={pflicht}
      negativ={negativ}
      value={text}
      onChange={(t) => {
        setText(t);
        const g = leseZahl(t, { negativ });
        if (g.fehler === null) onWert(g.wert);
      }}
    />
  );
}
