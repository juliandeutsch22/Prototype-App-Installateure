import type { Termin } from '@/types';
import { todayStr } from '@/lib/time';
import { datumAT } from '@/lib/datum';
import { artName, terminZeit } from '@/features/termine/terminText';
import Card from './Card';
import { TeilFehler } from './States';
import { AktenVerweis } from './AktenBereiche';

export interface AktenTerminStand { termine: Termin[] | null; fehler: boolean }

/** Die Kurzansicht liest den schon geladenen Terminbestand; sie stellt keine zweite Abfrage. */
export default function AktenTerminVorschau({ stand, bereich }: { stand: AktenTerminStand; bereich: string }) {
  const heute = todayStr();
  const termin = stand.termine?.filter((t) => t.datum >= heute)
    .slice().sort((a, b) => a.datum.localeCompare(b.datum) || (a.zeitVon ?? '').localeCompare(b.zeitVon ?? ''))[0];
  return <Card title="Nächster Termin" action={<AktenVerweis bereich={bereich}>Alle Termine →</AktenVerweis>}>
    {stand.fehler ? <TeilFehler was="die Termine" /> : stand.termine === null ? (
      <p className="text-sm text-ink-muted">Termine werden geladen …</p>
    ) : !termin ? <p className="text-sm text-ink-muted">Kein kommender Termin geplant.</p> : <div className="akten-termin">
      <p>{datumAT(termin.datum)}</p>
      {terminZeit(termin) && <p className="akten-termin-zeit">{terminZeit(termin)}</p>}
      <p className="akten-termin-art">{artName(termin.art)}</p>
      {termin.notiz && <p className="text-sm text-ink-muted whitespace-pre-line">{termin.notiz}</p>}
    </div>}
  </Card>;
}
