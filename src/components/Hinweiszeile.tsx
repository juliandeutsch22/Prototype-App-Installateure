import { useId, useState, type ReactNode } from 'react';
import Icon from './Icon';

/**
 * Ein Hinweis als ZEILE, nicht als Kasten (Designlinie „Fassung 3",
 * docs/design/linie.md § 7): Symbol, ein Satz, höchstens ein Link.
 *
 * Farbige Warnkarten standen gleich laut da wie der Inhalt, auf den sie
 * hinwiesen, und zwei davon übereinander machten die Seite unruhig. Die
 * Farbe steckt jetzt nur noch im Symbol; der Kern des Satzes steht halbfett
 * (`<b>`), der Rest gedämpft.
 *
 * `stufe` wählt das Symbol: Dreieck bei `warn` und `fehl`, Kreis mit „i"
 * sonst. Das Symbol ist Beiwerk (`aria-hidden` in `Icon`) — was es sagt,
 * muss im Satz stehen.
 *
 * EIN SATZ PLUS „ANZEIGEN“ (U9, Durchsicht 15.11.2026; Regel „eine Hilfe
 * pro Seite“). Lange Warntexte standen offen auf der Seite — „An 10 Tagen
 * steht dieselbe Buchung zweimal …“ samt aller Tage — und schoben die Arbeit
 * nach unten. Der Satz, der sagt, was los ist, steht da (`children`); was ihn
 * erklärt oder aufzählt, kommt mit `einzelheiten` erst auf „Anzeigen“. Die
 * Rolle (`alert`, `status`) gilt dem Satz; die Einzelheiten liest vor, wer
 * sie aufklappt. Der Wächter `tests/unit/warntextKurz.test.ts` findet lange
 * Warntexte ohne `einzelheiten`.
 */
export default function Hinweiszeile({
  stufe,
  children,
  role,
  einzelheiten,
}: {
  /**
   * Warum ein langer Warntext ganz offen bleibt — etwa ein Abgleich, dessen
   * Zahlen die Auskunft selbst sind. Wird nicht angezeigt; der Wächter
   * verlangt für einen langen Text ohne `einzelheiten` diesen Grund.
   */
  offenWeil?: string;
  stufe?: 'warn' | 'fehl';
  children: ReactNode;
  /** Für Meldungen, die sich einstellen, während man auf der Seite ist. */
  role?: 'status' | 'alert';
  /** Was den Satz erklärt oder aufzählt — erst auf „Anzeigen“. */
  einzelheiten?: ReactNode;
}) {
  const [offen, setOffen] = useState(false);
  const id = useId();
  return (
    <div className={`hinweiszeile ${stufe ? `hinweiszeile-${stufe}` : ''}`} role={role}>
      <Icon name={stufe ? 'warnung' : 'hinweis'} size={16} />
      <div className="min-w-0">
        {children}
        {einzelheiten && (
          <>
            <button
              type="button"
              className="link text-meta hinweiszeile-anzeigen"
              aria-expanded={offen}
              aria-controls={id}
              onClick={() => setOffen((o) => !o)}
            >
              {offen ? 'Ausblenden' : 'Anzeigen'}
            </button>
            {/* Im DOM, nur verborgen: `aria-controls` zeigt so immer auf etwas, und der Text bleibt für die Suche im Browser da. */}
            <div id={id} className="hinweiszeile-einzelheiten" hidden={!offen}>{einzelheiten}</div>
          </>
        )}
      </div>
    </div>
  );
}
