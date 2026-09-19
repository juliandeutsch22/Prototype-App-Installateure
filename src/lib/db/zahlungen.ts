/**
 * Zahlungseingänge — die Weiche.
 *
 * Die Signaturen hier sind der Vertrag mit den Ansichten; siehe
 * `tests/unit/datenschichtVertrag.test.ts`.
 */
import * as pg from './pg/zahlungen';
export type { NeueZahlung } from './pg/zahlungen';

export const listZahlungen = pg.listZahlungen;
export const listZahlungenImZeitraum = pg.listZahlungenImZeitraum;
export const createZahlung = pg.createZahlung;
export const updateZahlung = pg.updateZahlung;
export const deleteZahlung = pg.deleteZahlung;
