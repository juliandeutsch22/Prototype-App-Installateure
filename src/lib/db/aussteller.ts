/**
 * Die Firmendaten eines Belegs zum Zeitpunkt seiner Ausstellung — nur die
 * Weiche. Siehe `lib/aussteller.ts` und `pg/aussteller.ts`.
 */
import type { Company } from '@/types';
import { mitAussteller, type AusstellerAngaben } from '@/lib/aussteller';
import * as pg from './pg/aussteller';

export function ausstellerStaende(
  companyId: string,
  ids: readonly (string | null | undefined)[],
): Promise<Map<string, AusstellerAngaben>> {
  return pg.ausstellerStaende(companyId, ids);
}

/**
 * Die Firmendaten, mit denen ein Beleg gedruckt wird.
 *
 * Kommt der Stand nicht, WIRFT das — still mit den heutigen Daten zu drucken
 * hieße, genau den falschen Beleg zu erzeugen, den der Stand verhindern soll.
 */
export async function belegFirma(company: Company, stand?: string | null): Promise<Company> {
  if (!stand) return company;
  const angaben = (await pg.ausstellerStaende(company.id, [stand])).get(stand);
  if (!angaben) {
    throw new Error('Die Firmendaten dieses Belegs konnten nicht geladen werden — bitte noch einmal versuchen.');
  }
  return mitAussteller(company, angaben);
}
