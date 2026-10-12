import { useEffect, useState } from 'react';
import { listAusfuehrungen } from '@/lib/db/wartungen';
import type { Wartung, WartungAusfuehrung } from '@/types';
import type { WithId } from '@/lib/db/core';
import { LotVerlauf, type LotPunkt } from '@/components/LotBausteine';
import { SkeletonList, TeilFehler } from '@/components/States';
import { datumAT } from '@/lib/datum';
import { ausfuehrungenFuerVerlauf } from './ausfuehrungen';

/**
 * DIE WARTUNGEN EINER ANLAGE ALS LOT (17 G): jede Ausführung, dann was
 * eingeplant ist und was ansteht (`weiter`).
 *
 * Geholt, sobald das Seitenfenster aufgeht, und neu, wenn „zuletzt
 * gewartet“ sich ändert. ERST VOLLSTÄNDIG, DANN SICHTBAR: bis die
 * Ausführungen da sind, steht ein Platzhalter — sonst wüchse der Verlauf
 * beim Eintreffen nach unten. Scheitert das Holen, zeigt er, was die
 * Wartung selbst weiss (die letzte Ausführung), und sagt es.
 */
export default function WartungVerlauf({
  companyId,
  wartung,
  weiter,
}: {
  companyId: string;
  wartung: WithId<Wartung>;
  weiter: LotPunkt[];
}) {
  const schluessel = `${wartung.id}|${wartung.zuletztAm ?? ''}`;
  const [stand, setStand] = useState<{ fuer: string; liste: WithId<WartungAusfuehrung>[] | 'fehler' } | null>(null);
  const [versuch, setVersuch] = useState(0);

  useEffect(() => {
    let weg = false;
    listAusfuehrungen(companyId, wartung.id)
      .then((liste) => { if (!weg) setStand({ fuer: schluessel, liste }); })
      .catch(() => { if (!weg) setStand({ fuer: schluessel, liste: 'fehler' }); });
    return () => { weg = true; };
    // Am Schlüssel, nicht am Objekt: eine neu geladene Liste liefert dieselbe Anlage als neues Objekt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, schluessel, versuch]);

  const geladen = stand?.fuer === schluessel ? stand.liste : null;
  if (geladen === null) return <SkeletonList rows={2 + weiter.length} />;

  const bisher = ausfuehrungenFuerVerlauf(wartung, geladen === 'fehler' ? [] : geladen);
  const punkte: LotPunkt[] = [
    ...(bisher.length > 0
      ? bisher.map((a, i) => ({
          titel: i === bisher.length - 1 ? 'Zuletzt gewartet' : 'Gewartet',
          zeit: datumAT(a.am),
          text: a.baustelle ? `Baustelle ${a.baustelle}` : undefined,
        }))
      : [{ titel: 'Noch nie gewartet' }]),
    ...weiter,
  ];
  return (
    <>
      {geladen === 'fehler' && <TeilFehler was="Die Liste der früheren Ausführungen" onRetry={() => setVersuch((n) => n + 1)} />}
      <LotVerlauf name="Wartungen dieser Anlage" punkte={punkte} />
    </>
  );
}
