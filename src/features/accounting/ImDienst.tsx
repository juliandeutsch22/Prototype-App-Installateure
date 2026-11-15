import { useCallback, useEffect, useState } from 'react';
import type { AppUser } from '@/types';
import Card from '@/components/Card';
import { Zustand } from '@/components/Badge';
import { List, ListRow } from '@/components/ListRow';
import { EmptyState, SkeletonList, TeilFehler } from '@/components/States';
import { laufendeZeitsitzungen } from '@/lib/db/zeitsitzungen';
import { dauerText, timerBaustelle, timerDauer, timerOrtszeit, type Zeitsitzung } from '@/lib/zeitsitzung';
import { datumAT } from '@/lib/datum';
import { todayStr } from '@/lib/time';

/** Wie oft nachgesehen wird, wer im Dienst ist — die Startzeiten ändern sich selten, die Dauer läuft mit. */
export const IM_DIENST_NACHSEHEN_MS = 60_000;

/**
 * HEUTE IM DIENST (F11): wer gerade einen Arbeitstag laufen hat, seit wann,
 * auf welcher Baustelle, in der Pause oder nicht — fürs Büro, das sonst
 * anruft. Die Daten (Start/Stopp, `zeitsitzungen`) und das Leserecht gab es;
 * die Ansicht fehlte.
 *
 * Es ist der Stand des Timers, keine Buchung: gebucht wird erst nach „Stopp“
 * und Prüfen. Ein Arbeitstag, der schon vor heute begann, steht mit seinem
 * Datum da — meist ein vergessenes „Stopp“; beenden kann ihn nur die Person.
 *
 * Steht nur da, wenn Start/Stopp eingeschaltet ist oder noch ein Arbeitstag
 * läuft (nach dem Ausschalten lassen sich laufende weiter beenden).
 */
export default function ImDienst({
  companyId,
  personen,
  timerAn,
  onPerson,
}: {
  companyId: string;
  personen: readonly AppUser[];
  timerAn: boolean;
  onPerson: (uid: string) => void;
}) {
  const [stand, setStand] = useState<Zeitsitzung[] | 'laedt' | 'fehler'>('laedt');
  const [jetzt, setJetzt] = useState(() => Date.now());

  const laden = useCallback(() => {
    void laufendeZeitsitzungen(companyId)
      .then(setStand)
      .catch(() => setStand('fehler'));
  }, [companyId]);

  useEffect(() => {
    laden();
    const uhr = window.setInterval(() => {
      setJetzt(Date.now());
      if (document.visibilityState !== 'hidden') laden();
    }, IM_DIENST_NACHSEHEN_MS);
    const sichtbar = () => {
      if (document.visibilityState === 'visible') {
        setJetzt(Date.now());
        laden();
      }
    };
    document.addEventListener('visibilitychange', sichtbar);
    return () => {
      window.clearInterval(uhr);
      document.removeEventListener('visibilitychange', sichtbar);
    };
  }, [laden]);

  if (!timerAn && !(Array.isArray(stand) && stand.length > 0)) return null;
  const name = (uid: string) => personen.find((p) => p.uid === uid)?.name ?? 'Unbekannte Person';
  const heute = todayStr();
  const sortiert = Array.isArray(stand) ? [...stand].sort((a, b) => name(a.user_id).localeCompare(name(b.user_id), 'de')) : [];

  return (
    <Card
      title={`Heute im Dienst${Array.isArray(stand) ? ` (${stand.length})` : ''}`}
      hint="Wer gerade mit Start/Stopp einen Arbeitstag laufen hat — seit wann, auf welcher Baustelle, ob in der Pause, und die Arbeitszeit bisher. Das ist der Stand des Timers, noch keine Buchung: gebucht wird nach „Stopp“ und Prüfen. Ein Arbeitstag, der vor heute begann, steht mit seinem Datum da — meist ein vergessenes „Stopp“. Beenden kann ihn nur die Person selbst. Die Zeile öffnet die Person."
      buendig
    >
      {stand === 'laedt' ? (
        <div className="p-4"><SkeletonList rows={2} /></div>
      ) : stand === 'fehler' ? (
        <div className="px-4 py-3"><TeilFehler was="Die Liste „Heute im Dienst“" onRetry={laden} /></div>
      ) : sortiert.length === 0 ? (
        <EmptyState>Gerade läuft bei niemandem ein Arbeitstag.</EmptyState>
      ) : (
        <List>
          {sortiert.map((s) => {
            const d = timerDauer(s, jetzt);
            const beginn = timerOrtszeit(d.beginn);
            const baustelle = timerBaustelle(s);
            const pause = d.pauseSeit ? timerOrtszeit(d.pauseSeit).time : null;
            const alt = beginn.date < heute;
            return (
              <ListRow
                key={s.id}
                title={<><span>{name(s.user_id)}</span><span className="sr-only"> – Person öffnen</span></>}
                onOeffnen={() => onPerson(s.user_id)}
                subtitle={
                  <>
                    <span className="block">
                      {alt ? `seit ${datumAT(beginn.date)}, ${beginn.time}` : `seit ${beginn.time}`}
                      {baustelle ? ` · ${baustelle}` : ' · ohne Baustelle'}
                      {pause ? ` · Pause seit ${pause}` : ''}
                    </span>
                    {alt && (
                      <span className="mt-1 block text-xs text-ink">Läuft seit einem früheren Tag — vermutlich „Stopp“ vergessen.</span>
                    )}
                  </>
                }
                wert={dauerText(d.arbeitMs, false)}
              >
                {s.stand === 'pause' ? <Zustand stand="offen">Pause</Zustand> : <Zustand stand="laeuft">läuft</Zustand>}
              </ListRow>
            );
          })}
        </List>
      )}
    </Card>
  );
}
