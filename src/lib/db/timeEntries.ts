/**
 * Zeiterfassung.
 *
 * Diese Datei ist mehr als eine Weiche: sie trägt die
 * DOPPELBUCHUNGSPRÜFUNG. Die gehört hierher und nicht in `fs/` oder `pg/`,
 * weil sie eine Regel des Betriebs ist und keine Eigenschaft der Datenbank —
 * und weil eine Sicherheitsregel, die in zwei Fassungen nebeneinander steht,
 * früher oder später auseinanderläuft.
 *
 * Die Signaturen sind der Vertrag mit den Ansichten; siehe
 * `tests/unit/datenschichtVertrag.test.ts`.
 */
import type { TimeEntry } from '@/types';
import { mitFristOder } from '@/lib/frist';
import { buchungKonflikt } from '@/lib/tagesbuchungen';
import type { WithId } from './core';
import type { WriteOutcome } from '@/lib/sync/ausgangsfach';
import * as pg from './pg/timeEntries';

export type NewTimeEntry = Omit<TimeEntry, 'id' | 'companyId' | 'createdAt'>;

export function listOwnEntriesSince(
  companyId: string, uid: string, from: string,
): Promise<WithId<TimeEntry>[]> {
  return pg.listOwnEntriesSince(companyId, uid, from);
}

/**
 * Die eigenen Einträge eines Zeitraums — für den Eintrittsmonat im Saldo
 * (siehe `saldoAusBilanzen`).
 */
export function listOwnEntriesInRange(
  companyId: string, uid: string, from: string, to: string,
): Promise<WithId<TimeEntry>[]> {
  return pg.listOwnEntriesInRange(companyId, uid, from, to);
}

export function subscribeOwnEntriesInRange(
  companyId: string,
  uid: string,
  from: string,
  to: string,
  cb: (rows: WithId<TimeEntry>[]) => void,
  onError: (e: Error) => void,
): () => void {
  return pg.subscribeOwnEntriesInRange(companyId, uid, from, to, cb, onError);
}

export function subscribeEntriesInRange(
  companyId: string,
  from: string,
  to: string,
  cb: (rows: WithId<TimeEntry>[]) => void,
  onError: (e: Error) => void,
): () => void {
  return pg.subscribeEntriesInRange(companyId, from, to, cb, onError);
}

export function listEntriesInRange(
  companyId: string, from: string, to: string,
): Promise<WithId<TimeEntry>[]> {
  return pg.listEntriesInRange(companyId, from, to);
}

/**
 * Nur die Urlaubstage eines Zeitraums — für den Resturlaub.
 *
 * Steht als eigene Weiche neben `listEntriesInRange`, weil sie eine andere
 * Frage beantwortet: nicht „was war in diesem Zeitraum los", sondern „wie
 * viel Urlaub wurde seit dem Startdatum verbraucht". Beide über einen Aufruf
 * zu bedienen hiesse, dem Aufrufer das Filtern zu überlassen — und damit dem
 * Browser eine Arbeit, die die Datenbank in derselben Abfrage erledigt.
 */
export function listUrlaubstage(
  companyId: string, from: string, to: string,
): Promise<WithId<TimeEntry>[]> {
  return pg.listUrlaubstage(companyId, from, to);
}

export function listEntriesForProjects(
  companyId: string, projectNumbers: string[],
): Promise<WithId<TimeEntry>[]> {
  return pg.listEntriesForProjects(companyId, projectNumbers);
}

export function eintraegeAmTag(
  companyId: string, uid: string, date: string, exceptId?: string,
): Promise<WithId<TimeEntry>[]> {
  return pg.eintraegeAmTag(companyId, uid, date, exceptId);
}

/**
 * Wird geworfen, wenn an diesem Tag nicht mehr dazugebucht werden darf.
 *
 * DER GRUND STEHT IN DER MELDUNG, nicht nur die Tatsache. Es gibt vier
 * verschiedene Fälle mit vier verschiedenen Handlungen (siehe
 * `lib/tagesbuchungen.ts`); ein gemeinsames „geht nicht" liesse den Monteur
 * raten, was er tun soll.
 */
export class DuplicateEntryError extends Error {
  constructor(
    public readonly date: string,
    public readonly grund: string,
  ) {
    // Der TAG gehört in die Meldung: sie landet auch in Protokollen und in
    // der Warteschlange für Offline-Schreibvorgänge, wo der Zusammenhang
    // sonst fehlt. Die Oberfläche zeigt `grund` allein.
    super(`${date}: ${grund}`);
    this.name = 'DuplicateEntryError';
  }
}

/**
 * Wie lange die Doppelbuchungsprüfung den Monteur warten lassen darf.
 *
 * AUS DEM BETRIEB GEMELDET: „das Erfassen einer Zeitbuchung hat lange
 * gedauert". Eine der Ursachen steht hier — die Prüfung ist eine ABFRAGE, und
 * eine Abfrage hat keine Zeitgrenze. Auf einer zähen Verbindung im Keller
 * wartete das Speichern also unbegrenzt, bevor der Schreibvorgang überhaupt
 * losging.
 */
const DUPLIKAT_FRIST_MS = 3000;

