/**
 * WOHIN „ZURÜCK“ AUS EINER AKTE FÜHRT (L8, 17.11.2026).
 *
 * Listen halten Suche, Auswahl und Ansicht in ihrer Adresse
 * (`/customers?suche=Huber`). Der Rückweg der Akte („← Zur Kundenliste“)
 * führte aber auf die nackte Liste — Suche und Filter waren weg, obwohl sie
 * in der Adresse standen. Die Hülle merkt sich deshalb je Pfad die zuletzt
 * gesehene Abfrage; der Rückweg nimmt sie mit.
 *
 * Nur im Arbeitsspeicher dieser Sitzung: nach einem Neuladen führt der
 * Rückweg wie bisher auf die Liste ohne Abfrage.
 */
const ZULETZT = new Map<string, string>();

/** Von der Hülle bei jedem Seitenwechsel aufgerufen. */
export function listenAdresseMerken(pfad: string, abfrage: string): void {
  if (abfrage && abfrage !== '?') ZULETZT.set(pfad, abfrage.startsWith('?') ? abfrage : `?${abfrage}`);
  else ZULETZT.delete(pfad);
}

/** Der Rückweg mit der zuletzt gesehenen Abfrage seines Pfads — ein Ziel mit eigener Abfrage bleibt, wie es ist. */
export function mitListenAdresse(ziel: string): string {
  if (ziel.includes('?') || ziel.includes('#')) return ziel;
  return `${ziel}${ZULETZT.get(ziel) ?? ''}`;
}

/** Für Prüfungen. */
export function listenAdressenVergessen(): void {
  ZULETZT.clear();
}
