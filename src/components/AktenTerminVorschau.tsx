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
  const jetzt = new Date();
  const uhrzeit = `${String(jetzt.getHours()).padStart(2, '0')}:${String(jetzt.getMinutes()).padStart(2, '0')}`;
  // Ein bekanntes, schon beendetes Zeitfenster ist kein nächster Termin.
  // Ohne Endzeit bleibt der heutige Termin erhalten: sein Ende ist unbekannt.
  const termin = stand.termine?.filter((t) => t.datum > heute ||
    (t.datum === heute && (!t.zeitBis || t.zeitBis.slice(0, 5) > uhrzeit)))
    .slice().sort((a, b) => a.datum.localeCompare(b.datum) || (a.zeitVon ?? '').localeCompare(b.zeitVon ?? ''))[0];
  return <Card title="Nächster Termin" action={<AktenVerweis bereich={bereich}>Alle Termine →</AktenVerweis>}>
    {stand.fehler ? <TeilFehler was="die Termine" /> : stand.termine === null ? (
      <p className="text-sm text-ink-muted">Termine werden geladen …</p>
    ) : !termin ? <p className="text-sm text-ink-muted">Kein kommender Termin geplant.</p> : <div className="akten-termin">
      <time className="akten-termin-datum" dateTime={termin.datum}>
        <span aria-hidden="true" className="akten-termin-monat">{new Date(`${termin.datum}T12:00:00`).toLocaleDateString('de-AT', { month: 'short' })} {termin.datum.slice(0, 4)}</span>
        <strong aria-hidden="true" className="akten-termin-tag">{termin.datum.slice(8, 10)}</strong>
        <span className="sr-only">{datumAT(termin.datum)}</span>
      </time>
      <div className="akten-termin-inhalt"><p className="akten-termin-art">{artName(termin.art)}</p>
        {termin.notiz && <p className="text-sm text-ink-muted whitespace-pre-line">{termin.notiz}</p>}</div>
      {terminZeit(termin) && <p className="akten-termin-zeit">{terminZeit(termin)}</p>}
    </div>}
  </Card>;
}
