/**
 * Die öffentliche Seite des Annahme-Links (M02a) — nur die Weiche. Siehe
 * `pg/angebotAnnahme.ts`.
 */
import * as pg from './pg/angebotAnnahme';

export type { AnnahmeAntwort, AnnahmeAnfrage, AnnahmeStand } from './pg/angebotAnnahme';

export function annahmeAnfrage(anfrage: pg.AnnahmeAnfrage): Promise<pg.AnnahmeAntwort> {
  return pg.annahmeAnfrage(anfrage);
}

export function standLesen(roh: unknown): pg.AnnahmeStand {
  return pg.standLesen(roh);
}
