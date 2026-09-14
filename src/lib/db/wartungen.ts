/**
 * Wiederkehrende Wartungen — nur die Weiche.
 */
import type { Wartung } from '@/types';
import { nutztPostgres } from './quelle';
import type { WithId } from './core';
import * as fs from './fs/wartungen';
import * as pg from './pg/wartungen';

export type NewWartung = Omit<Wartung, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>;

export function listWartungen(companyId: string, max = 500): Promise<WithId<Wartung>[]> {
  return nutztPostgres() ? pg.listWartungen(companyId, max) : fs.listWartungen(companyId, max);
}

export function listFaelligeWartungen(
  companyId: string, bis: string, max = 200,
): Promise<WithId<Wartung>[]> {
  return nutztPostgres()
    ? pg.listFaelligeWartungen(companyId, bis, max)
    : fs.listFaelligeWartungen(companyId, bis, max);
}

export function listWartungenForCustomer(
  companyId: string, customerId: string, max = 100,
): Promise<WithId<Wartung>[]> {
  return nutztPostgres()
    ? pg.listWartungenForCustomer(companyId, customerId, max)
    : fs.listWartungenForCustomer(companyId, customerId, max);
}

export function createWartung(companyId: string, w: NewWartung): Promise<string> {
  return nutztPostgres() ? pg.createWartung(companyId, w) : fs.createWartung(companyId, w);
}

export function updateWartung(id: string, data: Partial<NewWartung>): Promise<void> {
  return nutztPostgres() ? pg.updateWartung(id, data) : fs.updateWartung(id, data);
}

export function deleteWartung(id: string): Promise<void> {
  return nutztPostgres() ? pg.deleteWartung(id) : fs.deleteWartung(id);
}

export function wartungErledigt(
  id: string,
  args: { erledigtAm: string; intervallMonate: number; projectNumber?: string },
): Promise<void> {
  return nutztPostgres() ? pg.wartungErledigt(id, args) : fs.wartungErledigt(id, args);
}

export function wartungEingeplant(id: string, projectNumber: string): Promise<void> {
  return nutztPostgres()
    ? pg.wartungEingeplant(id, projectNumber)
    : fs.wartungEingeplant(id, projectNumber);
}

export type { WithId };

/**
 * Wartungen suchen.
 *
 * DIE EINE WEICHE, HINTER DER SICH ZWEI VERSCHIEDENE ZUSAGEN VERBERGEN — und
 * das steht hier, weil es sonst niemand wüsste. Unter Postgres sucht die
 * Datenbank über den ganzen Bestand und findet auch mitten im Wort. Unter
 * Firestore lädt die App die ersten `max` Zeilen und filtert im Browser: was
 * dahinter liegt, ist unauffindbar.
 *
 * Der Unterschied ist der Grund für den Umzug und nicht sein Nebenprodukt.
 */
export function searchWartungen(
  companyId: string, begriff: string, max = 500,
): Promise<WithId<Wartung>[]> {
  return nutztPostgres()
    ? pg.searchWartungen(companyId, begriff, max)
    : fs.searchWartungen(companyId, begriff, max);
}
