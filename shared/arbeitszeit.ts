/**
 * Die Arbeitszeit EINES Zeiteintrags in Minuten.
 *
 * Diese Datei ist die gemeinsame Quelle für die App UND für die Cloud
 * Functions. Sie hat bewusst keine Importe: keine Firebase-Typen, keine
 * React-Umgebung, nichts aus `src/`. Nur so lässt sie sich auf beiden Seiten
 * unverändert verwenden.
 *
 * WARUM DER AUFWAND. Die Monatsbilanzen werden serverseitig gerechnet, die
 * Anzeige im Zeitkonto clientseitig. Zwei Implementierungen derselben Formel
 * wären der gefährlichste Teil dieser Übung: Sie ergeben dieselbe Zahl,
 * solange beide gleich gepflegt werden — und irgendwann eben nicht mehr.
 * Bemerkt würde es an einem Stundensaldo, der auf den Lohnzettel geht.
 *
 * Der Weg in die Functions: `firebase deploy` lädt ausschließlich das
 * Verzeichnis `functions/` hoch, eine Datei daneben wäre zur Laufzeit nicht
 * vorhanden. Deshalb kopiert ein Prebuild-Schritt diese Datei nach
 * `functions/src/generated/`. Die Kopie ist nicht eingecheckt und wird bei
 * JEDEM Build neu geschrieben — sie kann also nicht auseinanderlaufen.
 * Dasselbe Muster nutzt `scripts/voice-entry.mjs` bereits.
 */

/** Nur die Felder, die für die Rechnung zählen — bewusst schmal gehalten. */
export interface Zeitangaben {
  status: 'Anwesend' | 'Krank' | 'Urlaub' | 'Zeitausgleich' | 'Berufsschule';
  startTime?: string;
  endTime?: string;
  breakDuration?: number;
  /** Alternative Erfassung als Dezimalstunden (Spracherfassung). */
  hours?: number;
  /**
   * Der Tag des Beginns (JJJJ-MM-TT). Mit ihm zählt die Nacht der
   * Zeitumstellung richtig — ohne ihn rechnet die Formel wie bisher.
   */
  date?: string;
}

/** Der Tag des letzten Sonntags eines Monats (Monat 0-basiert). */
function letzterSonntag(jahr: number, monat: number): number {
  const letzter = new Date(Date.UTC(jahr, monat + 1, 0));
  return letzter.getUTCDate() - letzter.getUTCDay();
}

/**
 * Der Abstand der Wiener Ortszeit zu UTC in Minuten: 60 im Winter, 120 im
 * Sommer (EU-Regel: letzter Sonntag im März 02:00 → 03:00, letzter Sonntag im
 * Oktober 03:00 → 02:00).
 *
 * DIE STUNDE DAZWISCHEN zählt als Winterzeit — die Stunde, die es im März
 * nicht gibt, wie die, die es im Oktober zweimal gibt. So rechnet auch
 * Postgres (`… at time zone 'Europe/Vienna'`), und nur so kommen App und
 * Datenbank auf dieselbe Minute (`tests/unit/arbeitszeitUmstellung.test.ts`).
 */
export function wienVersatzMin(datum: string, zeit: string): number {
  const [j, m, t] = datum.split('-').map(Number);
  const hm = zeit.slice(0, 5);
  if (m < 3 || m > 10) return 60;
  if (m > 3 && m < 10) return 120;
  const sonntag = letzterSonntag(j, m - 1);
  if (m === 3) return t > sonntag || (t === sonntag && hm >= '03:00') ? 120 : 60;
  return t < sonntag || (t === sonntag && hm < '02:00') ? 120 : 60;
}

/** Der Tag nach `datum`, als JJJJ-MM-TT. */
function folgetag(datum: string): string {
  const [j, m, t] = datum.split('-').map(Number);
  return new Date(Date.UTC(j, m - 1, t + 1)).toISOString().slice(0, 10);
}

export function calcWorkMin(entry: Zeitangaben): number {
  if (entry.status !== 'Anwesend') return 0;
  if (entry.startTime && entry.endTime) {
    const start = new Date(`1970-01-01T${entry.startTime}`);
    const end = new Date(`1970-01-01T${entry.endTime}`);
    let span = (end.getTime() - start.getTime()) / 60000;
    // Endzeit vor Startzeit heißt: der Einsatz ging über Mitternacht
    // (Bereitschaft, Notdienst). Vorher ergab 22:00–06:00 glatt 0 Stunden —
    // die Nacht war schlicht nicht bezahlt.
    const ueberMitternacht = span < 0;
    if (ueberMitternacht) span += 24 * 60;
    /*
      DIE NACHT DER ZEITUMSTELLUNG (offene Punkte B6). Die Uhrzeiten sagen
      22:00–06:00, gearbeitet wurden im März sieben Stunden und im Oktober
      neun. Mit dem Tag lässt sich das rechnen: die Differenz der Uhrzeiten
      minus das, um das die Uhr dazwischen gesprungen ist.
    */
    if (entry.date && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
      const endeTag = ueberMitternacht ? folgetag(entry.date) : entry.date;
      span -= wienVersatzMin(endeTag, entry.endTime) - wienVersatzMin(entry.date, entry.startTime);
    }
    const brk = Number(entry.breakDuration ?? 0) || 0;
    return Math.max(0, span - brk);
  }
  if (typeof entry.hours === 'number' && !Number.isNaN(entry.hours)) {
    return Math.max(0, Math.round(entry.hours * 60));
  }
  return 0;
}
