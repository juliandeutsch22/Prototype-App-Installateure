import type { AppUser } from '@/types';
import { bilanzMarker, listBilanzen, monatVon } from '@/lib/db/monatsbilanzen';
import { listOwnEntriesSince } from '@/lib/db/timeEntries';
import { calcOverallSaldo, localDateStr, saldoAusBilanzen, type SaldoResult } from '@/lib/time';

/**
 * Das eigene Zeitguthaben — dieselbe Zahl, die die Zeiterfassung zeigt.
 *
 * Für den ZA-Antrag: wer vier Stunden frei nehmen will, soll sehen, ob sein
 * Guthaben das trägt. DIESELBE WAHL DES WEGES wie in `TimeView`: aus den
 * Monatsbilanzen, wenn sie bis zum Eintritt zurückreichen, sonst aus allen
 * Einträgen seit dem Eintritt. Der laufende Monat kommt immer aus den
 * Einträgen — dort hinkt die Bilanz sonst der letzten Buchung hinterher.
 */
export async function zeitguthabenLaden(profil: AppUser): Promise<SaldoResult> {
  if (!profil.appStartDate) return calcOverallSaldo(profil, []);
  const eintritt = profil.appStartDate;
  const marker = await bilanzMarker(profil.companyId, profil.uid).catch(() => null);
  if (marker && marker.vollstaendigAb <= monatVon(eintritt)) {
    const jetzt = new Date();
    const monatsErster = localDateStr(new Date(jetzt.getFullYear(), jetzt.getMonth(), 1));
    const [bilanzen, laufend] = await Promise.all([
      listBilanzen(profil.companyId, profil.uid, monatVon(eintritt)),
      listOwnEntriesSince(profil.companyId, profil.uid, monatsErster),
    ]);
    return saldoAusBilanzen(profil, bilanzen, laufend);
  }
  return calcOverallSaldo(profil, await listOwnEntriesSince(profil.companyId, profil.uid, eintritt));
}
