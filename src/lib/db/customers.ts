import { where, orderBy, limit, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Customer, Project } from '@/types';
import { queryTenant, createInTenant, updateInTenant, type WithId } from './core';

/**
 * Kundenstammdaten.
 *
 * Der Kunde war bis hierher ein Textfeld an der Baustelle. Diese Sammlung
 * macht ihn zu einem eigenen Datensatz — Grundlage für Kundenhistorie,
 * Wartungsverträge und ein Mahnwesen, das über die einzelne Rechnung
 * hinausgeht.
 */

const COLLECTION = 'customers';
const PROJEKTE = 'projects';

/**
 * Kunden alphabetisch, mit Obergrenze.
 *
 * Kunden wachsen mit dem Geschäft, nicht mit der Zeit — aber sie wachsen.
 * Alphabetisch statt nach Anlagedatum, weil diese Liste zum NACHSCHLAGEN da
 * ist: gesucht wird ein Name, nicht der zuletzt angelegte Datensatz.
 */
export function listCustomers(companyId: string, max = 500) {
  return queryTenant<Customer>(COLLECTION, companyId, orderBy('name'), limit(max));
}

/**
 * Bestimmte Kunden, nach Id.
 *
 * Für Ansichten, die zu vorhandenen Baustellen nur noch die Stammdaten
 * brauchen. Firestore erlaubt höchstens 30 Werte je `in`-Abfrage, deshalb in
 * Blöcken.
 */
export async function listCustomersByIds(companyId: string, ids: string[]) {
  const eindeutig = [...new Set(ids.filter(Boolean))];
  if (eindeutig.length === 0) return [];
  const bloecke: string[][] = [];
  for (let i = 0; i < eindeutig.length; i += 30) bloecke.push(eindeutig.slice(i, i + 30));
  const teile = await Promise.all(
    bloecke.map((b) =>
      queryTenant<Customer>(COLLECTION, companyId, where('__name__', 'in', b)),
    ),
  );
  return teile.flat();
}

/**
 * Die Baustellen EINES Kunden — die Historie.
 *
 * Mit Obergrenze, und die ist nicht bloße Vorsicht: eine Hausverwaltung
 * sammelt über zehn Jahre hunderte Baustellen an. Die Grenze steht hoch
 * genug, dass sie im Normalfall nicht greift, und niedrig genug, dass ein
 * Großkunde die Ansicht nicht lahmlegt.
 */
export function listProjectsForCustomer(companyId: string, customerId: string, max = 300) {
  return queryTenant<Project>(
    PROJEKTE,
    companyId,
    where('customerId', '==', customerId),
    limit(max),
  );
}

export type NewCustomer = Omit<Customer, 'id' | 'companyId' | 'createdAt'>;

export function createCustomer(companyId: string, c: NewCustomer) {
  return createInTenant(COLLECTION, companyId, c);
}

/**
 * Kunde ändern — und den Namen bei den verknüpften Baustellen nachziehen.
 *
 * Die Baustellen tragen den Kundennamen als Kopie, damit ihre Listen nicht
 * zusätzlich die Kundensammlung laden müssen. Ohne dieses Nachziehen liefen
 * Anzeige und Stammdaten nach der ersten Umbenennung auseinander — und
 * niemand wüsste, welche der beiden Schreibweisen die richtige ist.
 *
 * In EINEM Batch mit der Änderung des Kunden: bricht die Verbindung
 * dazwischen ab, wäre der Kunde umbenannt und die Baustellen nicht.
 */
export async function updateCustomer(
  companyId: string,
  id: string,
  data: Partial<NewCustomer>,
) {
  if (data.name === undefined) {
    await updateInTenant(COLLECTION, id, data);
    return 0;
  }

  const betroffen = await listProjectsForCustomer(companyId, id);
  const batch = writeBatch(db);
  batch.update(doc(db, COLLECTION, id), { ...data });
  for (const p of betroffen) {
    batch.update(doc(db, PROJEKTE, p.id), { customerName: data.name });
  }
  await batch.commit();
  return betroffen.length;
}

/**
 * Kunde löschen — nur ohne Baustellen.
 *
 * Ein Kunde mit Baustellen zu löschen hinterließe Baustellen, die auf einen
 * Datensatz zeigen, den es nicht mehr gibt. Dieselbe Überlegung wie bei den
 * Benutzern, die aus demselben Grund nur deaktiviert werden.
 */
export async function deleteCustomer(companyId: string, id: string) {
  const betroffen = await listProjectsForCustomer(companyId, id);
  if (betroffen.length > 0) {
    throw new Error(
      `Der Kunde hat noch ${betroffen.length} ${betroffen.length === 1 ? 'Baustelle' : 'Baustellen'}.`,
    );
  }
  await deleteDoc(doc(db, COLLECTION, id));
}

/**
 * Eine Baustelle einem Kunden zuordnen.
 *
 * Für die Übernahme der Altbestände und für nachträgliche Korrekturen. Der
 * Name wandert als Kopie mit.
 */
export function assignProjectToCustomer(
  projectId: string,
  customerId: string,
  customerName: string,
) {
  return updateInTenant(PROJEKTE, projectId, { customerId, customerName });
}

export type { WithId };
