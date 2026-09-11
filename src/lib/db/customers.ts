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
import { nutztPostgres } from './quelle';
import type { WithId } from './core';
import * as fs from './fs/customers';
import * as pg from './pg/customers';

export type NewCustomer = Omit<Customer, 'id' | 'companyId' | 'createdAt'>;

export function listCustomers(companyId: string, max = KUNDEN_GRENZE): Promise<WithId<Customer>[]> {
  return nutztPostgres() ? pg.listCustomers(companyId, max) : fs.listCustomers(companyId, max);
}

export function listCustomersByIds(companyId: string, ids: string[]): Promise<WithId<Customer>[]> {
  return nutztPostgres() ? pg.listCustomersByIds(companyId, ids) : fs.listCustomersByIds(companyId, ids);
}

export function listProjectsForCustomer(
  companyId: string, customerId: string, max = 300,
): Promise<WithId<Project>[]> {
  return nutztPostgres()
    ? pg.listProjectsForCustomer(companyId, customerId, max)
    : fs.listProjectsForCustomer(companyId, customerId, max);
}

export function listUnlinkedProjectsByName(
  companyId: string, customerName: string, max = 50,
): Promise<WithId<Project>[]> {
  return nutztPostgres()
    ? pg.listUnlinkedProjectsByName(companyId, customerName, max)
    : fs.listUnlinkedProjectsByName(companyId, customerName, max);
}

export function createCustomer(companyId: string, c: NewCustomer): Promise<string> {
  return nutztPostgres() ? pg.createCustomer(companyId, c) : fs.createCustomer(companyId, c);
}

export function updateCustomer(
  companyId: string, id: string, data: Partial<NewCustomer>,
): Promise<number> {
  return nutztPostgres()
    ? pg.updateCustomer(companyId, id, data)
    : fs.updateCustomer(companyId, id, data);
}

export function deleteCustomer(companyId: string, id: string): Promise<void> {
  return nutztPostgres() ? pg.deleteCustomer(companyId, id) : fs.deleteCustomer(companyId, id);
}

export function assignProjectToCustomer(
  projectId: string, customerId: string, customerName: string,
): Promise<void> {
  return nutztPostgres()
    ? pg.assignProjectToCustomer(projectId, customerId, customerName)
    : fs.assignProjectToCustomer(projectId, customerId, customerName);
}

export type { WithId };
