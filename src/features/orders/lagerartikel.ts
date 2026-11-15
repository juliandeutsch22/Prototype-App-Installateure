import type { Material } from '@/types';

/**
 * Katalog und Lager getrennt (Testbericht 30.09.2026, M30).
 *
 * Ein Katalogartikel ist nicht von selbst ein Lagerartikel: nach einem
 * DATANORM-Import stünden sonst zehntausende Artikel mit Bestand null in der
 * Lagerliste. Geführt wird, was „im Lager führen“ trägt — die Datenbank setzt
 * das von selbst, sobald ein Artikel Bestand bekommt.
 *
 * Ein Datensatz ohne Angabe (ältere Zwischenstände, Vorschau) gilt als
 * geführt: so stand er vorher im Lager, und so bleibt er dort.
 */
export function imLager(m: Pick<Material, 'lagerartikel'>): boolean {
  return m.lagerartikel !== false;
}

/**
 * Knapp ist ein Artikel unter seiner Mindestmenge; ohne Mindestmenge, wenn
 * höchstens `grenze` frei sind (G8).
 *
 * Ein ausgelaufener Artikel ist nie knapp (M9, Entscheidung 15.11.2026): er
 * wird nicht mehr nachbestellt, die Warnung forderte genau das. Dieselbe
 * Regel rechnet die Datenbank für die Startseite (`lager_knapp`).
 */
export function istKnapp(frei: number, m: Pick<Material, 'mindestmenge' | 'ausgelaufen'>, grenze: number): boolean {
  if (m.ausgelaufen) return false;
  return m.mindestmenge != null ? frei < m.mindestmenge : frei <= grenze;
}
