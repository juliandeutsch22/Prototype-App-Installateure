/**
 * Einsatzplanung — auf Postgres.
 *
 * Der Unterschied zur Firestore-Fassung steht ganz unten: `saveAssignments`
 * war dort ein Batch aus Löschungen, Anlagen und einer Mitzieh-Änderung an
 * der Rüstliste; hier ist es EIN Aufruf, der in einer Transaktion läuft.
 */
import type { Assignment, KalenderAbo, KalenderAboArt } from '@/types';
import { plusTage } from '@shared/freistellung';
import { abfragen, abonnieren, derClient, kanalHalten, SEITE, type WithId } from './kern';
import { objektAlsZeile, zeileAlsObjekt } from './felder';
import { paarGeaendertAus, type PaarGrundlage } from '../paarFassung';
import { ruestlisteFrageAus, type RuestlisteErgebnis, type RuestlisteUmzug, type RuestlisteWahl } from '../ruestlisteFrage';

const EINSAETZE = 'assignments';

/**
 * Die anstehenden Einsätze eines Mitarbeiters, ab einem Datum.
 *
 * Die Obergrenze steht auf einer Zahl, die keine echte Planung verdeckt:
 * Baustellen werden Wochen im Voraus eingeteilt, nicht Jahre. Wird sie
 * erreicht, fehlt hinten der am weitesten entfernte Einsatz — nicht der
 * nächste, und darauf kommt es an.
 */
export function listUpcomingAssignments(
  companyId: string,
  uid: string,
  from: string,
  max = 200,
) {
  return abfragen<Assignment>(EINSAETZE, companyId, {
    wo: [
      { art: 'gleich', feld: 'userId', wert: uid },
      { art: 'ab', feld: 'date', wert: from },
    ],
    sortiere: { feld: 'date' },
    grenze: max,
  });
}

/** Einsätze an einem Datum (Planungsansicht). */
export function listAssignmentsForDate(companyId: string, date: string) {
  return abfragen<Assignment>(EINSAETZE, companyId, {
    wo: [{ art: 'gleich', feld: 'date', wert: date }],
  });
}

/** Einsätze EINES Mitarbeiters in einem Zeitraum — der Monatskalender. */
export function listAssignmentsForUserInRange(
  companyId: string,
  uid: string,
  from: string,
  to: string,
) {
  return abfragen<Assignment>(EINSAETZE, companyId, {
    wo: [
      { art: 'gleich', feld: 'userId', wert: uid },
      { art: 'ab', feld: 'date', wert: from },
      { art: 'bis', feld: 'date', wert: to },
    ],
  });
}

/**
 * Alle Einsätze des Betriebs in einem Zeitraum — einmal gelesen, nicht live.
 *
 * Für die Startseite (Nachtest 01.10.2026, Paket B): Auslastung der Woche
 * und „Baustellen ohne Einsatz in den nächsten 14 Tagen“. Der Zeitraum ist
 * kurz, die Grenze trotzdem gesetzt.
 */
export function listAssignmentsInRange(companyId: string, from: string, to: string, max = 3000) {
  return abfragen<Assignment>(EINSAETZE, companyId, {
    wo: [
      { art: 'ab', feld: 'date', wert: from },
      { art: 'bis', feld: 'date', wert: to },
    ],
    sortiere: { feld: 'date' },
    grenze: max,
  });
}

/**
 * Alle Einsätze eines ZEITRAUMS, live — das Wochenbrett.
 *
 * Warum nicht zweimal der Monat: eine Woche läuft regelmäßig über den
 * Monatswechsel. Zwei Abonnements müssten dann zusammengeführt werden, und
 * zwar an einer Stelle, an der ein Fehler wie eine leere Woche aussieht.
 */
export function subscribeAssignmentsInRange(
  companyId: string,
  from: string,
  to: string,
  cb: (rows: WithId<Assignment>[]) => void,
  onError: (e: Error) => void,
): () => void {
  return abonnieren<Assignment>(EINSAETZE, companyId, cb, onError, {
    wo: [
      { art: 'ab', feld: 'date', wert: from },
      { art: 'bis', feld: 'date', wert: to },
    ],
  });
}

