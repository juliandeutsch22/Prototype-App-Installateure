import type { ReactNode } from 'react';

type Ton = 'neutral' | 'warnung' | 'info' | 'gefahr' | 'gut';

const KLASSE: Record<Ton, string> = {
  neutral: 'meldung',
  warnung: 'meldung-warnung',
  info: 'meldung-info',
  gefahr: 'meldung-gefahr',
  gut: 'meldung-gut',
};

/**
 * Ein Hinweis im Fluss der Seite — ruhiger Kasten, die Farbe trägt die Schrift.
 *
 * Bis zum 25.09.2026 stand dieses Muster in rund vierzig Abschriften
 * (`rounded border border-line bg-surface-2 px-3 py-2 text-sm text-warning`
 * und Geschwister). Jetzt steht es einmal, in `.meldung*` (index.css).
 *
 * `role` reicht die Aufrufstelle durch: eine Warnung, die gerade entsteht,
 * ist `alert`; ein stehender Hinweis braucht keine Rolle.
 */
export default function Meldung({
  ton = 'neutral',
  titel,
  role,
  id,
  children,
}: {
  ton?: Ton;
  titel?: ReactNode;
  role?: 'alert' | 'status';
  id?: string;
  children?: ReactNode;
}) {
  return (
    <div className={KLASSE[ton]} role={role} id={id}>
      {titel && <p className="meldung-titel">{titel}</p>}
      {children}
    </div>
  );
}
