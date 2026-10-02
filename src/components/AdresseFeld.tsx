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
 *
 * UND ES ERKENNT DIE VERMISCHUNG (Nachtest 01.10.2026, G3): auf manchem
 * Telefon greift das Markieren nicht, der Cursor steht vorn, und die
 * getippte Adresse landet VOR dem Vorschlag — „Alois-Köberl-Gasse 11KI-
 * Teststraße 1, 8200 Gleisdorf“. Steht der Vorschlag im Feld, aber nicht
 * allein, fragt das Feld, welche der beiden gemeint ist.
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
  const v = vorschlag?.trim() ?? '';
  const vermischt = !!v && value.trim() !== v && value.includes(v);
  const getippt = vermischt ? value.replace(v, '').replace(/^[\s,;]+|[\s,;]+$/g, '') : '';
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
      {vermischt && (
        <div role="status" className="mt-1 text-sm text-warning">
          <p>Hier stehen zwei Adressen ineinander — die des Kunden und eine getippte. Welche gilt?</p>
          <div className="mt-1 flex flex-wrap gap-x-4">
            {getippt && (
              <button type="button" className="link-hinweis-weiter min-h-touch" onClick={() => onChange(getippt)}>
                {getippt}
              </button>
            )}
            <button type="button" className="link-hinweis-weiter min-h-touch" onClick={() => onChange(v)}>
              {v}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
