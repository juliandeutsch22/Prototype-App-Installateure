import { useMemo } from 'react';
import { listZeitjournal, type ZeitAenderung } from '@/lib/db/zeitjournal';
import type { SeitenZeiger } from '@/lib/db/pg/kern';
import { useSeitenListe } from '@/lib/useSeitenListe';
import { datumAT } from '@/lib/datum';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';
import Nachladen from '@/components/Nachladen';

const ANGABEN: Record<string, string> = {
  date: 'Tag', status: 'Status', start_time: 'Von', end_time: 'Bis',
  break_duration: 'Pause (Minuten)', travel_time: 'Wegzeit (Minuten)', hours: 'Stunden',
  project_number: 'Baustelle', customer_name: 'Kunde', helper_name: 'Kollege', vehicle_plate: 'Fahrzeug',
  comment: 'Notiz', is_helper: 'Als Helfer', is_night_work: 'Nachtarbeit', nacht_abgewaehlt: 'Grund ohne Nachtarbeit',
  is_emergency: 'Notdienst', unterricht_min: 'Unterricht (Minuten)', is_billed: 'Verrechnet',
  invoice_number: 'Rechnung', satz: 'Einstufung', ins_budget: 'Zählt ins Budget', source: 'Erfassung',
};
const AKTION = { angelegt: 'Angelegt', geaendert: 'Geändert', geloescht: 'Gelöscht' };
function wert(feld: string, w: unknown): string {
  if (w == null || w === '') return '—';
  if (typeof w === 'boolean') return w ? 'Ja' : 'Nein';
  if (typeof w === 'number') return w.toLocaleString('de-AT');
  if (feld === 'date') return datumAT(String(w));
  if (feld === 'start_time' || feld === 'end_time') return String(w).slice(0, 5);
  if (feld === 'source') return w === 'voice' ? 'Sprache' : 'Handeintrag';
  return String(w);
}
function angaben(j: ZeitAenderung) {
  return Object.entries(ANGABEN).filter(([feld]) => j.art === 'geaendert'
    ? JSON.stringify(j.vorher?.[feld]) !== JSON.stringify(j.nachher?.[feld])
    : !!(j.nachher ?? j.vorher)?.[feld]);
}

/** Auch gelöschte Buchungen bleiben auffindbar; der Server schützt die eigenen und die Bürodaten. */
export default function Zeitjournal({ companyId, userId }: { companyId: string; userId?: string }) {
  const laden = useMemo(() => (vor?: SeitenZeiger | null) => listZeitjournal(companyId, userId, vor), [companyId, userId]);
  const liste = useSeitenListe(laden);
  return <div className="space-y-3">
    <p className="text-sm text-ink-muted">{userId ? 'Änderungen deiner Zeitbuchungen.' : 'Änderungen der Zeitbuchungen im Betrieb.'}
      {' '}Seit Einführung des Protokolls; ältere Änderungen werden nicht nachträglich erfunden.</p>
    {liste.fehler && <ErrorState message={liste.fehler} onRetry={() => void liste.neuLaden()} />}
    {liste.laedt ? <SkeletonList rows={3} /> : !liste.fehler && !liste.zeilen.length
      ? <EmptyState>Noch keine Änderungen protokolliert.</EmptyState> : <ol className="divide-y divide-line" aria-label="Änderungen der Zeitbuchungen">
        {liste.zeilen.map((j) => <li key={j.id} className="py-3 space-y-1">
          <p className="font-semibold">{j.userName} · {datumAT(j.datum)} · {AKTION[j.art]}</p>
          <p className="text-sm text-ink-muted">{j.durchName} · {new Date(j.createdAt).toLocaleString('de-AT')}</p>
          <dl className="text-sm">{angaben(j).map(([feld, label]) => <div key={feld} className="py-1">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="break-words">{j.art === 'geaendert'
              ? `${wert(feld, j.vorher?.[feld])} → ${wert(feld, j.nachher?.[feld])}`
              : wert(feld, (j.nachher ?? j.vorher)?.[feld])}</dd>
          </div>)}</dl>
        </li>)}
      </ol>}
    {liste.mehr && <Nachladen geladen={liste.zeilen.length} grenze={liste.zeilen.length}
      onMehr={() => void liste.nachladen()} laeuft={liste.mehrLaedt} einheit="Änderungen" sucheImBrowser={false} />}
  </div>;
}
