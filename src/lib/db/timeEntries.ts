import { where } from 'firebase/firestore';
import type { TimeEntry } from '@/types';
import { mitFristOder } from '@/lib/frist';
import { buchungKonflikt } from '@/lib/tagesbuchungen';
import {
  queryTenant,
  subscribeTenant,
  createInTenant,
  updateInTenant,
  deleteInTenant,
  type WithId,
} from './core';

const COLLECTION = 'timeEntries';

/**
 * Eigene Eintraege AB einem Datum.
 *
 * Die Grenze ist nicht optional. Ohne sie las diese Abfrage jede Buchung
 * eines Mitarbeiters seit Eintritt — nach zehn Jahren rund 2.200 Dokumente,
 * bei JEDEM Aufruf der Startseite, und jedes Jahr mehr. Wer nur wissen will,
 * ob gestern gebucht wurde, braucht davon keines aus dem Vorjahr.
 */
export function listOwnEntriesSince(companyId: string, uid: string, from: string) {
  return queryTenant<TimeEntry>(
    COLLECTION,
    companyId,
    where('userId', '==', uid),
    where('date', '>=', from),
  );
}

/**
 * Live-Abo der eigenen Eintraege in einem Zeitraum.
 *
 * Vorher ohne Zeitraum: das Zeitkonto abonnierte die gesamte eigene
 * Vorgeschichte und hielt sie im Speicher, nur um die letzten Wochen
 * anzuzeigen. Ein Abo ist dabei teurer als ein einmaliges Laden — es bleibt
 * offen und laedt bei jeder Aenderung nach.
 */
export function subscribeOwnEntriesInRange(
  companyId: string,
  uid: string,
  from: string,
  to: string,
  cb: (rows: WithId<TimeEntry>[]) => void,
  onError: (e: Error) => void,
) {
  return subscribeTenant<TimeEntry>(
    COLLECTION,
    companyId,
    cb,
    onError,
    where('userId', '==', uid),
    where('date', '>=', from),
    where('date', '<=', to),
  );
}

/**
 * Einträge eines Zeitraums, live — für die Mitarbeiterübersicht.
 *
 * Vorher lief dort `subscribeAllEntries`: alle Zeiteinträge des Betriebs seit
 * Einführung, im Browser auf den Monat gefiltert. Bei zwanzig Monteuren sind
 * das nach fünf Jahren über zwanzigtausend Dokumente je Seitenaufruf —
 * langsam, und weil Firestore je gelesenem Dokument abrechnet, unnötig teuer.
 *
 * Der Zeitraum ist ein Jahr, nicht ein Monat: der Resturlaub zählt die
 * Urlaubstage des ganzen Jahres, sonst stünde dort für jeden Monat der volle
 * Anspruch. Der Vergleich läuft über den Datums-STRING, was bei ISO-Angaben
 * gleicher Länge zeichenweise dasselbe ist wie ein Datumsvergleich.
 */
export function subscribeEntriesInRange(
  companyId: string,
  from: string,
  to: string,
  cb: (rows: WithId<TimeEntry>[]) => void,
  onError: (e: Error) => void,
) {
  return subscribeTenant<TimeEntry>(
    COLLECTION,
    companyId,
    cb,
    onError,
    where('date', '>=', from),
    where('date', '<=', to),
  );
}

/**
 * Einträge eines Zeitraums, einmalig geladen.
 *
 * Für die Zeitraum-Exporte: die Ansicht hält nur das angezeigte Jahr, ein
 * Stundennachweis darf aber über den Jahreswechsel gehen. Würde er aus der
 * geladenen Liste gefiltert, fehlte der Dezember im PDF — ohne Hinweis.
 */
export function listEntriesInRange(companyId: string, from: string, to: string) {
  return queryTenant<TimeEntry>(
    COLLECTION,
    companyId,
    where('date', '>=', from),
    where('date', '<=', to),
  );
}

