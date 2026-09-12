/**
 * Welche Meldungen jemand bekommt — Art und Vorgabe.
 *
 * WARUM EIGENES MODUL. Die Vorgabe ist eine Regel des Betriebs und keine der
 * Datenbank: wer nichts einstellt, soll nichts verpassen. Stünde sie in `fs/`
 * und in `pg/` nebeneinander, wären es eines Tages zwei verschiedene
 * Vorgaben, und was jemand bekommt, hinge davon ab, welche Datenquelle
 * gerade läuft.
 *
 * Und die Weiche holte ihren öffentlichen Typ sonst aus einer der beiden
 * Seiten — der Vertragswächter hat das sichtbar gemacht, indem er
 * `fs.NotifyPrefs` in die Fassung schrieb. Ein Typ, den die Aussenseite
 * zusagt, gehört keiner der beiden Seiten.
 */
import type { UserPrefs } from '@/types';

/** Die Meldungsarten, die jemand für sich ein- und ausschalten kann. */
export type NotifyPrefs = Pick<
  UserPrefs,
  'notifyNewOrder' | 'notifyOrderReady' | 'notifyUrgentDelivery'
>;

/** Vorgabe für jemanden, der noch nie etwas eingestellt hat. */
export const PREFS_DEFAULTS: NotifyPrefs = {
  // Alle an: Abschalten ist ein bewusster Schritt, Einschalten sollte keiner
  // sein.
  notifyNewOrder: true,
  notifyOrderReady: true,
  notifyUrgentDelivery: true,
};
