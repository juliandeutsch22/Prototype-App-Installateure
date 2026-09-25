import type { ReactNode } from 'react';

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
  return (
    <div className="seitenkopf">
      <div>
        {ueber && <p className="seitenkopf-ueber">{ueber}</p>}
        <h1 className="seitentitel">{title}</h1>
        {subtitle && <p className="seitenkopf-unter">{subtitle}</p>}
      </div>
      {action && <div className="seitenkopf-aktion">{action}</div>}
    </div>
  );
}
