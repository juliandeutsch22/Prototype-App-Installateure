import type { Material, RuestPosition } from '@/types';

/**
 * Was einer Position der Rüstliste im Lager fehlt — und was davon noch keine
 * Anforderung bringt (Runde 6, M5).
 *
 * Eigene Datei, weil Ansicht und Speichern dieselbe Zahl brauchen: die
 * Ansicht zeigt sie, das Speichern legt genau diese Menge als Anforderung an.
 * Zwei Rechnungen dafür liefen irgendwann auseinander.
 */

/**
 * Was im Lager fehlt — nur bei einem Katalogartikel. Eine freie Zeile
 * („Leihgerät Kernbohrer") hat keinen Bestand, und „0 von 1 vorhanden" wäre
 * dort eine Falschaussage statt einer Warnung.
 *
 * `verfuegbar`: was für DIESE Liste frei ist (Testbericht 30.09.2026, M32) —
 * ohne Angabe der Bestand.
 */
export function ruestFehlt(
  p: Pick<RuestPosition, 'menge'>,
  artikel: Pick<Material, 'id' | 'stock'> | undefined,
  verfuegbar?: Map<string, number>,
): number {
  if (!artikel) return 0;
  const da = verfuegbar?.get(artikel.id) ?? artikel.stock ?? 0;
  return Math.max(0, Math.round((p.menge - Math.max(da, 0)) * 1000) / 1000);
}

/**
 * Was davon noch anzufordern ist: die Fehlmenge ohne das, was verknüpfte
 * Anforderungen schon bringen. Sie reservieren ihren Teil selbst — die Liste
 * rechnet nur mit dem Rest aus dem Regal.
 */
export function nochAnzufordern(
  p: Pick<RuestPosition, 'menge' | 'angefordert'>,
  artikel: Pick<Material, 'id' | 'stock'> | undefined,
  verfuegbar?: Map<string, number>,
): number {
  return Math.max(0, Math.round((ruestFehlt(p, artikel, verfuegbar) - (p.angefordert ?? 0)) * 1000) / 1000);
}

/** Was eine gespeicherte Position selbst im Regal reserviert — wie `app.ruest_reserviert`. */
export function ausDemRegal(p: Pick<RuestPosition, 'menge' | 'angefordert'>): number {
  return Math.max(0, p.menge - (p.angefordert ?? 0));
}
