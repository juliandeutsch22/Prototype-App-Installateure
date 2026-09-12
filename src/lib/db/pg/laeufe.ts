/**
 * Den Zustand eines nächtlichen Laufs holen — auf Postgres.
 *
 * GESCHRIEBEN WIRD HIER NICHTS, und das ist Absicht: die Tabelle trägt keine
 * Schreibrichtlinie, die Läufe selbst arbeiten mit dem Dienstschlüssel. Eine
 * Überwachung, die der Überwachte beschreiben kann, überwacht nichts.
 *
 * WAS „NICHT DA" HEISST. Ein Lauf, der noch nie gelaufen ist, hat keine
 * Zeile. Wer nicht zur Spitze gehört, sieht auch keine. Beides kommt als
 * `undefined` zurück und bedeutet dasselbe: „von diesem Lauf ist nichts
 * bekannt". Das ist NICHT dasselbe wie „alles in Ordnung", und die Ansicht
 * unterscheidet das.
 */
import type { Lauf, LaufArt } from '@shared/laufStatus';
import { derClient } from './kern';
import { zeileAlsObjekt } from './felder';

const LAEUFE = 'system_laeufe';

export async function ladeLauf(companyId: string, art: LaufArt): Promise<Lauf | undefined> {
  try {
    const { data, error } = await derClient()
      .from(LAEUFE).select('*')
      .eq('company_id', companyId).eq('art', art)
      .maybeSingle();
    if (error || !data) return undefined;
    return zeileAlsObjekt<Lauf>(LAEUFE, data as Record<string, unknown>);
  } catch {
    return undefined;
  }
}
