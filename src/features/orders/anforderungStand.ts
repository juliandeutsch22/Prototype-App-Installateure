import type { MaterialOrder } from '@/types';

/**
 * Wann eine Anforderung auffällt (Startseite und Filter der Anforderungen,
 * Nachtest 01.10.2026 Paket B) — an einer Stelle, damit Startseite und Liste
 * dieselben Zeilen meinen.
 */

const TAG_MS = 86_400_000;

/** Bestellt, noch nicht geliefert, Liefertermin vorbei. */
export function istLieferungUeberfaellig(
  o: Pick<MaterialOrder, 'bestelltAm' | 'geliefertAm' | 'liefertermin' | 'status'>,
  heute: string,
): boolean {
  return !!o.bestelltAm && !o.geliefertAm && !!o.liefertermin && o.liefertermin < heute && o.status !== 'Erledigt';
}

/** Bestellt, noch nicht geliefert, heute erwartet. */
export function istLieferungHeute(
  o: Pick<MaterialOrder, 'bestelltAm' | 'geliefertAm' | 'liefertermin'>,
  heute: string,
): boolean {
  return !!o.bestelltAm && !o.geliefertAm && o.liefertermin === heute;
}

export const ABHOLBEREIT_ALT_TAGE = 3;

/** Der Wiener Kalendertag eines Zeitpunkts, als JJJJ-MM-TT. */
export function wienerTag(ms: number): string {
  return new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });
}

/**
 * Seit über drei Tagen abholbereit — gerechnet ab dem Zeitstempel der
 * Datenbank, IN KALENDERTAGEN (Runde 6, Hinweis 7). Vorher zählten Stunden:
 * „abholbereit seit 24.10.“ war am 27.10. um 10 Uhr schon „über 3 Tage“, um
 * 7 Uhr noch nicht — und wer die Zahl mit dem gezeigten Tag verglich, kam
 * nicht auf dasselbe. Jetzt gilt der Tag, der auch dasteht.
 */
export function istAbholbereitAlt(o: Pick<MaterialOrder, 'status' | 'abholbereitSeit'>, jetzt: number): boolean {
  if (o.status !== 'Abholbereit' || !o.abholbereitSeit) return false;
  const tage = Math.round(
    (Date.parse(`${wienerTag(jetzt)}T00:00:00Z`) - Date.parse(`${wienerTag(o.abholbereitSeit)}T00:00:00Z`)) / TAG_MS,
  );
  return tage > ABHOLBEREIT_ALT_TAGE;
}

/**
 * Ändern und Zurückziehen geht, solange das Lager nicht entschieden hat,
 * woher das Material kommt — dieselbe Grenze wie in der Datenbank
 * (`app.anforderung_besitzer_offen`, `anforderung_zurueckziehen`).
 */
export function anforderungAenderbar(
  o: Pick<MaterialOrder, 'status' | 'processed' | 'beschaffung' | 'transactionType'>,
): boolean {
  return o.transactionType !== 'return' && o.status === 'Offen' && !o.processed && !o.beschaffung;
}

/**
 * WARUM ES DAUERT — der Satz für den Besteller, in der Zeile und im
 * Seitenfenster derselbe. Liegt es nicht im Lager, wird es beim Großhändler
 * bestellt; das sagt dem Monteur, dass er nicht vergeblich ins Lager fährt.
 *
 * STORNIERT (M11): hat das Lager die Bestellung beim Händler storniert, steht
 * die Zeile wieder auf „zu bestellen“. Ohne eigenen Satz läse der Monteur
 * nur „wird bestellt“ und wüsste nicht, dass seine Ware nicht kommt und
 * warum. Wird neu bestellt, gilt wieder „bestellt“ — der Storno ist dann
 * Geschichte und steht nur noch im Verlauf des Lagers.
 */
export function beschaffungStand(
  o: Pick<MaterialOrder, 'beschaffung' | 'bestelltAm' | 'geliefertAm' | 'bestellungStorniertAm' | 'bestellungStornoGrund'>,
): string {
  if (o.beschaffung !== 'einkauf' || o.geliefertAm) return '';
  if (o.bestelltAm) return 'beim Großhändler bestellt';
  if (o.bestellungStorniertAm) {
    const grund = o.bestellungStornoGrund?.trim();
    return `Bestellung storniert${grund ? ` (${grund})` : ''} — wird neu bestellt`;
  }
  return 'nicht im Lager — wird bestellt';
}
