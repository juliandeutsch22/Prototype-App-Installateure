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

/** Seit über drei Tagen abholbereit — gerechnet ab dem Zeitstempel der Datenbank. */
export function istAbholbereitAlt(o: Pick<MaterialOrder, 'status' | 'abholbereitSeit'>, jetzt: number): boolean {
  return o.status === 'Abholbereit' && !!o.abholbereitSeit && jetzt - o.abholbereitSeit > ABHOLBEREIT_ALT_TAGE * TAG_MS;
}
