import type { AppUser } from '@/types';
import { fuehrtZeitkonto } from '@/lib/permissions';

/**
 * Wer in der Mitarbeiterübersicht eines Monats steht.
 *
 * Alle aktiven Konten mit Zeitkonto, wie bisher — und dazu deaktivierte,
 * sobald sie im Monat gebucht haben (Befund 09.11.2026). Wer ausscheidet,
 * wird deaktiviert; seine letzten Stunden, Krankenstände und Urlaube gehören
 * trotzdem in die Lohnabrechnung des Monats. Ohne Buchung im Monat bleibt
 * ein deaktiviertes Konto weg: es ist dann kein Teil dieses Monats.
 */
export function personenImMonat(
  users: readonly AppUser[],
  gebuchtImMonat: ReadonlySet<string>,
  /** 'YYYY-MM' — wer in diesem Monat austritt, gehört dazu, auch ohne Buchung (E87). */
  monat?: string,
): AppUser[] {
  return users
    .filter((u) => fuehrtZeitkonto(u) && (u.active !== false || gebuchtImMonat.has(u.uid) || (!!monat && austrittIm(u, monat))))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/*
  WER IM MONAT AUSTRITT, STEHT DA (E87): sein Soll bis zum letzten Tag ist
  Teil der Abrechnung — auch ohne einen einzigen Eintrag im Monat; dann
  steht genau das als Minus da, statt dass die Person fehlt.
*/
function austrittIm(u: Pick<AppUser, 'austritt' | 'appStartDate'>, monat: string): boolean {
  return !!u.austritt && u.austritt.slice(0, 7) === monat && (!u.appStartDate || u.appStartDate.slice(0, 7) <= monat);
}

/** Deaktiviert (ausgeschieden) — das Wort in der Zeile und im Export. */
export const istDeaktiviert = (u: Pick<AppUser, 'active'>) => u.active === false;

/**
 * Soll und Saldo sind keine Aussage: deaktiviert OHNE Austrittsdatum. Mit ihm
 * endet das Soll am letzten Tag (`pflichtTage`, E87) und ist wieder richtig.
 * Den Resturlaub beim Austritt (Ersatzleistung, § 10 UrlG) rechnet weiter die
 * Lohnverrechnung — er bleibt bei jedem Ausgeschiedenen leer.
 */
export const ohneSollAussage = (u: Pick<AppUser, 'active' | 'austritt'>) => u.active === false && !u.austritt;
