/**
 * Kundenstammdaten.
 *
 * Der Kunde war bis hierher ein Textfeld an der Baustelle. Diese Sammlung
 * macht ihn zu einem eigenen Datensatz — Grundlage für Kundenhistorie,
 * Wartungsverträge und ein Mahnwesen, das über die einzelne Rechnung
 * hinausgeht.
 *
 * DIESE DATEI IST NUR NOCH DIE WEICHE. Die Arbeit steht in
 * `pg/customers.ts`; hier stehen die Signaturen, auf die sich die Ansichten
 * verlassen.
 *
 * Die Signaturen hier sind der Vertrag mit den Ansichten — siehe
 * `tests/unit/datenschichtVertrag.test.ts`. Sie ändern sich beim Umzug nicht.
 */
import type { Customer, Project } from '@/types';
import { KUNDEN_GRENZE } from '@/lib/listengrenzen';
import type { WithId } from './core';
import * as pg from './pg/customers';

export type NewCustomer = Omit<Customer, 'id' | 'companyId' | 'createdAt'>;

export function listCustomers(companyId: string, max = KUNDEN_GRENZE): Promise<WithId<Customer>[]> {
  return pg.listCustomers(companyId, max);
}

export function listCustomersByIds(companyId: string, ids: string[]): Promise<WithId<Customer>[]> {
  return pg.listCustomersByIds(companyId, ids);
}

export function listProjectsForCustomer(
  companyId: string, customerId: string, max = 300,
): Promise<WithId<Project>[]> {
  return pg.listProjectsForCustomer(companyId, customerId, max);
}

export function listUnlinkedProjectsByName(
  companyId: string, customerName: string, max = 50,
): Promise<WithId<Project>[]> {
  return pg.listUnlinkedProjectsByName(companyId, customerName, max);
}

export function createCustomer(companyId: string, c: NewCustomer): Promise<string> {
  return pg.createCustomer(companyId, c);
}

export function updateCustomer(
  companyId: string, id: string, data: Partial<NewCustomer>,
): Promise<number> {
  return pg.updateCustomer(companyId, id, data);
}

export function deleteCustomer(companyId: string, id: string): Promise<void> {
  return pg.deleteCustomer(companyId, id);
}

export function assignProjectToCustomer(
  projectId: string, customerId: string, customerName: string,
): Promise<void> {
  return pg.assignProjectToCustomer(projectId, customerId, customerName);
}

export type { WithId };

/**
 * Kunden suchen.
 *
 * DIE SUCHE LÄUFT IN DER DATENBANK, über den ganzen Bestand, und findet auch
 * mitten im Wort. Bis zum Umzug lud die App die ersten `max` Zeilen und
 * filterte im Browser: was dahinter lag, war unauffindbar, und die Ansicht
 * sagte nichts dazu.
 *
 * Der Unterschied ist der Grund für den Umzug und nicht sein Nebenprodukt.
 */
export function searchCustomers(
  companyId: string, begriff: string, max = KUNDEN_GRENZE,
): Promise<WithId<Customer>[]> {
  return pg.searchCustomers(companyId, begriff, max);
}
