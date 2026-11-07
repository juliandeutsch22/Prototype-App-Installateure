/**
 * Annahme-Links der Angebote (M02a) — nur die Weiche. Siehe `pg/angebotLinks.ts`.
 */
import type { Abrechnungsart } from '@/types';
import * as pg from './pg/angebotLinks';

export type { AngebotLink, AngebotLinkZustand, NeuerAngebotLink, UeberLinkAngenommen } from './pg/angebotLinks';

export function listAngebotLinks(angebotId: string): Promise<pg.AngebotLink[]> {
  return pg.listAngebotLinks(angebotId);
}

export function angebotLinkErzeugen(
  angebotId: string,
  o: { abrechnung: Abrechnungsart; praefix: string; gueltigBis?: string | null },
): Promise<pg.NeuerAngebotLink> {
  return pg.angebotLinkErzeugen(angebotId, o);
}

export function angebotLinkWiderrufen(linkId: string): Promise<void> {
  return pg.angebotLinkWiderrufen(linkId);
}

/** Über den Link angenommen, von der Führung noch nicht geöffnet — für die Startseite. */
export function listUeberLinkAngenommen(): Promise<pg.UeberLinkAngenommen[]> {
  return pg.listUeberLinkAngenommen();
}

export function angebotLinkGesehen(linkId: string): Promise<void> {
  return pg.angebotLinkGesehen(linkId);
}