/**
 * Eintraege zu bestimmten Baustellen — fuer das Projekt-Radar.
 *
 * Das Radar verglich Ist gegen Budget und holte sich dafuer JEDEN
 * Zeiteintrag des Betriebs. Ein Budget laeuft ueber die Laufzeit der
 * Baustelle, nicht ueber einen Zeitraum, also liess sich das nicht ueber das
 * Datum begrenzen — wohl aber ueber die Baustelle. Abgeschlossene Baustellen
 * fallen damit weg, und die machen nach ein paar Jahren den Grossteil aus.
 *
 * Je Baustelle eine Abfrage, nebeneinander. Zwei Gleichheitsfilter brauchen
 * in Firestore keinen zusammengesetzten Index.
 *
 * Gesucht wird nach MEHREREN Schreibweisen: `normProjectNumber` entfernt ein
 * fuehrendes „PR-", das aus Altbestaenden stammen kann. Eine Abfrage nur auf
 * die blanke Nummer uebersaehe solche Eintraege stillschweigend — und eine zu
 * niedrige Ist-Zeit zeigt eine gruene Ampel auf einer gerissenen Baustelle.
 */
export async function listEntriesForProjects(
  companyId: string,
  projectNumbers: string[],
): Promise<WithId<TimeEntry>[]> {
  const varianten = new Map<string, string[]>();
  for (const roh of projectNumbers) {
    const blank = (roh ?? '').trim().replace(/^PR-/i, '');
    if (!blank) continue;
    varianten.set(blank, [...new Set([roh.trim(), blank, `PR-${blank}`])]);
  }
  if (varianten.size === 0) return [];

  const teile = await Promise.all(
    [...varianten.values()].map((formen) =>
      queryTenant<TimeEntry>(COLLECTION, companyId, where('projectNumber', 'in', formen)),
    ),
  );
  // Dieselbe Baustelle kann nicht doppelt vorkommen, verschiedene Baustellen
  // teilen keine Eintraege — trotzdem ueber die id entdoppeln, damit ein
  // kuenftiger ueberlappender Aufruf nicht still doppelt zaehlt.
  const nachId = new Map<string, WithId<TimeEntry>>();
  for (const e of teile.flat()) nachId.set(e.id, e);
  return [...nachId.values()];
}

export type NewTimeEntry = Omit<TimeEntry, 'id' | 'companyId' | 'createdAt'>;

/**
 * ALLE Einträge eines Mitarbeiters an einem Datum.
 *
 * Vorher gab diese Funktion den ERSTEN zurück und hieß `findEntryForDate` —
 * das reichte, solange je Tag nur ein Eintrag erlaubt war. Seit ein Monteur
 * mehrere Baustellen an einem Tag buchen darf, muss die Regel alle sehen:
 * ob noch etwas dazu darf, hängt davon ab, WAS schon da steht (siehe
 * `lib/tagesbuchungen.ts`).
 *
 * `exceptId` blendet den gerade bearbeiteten Eintrag aus — sonst meldete
 * jede Änderung einen Konflikt mit sich selbst.
 */
export async function eintraegeAmTag(
  companyId: string,
  uid: string,
  date: string,
  exceptId?: string,
): Promise<WithId<TimeEntry>[]> {
  const rows = await queryTenant<TimeEntry>(
    COLLECTION,
    companyId,
    where('userId', '==', uid),
    where('date', '==', date),
  );
  return rows.filter((r) => r.id !== exceptId);
}

/**
 * Wird geworfen, wenn an diesem Tag nicht mehr dazugebucht werden darf.
 *
 * DER GRUND STEHT IN DER MELDUNG, nicht nur die Tatsache. Es gibt vier
 * verschiedene Fälle mit vier verschiedenen Handlungen (siehe
 * `lib/tagesbuchungen.ts`); ein gemeinsames „geht nicht" ließe den Monteur
 * raten, was er tun soll.
 */
export class DuplicateEntryError extends Error {
  constructor(
    public readonly date: string,
    public readonly grund: string,
  ) {
    // Der TAG gehoert in die Meldung: sie landet auch in Protokollen und in
    // der Warteschlange fuer Offline-Schreibvorgaenge, wo der Zusammenhang
    // sonst fehlt. Die Oberflaeche zeigt `grund` allein.
    super(`${date}: ${grund}`);
    this.name = 'DuplicateEntryError';
  }
}

/**
 * Legt einen Zeiteintrag an. Blockt eine zweite Buchung am selben Tag — der
 * Legacy-Schutz (2287-2293), der hier fehlte: mehrere Einträge pro Tag
 * verfälschen den Überstunden-Saldo unbemerkt. Gilt bewusst auch für den
 * Sprachpfad, deshalb sitzt die Prüfung hier und nicht nur im Formular.
 */
