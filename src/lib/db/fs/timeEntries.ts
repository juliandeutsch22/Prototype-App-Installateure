import { where } from 'firebase/firestore';
import type { TimeEntry } from '@/types';
import { writeWithOfflineNotice } from '@/lib/offlineWrite';
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
/**
 * Nur die URLAUBSTAGE eines Zeitraums — für den Resturlaub.
 *
 * WARUM EINE EIGENE ABFRAGE UND NICHT DER JAHRESBESTAND. Der Anspruch dieses
 * Jahres hängt am Rest des Vorjahres, und der am Jahr davor; gerechnet werden
 * muss also der ganze Verlauf seit dem Startdatum. Den kompletten
 * Zeitbestand mehrerer Jahre dafür zu laden wäre um ein Vielfaches mehr, als
 * die Frage braucht — bei zehn Monteuren sind das Zehntausende Buchungen
 * gegenüber ein paar Hundert Urlaubstagen.
 *
 * Gefiltert wird deshalb SERVERSEITIG auf den Status. Die Alternative — alles
 * holen und im Browser filtern — ist genau die Sorte Abfrage, die dieser
 * Anwendung schon einmal die Ladezeit gekostet hat.
 */
export function listUrlaubstage(companyId: string, from: string, to: string) {
  return queryTenant<TimeEntry>(
    COLLECTION,
    companyId,
    where('status', '==', 'Urlaub'),
    where('date', '>=', from),
    where('date', '<=', to),
  );
}

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
 * Legt an. OHNE die Doppelbuchungsprüfung — die steht eine Ebene höher.
 *
 * Sie ist keine Eigenschaft von Firestore, sondern eine Regel des Betriebs,
 * und eine Regel, die in zwei Fassungen nebeneinander steht, läuft
 * auseinander. Siehe `db/timeEntries.ts`.
 */
export function anlegen(companyId: string, entry: NewTimeEntry) {
  return createInTenant(COLLECTION, companyId, entry);
}

export function aendern(id: string, data: Partial<TimeEntry>) {
  return updateInTenant(COLLECTION, id, data);
}

export function loeschen(id: string) {
  return deleteInTenant(COLLECTION, id);
}

/**
 * Dieselben Namen wie in `pg/` — hier trägt sie Firestore selbst.
 *
 * Das SDK nimmt einen Schreibvorgang ohne Empfang in seinen lokalen
 * Zwischenspeicher und sendet ihn nach; `writeWithOfflineNotice` wartet nur
 * begrenzt auf die Serverbestätigung und meldet sonst „vorgemerkt". Ein
 * eigenes Ausgangsfach wäre hier eine zweite Warteschlange neben der des SDK
 * — zwei Fassungen derselben Zusage, und die laufen auseinander.
 *
 * Diese beiden Zeilen fallen mit Stufe 9 weg.
 */
export function anlegenOhneEmpfang(companyId: string, entry: NewTimeEntry) {
  return writeWithOfflineNotice(anlegen(companyId, entry));
}

export function aendernOhneEmpfang(id: string, data: Partial<TimeEntry>) {
  return writeWithOfflineNotice(aendern(id, data));
}
