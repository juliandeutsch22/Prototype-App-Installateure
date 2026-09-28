import type { ReactNode } from 'react';
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
 */
export default function Hinweiszeile({
  stufe,
  children,
  role,
}: {
  stufe?: 'warn' | 'fehl';
  children: ReactNode;
  /** Für Meldungen, die sich einstellen, während man auf der Seite ist. */
  role?: 'status' | 'alert';
}) {
  return (
    <div className={`hinweiszeile ${stufe ? `hinweiszeile-${stufe}` : ''}`} role={role}>
      <Icon name={stufe ? 'warnung' : 'hinweis'} size={16} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
