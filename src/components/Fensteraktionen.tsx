import type { ReactElement } from 'react';
import RowMenu, { type RowMenuItem } from './RowMenu';

/**
 * DIE KNÖPFE EINES FENSTERS (U4, Durchsicht 15.11.2026): eine gefüllte
 * Hauptaktion, höchstens eine zweite, alles Weitere im ⋯.
 *
 * Vorher standen in Fenstern bis zu fünf Knöpfe gleich laut in drei Zeilen
 * (Rechnung: Zahlung, Mahnen, PDF, Per Mail, Stornieren) oder drei gleich
 * gerahmte nebeneinander (Schein-Entwurf: PDF · Verwerfen · Weiterbearbeiten)
 * mit „Löschen“ darunter. Was der nächste Schritt ist, sagte keiner.
 *
 * - `haupt`: der eine gefüllte Knopf, rechts — am Handy dort, wo der Daumen ist.
 * - `zweit`: höchstens eine Nebenhandlung, gerahmt, links daneben.
 * - `weitere`: alles Übrige im ⋯ ganz links. UNUMKEHRBARES STEHT IMMER DORT
 *   (`danger`), nie als Knopf neben dem nächsten Schritt — ein Fehlgriff auf
 *   „Löschen“ statt „Weiterbearbeiten“ kostet einen Beleg.
 *
 * Die Wächter in `tests/unit/bedienregeln.test.ts` halten die Regel auch an
 * Stellen, die diesen Baustein (noch) nicht nehmen: keine Knopfreihe mit mehr
 * als zwei Knöpfen, mehr als einer Hauptaktion oder einem Gefahrknopf.
 */
export default function Fensteraktionen({ haupt, zweit, weitere = [], about }: {
  haupt?: ReactElement | false | null;
  zweit?: ReactElement | false | null;
  weitere?: RowMenuItem[];
  /** Wessen Aktionen — für die Vorlesehilfe des ⋯ („Rechnung RE-2026-0012“). */
  about: string;
}) {
  if (!haupt && !zweit && weitere.length === 0) return null;
  return (
    <div className="fuss-aktionen fensteraktionen">
      {weitere.length > 0 && <span className="fensteraktionen-mehr"><RowMenu about={about} items={weitere} /></span>}
      {zweit || null}
      {haupt || null}
    </div>
  );
}
