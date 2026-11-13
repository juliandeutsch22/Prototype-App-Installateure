import type { MaterialOrder } from '@/types';
import type { MaterialZeile } from './materialZeilen';

/**
 * „FÜR DIESE BAUSTELLE ABGEHOLT“ AM SCHEIN (C2, E89).
 *
 * Die Vorausfüllung bleibt abgeschafft: auf den Schein kommt nur, was jemand
 * antippt — der Kunde unterschreibt, was verbaut wurde, nicht was abgeholt
 * wurde. Die Vorschläge ersparen nur das Suchen nach dem, was man selbst für
 * diese Baustelle aus dem Lager oder vom Händler geholt hat.
 */

/** Wie viele Tage bis zum Tag des Scheins zählen. */
export const ABGEHOLT_TAGE = 14;

/**
 * Der Zeitraum: die zwei Wochen bis zum Ende des Scheintags. Ein Schein
 * beschreibt einen Tag; was vor Wochen abgeholt wurde, stand meist auf einem
 * früheren Schein und würde das Frische nur verdecken. Gerechnet wird in der
 * Ortszeit des Geräts, wie der Tag des Scheins selbst.
 */
export function abgeholtZeitraum(datum: string): { abIso: string; bisIso: string } {
  const [j, m, t] = datum.split('-').map(Number);
  const ab = new Date(j, m - 1, t - (ABGEHOLT_TAGE - 1), 0, 0, 0, 0);
  const bis = new Date(j, m - 1, t, 23, 59, 59, 999);
  return { abIso: ab.toISOString(), bisIso: bis.toISOString() };
}

export interface AbgeholtVorschlag {
  /** Artikel aus dem Katalog — oder `null` bei einer frei angeforderten Ware. */
  materialId: string | null;
  name: string;
  /** Zusammengezählt über alle Abholungen desselben Artikels im Zeitraum. */
  menge: number;
  /** Die jüngste Abholung. */
  zuletzt: number | null;
  /** Mindestens einmal beim Händler mitgenommen statt aus dem Lager. */
  vomHaendler: boolean;
}

const schluessel = (materialId: string | null | undefined, name: string) =>
  materialId ? `id:${materialId}` : `name:${name.trim().toLocaleLowerCase('de-AT')}`;

/**
 * Je Artikel eine Zeile, die Mengen zusammengezählt, neueste Abholung zuerst.
 * Was schon auf dem Schein steht, fällt weg — ein Tipp darauf hätte die
 * Menge verdoppelt, ohne dass es jemand merkt.
 */
export function abgeholtVorschlaege(
  abgeholt: readonly MaterialOrder[],
  zeilen: readonly MaterialZeile[],
): AbgeholtVorschlag[] {
  const drauf = new Set(zeilen.map((z) => schluessel(z.materialId, z.name)));
  const je = new Map<string, AbgeholtVorschlag>();
  for (const o of abgeholt) {
    if (o.transactionType !== 'order' || o.status !== 'Erledigt') continue;
    const k = schluessel(o.materialId, o.materialName);
    if (drauf.has(k)) continue;
    const menge = Number(o.quantity) || 0;
    if (menge <= 0) continue;
    const zeit = o.erledigtAm ?? null;
    const da = je.get(k);
    if (da) {
      da.menge += menge;
      if (zeit != null && (da.zuletzt == null || zeit > da.zuletzt)) da.zuletzt = zeit;
      da.vomHaendler ||= o.abgeholtHerkunft === 'haendler';
    } else {
      je.set(k, {
        materialId: o.materialId ?? null,
        name: o.materialName,
        menge,
        zuletzt: zeit,
        vomHaendler: o.abgeholtHerkunft === 'haendler',
      });
    }
  }
  return [...je.values()].sort((a, b) => (b.zuletzt ?? 0) - (a.zuletzt ?? 0) || a.name.localeCompare(b.name, 'de-AT'));
}
