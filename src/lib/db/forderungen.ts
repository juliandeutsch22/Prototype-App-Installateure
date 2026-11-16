import type { ForderungsStand } from '@shared/forderungen';
import { derClient } from './pg/kern';

/**
 * DIE OFFENEN FORDERUNGEN DER STARTSEITE (Durchsicht 15.11.2026, Budget B3):
 * Zahlen und die ersten je Abschnitt, ausgewertet von der Edge Function
 * `startseite-forderungen` mit den Regeln in `shared/forderungen.ts`. Bis
 * dahin kamen dafür alle offenen Köpfe in den Browser (gewachsener Bestand:
 * 198). Gelesen wird mit den Rechten der anrufenden Person. Die Köpfe darin
 * tragen nur die Felder, die die Regeln lesen (`RechnungsKopf` in `shared/`).
 */
export async function startseiteForderungen(heute: string): Promise<ForderungsStand> {
  const { data, error } = await derClient().functions.invoke('startseite-forderungen', { body: { heute } });
  if (error) {
    const rumpf = await (error as { context?: Response }).context?.json?.().catch(() => undefined);
    throw new Error(rumpf?.error ?? error.message);
  }
  return data as ForderungsStand;
}
