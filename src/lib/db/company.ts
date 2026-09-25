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
import * as pg from './pg/company';

export function getCompany(companyId: string): Promise<Company | null> {
  return pg.getCompany(companyId);
}

export function updateCompany(
  companyId: string, data: Partial<Omit<Company, 'id'>>,
): Promise<void> {
  return pg.updateCompany(companyId, data);
}

/**
 * Der ganze Bestand eines Betriebs in einer Antwort (DSGVO Art. 15/20).
 *
 * Eine Abfrage mit erhöhten Rechten, und die Sammlungsliste kommt aus dem
 * Katalog der Datenbank statt aus einer Datei, die jemand pflegen muss — eine
 * vergessene Tabelle wäre sonst eine unvollständige Auskunft.
 */
export function auszug(): Promise<pg.BetriebsAuszug> {
  return pg.auszug();
}

export type { BetriebsAuszug } from './pg/company';

export type { NaechsteNummern } from './pg/company';

/** Was die Nummernkreise als Nächstes vergäben — ohne eine Nummer zu verbrauchen. */
export function naechsteNummern(jahr: number): Promise<pg.NaechsteNummern> {
  return pg.naechsteNummern(jahr);
}
