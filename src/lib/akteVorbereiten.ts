import type { QueryKey } from '@tanstack/react-query';
import { ansichtVorbereiten } from './ansichten';
import { abfrageSpeicher } from './zwischenspeicher';
import { speicherNutzer } from './liveSpeicher';

/**
 * EINE AKTE VORBEREITEN, WÄHREND DER FINGER NOCH AUF DER ZEILE LIEGT (L12).
 *
 * Bis hierher begann eine Akte erst nach dem Loslassen: Baustein holen
 * (beim ersten Mal, wenn das Vorladen im Leerlauf ihn noch nicht hatte),
 * dann den Kopf aus der Datenbank. Beim Berühren der Zeile geschieht jetzt
 * beides vorab — ohne zusätzliche Anfrage für den Kopf: die Zeile der Liste
 * trägt dieselben Daten, die die Akte sonst als Erstes fragt. Sie werden in
 * den gemerkten Stand der Akte gelegt (`useGemerkt`); die Akte zeigt sie
 * sofort und holt wie sonst im Hintergrund frisch.
 *
 * Was die Akte schon gemerkt hat, ist neuer und bleibt. Gemerkt wird nur für
 * den Angemeldeten — dieselbe Regel wie im übrigen Zwischenspeicher.
 */
export function akteVorbereiten(pfad: string, kopf?: { schluessel: QueryKey; daten: object }): void {
  ansichtVorbereiten(pfad);
  if (!kopf) return;
  const [, uid, betrieb] = kopf.schluessel as unknown[];
  if (speicherNutzer() !== `${String(uid)}@${String(betrieb)}`) return;
  abfrageSpeicher.setQueryData<object>(kopf.schluessel, (alt) => ({ ...kopf.daten, ...alt }));
}