/**
 * Wie lange die Doppelbuchungsprüfung den Monteur warten lassen darf.
 *
 * AUS DEM BETRIEB GEMELDET: „das Erfassen einer Zeitbuchung hat lange
 * gedauert". Eine der Ursachen steht hier — die Prüfung ist eine ABFRAGE, und
 * Firestore-Abfragen haben keine Zeitgrenze. Auf einer zähen Verbindung im
 * Keller wartete das Speichern also unbegrenzt, bevor der Schreibvorgang
 * überhaupt losging.
 */
const DUPLIKAT_FRIST_MS = 3000;

export async function createTimeEntry(companyId: string, entry: NewTimeEntry) {
  /**
   * WAS BEI ABLAUF DER FRIST PASSIERT — und warum es so herum richtig ist.
   *
   * Antwortet der Server nicht rechtzeitig, wird trotzdem gebucht. Die beiden
   * Fehler sind ungleich schwer: eine Doppelbuchung steht sichtbar in „Meine
   * Einträge" und lässt sich in zehn Sekunden löschen. Eine Zeit, die sich
   * nicht buchen lässt, kostet den Monteur den Nachtrag am Abend — und das
   * ist genau der Weg zurück zum Zettel im Auto.
   *
   * Das Formular prüft ohnehin zuerst gegen die geladenen Tage; diese Abfrage
   * fängt nur die Tage AUSSERHALB des geladenen Fensters ab.
   */
  const vorhandene = await mitFristOder(
    eintraegeAmTag(companyId, entry.userId, entry.date),
    async () => [],
    DUPLIKAT_FRIST_MS,
  );
  const grund = buchungKonflikt(entry, vorhandene);
  if (grund) throw new DuplicateEntryError(entry.date, grund);
  return createInTenant(COLLECTION, companyId, entry);
}

/**
 * Ändert einen Zeiteintrag — und blockt dabei dieselbe Doppelbuchung wie
 * beim Anlegen.
 *
 * Die Prüfung fehlte hier: `createTimeEntry` liess keine zweite Buchung am
 * selben Tag zu, das BEARBEITEN durfte ein Datum aber auf einen Tag
 * schieben, an dem bereits gebucht war. Danach stehen zwei Einträge auf
 * demselben Tag, der Überstunden-Saldo zählt beide, und niemand sieht es —
 * die Zahl ist einfach falsch. Erreichbar war das für jeden Benutzer an
 * jedem Tag.
 *
 * `owner` ist bewusst Pflicht und meint den EIGENTÜMER des Eintrags, nicht
 * den Bearbeiter: korrigiert die Buchhaltung den Eintrag eines Monteurs,
 * muss gegen dessen Tage geprüft werden, nicht gegen ihre eigenen.
 *
 * `exceptId` blendet den gerade bearbeiteten Eintrag aus — sonst meldete
 * jede Änderung, die das Datum unangetastet lässt, einen Konflikt mit sich
 * selbst.
 */
export async function updateTimeEntry(
  id: string,
  data: Partial<TimeEntry>,
  owner: { companyId: string; userId: string },
) {
  /*
    GEPRUEFT WIRD JETZT AUCH DIE BAUSTELLE, nicht nur der Tag.

    Vorher genuegte es zu wissen, DASS an dem Tag schon etwas steht — je Tag
    war ohnehin nur ein Eintrag erlaubt. Jetzt entscheidet mit, WAS dort
    steht: zwei Eintraege desselben Tages auf DIESELBE Baustelle waeren genau
    die Doppelbuchung, die den Saldo verfaelscht.

    Die Pruefung haengt weiterhin am mitgeschickten Datum. Das ist keine
    Luecke, sondern eine Bedingung an die Aufrufstelle: `TimeForm` schickt
    beim Bearbeiten IMMER den vollstaendigen Satz aus Datum, Status und
    Baustelle mit (`payload`), und andere Aufrufer gibt es nicht.
  */
  if (data.date) {
    const vorhandene = await mitFristOder(
      eintraegeAmTag(owner.companyId, owner.userId, data.date, id),
      async () => [],
      DUPLIKAT_FRIST_MS,
    );
    const grund = buchungKonflikt(
      { status: data.status ?? 'Anwesend', projectNumber: data.projectNumber },
      vorhandene,
    );
    if (grund) throw new DuplicateEntryError(data.date, grund);
  }
  return updateInTenant(COLLECTION, id, data);
}

export function deleteTimeEntry(id: string) {
  return deleteInTenant(COLLECTION, id);
}

