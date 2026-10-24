import { useCallback, useEffect, useState } from 'react';
import { listDokumente } from '@/lib/db/baustellenDokumente';
import type { BaustellenDokument } from '@/types';
import type { WithId } from '@/lib/db/core';

export type PlaeneStand =
  | { zustand: 'laedt' }
  | { zustand: 'fehler' }
  | { zustand: 'bereit'; dokumente: WithId<BaustellenDokument>[] };

/**
 * Die Pläne einer oder mehrerer Baustellen.
 *
 * EINE ABFRAGE FÜR ALLE BAUSTELLEN AUF DEM SCHIRM, nicht eine je Karte: der
 * Einsatzplan zeigt eine Woche, und dieselbe Baustelle kommt darin fünfmal
 * vor.
 *
 * OHNE ADRESSEN (A14, 24.10.2026): die Adresse zum Öffnen entsteht erst beim
 * Antippen (`PlaeneListe`) — so prüft der Speicher die Freigabe jedes Mal,
 * und auch wer den Einsatzplan morgens öffnet und mittags tippt, steht nicht
 * vor „abgelaufen“.
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
      setStand({ zustand: 'bereit', dokumente: [] });
      return;
    }
    let weg = false;
    const holen = async () => {
      try {
        const dokumente = await listDokumente(companyId, ids);
        if (!weg) setStand({ zustand: 'bereit', dokumente });
      } catch {
        if (!weg) setStand({ zustand: 'fehler' });
      }
    };
    void holen();
    return () => {
      weg = true;
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
