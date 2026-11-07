/**
 * Materialbereitschaft und Bestellvorschläge (M04b) — nur die Weiche.
 * Was gerechnet wird, steht in `features/assignments/materialDeckung.ts`
 * und in der Migration `20261108100000_materialbereitschaft.sql`.
 */
import * as pg from './pg/materialdeckung';

export type {
  AnforderungsStand,
  Bestellvorschlag,
  DeckungsDaten,
  DeckungsListe,
  UebernahmeErgebnis,
  ZulaufEintrag,
} from './pg/materialdeckung';

export function materialdeckung(
  von: string,
  bis: string,
  formular?: { baustelle: string; dazu: readonly string[] },
): Promise<pg.DeckungsDaten> {
  return pg.materialdeckung(von, bis, formular);
}

export function bestellvorschlaege(): Promise<pg.Bestellvorschlag[]> {
  return pg.bestellvorschlaege();
}

export function bestellvorschlaegeUebernehmen(
  vorgang: string,
  posten: { materialId: string; menge: number; lieferantId: string | null; erwartet: number }[],
): Promise<pg.UebernahmeErgebnis> {
  return pg.bestellvorschlaegeUebernehmen(vorgang, posten);
}
