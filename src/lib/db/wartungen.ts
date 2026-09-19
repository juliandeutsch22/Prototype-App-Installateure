/**
 * Wiederkehrende Wartungen — nur die Weiche.
 */
import type { Wartung } from '@/types';
import type { WithId } from './core';
import * as pg from './pg/wartungen';

export type NewWartung = Omit<Wartung, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>;

export function listWartungen(companyId: string, max = 500): Promise<WithId<Wartung>[]> {
  return pg.listWartungen(companyId, max);
}

export function listFaelligeWartungen(
  companyId: string, bis: string, max = 200,
): Promise<WithId<Wartung>[]> {
  return pg.listFaelligeWartungen(companyId, bis, max);
}

export function listWartungenForCustomer(
  companyId: string, customerId: string, max = 100,
): Promise<WithId<Wartung>[]> {
  return pg.listWartungenForCustomer(companyId, customerId, max);
}

export function createWartung(companyId: string, w: NewWartung): Promise<string> {
  return pg.createWartung(companyId, w);
}

export function updateWartung(id: string, data: Partial<NewWartung>): Promise<void> {
  return pg.updateWartung(id, data);
}

export function deleteWartung(id: string): Promise<void> {
  return pg.deleteWartung(id);
}

export function wartungErledigt(
  id: string,
  args: { erledigtAm: string; intervallMonate: number; projectNumber?: string },
): Promise<void> {
  return pg.wartungErledigt(id, args);
}

export function wartungEingeplant(id: string, projectNumber: string): Promise<void> {
  return pg.wartungEingeplant(id, projectNumber);
}

export type { WithId };

/**
 * Wartungen suchen.
 *
 * DIE SUCHE LÄUFT IN DER DATENBANK, über den ganzen Bestand, und findet auch
 * mitten im Wort. Bis zum Umzug lud die App die ersten `max` Zeilen und
 * filterte im Browser: was dahinter lag, war unauffindbar, und die Ansicht
 * sagte nichts dazu.
 *
 * Der Unterschied ist der Grund für den Umzug und nicht sein Nebenprodukt.
 */
export function searchWartungen(
  companyId: string, begriff: string, max = 500,
): Promise<WithId<Wartung>[]> {
  return pg.searchWartungen(companyId, begriff, max);
}
