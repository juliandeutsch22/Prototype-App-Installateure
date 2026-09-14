/**
 * Die Plattform — Betriebe anlegen, in keinen hineinsehen.
 *
 * Nur die Weiche. Unter Firestore tut das die Cloud Function
 * `betriebAnlegen`, unter Postgres die Edge Function `betrieb-anlegen`; der
 * Aufrufer findet beide Wege über `lib/functions.ts:callBetriebAnlegen`.
 */
import { nutztPostgres } from './quelle';
import * as pg from './pg/plattform';

export type { BetriebAngelegt } from './pg/plattform';

export function betriebAnlegen(daten: {
  name: string; companyId: string; adminEmail: string; adminName: string;
}): Promise<pg.BetriebAngelegt> {
  if (!nutztPostgres()) {
    throw new Error('Unter Firestore legt die Cloud Function an — siehe lib/functions.ts.');
  }
  return pg.betriebAnlegen(daten);
}
