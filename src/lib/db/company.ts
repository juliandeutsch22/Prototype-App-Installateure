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
 * Der ganze Bestand eines Betriebs als Datei (DSGVO Art. 15/20).
 *
 * Eine Abfrage mit erhöhten Rechten, und die Sammlungsliste kommt aus dem
 * Katalog der Datenbank statt aus einer Datei, die jemand pflegen muss — eine
 * vergessene Tabelle wäre sonst eine unvollständige Auskunft. Seit K4
 * (Durchsicht 15.11.2026) in Teilen abgeholt, ohne Obergrenze.
 */
export { betriebAuszugDatei } from './pg/auszugTeile';
export type { AuszugDatei, Fortschritt } from './pg/auszugTeile';

export type { NaechsteNummern } from './pg/company';

/** Was die Nummernkreise als Nächstes vergäben — ohne eine Nummer zu verbrauchen. */
export function naechsteNummern(jahr: number): Promise<pg.NaechsteNummern> {
  return pg.naechsteNummern(jahr);
}

export type { NaechsteNummernImJahr } from './pg/company';

/** Dasselbe mit dem Jahr, in dem der Server vergibt (G12) — für die Vorschau. */
export function naechsteNummernImJahr(): Promise<pg.NaechsteNummernImJahr> {
  return pg.naechsteNummernImJahr();
}

export type { Rechnungsvorgaben } from './pg/company';

/** Nur die Rechnungsvorgaben speichern — darf auch die Buchhaltung (Testbericht H10). */
export function rechnungsvorgabenSpeichern(vorgaben: pg.Rechnungsvorgaben): Promise<void> {
  return pg.rechnungsvorgabenSpeichern(vorgaben);
}
