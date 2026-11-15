import type { EinsatzMaterial, MaterialOrder } from '@/types';
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

/**
 * „FÜR DIESEN EINSATZ EINGELADEN“ AM SCHEIN (V5, 16.11.2026).
 *
 * Was für den Einsatz geplant und eingeladen wurde, musste der Monteur am
 * Schein noch einmal suchen, Position für Position. Jetzt steht die
 * Rüstliste des Einsatzes (Baustelle und Tag des Scheins) als Vorschlag da —
 * nur, was abgehakt ist. Die Rüstliste gehört dem Einsatz, nicht einer
 * Person: auch der Kollege im Team, der den Schein schreibt, sieht, was ein
 * anderer eingeladen hat. Wie bei den Abholungen kommt nichts von selbst auf
 * den Schein; ein Tipp übernimmt die Zeile mit der eingeladenen Menge.
 */
export interface EingeladenVorschlag {
  materialId: string | null;
  name: string;
  einheit?: string;
  menge: number;
  /** Wer eingeladen hat — bei mehreren Positionen desselben Artikels der erste. */
  von: string;
}

export function eingeladenVorschlaege(
  liste: Pick<EinsatzMaterial, 'positionen' | 'geladen'> | null,
  zeilen: readonly MaterialZeile[],
): EingeladenVorschlag[] {
  if (!liste) return [];
  const drauf = new Set(zeilen.map((z) => schluessel(z.materialId, z.name)));
  const je = new Map<string, EingeladenVorschlag>();
  for (const p of liste.positionen ?? []) {
    const haken = liste.geladen?.[p.id];
    if (!haken) continue;
    const k = schluessel(p.materialId, p.name);
    if (drauf.has(k)) continue;
    const menge = Number(p.menge) || 0;
    if (menge <= 0) continue;
    const da = je.get(k);
    if (da) da.menge = Math.round((da.menge + menge) * 1000) / 1000;
    else je.set(k, { materialId: p.materialId ?? null, name: p.name, einheit: p.einheit || undefined, menge, von: haken.von });
  }
  return [...je.values()].sort((a, b) => a.name.localeCompare(b.name, 'de-AT'));
}

/** Dieselbe Baustelle — mit oder ohne „PR-“, ohne Rücksicht auf die Schreibweise. */
export function gleicheBaustelle(a?: string | null, b?: string | null): boolean {
  const n = (x?: string | null) => (x ?? '').trim().toLowerCase().replace(/^pr-/, '');
  return n(a) !== '' && n(a) === n(b);
}
