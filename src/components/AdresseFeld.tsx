import { useRef } from 'react';
import { InputField } from './Field';

/**
 * EINE ADRESSE, DIE AUS DEM KUNDEN VORGESCHLAGEN WIRD (Testbericht
 * 30.09.2026, G3 und G5).
 *
 * Wer einen Kunden wählte, bekam dessen Anschrift ins Feld. Wer dann die
 * eigentliche Baustellenadresse tippte, hängte sie an — bei PR-2026-0004
 * standen so zwei Adressen ohne Trenner aneinander.
 *
 * Solange im Feld genau der Vorschlag steht, sagt es das und ERSETZT ihn beim
 * Tippen (der Text wird beim Hineinklicken markiert). Wer ihn übernehmen
 * will, lässt ihn einfach stehen.
 */
export default function AdresseFeld({
  id,
  label,
  value,
  onChange,
  vorschlag,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (text: string) => void;
  /** Die Anschrift des gewählten Kunden, falls es eine gibt. */
  vorschlag?: string | null;
}) {
  const ausVorschlag = !!vorschlag?.trim() && value === vorschlag;
  // Manche Browser heben die Markierung beim Loslassen der Maus wieder auf;
  // nach dem ersten Klick hält dieses Flag sie fest.
  const geradeMarkiert = useRef(false);
  return (
    <div>
      <InputField
        id={id}
        label={label}
        value={value}
        aria-describedby={ausVorschlag ? `${id}-vorschlag` : undefined}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => {
          if (!ausVorschlag) return;
          e.currentTarget.select();
          geradeMarkiert.current = true;
        }}
        onMouseUp={(e) => {
          if (geradeMarkiert.current) e.preventDefault();
          geradeMarkiert.current = false;
        }}
      />
      {ausVorschlag && (
        <p id={`${id}-vorschlag`} className="mt-1 text-sm text-ink-muted">
          Vom Kunden übernommen. Stimmt die Baustelle nicht damit überein, einfach
          überschreiben.
        </p>
      )}
    </div>
  );
}
