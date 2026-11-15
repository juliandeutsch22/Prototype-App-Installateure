import type { AppUser, Company, UrlaubsanspruchAnpassung, Vacation } from '@/types';
import { listOwnVacations } from '@/lib/db/vacations';
import { listAnpassungen } from '@/lib/db/urlaubsanspruch';
import { zeitkontoSaldo } from '@/lib/db/zeitkonto';
import {
  antragNachUrlaubsjahr,
  dezemberHalbtage,
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
 * zweite: der Saldo aus der Datenbank (`zeitkonto_salden`, Durchsicht
 * 15.11.2026, L1) — eine Zeile statt aller Buchungen seit dem Eintritt; beim
 * Urlaub die genehmigten Anträge je Urlaubsjahr verteilt. Stünde auf der
 * Startseite eine andere Zahl als einen Tipp weiter, wäre keiner der beiden
 * mehr zu trauen.
 */
export async function eigenerSaldo(
  companyId: string,
  profil: AppUser,
  company: Company | null | undefined,
): Promise<SaldoResult | null> {
  void companyId;
  void company;
  if (!profil.appStartDate) return null;
  return zeitkontoSaldo(profil.uid);
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
    .flatMap((v) => antragNachUrlaubsjahr(v, profil, halbeTage, regel.jahresbeginn));
  const stand = urlaubsStand(profil, jahr, posten, regel, anpassungen);
  return { rest: stand.rest, anspruch: stand.anspruch };
}
