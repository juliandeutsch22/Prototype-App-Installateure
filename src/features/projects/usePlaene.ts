import { useCallback, useEffect, useState } from 'react';
import { dokumentAdressen, listDokumente, GUELTIG_SEKUNDEN } from '@/lib/db/baustellenDokumente';
import type { BaustellenDokument } from '@/types';
import type { WithId } from '@/lib/db/core';

export type PlaeneStand =
  | { zustand: 'laedt' }
  | { zustand: 'fehler' }
  | { zustand: 'bereit'; dokumente: WithId<BaustellenDokument>[]; adressen: Map<string, string> };

/**
 * Die Pläne einer oder mehrerer Baustellen — samt Adressen zum Öffnen.
 *
 * EINE ABFRAGE FÜR ALLE BAUSTELLEN AUF DEM SCHIRM, nicht eine je Karte: der
 * Einsatzplan zeigt eine Woche, und dieselbe Baustelle kommt darin fünfmal
 * vor.
 *
 * DIE ADRESSEN GELTEN EINE STUNDE und werden kurz davor erneuert. Wer den
 * Einsatzplan morgens öffnet und mittags auf den Plan tippt, soll nicht vor
 * „abgelaufen" stehen.
 */
export function usePlaene(companyId: string | undefined, projectIds: string[]) {
  const [stand, setStand] = useState<PlaeneStand>({ zustand: 'laedt' });
  const [versuch, setVersuch] = useState(0);
  // Am Inhalt hängen, nicht an der Identität des Arrays.
  const schluessel = [...new Set(projectIds.filter(Boolean))].sort().join('|');

  useEffect(() => {
    if (!companyId) return;
    const ids = schluessel ? schluessel.split('|') : [];
    if (ids.length === 0) {
      setStand({ zustand: 'bereit', dokumente: [], adressen: new Map() });
      return;
    }
    let weg = false;
    const holen = async () => {
      try {
        const dokumente = await listDokumente(companyId, ids);
        const adressen = await dokumentAdressen(dokumente);
        if (!weg) setStand({ zustand: 'bereit', dokumente, adressen });
      } catch {
        if (!weg) setStand({ zustand: 'fehler' });
      }
    };
    void holen();
    // Zehn Minuten vor Ablauf erneuern.
    const takt = window.setInterval(() => void holen(), (GUELTIG_SEKUNDEN - 600) * 1000);
    return () => {
      weg = true;
      window.clearInterval(takt);
    };
  }, [companyId, schluessel, versuch]);

  const neuLaden = useCallback(() => setVersuch((v) => v + 1), []);
  return { stand, neuLaden };
}

/** Die Pläne EINER Baustelle aus dem geladenen Stand. */
export function planeVon(stand: PlaeneStand, projectId: string | undefined) {
  if (stand.zustand !== 'bereit' || !projectId) return [];
  return stand.dokumente.filter((d) => d.projectId === projectId);
}
