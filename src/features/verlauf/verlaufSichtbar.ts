import type { Aktenart } from '@/lib/db/objektVerlauf';
import type { Role } from '@/types';

/**
 * Wer den Verlauf einer Akte sieht — dieselbe Grenze wie die Regel
 * `aenderungsjournal_lesen`: nie der Mitarbeiter, nie der Support, die
 * Stammdaten der Belegschaft nur die Spitze. Wer die Akte öffnen kann, sieht
 * das Objekt; mehr fragt die Regel bei den übrigen Rollen nicht. Ohne diese
 * Grenze käme für alle anderen eine leere Liste zurück — ein toter Klick.
 */
export function verlaufSichtbar(role: Role | undefined, objektart: Aktenart, imEinblick: boolean): boolean {
  if (!role || imEinblick || role === 'Mitarbeiter') return false;
  if (objektart === 'benutzer') return role === 'Geschäftsführung' || role === 'Administrator';
  return true;
}