/**
 * WIE VIELE BAUSTELLEN JE TAG GEPLANT SIND, live — die Markierungen im
 * Monatskalender der Tagesplanung (L9, `einsatz_tage`).
 *
 * Bis 17.11.2026 kam dafür der ganze Monat aller Einsätze in den Browser
 * (bei 50 Personen 1.050 Zeilen, 405 KB), nur um je Tag die Baustellen zu
 * zählen. Jetzt zählt die Datenbank: eine Zeile je Tag. Ändert sich im
 * Betrieb ein Einsatz, wird neu gezählt — gebündelt auf höchstens einmal je
 * Sekunde, ein Speichern mit mehreren Personen ist eine Meldung je Zeile.
 */
export function beobachteEinsatzTage(
  companyId: string,
  von: string,
  bis: string,
  cb: (tage: Map<string, number>) => void,
  onError: (e: Error) => void,
): () => void {
  let weg = false;
  let lauf = 0;
  let geplant: ReturnType<typeof setTimeout> | undefined;
  const zaehlen = async () => {
    const meiner = ++lauf;
    const { data, error } = await derClient().rpc('einsatz_tage', { p_von: von, p_bis: bis });
    // Eine ältere Antwort darf eine neuere nicht überschreiben.
    if (weg || meiner !== lauf) return;
    if (error) {
      onError(new Error(error.message));
      return;
    }
    cb(new Map(((data ?? []) as Array<{ datum: string; baustellen: number }>).map((z) => [z.datum, Number(z.baustellen)])));
  };
  const bald = () => {
    if (geplant) return;
    geplant = setTimeout(() => {
      geplant = undefined;
      void zaehlen();
    }, 1000);
  };
  void zaehlen();
  const stopp = kanalHalten({
    tabelle: EINSAETZE,
    filter: `company_id=eq.${companyId}`,
    beiAenderung: bald,
    beiBereit: bald,
    client: derClient(),
  });
  return () => {
    weg = true;
    if (geplant) clearTimeout(geplant);
    stopp();
  };
}

export type AssignmentInput = Omit<Assignment, 'id' | 'companyId' | 'createdAt'>;

/**
 * Speichern = die alte Einteilung dieses Paares aus Tag und Baustelle fällt
 * weg, die neue entsteht.
 *
 * ALLES ODER NICHTS, deshalb eine Datenbankfunktion und nicht drei Aufrufe.
 * Bräche die Verbindung zwischen Löschen und Schreiben ab — auf der
 * Baustelle keine Seltenheit —, wäre der Tag für diese Baustelle leer, und
 * niemand erführe davon.
 *
 * IM SELBEN ZUG zieht die Rüstliste des Einsatzes ihre Mitarbeiterliste
 * nach. Nicht aus Bequemlichkeit: an dieser Liste hängt die Entscheidung, ob
 * ein Monteur eine Position abhaken darf (`app.ruestliste_geschuetzt`).
 * Liefe sie hinterher und ginge dazwischen etwas schief, sähe der neue
 * Kollege das Material und käme beim Antippen nicht durch.
 */
export async function saveAssignments(
  companyId: string,
  date: string,
  projectNumber: string,
  rows: AssignmentInput[],
  /**
   * Worauf die Eingabe beruht (P1). Weicht das Paar in der Datenbank davon
   * ab, wird nichts geschrieben und `PaarGeaendert` geworfen. Ohne Angabe
   * wird nicht geprüft — wie bisher.
   */
  grundlage?: PaarGrundlage,
): Promise<void> {
  /*
    Der Betrieb steht im Anmeldekontext, die Datenbankfunktion holt ihn sich
    dort (`app.arbeitsbetrieb()` — beim Support der Betrieb des Einblicks).
    Der Parameter bleibt trotzdem in der Signatur: sie ist der Vertrag mit
    den Ansichten (`tests/unit/datenschichtVertrag.test.ts`), und ihn zu
    ändern wäre eine Änderung an jeder Aufrufstelle für nichts.
  */
  void companyId;

  /*
    Tag und Baustelle stehen im Kopf des Aufrufs, nicht in den Zeilen. Sie
    dort nochmals mitzuschicken hiesse, dass eine Zeile mit abweichendem
    Datum stillschweigend unter dem falschen Tag landete — die Funktion
    schreibt jede Zeile auf `p_datum`.
  */
  const zeilen = rows.map(({ date: _tag, projectNumber: _bau, ...rest }) => {
    void _tag;
    void _bau;
    return objektAlsZeile(EINSAETZE, rest);
  });
  const { error } = await derClient().rpc('einsatz_speichern', {
    p_datum: date,
    p_baustelle: projectNumber,
    p_zeilen: zeilen,
    ...(grundlage ? { p_grundlage: grundlage } : {}),
  });
  if (error) throw paarGeaendertAus(error) ?? new Error(error.message);
}

