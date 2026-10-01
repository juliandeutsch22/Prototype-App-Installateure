/**
 * Materialaufschlag (Testbericht 30.09.2026, M31): vom Einkaufs- zum
 * Verkaufspreis.
 *
 * Ein Standard in Prozent je Betrieb, abweichend je Warengruppe (aus
 * DATANORM). Der Verkaufspreis wird nur VORGESCHLAGEN und bleibt
 * überschreibbar — er ist laut Handbuch die Kalkulation des Betriebs. Ohne
 * Aufschlag gibt es keinen Vorschlag: eine erfundene Marge wäre schlimmer als
 * keine.
 *
 * Dieselbe Rechnung steht in der Datenbank (`app.aufschlag_fuer`,
 * `verkaufspreise_vorschlagen`).
 */
export interface Materialaufschlag {
  /** Prozent auf den Einkaufspreis, für alle Warengruppen ohne eigenen Satz. */
  standard?: number | null;
  /** Prozent je Warengruppe (Schlüssel wie in DATANORM). */
  warengruppen?: Record<string, number>;
}

/** Der Aufschlag in Prozent — Warengruppe vor Standard; ohne beides `null`. */
export function aufschlagFuer(a: Materialaufschlag | null | undefined, warengruppe?: string | null): number | null {
  const wg = (warengruppe ?? '').trim();
  const eigen = wg ? a?.warengruppen?.[wg] : undefined;
  if (typeof eigen === 'number' && Number.isFinite(eigen)) return eigen;
  return typeof a?.standard === 'number' && Number.isFinite(a.standard) ? a.standard : null;
}

/** Der vorgeschlagene Verkaufspreis, auf Cent gerundet — oder `null`, wenn nichts vorzuschlagen ist. */
export function verkaufspreisVorschlag(
  einkaufspreis: number | null | undefined,
  a: Materialaufschlag | null | undefined,
  warengruppe?: string | null,
): number | null {
  if (einkaufspreis == null || !Number.isFinite(einkaufspreis) || einkaufspreis <= 0) return null;
  const p = aufschlagFuer(a, warengruppe);
  if (p == null) return null;
  return Math.round(einkaufspreis * (1 + p / 100) * 100) / 100;
}
