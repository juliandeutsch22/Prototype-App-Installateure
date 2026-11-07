/**
 * Worüber ein Artikel in der Katalogsuche gefunden wurde, wenn nicht über
 * Namen oder seine eigene Artikelnummer (M03a): über die Nummer eines
 * zugeordneten Großhändlers oder die EAN. Ohne Datenbankbezug, damit jede
 * Trefferliste es zeigen kann — die Suche selbst steht in
 * `lib/db/pg/nummernSuche.ts`.
 */

export interface NummernTreffer {
  nummer: string;
  art: 'lieferant' | 'ean';
  lieferant: string;
}

/** Ein Treffer der Katalogsuche — wo er über die Nummer eines Großhändlers kam, mit ihr. */
export type MitNummer<T> = T & { gefundenUeber?: NummernTreffer };

/** „Nr. B-7 bei Beta“ bzw. „EAN 4006…“ — für die Trefferzeile. */
export function gefundenUeberText(z: { gefundenUeber?: NummernTreffer }): string | undefined {
  const t = z.gefundenUeber;
  if (!t) return undefined;
  return t.art === 'ean' ? `EAN ${t.nummer}` : `Nr. ${t.nummer} bei ${t.lieferant}`;
}
