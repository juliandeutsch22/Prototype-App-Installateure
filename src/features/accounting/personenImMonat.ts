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
export function personenImMonat(users: readonly AppUser[], gebuchtImMonat: ReadonlySet<string>): AppUser[] {
  return users
    .filter((u) => fuehrtZeitkonto(u) && (u.active !== false || gebuchtImMonat.has(u.uid)))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Deaktiviert — Soll, Saldo und Resturlaub sind ohne Austrittsdatum keine Aussage. */
export const istDeaktiviert = (u: Pick<AppUser, 'active'>) => u.active === false;
