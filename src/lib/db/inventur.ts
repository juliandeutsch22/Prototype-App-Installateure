/**
 * Inventur als Zählliste (F14) — nur die Weiche; die Arbeit steht in `pg/inventur.ts`.
 */
import * as pg from './pg/inventur';

export type {
  InventurAuswahl,
  InventurBuchung,
  InventurErgebnis,
  InventurUmfang,
  InventurVorschau,
  InventurVorschauZeile,
  Zaehlliste,
  ZaehllisteVoll,
  ZaehllistenZeile,
} from './pg/inventur';

export function inventurListen(grenze?: number): Promise<pg.Zaehlliste[]> {
  return pg.inventurListen(grenze);
}

export function inventurLaden(id: string): Promise<pg.ZaehllisteVoll> {
  return pg.inventurLaden(id);
}

export function inventurAnlegen(a: pg.InventurAuswahl): Promise<{ id: string; artikel: number; uebersprungen: number }> {
  return pg.inventurAnlegen(a);
}

export function inventurArtikelHinzufuegen(inventur: string, materialId: string): Promise<string> {
  return pg.inventurArtikelHinzufuegen(inventur, materialId);
}

export function inventurZaehlen(
  zeile: string,
  menge: number | null,
): Promise<{ gezaehlt: number | null; gezaehltAm: number | null; gezaehltVonName: string | null }> {
  return pg.inventurZaehlen(zeile, menge);
}

export function inventurVorschau(inventur: string): Promise<pg.InventurVorschau> {
  return pg.inventurVorschau(inventur);
}

export function inventurBuchen(
  inventur: string,
  grund: string,
  gruende: Record<string, string>,
  stand: string,
): Promise<pg.InventurBuchung> {
  return pg.inventurBuchen(inventur, grund, gruende, stand);
}

export function inventurVerwerfen(inventur: string): Promise<void> {
  return pg.inventurVerwerfen(inventur);
}
