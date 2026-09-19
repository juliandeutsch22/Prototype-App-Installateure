/**
 * Die offenen Posten für die Abzeichen im Menü.
 *
 * DREI ZAHLEN AUS EINER ABFRAGE, und das ist der Punkt: je Seitenwechsel drei
 * einzelne Abfragen zu stellen wäre dieselbe Auskunft zum dreifachen Preis.
 *
 * Der Rückgabewert kennt `undefined` — „nicht bekannt". Scheitert die Abfrage,
 * zeigt das Menü KEIN Abzeichen statt einer Null: eine Null behauptet, es
 * liege nichts an, und das ist die teurere Falschaussage.
 */
import * as pg from './pg/offenePosten';

export type { OffenePosten } from './pg/offenePosten';

export function ladeOffenePosten(heute: string): Promise<pg.OffenePosten | undefined> {
  return pg.ladeOffenePosten(heute);
}
