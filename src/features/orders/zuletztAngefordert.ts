import type { MaterialOrder } from '@/types';

/**
 * „ZULETZT ANGEFORDERT“ ÜBER DEM KATALOG (C5, E89).
 *
 * Monteure fordern oft dasselbe an — die Dichtungen, das Rohr, die Fittings
 * der Baustelle. Statt jedes Mal zu suchen, stehen die eigenen letzten
 * Artikel oben. Mit gewählter Baustelle die dieser Baustelle; ohne, oder
 * wenn es für sie noch keine gibt, die der letzten vier Wochen.
 */

/** Wie viele Artikel oben stehen — mehr wäre wieder ein Katalog. */
export const ZULETZT_ANZAHL = 5;
/** Ohne Baustelle: so weit zurück. Älteres ist kein „oft dasselbe“ mehr. */
export const ZULETZT_TAGE = 28;

export interface ZuletztArtikel {
  materialId: string;
  /** Die Menge der letzten Anforderung — als Erinnerung, nicht als Vorgabe. */
  menge: number;
  am: number | null;
}

export function zuletztAngefordert(
  eigene: readonly MaterialOrder[],
  projectNumber: string,
  jetzt: number,
): { artikel: ZuletztArtikel[]; fuerBaustelle: boolean } {
  // Nur Katalogartikel: eine frei getippte Anforderung hat nichts, was die Liste wiederfände.
  const anforderungen = eigene
    .filter((o) => o.transactionType === 'order' && !!o.materialId)
    .slice()
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  const derBaustelle = projectNumber ? anforderungen.filter((o) => o.projectNumber === projectNumber) : [];
  const fuerBaustelle = derBaustelle.length > 0;
  const grenze = jetzt - ZULETZT_TAGE * 24 * 60 * 60 * 1000;
  const quelle = fuerBaustelle ? derBaustelle : anforderungen.filter((o) => (o.createdAt ?? 0) >= grenze);
  const gesehen = new Set<string>();
  const artikel: ZuletztArtikel[] = [];
  for (const o of quelle) {
    const id = o.materialId!;
    if (gesehen.has(id)) continue;
    gesehen.add(id);
    artikel.push({ materialId: id, menge: Number(o.quantity) || 0, am: o.createdAt ?? null });
    if (artikel.length === ZULETZT_ANZAHL) break;
  }
  return { artikel, fuerBaustelle };
}
