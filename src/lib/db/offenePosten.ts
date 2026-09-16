/**
 * Die offenen Posten für die Abzeichen im Menü — nur die Weiche.
 *
 * UNTER FIRESTORE GIBT ES SIE NICHT, und das ist kein Versehen. Dort wären es
 * drei Abfragen je Seitenwechsel, und das Mahnwesen liesse sich gar nicht
 * abfragen: „überfällig und die Frist der letzten Mahnung ist abgelaufen" ist
 * eine Bedingung über zwei Felder mit Ungleichheit, die Firestore nicht
 * indiziert. Der Firestore-Zweig ist toter Code, den Stufe 9 entfernt; ihm
 * eine halbe Fassung dieser Funktion mitzugeben hiesse, Arbeit in etwas zu
 * stecken, das niemand mehr ausführt — und bis dahin eine Zahl anzuzeigen,
 * die nur teilweise stimmt.
 *
 * Er bekommt deshalb `undefined`: „nicht bekannt", und das Menü zeigt kein
 * Abzeichen.
 */
import { nutztPostgres } from './quelle';
import * as pg from './pg/offenePosten';

export type { OffenePosten } from './pg/offenePosten';

export function ladeOffenePosten(heute: string): Promise<pg.OffenePosten | undefined> {
  return nutztPostgres() ? pg.ladeOffenePosten(heute) : Promise.resolve(undefined);
}
