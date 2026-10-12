import { useEffect, useState } from 'react';
import type { Vacation } from '@/types';
import type { WithId } from '@/lib/db/core';
import { listApprovedVacationsInRange } from '@/lib/db/vacations';
import Card from '@/components/Card';
import MonthCalendar from '@/components/MonthCalendar';
import Hinweiszeile from '@/components/Hinweiszeile';
import { List, ListRow } from '@/components/ListRow';
import { SkeletonList, TeilFehler } from '@/components/States';
import { todayStr } from '@/lib/time';
import { fmtTag, zeitraumText } from './abwesenheitText';
import { GENEHMIGT_GRENZE, amTag, artText, monatsGrenzen, personenJeTag } from './urlaubMonat';

/**
 * DER MONAT NEBEN DEN ANTRÄGEN (Protokoll E8, Plan 17 H): wer in welchem
 * Monat frei hat, für die, die Urlaub entscheiden.
 *
 * Der Kalender zählt je Tag die Personen mit genehmigtem Urlaub oder
 * Zeitausgleich; darunter steht für den gewählten Tag, wer es ist. Die
 * offenen Anträge stehen nicht noch einmal hier — sie stehen daneben.
 *
 * BEGINNT BEIM ÄLTESTEN OFFENEN ANTRAG: über ihn wird zuerst entschieden
 * (die Liste daneben steht in derselben Reihenfolge). Ohne offenen Antrag
 * beim heutigen Tag. Danach blättert, wer will — die Karte springt nicht
 * mit, wenn sich die Anträge nach einer Entscheidung ändern.
 *
 * ERST VOLLSTÄNDIG, DANN SICHTBAR: bis der Monat geladen ist, steht ein
 * Platzhalter statt eines leeren Kalenders, der „niemand frei“ behauptete.
 */
export default function UrlaubMonat({
  companyId,
  ersterTag,
  className,
}: {
  companyId: string;
  /** Womit die Karte beginnt — der Beginn des ältesten offenen Antrags, sonst heute. */
  ersterTag?: string;
  className?: string;
}) {
  const [tag, setTag] = useState(() => ersterTag ?? todayStr());
  const [cursor, setCursor] = useState(() => {
    const [j, m] = tag.split('-').map(Number);
    return { jahr: j, monat: m - 1 };
  });
  const { von, bis } = monatsGrenzen(cursor.jahr, cursor.monat);
  const [stand, setStand] = useState<{ fuer: string; liste: WithId<Vacation>[] | 'fehler' } | null>(null);
  const [versuch, setVersuch] = useState(0);

  useEffect(() => {
    let weg = false;
    listApprovedVacationsInRange(companyId, von, bis, GENEHMIGT_GRENZE)
      .then((liste) => { if (!weg) setStand({ fuer: von, liste }); })
      .catch(() => { if (!weg) setStand({ fuer: von, liste: 'fehler' }); });
    return () => { weg = true; };
  }, [companyId, von, bis, versuch]);

  const geladen = stand?.fuer === von ? stand.liste : null;

  function blaettern(delta: number) {
    const d = new Date(cursor.jahr, cursor.monat + delta, 1);
    setCursor({ jahr: d.getFullYear(), monat: d.getMonth() });
    // Der gewählte Tag geht mit in den neuen Monat: sein Erster, oder heute, wenn er dort liegt.
    const neu = monatsGrenzen(d.getFullYear(), d.getMonth());
    const heute = todayStr();
    setTag(heute >= neu.von && heute <= neu.bis ? heute : neu.von);
  }

  const genehmigt = Array.isArray(geladen) ? amTag(geladen, tag) : [];

  return (
    <Card
      className={className}
      title="Urlaub im Monat"
      buendig
      hint={
        <>
          Der Kalender zählt je Tag, wie viele Personen genehmigten Urlaub oder Zeitausgleich haben —
          auch Betriebsurlaub. Ein Tipp auf einen Tag zeigt, wer es ist. Krankenstände und
          Sonderurlaub stehen hier nicht: sie gehören nicht zur Urlaubsentscheidung und sind dem
          Büro vorbehalten.
        </>
      }
    >
      {geladen === null ? (
        <SkeletonList rows={6} />
      ) : (
        <div>
          {geladen === 'fehler' && (
            <div className="px-4 py-3">
              <TeilFehler was="Der genehmigte Urlaub dieses Monats" onRetry={() => setVersuch((n) => n + 1)} />
            </div>
          )}
          {Array.isArray(geladen) && geladen.length >= GENEHMIGT_GRENZE && (
            <div className="px-4 py-3">
              <Hinweiszeile stufe="warn">
                <p>Mehr als {GENEHMIGT_GRENZE} genehmigte Anträge in diesem Monat — die Übersicht ist unvollständig.</p>
              </Hinweiszeile>
            </div>
          )}
          <MonthCalendar
            year={cursor.jahr}
            month={cursor.monat}
            selected={tag}
            onSelect={setTag}
            onShiftMonth={blaettern}
            marks={Array.isArray(geladen) ? personenJeTag(geladen, von, bis) : undefined}
            markLabel={(n) => `${n} ${n === 1 ? 'Person' : 'Personen'} frei`}
            ohneRahmen
          />
          <div>
            <h3 className="section-label px-4 pt-3">Am {fmtTag(tag)}</h3>
            {geladen === 'fehler' ? null : genehmigt.length === 0 ? (
              <p className="px-4 pb-4 pt-1 text-sm text-ink-muted">Niemand hat an diesem Tag frei.</p>
            ) : (
              <List>
                {genehmigt.map((v) => (
                  <ListRow
                    key={v.id}
                    title={v.userName}
                    subtitle={`${artText(v)} · ${zeitraumText(v.von, v.bis)}`}
                  />
                ))}
              </List>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