/**
 * Einen einzelnen Einsatz entfernen (Formular „Einsatz löschen“).
 *
 * DIE RÜSTLISTE ZIEHT MIT (P2): die Mannschaft der Liste schrumpft im selben
 * Zug. War es der Letzte und hängt eine Liste am Paar, fragt die Datenbank
 * bei `wahl = 'fragen'` zurück (`RuestlisteFrage`), statt die Liste still
 * verwaist stehen zu lassen. Ohne Wahl bleibt sie stehen, wie bisher.
 */
export async function deleteAssignment(id: string, wahl?: RuestlisteWahl): Promise<RuestlisteErgebnis | null> {
  /*
    ÜBER `einsatz_loeschen`, NICHT DIREKT IN DER TABELLE (P1): die Funktion
    sperrt erst das Paar aus Tag und Baustelle, dann die Zeile — wie jedes
    Speichern, Umplanen und die Folgetage. So läuft ein Löschen nie mitten
    in ein Speichern desselben Paares hinein, und die Prüfung der Fassung
    sieht es. Rechte und Fehlermeldung bleiben die des direkten Löschens.
  */
  const { data, error } = await derClient().rpc('einsatz_loeschen', { p_id: id, ...(wahl ? { p_ruestliste: wahl } : {}) });
  if (error) throw ruestlisteFrageAus(error) ?? new Error(error.message);
  return (data ?? null) as RuestlisteErgebnis | null;
}

/*
  DAS KALENDER-ABO (Entscheidung vom 02.10.2026). Der Link kommt nur beim
  Anlegen zurück; gespeichert ist sein Hashwert. Lesen darf jede Person nur
  das eigene (`kalender_abos_lesen`). Je Person gibt es zwei Arten — das
  eigene Abo und den Gesamtplan der Leitung (Plan 10.4, PR B).
*/
export async function kalenderAboStand(userId: string, art: KalenderAboArt = 'eigen'): Promise<KalenderAbo | null> {
  const { data, error } = await derClient()
    .from('kalender_abos')
    .select('angelegt_am, zuletzt_abgerufen')
    .eq('user_id', userId)
    .eq('art', art)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? zeileAlsObjekt<KalenderAbo>('kalender_abos', data as Record<string, unknown>) : null;
}

/** Einen neuen geheimen Schlüssel anlegen — der bisherige hört damit auf. */
export async function kalenderAboAnlegen(art: KalenderAboArt = 'eigen'): Promise<string> {
  const { data, error } = await derClient().rpc('kalender_abo_anlegen', { p_art: art });
  if (error) throw new Error(error.message);
  return String(data ?? '');
}

export async function kalenderAboBeenden(art: KalenderAboArt = 'eigen'): Promise<void> {
  const { error } = await derClient().rpc('kalender_abo_beenden', { p_art: art });
  if (error) throw new Error(error.message);
}

/**
 * Nur Person, Tag und Baustelle der Einsätze — für die Startseite der
 * Leitung (Ladezeit, 19.10.2026): „Baustellen ohne Einsatz“ und die
 * Auslastung der Woche fragen nichts anderes. Ganze Einsätze über das
 * Planfenster waren nach den Buchungen das grösste Stück der Startseite.
 */
/**
 * Je Baustelle der letzte Einsatz vor `heute` und der nächste ab `heute`,
 * im Fenster `von`–`bis` — für „Baustellen ohne Einsatz“ (Ladezeit,
 * 19.10.2026). Eine Zeile je Baustelle statt jedes Einsatzes; seitenweise,
 * weil auch die Antwort einer Funktion bei 1.000 Zeilen endet.
 */
export async function baustellenEinsatzlage(
  companyId: string, von: string, heute: string, bis: string, seite = SEITE,
): Promise<{ projectNumber: string; zuletzt: string | null; naechster: string | null }[]> {
  type Zeile = { project_number: string; zuletzt: string | null; naechster: string | null };
  const alle: Zeile[] = [];
  for (let ab = 0; ; ab += seite) {
    const { data, error } = await derClient()
      .rpc('baustellen_einsatzlage', { p_company: companyId, p_von: von, p_heute: heute, p_bis: bis })
      .range(ab, ab + seite - 1);
    if (error) throw new Error(error.message);
    const teil = (data ?? []) as Zeile[];
    alle.push(...teil);
    if (teil.length < seite) break;
  }
  return alle.map((z) => ({ projectNumber: z.project_number, zuletzt: z.zuletzt, naechster: z.naechster }));
}

