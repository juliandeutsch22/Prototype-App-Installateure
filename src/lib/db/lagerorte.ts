/**
 * Lagerorte, Fahrzeuge, Bestand je Ort und die Umlagerung (M04a) — nur die Weiche.
 */
import type { Fahrzeug, Lagerbestand, Lagerort } from '@/types';
import type { WithId } from './core';
import * as pg from './pg/lagerorte';

export type { KennzeichenVorschlag, UmlagerAuftrag, UmlagerErgebnis } from './pg/lagerorte';

export function listLagerorte(companyId: string): Promise<WithId<Lagerort>[]> {
  return pg.listLagerorte(companyId);
}

export function listFahrzeuge(companyId: string): Promise<WithId<Fahrzeug>[]> {
  return pg.listFahrzeuge(companyId);
}

export function fahrzeugSpeichern(f: Parameters<typeof pg.fahrzeugSpeichern>[0]): Promise<string> {
  return pg.fahrzeugSpeichern(f);
}

export function lagerortSpeichern(o: Parameters<typeof pg.lagerortSpeichern>[0]): Promise<string> {
  return pg.lagerortSpeichern(o);
}

export function kennzeichenAusBuchungen(): Promise<pg.KennzeichenVorschlag[]> {
  return pg.kennzeichenAusBuchungen();
}

export function bestandAmOrt(companyId: string, lagerortId: string): Promise<Lagerbestand[]> {
  return pg.bestandAmOrt(companyId, lagerortId);
}

export function bestandDesArtikels(companyId: string, materialId: string): Promise<Lagerbestand[]> {
  return pg.bestandDesArtikels(companyId, materialId);
}

export function bestandBeobachten(companyId: string, beiAenderung: () => void): () => void {
  return pg.bestandBeobachten(companyId, beiAenderung);
}

/** Umlagern nach dem Schreibbefehls-Vertrag — siehe `pg.umlagern`. */
export function umlagern(a: pg.UmlagerAuftrag, vorgang?: string): Promise<pg.UmlagerErgebnis> {
  return pg.umlagern(a, vorgang);
}

/** Was aus einem Vorgang wurde — `null`, wenn nichts geschrieben ist. */
export function befehlStand(vorgang: string): Promise<Record<string, unknown> | null> {
  return pg.befehlStand(vorgang);
}
