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
  status: 'Anwesend' | 'Krank' | 'Urlaub' | 'Zeitausgleich';
  startTime?: string;
  endTime?: string;
  breakDuration?: number;
  /** Alternative Erfassung als Dezimalstunden (Spracherfassung). */
  hours?: number;
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
    if (span < 0) span += 24 * 60;
    const brk = Number(entry.breakDuration ?? 0) || 0;
    return Math.max(0, span - brk);
  }
  if (typeof entry.hours === 'number' && !Number.isNaN(entry.hours)) {
    return Math.max(0, Math.round(entry.hours * 60));
  }
  return 0;
}
