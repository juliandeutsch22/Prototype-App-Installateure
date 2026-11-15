/**
 * Kontoauszug abgleichen (F13) — die Weiche.
 *
 * Die Signaturen hier sind der Vertrag mit den Ansichten; siehe
 * `tests/unit/datenschichtVertrag.test.ts`.
 */
import * as pg from './pg/kontoauszug';
export type { ZuVerbuchen, VerbuchtErgebnis } from './pg/kontoauszug';

export const kontoauszugVerbuchen = pg.kontoauszugVerbuchen;
export const kontoauszugSchonVerbucht = pg.kontoauszugSchonVerbucht;
export const rechnungsKoepfeNachNummer = pg.rechnungsKoepfeNachNummer;
