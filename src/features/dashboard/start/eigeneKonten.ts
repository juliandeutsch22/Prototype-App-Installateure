import type { AppUser, Company, UrlaubsanspruchAnpassung, Vacation } from '@/types';
import { listOwnEntriesInRange, listOwnEntriesSince } from '@/lib/db/timeEntries';
import { bilanzMarker, listBilanzen, monatVon } from '@/lib/db/monatsbilanzen';
import { listOwnVacations } from '@/lib/db/vacations';
import { listAnpassungen } from '@/lib/db/urlaubsanspruch';
import {
  antragNachUrlaubsjahr,
  calcOverallSaldo,
  dezemberHalbtage,
  hatTagessoll,
  localDateStr,
  monatsLetzter,
  saldoAusBilanzen,
  todayStr,
  uebertragsRegel,
  urlaubsJahrVon,
  urlaubsStand,
  type SaldoResult,
} from '@/lib/time';

/**
 * Saldo und Resturlaub für die Kennzahlen des Monteurs (Startseite, Nachtest
 * 01.10.2026, Paket B).
 *
 * DIESELBE RECHNUNG WIE IN DER ZEITERFASSUNG UND IM URLAUB, nicht eine
 * zweite: Marker der Monatsbilanzen prüfen, sonst alle Buchungen seit
 * Eintritt; beim Urlaub die genehmigten Anträge je Urlaubsjahr verteilt.
 * Stünde auf der Startseite eine andere Zahl als einen Tipp weiter, wäre
 * keiner der beiden mehr zu trauen.
 */
export async function eigenerSaldo(
  companyId: string,
  profil: AppUser,
  company: Company | null | undefined,
): Promise<SaldoResult | null> {
  const eintritt = profil.appStartDate;
  if (!eintritt) return null;
  const halbeTage = dezemberHalbtage(company);
  const jetzt = new Date();
  const monatsErster = localDateStr(new Date(jetzt.getFullYear(), jetzt.getMonth(), 1));

  const marker = await bilanzMarker(companyId, profil.uid).catch(() => null);
  const brauchbar = !!marker && marker.vollstaendigAb <= monatVon(eintritt) && !hatTagessoll(profil);
  if (brauchbar) {
    const [bilanzen, startRows, laufend] = await Promise.all([
      listBilanzen(companyId, profil.uid, monatVon(eintritt)),
      listOwnEntriesInRange(companyId, profil.uid, eintritt, monatsLetzter(eintritt)),
      listOwnEntriesInRange(companyId, profil.uid, monatsErster, monatsLetzter(monatsErster)),
    ]);
    return saldoAusBilanzen(profil, bilanzen, laufend, halbeTage, startRows);
  }
  const rows = await listOwnEntriesSince(companyId, profil.uid, eintritt);
  return calcOverallSaldo(profil, rows, halbeTage);
}

/** Resturlaub im laufenden Urlaubsjahr — wie im Reiter Urlaub. */
export async function eigenerResturlaub(
  companyId: string,
  profil: AppUser,
  company: Company | null | undefined,
): Promise<{ rest: number; anspruch: number }> {
  const [eigene, anpassungen] = await Promise.all([
    listOwnVacations(companyId, profil.uid, 500),
    listAnpassungen(companyId, profil.uid),
  ]);
  return resturlaubAus(eigene, profil, company, anpassungen);
}

export function resturlaubAus(
  eigene: Vacation[],
  profil: AppUser,
  company: Company | null | undefined,
  anpassungen: readonly UrlaubsanspruchAnpassung[] = [],
): { rest: number; anspruch: number } {
  const halbeTage = dezemberHalbtage(company);
  const regel = uebertragsRegel(company);
  const jahr = urlaubsJahrVon(todayStr(), regel.jahresbeginn);
  const posten = eigene
    // Zeitausgleich geht vom Zeitguthaben ab, nicht vom Urlaub.
    .filter((v) => v.status === 'Genehmigt' && v.art !== 'Zeitausgleich')
    .flatMap((v) => antragNachUrlaubsjahr(v, profil.workDays, halbeTage, regel.jahresbeginn));
  const stand = urlaubsStand(profil, jahr, posten, regel, anpassungen);
  return { rest: stand.rest, anspruch: stand.anspruch };
}
