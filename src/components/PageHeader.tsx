import type { ReactNode } from 'react';
import { useInRouterContext, useLocation } from 'react-router-dom';
import { SeitenHilfeKnopf } from './SeitenHilfe';
import { gruppeVon } from '@/app/navigation';

/**
 * DER SEITENKOPF DER LINIE „LOT“ (Regel 2): überall gleich gebaut.
 *
 *   Ortszeile   klein und grau über dem Titel (wo bin ich, welcher Tag);
 *               ohne Angabe die Gruppe aus dem Menü („Aufträge“, „Geld“ …)
 *   Titel       30 px am Tablet und Schreibtisch, 24 px am Handy, halbfett
 *   Meta        eine Zeile darunter
 *   Stand       die Kennzahlen der Seite als ruhige Zeile (E24)
 *   rechts      „Hilfe zu dieser Seite“, das ⋯ der Seite, die Hauptaktion
 *
 * AM HANDY GEHT DIE HAUPTAKTION IN DEN DAUMENBEREICH: eine feste Leiste über
 * der unteren Navigation (`.daumen`). Oben rechts wäre sie mit einer Hand
 * nicht zu erreichen. Der Inhalt bekommt dafür unten Platz (`.inhalt:has(.daumen)`),
 * damit die Leiste kein Feld verdeckt.
 *
 * DER STAND GEHÖRT ZUM KOPF (E24, 25.10.2026). Als eigener Streifen zwischen
 * zwei Linien stand er zwischen Kopf und Arbeit und machte aus einem Block
 * drei. Im Kopf liest er sich wie der Kopf eines Dokuments: was die Seite
 * ist, und wie sie gerade steht.
 */
export default function PageHeader({
  title,
  subtitle,
  ort,
  action,
  mehr,
  hilfe,
  stand,
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
  /** Der Stand der Seite — eine `MetricRow` (oder ihr Platzhalter). */
  stand?: ReactNode;
}) {
  const imRouter = useInRouterContext();
  return (
    <div className="seitenkopf">
      <div className="min-w-0">
        {ort ? <p className="seitenkopf-ort">{ort}</p> : imRouter ? <OrtAusDemMenue /> : null}
        <h1>{title}</h1>
        {subtitle && <div className="seitenkopf-meta">{subtitle}</div>}
        {stand && <div className="seitenkopf-stand">{stand}</div>}
      </div>
      <div className="seitenkopf-rechts">
        <SeitenHilfeKnopf seite={title} einleitung={hilfe} />
        {mehr}
        {action && <div className="daumen">{action}</div>}
      </div>
    </div>
  );
}

/*
  DIESELBE ORTSZEILE AUF JEDER SEITE (Design-Entwurf, Punkt 1). Vorher
  trugen manche Seiten sie („Geld“, „Team“), andere nicht — der Kopf sah
  von Seite zu Seite anders aus. Wo eine Seite nichts Eigenes sagt (eine
  Akte ihren Typ, ein Rückweg), steht die Gruppe aus dem Menü.
*/
function OrtAusDemMenue() {
  const gruppe = gruppeVon(useLocation().pathname);
  return gruppe ? <p className="seitenkopf-ort">{gruppe}</p> : null;
}
