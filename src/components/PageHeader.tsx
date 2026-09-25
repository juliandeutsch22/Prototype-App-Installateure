import { useContext, useLayoutEffect, type ReactNode } from 'react';
import { UnterreiterKontext } from './unterreiterKontext';

/**
 * Einheitlicher Seitenkopf nach der Linie (docs/design/linie.md, 1): eine
 * kleine Zeile darüber (`ueber` — Datum · KW oder der Weg zurück), der Titel
 * groß und kräftig, darunter die gedämpfte Metazeile (`subtitle`). Rechts
 * wahlweise die Hauptaktion der Seite.
 *
 * Der kurze Strich unter dem Titel ist entfallen: der Entwurf trägt den
 * Titel über Größe und Stärke, und ein Schmuckstrich auf jeder Seite war
 * genau die Art Zierde, die die Linie weglässt.
 *
 * Das Aussehen steht in `.seitenkopf` und Geschwistern (index.css, am Ende)
 * — je Element eine Klasse.
 */
export default function PageHeader({
  title,
  subtitle,
  action,
  ueber,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  ueber?: ReactNode;
}) {
  // Unter einem Reiter mit Unterseiten (Einstellungen, Einsatzplanung) steht
  // die Leiste der Bereiche direkt unter diesem Kopf (siehe Unterreiter.tsx).
  const unterreiter = useContext(UnterreiterKontext);
  const anmelden = unterreiter?.anmelden;
  useLayoutEffect(() => anmelden?.(), [anmelden]);

  return (
    <>
      <div className="seitenkopf">
        <div>
          {ueber && <p className="seitenkopf-ueber">{ueber}</p>}
          <h1 className="seitentitel">{title}</h1>
          {subtitle && <p className="seitenkopf-unter">{subtitle}</p>}
        </div>
        {action && <div className="seitenkopf-aktion">{action}</div>}
      </div>
      {unterreiter?.leiste}
    </>
  );
}
