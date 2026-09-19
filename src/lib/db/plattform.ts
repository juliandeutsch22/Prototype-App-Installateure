/**
 * Die Plattform — Betriebe anlegen, in keinen hineinsehen.
 *
 * Die Edge Function `betrieb-anlegen` tut die Arbeit, und sie ist die einzige,
 * die den Umzug nach Postgres überlebt hat: alles andere aus dem
 * Functions-Bestand ist zu SQL geworden, ein ANMELDEKONTO aber entsteht im
 * Anmeldedienst und nicht in einer Tabelle.
 */
import * as pg from './pg/plattform';

export type { BetriebAngelegt } from './pg/plattform';

export function betriebAnlegen(daten: {
  name: string; companyId: string; adminEmail: string; adminName: string;
}): Promise<pg.BetriebAngelegt> {
  return pg.betriebAnlegen(daten);
}
