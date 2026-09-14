/**
 * Die Entscheidungen der nächtlichen Ausleitung — ohne Firestore, ohne
 * Storage, ohne Firebase.
 *
 * WARUM GETRENNT. Die Ausleitung selbst besteht aus Lesen und Schreiben; was
 * daran schiefgehen kann, ist nicht das Lesen, sondern die Entscheidung
 * *welche Datei wann wieder gelöscht wird*. Ein Aufräumen, das einen Tag zu
 * weit greift, vernichtet genau den Stand, für den die Ausleitung gebaut
 * wurde — und es fällt erst auf, wenn man ihn braucht.
 *
 * Diese Datei importiert nichts, deshalb kann sie ohne Emulator und ohne
 * firebase-admin geprüft werden (`tests/unit/ausleitung.test.ts`). Die Cloud
 * Functions sind sonst ungetestet; hier ist wenigstens das Urteil geprüft,
 * auch wenn es das Schreiben nicht ist.
 */

/** 'YYYY-MM-DD' aus lokalen Komponenten (wie shared/feiertage.localDateStr). */
export function datumsStempel(d: Date): string {
  const j = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const t = String(d.getDate()).padStart(2, '0');
  return `${j}-${m}-${t}`;
}

/** Das Verzeichnis eines Mandanten im Zielspeicher. */
export function ausleitungsPraefix(companyId: string): string {
  return `ausleitung/${companyId}/`;
}

/**
 * Der Pfad eines Laufs.
 *
 * Ein Stand JE TAG, nicht je Lauf: läuft die Ausleitung an einem Tag zweimal
 * (etwa nach einem Fehlschlag von Hand angestoßen), überschreibt der zweite
 * Lauf den ersten, statt eine zweite Datei danebenzulegen. Sonst wüchse der
 * Speicher mit jedem Wiederholungsversuch, und beim Wiederanlauf müsste
 * jemand raten, welche der beiden die vollständige ist.
 */
export function ausleitungsPfad(companyId: string, datum: Date): string {
  return `${ausleitungsPraefix(companyId)}${datumsStempel(datum)}.jsonl`;
}

/** Das Datum aus einem Ausleitungspfad, oder null wenn er nicht dazu passt. */
export function datumAusPfad(pfad: string): string | null {
  const treffer = /(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(pfad);
  return treffer ? treffer[1] : null;
}

/**
 * Darf diese Datei weg?
 *
 * ZWEI SICHERHEITEN, beide absichtlich streng:
 *
 *   1. Was nicht wie ein Ausleitungsstand heißt, wird NIE gelöscht. Läge aus
 *      irgendeinem Grund etwas anderes im Verzeichnis, wäre ein Aufräumen,
 *      das es mitnimmt, ein Datenverlust ohne Ankündigung.
 *   2. Der jüngste Stand bleibt IMMER, auch wenn er älter ist als die
 *      Aufbewahrungsfrist. Ein Betrieb, bei dem die Ausleitung wochenlang
 *      scheitert, hätte sonst am Ende gar keinen Stand mehr — und zwar
 *      ausgerechnet dann, wenn niemand hinsieht. Lieber ein alter Stand als
 *      keiner.
 */
export function abgelaufeneStaende(
  pfade: string[],
  heute: Date,
  tage: number,
): string[] {
  const mitDatum = pfade
    .map((p) => ({ pfad: p, datum: datumAusPfad(p) }))
    .filter((e): e is { pfad: string; datum: string } => e.datum !== null);
  if (mitDatum.length <= 1) return [];

  const juengstes = mitDatum.reduce((a, b) => (a.datum >= b.datum ? a : b)).datum;

  const grenze = new Date(heute);
  grenze.setDate(grenze.getDate() - tage);
  const grenzStempel = datumsStempel(grenze);

  return mitDatum
    .filter((e) => e.datum < grenzStempel && e.datum !== juengstes)
    .map((e) => e.pfad);
}

/**
 * Eine Zeile im Ausleitungsstand.
 *
 * Zeilenweises JSON (NDJSON) und nicht EIN grosses Objekt: so lässt sich der
 * Stand schreiben und wieder einlesen, ohne ihn je vollständig im Speicher zu
 * halten. Bei 15.660 Zeiteinträgen ist das der Unterschied zwischen „läuft"
 * und „bricht ohne Meldung ab".
 */
export function jsonZeile(sammlung: string, zeile: Record<string, unknown>): string {
  return `${JSON.stringify({ sammlung, daten: zeile })}\n`;
}
