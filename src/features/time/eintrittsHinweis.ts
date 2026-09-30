import type { AppUser } from '@/types';
import { datumAT } from '@/lib/datum';

/**
 * WAS DIE MASKE ZU EINEM TAG VOR DEM EINTRITT ODER VOR DEM SALDO-START SAGT
 * (Testbericht 30.09.2026, M7).
 *
 * Vor dem Eintritt sperrt die Datenbank (`time_entries_nicht_vor_eintritt`) —
 * hier steht es nur früher da, bevor jemand den Tag ausfüllt. Zwischen
 * Eintritt und Saldo-Start wird gebucht, zählt aber nicht ins Zeitkonto:
 * diese Zeit deckt der Anfangssaldo ab. Früher verschwanden solche Stunden
 * still; jetzt sagt die Maske es vorher.
 */
export function eintrittsHinweis(
  person: Pick<AppUser, 'eintritt' | 'appStartDate'> | null | undefined,
  datum: string,
): { sperrt: boolean; text: string } | null {
  if (!person || !datum) return null;
  // Ohne eigenen Eintritt gilt der Saldo-Start — so hat ihn die Migration übernommen.
  const eintritt = person.eintritt ?? null;
  const saldoStart = person.appStartDate ?? null;
  if (eintritt && datum < eintritt) {
    return {
      sperrt: true,
      text: `Vor dem Eintritt am ${datumAT(eintritt)} lässt sich nicht buchen.`,
    };
  }
  if (saldoStart && datum < saldoStart) {
    return {
      sperrt: false,
      text:
        `Dieser Tag liegt vor dem Saldo-Start am ${datumAT(saldoStart)}. Die Buchung wird gespeichert, ` +
        'zählt aber nicht ins Zeitkonto — diese Zeit deckt der Anfangssaldo ab.',
    };
  }
  return null;
}
