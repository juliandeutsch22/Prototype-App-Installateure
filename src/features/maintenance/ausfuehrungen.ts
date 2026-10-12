import type { Wartung, WartungAusfuehrung } from '@/types';

/**
 * Die Ausführungen einer Anlage für den Verlauf, die älteste zuerst (17 G).
 *
 * VOR DEM 12.10.2026 hielt die Datenbank keine einzelnen Ausführungen fest,
 * nur „zuletzt gewartet“. Fehlt dieser Tag in der Liste, kommt er dazu — so
 * zeigt auch eine ältere Anlage ihre letzte Wartung, und keine erfundene
 * davor.
 */
export function ausfuehrungenFuerVerlauf(
  w: Pick<Wartung, 'zuletztAm' | 'letzteBaustelle'>,
  liste: Pick<WartungAusfuehrung, 'am' | 'baustelle'>[],
): { am: string; baustelle?: string }[] {
  const raus = liste.map((a) => ({ am: a.am, baustelle: a.baustelle ?? undefined }));
  if (w.zuletztAm && !raus.some((a) => a.am === w.zuletztAm)) {
    raus.push({ am: w.zuletztAm, baustelle: w.letzteBaustelle || undefined });
  }
  return raus.sort((a, b) => a.am.localeCompare(b.am));
}
