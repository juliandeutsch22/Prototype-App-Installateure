/**
 * Stammdaten des Betriebs — nur die Weiche.
 *
 * Sonderfall gegenüber den anderen Modulen: die Zeile IST der Mandant, es
 * gibt also nichts nach `companyId` zu filtern. Wer schreiben darf, sagt die
 * Datenquelle (Geschäftsführung/Administration), und feldweise gilt: Module
 * schaltet nur die Administration, die Urlaubs-Genehmigenden legt nur die
 * Geschäftsführung fest.
 */
import type { Company } from '@/types';
import { nutztPostgres } from './quelle';
import * as fs from './fs/company';
import * as pg from './pg/company';

export function getCompany(companyId: string): Promise<Company | null> {
  return nutztPostgres() ? pg.getCompany(companyId) : fs.getCompany(companyId);
}

export function updateCompany(
  companyId: string, data: Partial<Omit<Company, 'id'>>,
): Promise<void> {
  return nutztPostgres() ? pg.updateCompany(companyId, data) : fs.updateCompany(companyId, data);
}

/**
 * Der ganze Bestand eines Betriebs in einer Antwort (DSGVO Art. 15/20).
 *
 * Unter Firestore tut das die Cloud Function `exportCompanyData` — der
 * Aufrufer findet beide Wege über `lib/functions.ts:callExportCompanyData`.
 */
export function auszug(): Promise<pg.BetriebsAuszug> {
  if (!nutztPostgres()) {
    throw new Error('Unter Firestore holt die Cloud Function den Auszug — siehe lib/functions.ts.');
  }
  return pg.auszug();
}

export type { BetriebsAuszug } from './pg/company';
