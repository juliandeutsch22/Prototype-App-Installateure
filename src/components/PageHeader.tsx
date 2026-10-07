import type { ReactNode } from 'react';
import { SeitenHilfeKnopf } from './SeitenHilfe';

/**
 * DER SEITENKOPF DER LINIE „LOT“ (Regel 2): überall gleich gebaut.
 *
 *   Ortszeile   klein und grau über dem Titel (wo bin ich, welcher Tag)
 *   Titel       26 px am Tablet und Schreibtisch, 22 px am Handy, halbfett
 *   Meta        eine Zeile darunter
 *   rechts      „Hilfe zu dieser Seite“, das ⋯ der Seite, die Hauptaktion
 *
 * AM HANDY GEHT DIE HAUPTAKTION IN DEN DAUMENBEREICH: eine feste Leiste über
 * der unteren Navigation (`.daumen`). Oben rechts wäre sie mit einer Hand
 * nicht zu erreichen. Der Inhalt bekommt dafür unten Platz (`.inhalt:has(.daumen)`),
 * damit die Leiste kein Feld verdeckt.
 */
export default function PageHeader({
  title,
  subtitle,
  ort,
  action,
  mehr,
  hilfe,
}: {
  title: string;
  subtitle?: ReactNode;
  /** Ortszeile über dem Titel. */
  ort?: ReactNode;
  /** Die Hauptaktion der Seite — am Handy im Daumenbereich. */
  action?: ReactNode;
  /** Das ⋯-Menü der Seite (ein `RowMenu`); das einzige ⋯ im Seitenkopf. */
  mehr?: ReactNode;
  /** Einleitung für „Hilfe zu dieser Seite“, vor den gesammelten Erklärungen. */
  hilfe?: ReactNode;
}) {
  return (
    <div className="seitenkopf">
      <div className="min-w-0">
        {ort && <p className="seitenkopf-ort">{ort}</p>}
        <h1>{title}</h1>
        {subtitle && <div className="seitenkopf-meta">{subtitle}</div>}
      </div>
      <div className="seitenkopf-rechts">
        <SeitenHilfeKnopf seite={title} einleitung={hilfe} />
        {mehr}
        {action && <div className="daumen">{action}</div>}
      </div>
    </div>
  );
}
