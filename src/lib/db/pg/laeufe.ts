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

/** Was die Ausleitung von Hand zurückmeldet. */
export interface AusleitungsBilanz {
  companyId: string;
  zeilen: number;
  bytes: number;
  pfad: string;
  geraeumt: number;
  ziel: string;
}

/**
 * Die Sicherung sofort erstellen — über die Edge Function.
 *
 * WARUM ES DEN KNOPF GIBT: eine Sicherung, die man nicht auslösen kann, prüft
 * niemand; und eine, die niemand je geprüft hat, ist keine. Einmal drücken
 * zeigt in einem Zug, ob die Berechtigungen stimmen, ob das Ziel erreichbar
 * ist und wie gross der Stand ist.
 *
 * Ausgeleitet wird immer nur der EIGENE Betrieb — der Nachtlauf nimmt alle,
 * dieser Aufruf nicht.
 */
export async function ausleitungJetzt(): Promise<AusleitungsBilanz> {
  const { data, error } = await derClient().functions.invoke('daten-ausleitung', {
    body: { quelle: 'knopf' },
  });
  if (error) {
    // Die Meldung der Function durchreichen, nicht den nackten Status — sonst
    // stünde vor der Geschäftsführung „non-2xx status code".
    const rumpf = await (error as { context?: Response }).context?.json?.()
      .catch(() => undefined);
    throw new Error(rumpf?.error ?? error.message);
  }
  return data as AusleitungsBilanz;
}
