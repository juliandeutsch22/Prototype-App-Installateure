import { where, doc, deleteDoc, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Project } from '@/types';
import { BAUSTELLEN_AUSWAHL_GRENZE } from '@/lib/listengrenzen';
import { queryTenant, subscribeTenant, createInTenant, updateInTenant, type WithId } from './core';

const COLLECTION = 'projects';

/**
 * Laufende Baustellen — die Auswahlliste ueberall im Programm.
 *
 * Der Statusfilter lief vorher im BROWSER: geladen wurde jede Baustelle des
 * Betriebs seit jeher, weggeworfen wurden die abgeschlossenen. Genau die
 * machen mit den Jahren den Grossteil aus. Firestore kann das selbst, und
 * dann wandern die abgeschlossenen gar nicht erst ueber die Leitung.
 */
export function listActiveProjects(companyId: string, max = BAUSTELLEN_AUSWAHL_GRENZE) {
  return queryTenant<Project>(
    COLLECTION,
    companyId,
    where('status', 'in', ['Aktiv', 'Pausiert']),
    limit(max),
  );
}

/**
 * Bestimmte Baustellen, nach Nummer.
 *
 * Fuer Ansichten, die zu vorhandenen Datensaetzen nur noch den Kundennamen
 * brauchen — etwa der Einsatzplan eines Monteurs. Vorher wurde dafuer der
 * gesamte Baustellenbestand geladen, um daraus drei Namen zu lesen.
 *
 * Firestore erlaubt hoechstens 30 Werte je `in`-Abfrage, deshalb in Bloecken
 * und nebeneinander. Die Zahl der Nummern haengt an dem, was der Aufrufer
 * ohnehin schon geladen hat, ist also selbst begrenzt.
 */
export async function listProjectsByNumbers(companyId: string, numbers: string[]) {
  const eindeutig = [...new Set(numbers.filter(Boolean))];
  if (eindeutig.length === 0) return [];
  const bloecke: string[][] = [];
  for (let i = 0; i < eindeutig.length; i += 30) bloecke.push(eindeutig.slice(i, i + 30));
  const teile = await Promise.all(
    bloecke.map((b) =>
      queryTenant<Project>(COLLECTION, companyId, where('projectNumber', 'in', b)),
    ),
  );
  return teile.flat();
}

/**
 * Baustellen zu einer NUMMER — die Suche, die ueber die geladene Liste
 * hinausreicht.
 *
 * Die Verwaltungsliste zeigt die juengsten dreihundert. Eine Baustelle von
 * vor vier Jahren steht nicht darin, und im Browser zu filtern kann sie
 * folglich nicht finden. Nach der NUMMER laesst sich dagegen exakt fragen —
 * ohne ein zusaetzliches Suchfeld, das erst auf jedem Altbestand nachgetragen
 * werden muesste.
 *
 * `formen` traegt beide Schreibweisen (mit und ohne „PR-"), weil Firestore
 * genau vergleicht. Warum das so ist, steht in `baustellenSuche.ts`.
 */
export function findProjectsByNumber(companyId: string, formen: string[]) {
  if (formen.length === 0) return Promise.resolve([]);
  return queryTenant<Project>(COLLECTION, companyId, where('projectNumber', 'in', formen));
}

/**
 * Die juengsten Baustellen, mit Obergrenze — fuer die Verwaltungsliste.
 *
 * Baustellen wachsen langsamer als Zeiteintraege, aber sie wachsen: bei
 * zweihundert Auftraegen im Jahr sind es nach zehn Jahren zweitausend. Die
 * Liste hat eine Suche; was aelter ist als die Grenze, wird nachgeladen.
 */
export function listRecentProjects(companyId: string, max: number) {
  return queryTenant<Project>(
    COLLECTION,
    companyId,
    orderBy('createdAt', 'desc'),
    limit(max),
  );
}

/** Projekte, denen ein Mitarbeiter zugeordnet ist. */
export function listProjectsForEmployee(companyId: string, uid: string) {
  return queryTenant<Project>(COLLECTION, companyId, where('assignedEmployees', 'array-contains', uid));
}

/** Baustellen live, neueste zuerst, mit Obergrenze. */
export function subscribeRecentProjects(
  companyId: string,
  max: number,
  cb: (rows: WithId<Project>[]) => void,
  onError: (e: Error) => void,
) {
  return subscribeTenant<Project>(
    COLLECTION,
    companyId,
    cb,
    onError,
    orderBy('createdAt', 'desc'),
    limit(max),
  );
}

export type NewProject = Omit<Project, 'id' | 'companyId' | 'createdAt'>;

export function createProject(companyId: string, p: NewProject) {
  // Über createInTenant, damit leere Optionalfelder (z. B. kein Budget)
  // nicht als undefined bei Firestore landen und das Anlegen scheitern lassen.
  return createInTenant(COLLECTION, companyId, p);
}

export function updateProject(id: string, data: Partial<Project>) {
  return updateInTenant(COLLECTION, id, data);
}

export function deleteProject(id: string) {
  return deleteDoc(doc(db, COLLECTION, id));
}
