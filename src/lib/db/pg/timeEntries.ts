/**
 * Zeiterfassung — auf Postgres.
 *
 * Reine Zugriffe. Die Doppelbuchungsprüfung steht eine Ebene höher, in
 * `db/timeEntries.ts`: sie ist eine Regel des Betriebs und keine Eigenschaft
 * der Datenbank, und eine Regel in zwei Fassungen läuft auseinander.
 */
import type { TimeEntry } from '@/types';
import { abfragen, abonnieren, anlegenMitKennung, aendern as kernAendern, loeschen as kernLoeschen, derClient, SEITE, type WithId } from './kern';

import {
  aendernOhneEmpfang as fachAendern, anlegenOhneEmpfang as fachAnlegen,
} from './ohneEmpfang';

const ZEITEN = 'time_entries';

export function listOwnEntriesSince(companyId: string, uid: string, from: string) {
  return abfragen<TimeEntry>(ZEITEN, companyId, {
    wo: [
      { art: 'gleich', feld: 'userId', wert: uid },
      { art: 'ab', feld: 'date', wert: from },
    ],
  });
}

/** Die eigenen Einträge eines Zeitraums, beide Grenzen eingeschlossen. */
export function listOwnEntriesInRange(companyId: string, uid: string, from: string, to: string) {
  return abfragen<TimeEntry>(ZEITEN, companyId, {
    wo: [
      { art: 'gleich', feld: 'userId', wert: uid },
      { art: 'ab', feld: 'date', wert: from },
      { art: 'bis', feld: 'date', wert: to },
    ],
  });
}

export function subscribeOwnEntriesInRange(
  companyId: string,
  uid: string,
  from: string,
  to: string,
  cb: (rows: WithId<TimeEntry>[]) => void,
  onError: (e: Error) => void,
) {
  return abonnieren<TimeEntry>(ZEITEN, companyId, cb, onError, {
    wo: [
      { art: 'gleich', feld: 'userId', wert: uid },
      { art: 'ab', feld: 'date', wert: from },
      { art: 'bis', feld: 'date', wert: to },
    ],
  });
}

export function subscribeEntriesInRange(
  companyId: string,
  from: string,
  to: string,
  cb: (rows: WithId<TimeEntry>[]) => void,
  onError: (e: Error) => void,
) {
  return abonnieren<TimeEntry>(ZEITEN, companyId, cb, onError, {
    wo: [
      { art: 'ab', feld: 'date', wert: from },
      { art: 'bis', feld: 'date', wert: to },
    ],
  });
}

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
  return abfragen<TimeEntry>(ZEITEN, companyId, {
    wo: [
      { art: 'gleich', feld: 'status', wert: 'Urlaub' },
      { art: 'ab', feld: 'date', wert: from },
      { art: 'bis', feld: 'date', wert: to },
    ],
    sortiere: { feld: 'date' },
  });
}

export function listEntriesInRange(companyId: string, from: string, to: string) {
  return abfragen<TimeEntry>(ZEITEN, companyId, {
    wo: [
      { art: 'ab', feld: 'date', wert: from },
      { art: 'bis', feld: 'date', wert: to },
    ],
  });
}

/**
 * Nur die Spalten, aus denen sich Arbeitszeit rechnen lässt — für den
 * Durchschnitt der 17 Wochen (Arbeitszeitgrenzen). Vier Monate Vorlauf mit
 * Kommentar, Kunde und Fahrzeug zu laden, wäre ein Vielfaches dessen, was
 * die Frage braucht.
 */
export function listArbeitszeitenInRange(companyId: string, from: string, to: string) {
  return abfragen<Pick<TimeEntry, 'userId' | 'date' | 'status' | 'startTime' | 'endTime' | 'breakDuration' | 'hours'>>(
    ZEITEN,
    companyId,
    {
      wo: [
        { art: 'ab', feld: 'date', wert: from },
        { art: 'bis', feld: 'date', wert: to },
      ],
      spalten: 'id,user_id,date,status,start_time,end_time,break_duration,hours',
    },
  );
}

/**
 * Einträge zu bestimmten Baustellen — für das Projekt-Radar.
 *
 * EINE Abfrage statt einer je Baustelle: Firestore brauchte je Baustelle eine
 * eigene `in`-Abfrage, weil zwei `in` in einer Abfrage nicht erlaubt waren.
 *
 * Gesucht wird weiterhin nach mehreren Schreibweisen — ein führendes „PR-"
 * stammt aus Altbeständen. Eine Abfrage nur auf die blanke Nummer übersähe
 * solche Einträge stillschweigend, und eine zu niedrige Ist-Zeit zeigt eine
 * grüne Ampel auf einer gerissenen Baustelle.
 */