/**
 * DIE AKTIVEN BAUSTELLEN OHNE EINSATZ in den nächsten 14 Tagen
 * (`baustellen_ohne_einsatz`, Durchsicht 15.11.2026, P8) — über alle aktiven
 * Baustellen, in der Datenbank entschieden. Startseite (Zähler) und
 * Baustellenliste (Filter) fragen beide hier; vorher zählte die eine über
 * eine Zeile je Baustelle und die andere über alle Einsätze mit Grenze 3.000.
 */
export async function baustellenOhneEinsatz(
  heute: string, seite = SEITE,
): Promise<{ projectNumber: string; zuletzt?: string }[]> {
  type Zeile = { project_number: string; zuletzt: string | null };
  const alle: Zeile[] = [];
  for (let ab = 0; ; ab += seite) {
    const { data, error } = await derClient().rpc('baustellen_ohne_einsatz', { p_heute: heute }).range(ab, ab + seite - 1);
    if (error) throw new Error(error.message);
    const teil = (data ?? []) as Zeile[];
    alle.push(...teil);
    if (teil.length < seite) break;
  }
  return alle.map((z) => (z.zuletzt ? { projectNumber: z.project_number, zuletzt: z.zuletzt } : { projectNumber: z.project_number }));
}

export function listEinsatztageInRange(companyId: string, from: string, to: string, max = 3000) {
  return abfragen<Pick<Assignment, 'userId' | 'date' | 'projectNumber'>>(EINSAETZE, companyId, {
    wo: [
      { art: 'ab', feld: 'date', wert: from },
      { art: 'bis', feld: 'date', wert: to },
    ],
    sortiere: { feld: 'date' },
    grenze: max,
    spalten: 'id,user_id,date,project_number',
  });
}

/**
 * DIE EINSÄTZE EINER BAUSTELLE (B1/B5, E83): die nächsten ab heute und die
 * letzten davor — für die Akte, die zeigt, wann dort jemand war und wann
 * jemand kommt, und deren Hauptaktion „Einsatz planen“ heißt, solange es
 * keinen gibt. Je Richtung mit Grenze: eine lange Baustelle hat Hunderte
 * Einsatztage, die Akte zeigt davon wenige.
 */
export async function einsaetzeDerBaustelle(
  companyId: string, projectNumber: string, heute: string, je = 20,
): Promise<{ kommend: WithId<Assignment>[]; vorher: WithId<Assignment>[] }> {
  const [kommend, vorher] = await Promise.all([
    abfragen<Assignment>(EINSAETZE, companyId, {
      wo: [
        { art: 'gleich', feld: 'projectNumber', wert: projectNumber },
        { art: 'ab', feld: 'date', wert: heute },
      ],
      sortiere: { feld: 'date' },
      grenze: je,
    }),
    abfragen<Assignment>(EINSAETZE, companyId, {
      wo: [
        { art: 'gleich', feld: 'projectNumber', wert: projectNumber },
        { art: 'bis', feld: 'date', wert: plusTage(heute, -1) },
      ],
      sortiere: { feld: 'date', absteigend: true },
      grenze: je,
    }),
  ]);
  return { kommend, vorher };
}

/** Was an einem Folgetag geschah (E85) — je Tag eine Zeile der Antwort. */
export interface FolgeTag {
  datum: string;
  ergebnis: 'geplant' | 'ergaenzt' | 'geaendert' | 'unveraendert' | 'wochenende' | 'feiertag' | 'betriebsurlaub' | 'alle_abwesend';
  eingeteilt: string[];
  abwesend: string[];
  anderswo: string[];
  /** Beim Angleichen (V13): wer an dem Tag herausgenommen wurde. */
  entfernt: string[];
}

/**
 * Die Einteilung eines Tages auf die Folgetage übernehmen
 * (`einsatz_folgetage`) — in einem Aufruf, mit den Prüfungen je Tag.
 * Die Zeilen sind dieselben wie für `saveAssignments`.
 */