/**
 * Legt einen Zeiteintrag an und blockt eine zweite Buchung am selben Tag.
 *
 * WAS BEI ABLAUF DER FRIST PASSIERT — und warum es so herum richtig ist.
 * Antwortet der Server nicht rechtzeitig, wird trotzdem gebucht. Die beiden
 * Fehler sind ungleich schwer: eine Doppelbuchung steht sichtbar in „Meine
 * Einträge" und lässt sich in zehn Sekunden löschen. Eine Zeit, die sich
 * nicht buchen lässt, kostet den Monteur den Nachtrag am Abend — und das ist
 * genau der Weg zurück zum Zettel im Auto.
 *
 * Das Formular prüft ohnehin zuerst gegen die geladenen Tage; diese Abfrage
 * fängt nur die Tage AUSSERHALB des geladenen Fensters ab.
 */
export async function createTimeEntry(companyId: string, entry: NewTimeEntry): Promise<string> {
  const vorhandene = await mitFristOder(
    eintraegeAmTag(companyId, entry.userId, entry.date),
    async () => [],
    DUPLIKAT_FRIST_MS,
  );
  const grund = buchungKonflikt(entry, vorhandene);
  if (grund) throw new DuplicateEntryError(entry.date, grund);
  return pg.anlegen(companyId, entry);
}

/**
 * DASSELBE FÜR DEN MONTEUR OHNE EMPFANG — mit derselben Doppelbuchungsprüfung.
 *
 * WARUM ES DIESE ZWEITE FASSUNG GIBT und `createTimeEntry` nicht einfach
 * umgestellt wurde: nicht jeder Aufrufer will ein Vormerken. Die Ansicht im
 * Büro sitzt am Schreibtisch; eine Meldung „wird nachgesendet" wäre dort
 * verwirrend, und ein stillschweigend vorgemerkter Vorgang in der
 * Einsatzplanung noch schlimmer.
 *
 * Die Prüfung auf Doppelbuchung läuft VOR dem Vormerken und mit Frist: ohne
 * Empfang kommt sie nicht durch, dann gilt `mitFristOder` und es wird
 * geschrieben. Das ist die richtige Reihenfolge — eine Buchung zu verlieren
 * wiegt schwerer als eine doppelte, die im Büro auffällt.
 */
export async function createTimeEntryOhneEmpfang(
  companyId: string, entry: NewTimeEntry,
): Promise<WriteOutcome> {
  const vorhandene = await mitFristOder(
    eintraegeAmTag(companyId, entry.userId, entry.date),
    async () => [],
    DUPLIKAT_FRIST_MS,
  );
  const grund = buchungKonflikt(entry, vorhandene);
  if (grund) throw new DuplicateEntryError(entry.date, grund);

  const { stand } = await pg.anlegenOhneEmpfang(companyId, entry);
  return stand;
}

export async function updateTimeEntryOhneEmpfang(
  id: string,
  data: Partial<TimeEntry>,
  owner: { companyId: string; userId: string },
): Promise<WriteOutcome> {
  if (data.date) {
    const vorhandene = await mitFristOder(
      eintraegeAmTag(owner.companyId, owner.userId, data.date, id),
      async () => [],
      DUPLIKAT_FRIST_MS,
    );
    const grund = buchungKonflikt(
      {
        status: data.status ?? 'Anwesend',
        projectNumber: data.projectNumber,
        startTime: data.startTime,
        endTime: data.endTime,
      },
      vorhandene,
    );
    if (grund) throw new DuplicateEntryError(data.date, grund);
  }
  return pg.aendernOhneEmpfang(id, data);
}

/**
 * Ändert einen Zeiteintrag — und blockt dabei dieselbe Doppelbuchung wie beim
 * Anlegen.
 *
 * Die Prüfung fehlte hier einmal: `createTimeEntry` liess keine zweite
 * Buchung am selben Tag zu, das BEARBEITEN durfte ein Datum aber auf einen
 * Tag schieben, an dem bereits gebucht war. Danach stehen zwei Einträge auf
 * demselben Tag, der Überstunden-Saldo zählt beide, und niemand sieht es.
 *
 * `owner` meint den EIGENTÜMER des Eintrags, nicht den Bearbeiter: korrigiert
 * die Buchhaltung den Eintrag eines Monteurs, muss gegen dessen Tage geprüft
 * werden, nicht gegen ihre eigenen.
 */
export async function updateTimeEntry(
  id: string,
  data: Partial<TimeEntry>,
  owner: { companyId: string; userId: string },
): Promise<void> {
  if (data.date) {
    const vorhandene = await mitFristOder(
      eintraegeAmTag(owner.companyId, owner.userId, data.date, id),
      async () => [],
      DUPLIKAT_FRIST_MS,
    );
    const grund = buchungKonflikt(
      {
        status: data.status ?? 'Anwesend',
        projectNumber: data.projectNumber,
        startTime: data.startTime,
        endTime: data.endTime,
      },
      vorhandene,
    );
    if (grund) throw new DuplicateEntryError(data.date, grund);
  }
  return pg.aendern(id, data);
}

export function deleteTimeEntry(id: string): Promise<void> {
  return pg.loeschen(id);
}
