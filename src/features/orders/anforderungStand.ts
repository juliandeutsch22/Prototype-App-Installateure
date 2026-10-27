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
