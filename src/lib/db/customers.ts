/**
 * Kundenstammdaten.
 *
 * Der Kunde war bis hierher ein Textfeld an der Baustelle. Diese Sammlung
 * macht ihn zu einem eigenen Datensatz — Grundlage für Kundenhistorie,
 * Wartungsverträge und ein Mahnwesen, das über die einzelne Rechnung
 * hinausgeht.
 *
 * DIESE DATEI IST NUR NOCH DIE WEICHE. Die Arbeit steht in `fs/customers.ts`
 * (Firestore) und `pg/customers.ts` (Postgres); welche gilt, entscheidet
 * `quelle.ts`. Stufe 9 löscht den einen Zweig und mit ihm diese Weiche.
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
 * DIE EINE WEICHE, HINTER DER SICH ZWEI VERSCHIEDENE ZUSAGEN VERBERGEN — und
 * das steht hier, weil es sonst niemand wüsste. Unter Postgres sucht die
 * Datenbank über den ganzen Bestand und findet auch mitten im Wort. Unter
 * Firestore lädt die App die ersten `max` Zeilen und filtert im Browser: was
 * dahinter liegt, ist unauffindbar.
 *
 * Der Unterschied ist der Grund für den Umzug und nicht sein Nebenprodukt.
 */
export function searchCustomers(
  companyId: string, begriff: string, max = KUNDEN_GRENZE,
): Promise<WithId<Customer>[]> {
  return pg.searchCustomers(companyId, begriff, max);
}