export async function listEntriesForProjects(
  companyId: string,
  projectNumbers: string[],
): Promise<WithId<TimeEntry>[]> {
  const formen = new Set<string>();
  for (const roh of projectNumbers) {
    const blank = (roh ?? '').trim().replace(/^PR-/i, '');
    if (!blank) continue;
    formen.add(roh.trim());
    formen.add(blank);
    formen.add(`PR-${blank}`);
  }
  if (formen.size === 0) return [];
  return abfragen<TimeEntry>(ZEITEN, companyId, {
    wo: [{ art: 'in', feld: 'projectNumber', werte: [...formen] }],
  });
}

/** Was eine Person auf einer Baustelle gearbeitet hat — eine Art, eine Summe. */
export interface BaustellenStunden {
  /** Die Nummer ohne „PR-“, wie `normProjectNumber`. */
  projectNumber: string;
  userId: string | null;
  userName: string;
  /** Fach zählt ins Budget, Helfer daneben, Lehrling außerhalb (`budgetArt`). */
  art: 'fach' | 'helfer' | 'lehrling';
  minuten: number;
  /** Der letzte Tag mit Arbeitszeit. */
  zuletzt: string;
}

/**
 * Die Stunden der Baustellen — Summen, keine Buchungen.
 *
 * ÜBER EINE EIGENE FUNKTION (Testbericht Runde 5, M1): die Projektleitung
 * liest von den Buchungen nur die eigenen und rechnete damit ihr Budget
 * schön. `baustellen_stunden` gibt ihr die Summen aller, ohne Zeitkonto und
 * Abwesenheiten. Wer sie nicht bekommen darf, bekommt einen Fehler.
 *
 * SEITENWEISE, wie `abfragen`: PostgREST deckelt auch die Antwort einer
 * Funktion still bei 1000 Zeilen, und eine Zeile je Baustelle, Person und Art
 * erreicht das bei vielen Baustellen auf der Startseite. Die Funktion sortiert
 * fest, damit keine Zeile zwischen zwei Seiten verloren geht.
 */
export async function stundenDerBaustellen(projectNumbers: string[], seite = SEITE): Promise<BaustellenStunden[]> {
  const nummern = projectNumbers.filter((n) => (n ?? '').trim().replace(/^PR-/i, ''));
  if (nummern.length === 0) return [];
  type Zeile = {
    projekt: string; user_id: string | null; user_name: string | null;
    art: BaustellenStunden['art']; minuten: number; zuletzt: string;
  };
  const alle: Zeile[] = [];
  for (let von = 0; ; von += seite) {
    const { data, error } = await derClient()
      .rpc('baustellen_stunden', { p_nummern: nummern })
      .range(von, von + seite - 1);
    if (error) throw new Error(error.message);
    const teil = (data ?? []) as Zeile[];
    alle.push(...teil);
    if (teil.length < seite) break;
  }
  return alle.map((z) => ({
    projectNumber: z.projekt,
    userId: z.user_id,
    userName: z.user_name ?? '',
    art: z.art,
    minuten: Number(z.minuten) || 0,
    zuletzt: z.zuletzt,
  }));
}

export type NewTimeEntry = Omit<TimeEntry, 'id' | 'companyId' | 'createdAt'>;

export async function eintraegeAmTag(
  companyId: string,
  uid: string,
  date: string,
  exceptId?: string,
): Promise<WithId<TimeEntry>[]> {
  const rows = await abfragen<TimeEntry>(ZEITEN, companyId, {
    wo: [
      { art: 'gleich', feld: 'userId', wert: uid },
      { art: 'gleich', feld: 'date', wert: date },
    ],
  });
  return rows.filter((r) => r.id !== exceptId);
}

/**
 * Legt an — mit einer Kennung VOM GERÄT.
 *
 * Das ist der Unterschied zur Firestore-Fassung und der Grund, warum die
 * Zeitbuchung ohne Empfang überhaupt tragen kann: nur wenn die Kennung schon
 * feststeht, bevor der Server sie bestätigt, darf derselbe Vorgang zweimal
 * ankommen, ohne zweimal zu landen (siehe `lib/sync/ausgangsfach.ts`).
 */
export function anlegen(companyId: string, entry: NewTimeEntry) {
  return anlegenMitKennung(ZEITEN, companyId, crypto.randomUUID(), entry);
}

export function aendern(id: string, data: Partial<TimeEntry>) {
  return kernAendern(ZEITEN, id, data);
}

/**
 * Dasselbe, aber mit dem Ausgangsfach dahinter — für den Monteur im Keller.
 *
 * Getrennt von `anlegen`/`aendern`, weil nicht jeder Aufrufer ein Vormerken
 * will: das Büro sitzt am Schreibtisch, und eine Zeile, die dort „vorgemerkt"
 * meldet, verwirrt mehr, als sie hilft.
 */
export function anlegenOhneEmpfang(companyId: string, entry: NewTimeEntry) {
  return fachAnlegen(ZEITEN, companyId, entry as unknown as Record<string, unknown>);
}

export function aendernOhneEmpfang(id: string, data: Partial<TimeEntry>) {
  return fachAendern(ZEITEN, id, data as Record<string, unknown>);
}

export function loeschen(id: string) {
  return kernLoeschen(ZEITEN, id);
}
