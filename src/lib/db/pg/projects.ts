/**
 * Baustellen — auf Postgres.
 *
 * Gleiche Aussenseite wie `fs/projects.ts`. Zwei Firestore-Eigenheiten fallen
 * dabei weg, beide unten benannt.
 */
import type { Project } from '@/types';
import { BAUSTELLEN_AUSWAHL_GRENZE } from '@/lib/listengrenzen';
import { abfragen, abonnieren, anlegen, aendern, loeschen, type WithId } from './kern';
import { oderUeberSpalten } from './suche';

const BAUSTELLEN = 'projects';

/**
 * Laufende Baustellen — die Auswahlliste überall im Programm.
 *
 * Der Statusfilter läuft serverseitig; abgeschlossene Baustellen wandern gar
 * nicht erst über die Leitung. Das war schon in Firestore so und bleibt.
 */
export function listActiveProjects(companyId: string, max = BAUSTELLEN_AUSWAHL_GRENZE) {
  return abfragen<Project>(BAUSTELLEN, companyId, {
    wo: [{ art: 'in', feld: 'status', werte: ['Aktiv', 'Pausiert'] }],
    grenze: max,
  });
}

/**
 * Bestimmte Baustellen, nach Nummer.
 *
 * Die Blockbildung steht hier nicht mehr, sondern in `kern.ts`: Postgres
 * kennt die 30-Werte-Grenze von Firestore nicht, PostgREST hat dafür eine
 * Längengrenze für die Adresse — und keine Stelle hier, an der jemand die
 * Blockgrösse vergisst.
 */
export async function listProjectsByNumbers(companyId: string, numbers: string[]) {
  const eindeutig = [...new Set(numbers.filter(Boolean))];
  if (eindeutig.length === 0) return [];
  return abfragen<Project>(BAUSTELLEN, companyId, {
    wo: [{ art: 'in', feld: 'projectNumber', werte: eindeutig }],
  });
}

/**
 * Baustellen zu einer Nummer — die Suche, die über die geladene Liste
 * hinausreicht.
 *
 * `formen` trägt weiterhin beide Schreibweisen (mit und ohne „PR-"). Das ist
 * keine Firestore-Eigenheit, sondern eine des Betriebs: beide Formen stehen
 * so in den Daten. Warum, steht in `baustellenSuche.ts`.
 */
export function findProjectsByNumber(companyId: string, formen: string[]) {
  if (formen.length === 0) return Promise.resolve([] as WithId<Project>[]);
  return abfragen<Project>(BAUSTELLEN, companyId, {
    wo: [{ art: 'in', feld: 'projectNumber', werte: formen }],
  });
}

export function listRecentProjects(companyId: string, max: number) {
  return abfragen<Project>(BAUSTELLEN, companyId, {
    sortiere: { feld: 'createdAt', absteigend: true },
    grenze: max,
  });
}

/** Baustellen, denen ein Mitarbeiter zugeordnet ist. */
export function listProjectsForEmployee(companyId: string, uid: string) {
  return abfragen<Project>(BAUSTELLEN, companyId, {
    wo: [{ art: 'enthaelt', feld: 'assignedEmployees', wert: uid }],
  });
}

export function subscribeRecentProjects(
  companyId: string,
  max: number,
  cb: (rows: WithId<Project>[]) => void,
  onError: (e: Error) => void,
) {
  return abonnieren<Project>(BAUSTELLEN, companyId, cb, onError, {
    sortiere: { feld: 'createdAt', absteigend: true },
    grenze: max,
  });
}

export type NewProject = Omit<Project, 'id' | 'companyId' | 'createdAt'>;

export function createProject(companyId: string, p: NewProject) {
  return anlegen(BAUSTELLEN, companyId, p);
}

export function updateProject(id: string, data: Partial<Project>) {
  return aendern(BAUSTELLEN, id, data);
}

export function deleteProject(id: string) {
  return loeschen(BAUSTELLEN, id);
}

/**
 * Baustellen suchen — serverseitig, mit Treffern in der Wortmitte.
 *
 * Dieselbe Narbe wie bei den Kunden: unter Firestore lud die Ansicht die
 * jüngsten paar hundert und filterte im Browser. Eine Baustelle aus dem
 * Vorjahr war damit unauffindbar, ohne dass irgendwo stand, warum.
 */
export function searchProjects(
  companyId: string, begriff: string, max = 300,
): Promise<WithId<Project>[]> {
  return abfragen<Project>(BAUSTELLEN, companyId, {
    oder: oderUeberSpalten(
      ['project_number', 'customer_name', 'address'], begriff,
    ),
    sortiere: { feld: 'projectNumber', absteigend: true },
    grenze: max,
  });
}
