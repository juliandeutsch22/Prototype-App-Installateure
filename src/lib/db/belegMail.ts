/**
 * Rechnung und Angebot per Mail (F16) — die Weiche.
 *
 * Die Signaturen hier sind der Vertrag mit den Ansichten; siehe
 * `tests/unit/datenschichtVertrag.test.ts`.
 */
import * as pg from './pg/belegMail';
export type { BelegMailAuftrag, BelegMailErgebnis, BelegMailStand, BelegVersand } from './pg/belegMail';

export const BelegMailNichtEingerichtet = pg.BelegMailNichtEingerichtet;
export const belegMailStand = pg.belegMailStand;
export const belegPerMail = pg.belegPerMail;
export const listBelegVersand = pg.listBelegVersand;
