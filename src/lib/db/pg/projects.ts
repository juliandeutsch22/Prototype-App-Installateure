/**
 * Baustellen — auf Postgres.
 *
 * Zwei Firestore-Eigenheiten sind beim Umzug weggefallen, beide unten
 * benannt.
 */
import type { Project } from '@/types';
import { belegNummer, PRAEFIX_VORGABE } from '@/lib/praefixe';
import { BAUSTELLEN_AUSWAHL_GRENZE } from '@/lib/listengrenzen';
import { abfragen, abonnieren, anlegen, aendern, derClient, loeschen, type WithId } from './kern';
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
 * Bestimmte Baustellen, nach Id.
 *
 * WARUM NICHT ÜBER DIE NUMMER. Die Projektnummer ist der Geschäftsschlüssel
 * und steht überall in der Oberfläche — aber sie ist ÄNDERBAR. Wird ein
 * Zahlendreher korrigiert, führt jeder Link auf die Akte ins Leere, der über
 * die Nummer gebaut war; die Kennung überlebt das. Eindeutig ist die Nummer
 * zwar (`projects_nummer_je_betrieb`), das macht sie aber nicht stabil.
 *
 * Die Blockbildung steht in `kern.ts`, nicht hier — siehe
 * `listProjectsByNumbers`.
 */
export async function listProjectsByIds(companyId: string, ids: string[]) {
  const eindeutig = [...new Set(ids.filter(Boolean))];
  if (eindeutig.length === 0) return [];
  return abfragen<Project>(BAUSTELLEN, companyId, {
    wo: [{ art: 'in', feld: 'id', werte: eindeutig }],
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

/**
 * Reserviert eine Baustellennummer — als VORSCHLAG, nicht als Zwang.
 *
 * WARUM ES DAS VORHER NICHT GAB: die Baustellennummer war ein Pflichtfeld,
 * das ein Mensch tippt. Automatisch entstand sie an genau einer Stelle, beim
 * Annehmen eines Angebots. Damit hätte ein einstellbarer Vorsatz für
 * Baustellen nichts bewirkt — es gäbe niemanden, der ihn anwendet.
 *
 * ÜBERSCHREIBBAR BLEIBT SIE. Manche Betriebe führen die Nummer des
 * Bauträgers oder des Architekten; ein Pflichtschema nähme ihnen das weg. Der
 * Zähler läuft dabei trotzdem weiter — sonst schlüge er beim nächsten Mal
 * dieselbe Nummer wieder vor.
 */
export async function reserveProjectNumber(
  companyId: string,
  opts: { seedFrom: number; praefix?: string },
): Promise<string> {
  void companyId;
  const jahr = new Date().getFullYear();
  const { data, error } = await derClient().rpc('naechste_nummer', {
    p_art: 'projects',
    p_jahr: jahr,
    p_seed: Math.max(opts.seedFrom, 0),
    p_wunsch: null,
  });
  if (error) throw new Error(error.message);
  return belegNummer(opts.praefix ?? PRAEFIX_VORGABE.baustelle, jahr, Number(data));
}

export type NewProject = Omit<Project, 'id' | 'companyId' | 'createdAt'>;

/**
 * EIN LEERES DATUM IST KEIN DATUM.
 *
 * DER FEHLER, DEN DAS BEHEBT — und er war schon im Betrieb, nicht neu. Ein
 * Datumsfeld, das niemand ausfüllt, liefert `''`. Postgres nimmt das für eine
 * `date`-Spalte nicht an („invalid input syntax for type date"), und die Maske
 * meldete „Die Baustelle konnte nicht gespeichert werden." Eine Baustelle OHNE
 * Beginn und Ende — der Normalfall bei einem kurzfristigen Auftrag — liess
 * sich damit gar nicht anlegen.
 *
 * Gefunden hat das der Durchklick im echten Browser. Die Ansichtstests konnten
 * es nicht finden: dort ist die Datenschicht ersetzt, und eine Nachbildung
 * nimmt jede Zeichenkette an.
 *
 * WARUM HIER UND NICHT IN DER MASKE. Beide Masken — Anlegen in der Liste,
 * Ändern in der Akte — gehen hier durch. In der Maske behoben wäre es zweimal
 * dieselbe Regel, und die dritte Maske hätte den Fehler wieder. Und der Grund
 * ist ein Postgres-Grund: Firestore nahm `''` klaglos an.
 *
 * Die App-Typen sagen ohnehin `startDate?: string` — „nicht angegeben" heisst
 * dort `undefined`, nie die leere Zeichenkette.
 */
const DATUMSFELDER = ['startDate', 'endDate'] as const;

export function createProject(companyId: string, p: NewProject) {
  const rein = { ...p };
  // Weglassen: `anlegen` überspringt `undefined`, die Spalte bleibt leer.
  for (const feld of DATUMSFELDER) if (rein[feld] === '') delete rein[feld];
  return anlegen(BAUSTELLEN, companyId, rein);
}

export function updateProject(id: string, data: Partial<Project>) {
  /*
    BEIM ÄNDERN REICHT WEGLASSEN NICHT. Wer ein eingetragenes Datum wieder
    LEERT, will es los sein — ein weggelassenes Feld bliebe in der Datenbank
    stehen, und die Baustelle behielte ein Enddatum, das gerade gelöscht
    wurde. Deshalb `null`: das heisst „diese Spalte leeren".
  */
  const rein: Record<string, unknown> = { ...data };
  for (const feld of DATUMSFELDER) if (rein[feld] === '') rein[feld] = null;
  return aendern(BAUSTELLEN, id, rein as Partial<Project>);
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
