import { kundenAbgeschnitten } from '@/lib/listengrenzen';
import Meldung from './Meldung';

/**
 * Der Hinweis unter einem Auswahlfeld, dessen Liste an ihrer Grenze endet.
 *
 * WARUM AUSGERECHNET HIER. Eine Liste, die abschneidet, sagt es inzwischen
 * überall — nur ein AUSWAHLFELD kann es nicht: es sieht vollständig aus, egal
 * wie viel fehlt. Das ist die unangenehmste Form einer Grenze. Wer seinen
 * Kunden nicht findet, legt die Baustelle ohne Kunden an oder tippt den Namen
 * von Hand ein; genau die Dublette, gegen die die Kundenstammdaten
 * eingeführt wurden.
 *
 * VIER MASKEN bieten Kunden zur Auswahl an — Baustelle, Angebot, Wartung,
 * Rechnung. Ein Satz an vier Stellen wäre viermal derselbe Satz und dreimal
 * die Gelegenheit, ihn beim Ändern zu vergessen.
 */
export default function KundenGrenze({ kunden }: { kunden: readonly unknown[] }) {
  if (!kundenAbgeschnitten(kunden)) return null;
  return (
    <div className="mt-1">
      <Meldung ton="warnung">
        Es werden nur die ersten {kunden.length} Kunden angeboten. Fehlt einer, ist er unter
        „Kunden" zu finden — dort lässt sich auch nachladen.
      </Meldung>
    </div>
  );
}