export async function einsatzFolgetage(
  companyId: string, von: string, bis: string, projectNumber: string, rows: AssignmentInput[], nurWerktage: boolean,
  /**
   * V13: die Folgetage der Einteilung des ersten Tages ANGLEICHEN — wer dort
   * nicht steht, geht; Aufgabe, Uhrzeit und Kennzeichen von der Zeile der
   * Person. Ohne: nur ergänzen (Anlegen, wie bisher).
   */
  angleichen = false,
): Promise<FolgeTag[]> {
  void companyId;
  const zeilen = rows.map(({ date: _tag, projectNumber: _bau, ...rest }) => {
    void _tag;
    void _bau;
    return objektAlsZeile(EINSAETZE, rest);
  });
  const { data, error } = await derClient().rpc('einsatz_folgetage', {
    p_von: von, p_bis: bis, p_baustelle: projectNumber, p_zeilen: zeilen, p_nur_werktage: nurWerktage,
    ...(angleichen ? { p_angleichen: true } : {}),
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as FolgeTag[]).map((t) => ({
    datum: t.datum,
    ergebnis: t.ergebnis,
    eingeteilt: t.eingeteilt ?? [],
    abwesend: t.abwesend ?? [],
    anderswo: t.anderswo ?? [],
    entfernt: t.entfernt ?? [],
  }));
}

/** Was beim Entfernen über mehrere Tage je Tag geschah (V13). */
export interface FolgeEntfernt {
  datum: string;
  entfernt: number;
  /** Wurde der Tag leer und hing eine Liste daran: was mit ihr geschah. */
  ruestliste: 'aufgeloest' | 'behalten' | null;
  inArbeit: number;
}

/**
 * Eine Person (oder alle) an den Tagen eines Zeitraums aus der Einteilung
 * einer Baustelle nehmen (`einsatz_folgetage_entfernen`, V13). Leer
 * gewordene Tage behandeln ihre Rüstliste nach `wahl`.
 */
export async function einsatzFolgetageEntfernen(
  von: string, bis: string, projectNumber: string, userId: string | null, wahl: 'aufloesen' | 'behalten',
): Promise<FolgeEntfernt[]> {
  const { data, error } = await derClient().rpc('einsatz_folgetage_entfernen', {
    p_von: von, p_bis: bis, p_baustelle: projectNumber, p_ruestliste: wahl, ...(userId ? { p_user: userId } : {}),
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { datum: string; entfernt: number; ruestliste: FolgeEntfernt['ruestliste']; in_arbeit: number }[])
    .map((z) => ({ datum: z.datum, entfernt: z.entfernt, ruestliste: z.ruestliste ?? null, inArbeit: z.in_arbeit ?? 0 }));
}

/**
 * Einen Einsatz auf einen anderen Tag oder zu einer anderen Person setzen,
 * oder ihn dorthin kopieren (`einsatz_umplanen`, E88) — eine Zeile, mit den
 * Prüfungen von „Auch an den folgenden Tagen“.
 * `anderswo`: die Person steht am Zieltag auch auf einer anderen Baustelle.
 * `ruestliste` (P2): ob die Rüstliste mitzog oder am Zieltag dazukam — sie
 * wandert, sobald am alten Tag niemand mehr auf der Baustelle steht.
 */
export async function einsatzUmplanen(
  id: string, datum: string, userId: string, kopieren: boolean,
): Promise<{ id: string; anderswo: boolean; ruestliste: RuestlisteUmzug }> {
  const { data, error } = await derClient().rpc('einsatz_umplanen', {
    p_id: id, p_datum: datum, p_user: userId, p_kopieren: kopieren,
  });
  if (error) throw new Error(error.message);
  const zeile = ((data ?? []) as { id: string; anderswo: boolean; ruestliste?: RuestlisteUmzug }[])[0];
  if (!zeile) throw new Error('Der Einsatz wurde nicht umgeplant.');
  return { id: zeile.id, anderswo: zeile.anderswo, ruestliste: zeile.ruestliste ?? null };
}

/**
 * Einen Einsatz entfernen (Wochenplan, `einsatz_entfernen`, E88) — die
 * Rüstliste wie bei `deleteAssignment`, mit derselben Frage beim Letzten.
 */
export async function einsatzEntfernen(id: string, wahl?: RuestlisteWahl): Promise<RuestlisteErgebnis | null> {
  const { data, error } = await derClient().rpc('einsatz_entfernen', { p_id: id, ...(wahl ? { p_ruestliste: wahl } : {}) });
  if (error) throw ruestlisteFrageAus(error) ?? new Error(error.message);
  return (data ?? null) as RuestlisteErgebnis | null;
}
