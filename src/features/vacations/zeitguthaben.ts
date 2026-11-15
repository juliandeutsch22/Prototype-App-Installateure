import type { AppUser } from '@/types';
import { zeitkontoSalden, zeitkontoSaldo } from '@/lib/db/zeitkonto';
import { calcOverallSaldo, type SaldoResult } from '@/lib/time';

/**
 * Das Zeitguthaben einer Person — dieselbe Zahl, die die Zeiterfassung zeigt.
 *
 * Für den ZA-Antrag: wer vier Stunden frei nehmen will, soll sehen, ob sein
 * Guthaben das trägt.
 *
 * AUS DER DATENBANK (Durchsicht 15.11.2026, L1): eine Zeile statt der
 * Bilanzen und — bei eigenem Tagessoll je Wochentag — aller Buchungen seit
 * dem Eintritt. Gerechnet mit der Arbeitszeit, die an jedem Tag galt (Z3).
 * `halbeTage` bleibt in der Signatur; die Datenbank liest die Einstellung
 * des Betriebs selbst.
 */
export async function zeitguthabenLaden(profil: AppUser, halbeTage: boolean): Promise<SaldoResult> {
  // Ohne Saldo-Start gibt es nichts zu rechnen — wie bisher ohne Anfrage.
  if (!profil.appStartDate) return calcOverallSaldo(profil, [], halbeTage);
  return zeitkontoSaldo(profil.uid);
}

/**
 * DER GESAMTSALDO ALLER KONTEN AUF EINMAL — für die Spalte „Gesamtsaldo“ der
 * Mitarbeiterübersicht (19.10.2026).
 *
 * EINE ANFRAGE FÜR ALLE (Durchsicht 15.11.2026, L2): vorher je Eintrittsmonat
 * die Buchungen des ganzen Betriebs, alle Bilanzen aller Jahre und für jede
 * Person mit Tagessoll alle ihre Buchungen — nach jeder Änderung erneut.
 * Ohne Eintrittsdatum gibt es keinen Saldo und keinen Eintrag in der Karte.
 */
export async function gesamtsaldenLaden(
  companyId: string,
  personen: AppUser[],
  halbeTage: boolean,
): Promise<Map<string, number>> {
  void companyId;
  void halbeTage;
  const mitEintritt = personen.filter((p) => !!p.appStartDate);
  if (mitEintritt.length === 0) return new Map();
  const alle = await zeitkontoSalden();
  const salden = new Map<string, number>();
  for (const p of mitEintritt) {
    const s = alle.get(p.uid);
    if (s) salden.set(p.uid, s.saldoH);
  }
  return salden;
}
