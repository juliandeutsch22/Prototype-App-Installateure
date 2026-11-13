/**
 * Angebote — nur die Weiche.
 *
 * Die Kette beginnt in der App bisher bei der Baustelle — in Wirklichkeit
 * beginnt sie bei Anfrage → Angebot → Auftrag. Die konkrete Folge dieses
 * Lochs: die kalkulierten Stunden, gegen die die Budget-Ampel misst, tippt
 * jemand ein zweites Mal von Hand ins Baustellenformular ab. Die Ampel misst
 * damit gegen eine Zahl, die niemand nachvollziehen kann und der deshalb auch
 * niemand traut.
 */
import type { Quote } from '@/types';
import type { WithId } from './core';
import * as pg from './pg/quotes';

export type NewQuote = Omit<Quote, 'id' | 'companyId' | 'createdAt' | 'projectId'>;

export function listRecentQuotes(companyId: string, max = 100): Promise<WithId<Quote>[]> {
  return pg.listRecentQuotes(companyId, max);
}

/** Angebote suchen — über alle, auf dem Server (17 I). */
export function sucheAngebote(companyId: string, begriff: string, max?: number): Promise<WithId<Quote>[]> {
  return pg.sucheAngebote(companyId, begriff, max);
}

export { ANGEBOT_TREFFER } from './pg/quotes';

/** Angebote nach Nummer, nur die Köpfe — für „Suchen oder springen“ (E91). */
export function angeboteNachNummer(companyId: string, begriff: string, max: number): Promise<pg.AngebotsTreffer[]> {
  return pg.angeboteNachNummer(companyId, begriff, max);
}

export function listQuotesForCustomer(
  companyId: string, customerId: string, max = 100,
): Promise<WithId<Quote>[]> {
  return pg.listQuotesForCustomer(companyId, customerId, max);
}

/** Alle Angebote eines Zeitraums — für das Belegarchiv. */
export function listQuotesInRange(companyId: string, von: string, bis: string): Promise<WithId<Quote>[]> {
  return pg.listQuotesInRange(companyId, von, bis);
}

export function getQuote(companyId: string, id: string): Promise<WithId<Quote> | null> {
  return pg.getQuote(companyId, id);
}

export function listQuotesForProject(companyId: string, projectId: string): Promise<WithId<Quote>[]> {
  return pg.listQuotesForProject(companyId, projectId);
}

/** Die Angebote mehrerer Baustellen in einem Zug — siehe `pg.listQuotesForProjects`. */
export function listQuotesForProjects(companyId: string, projectIds: readonly string[]): Promise<WithId<Quote>[]> {
  return pg.listQuotesForProjects(companyId, projectIds);
}

/** Die neuen Fassungen eines Angebots (M17). */
export function listFassungen(companyId: string, vorgaengerId: string): Promise<WithId<Quote>[]> {
  return pg.listFassungen(companyId, vorgaengerId);
}

export function createQuote(companyId: string, q: NewQuote): Promise<string> {
  return pg.createQuote(companyId, q);
}

export function updateQuote(id: string, data: Partial<NewQuote>): Promise<void> {
  return pg.updateQuote(id, data);
}

/** Endgültig löschen — nur ein Entwurf oder ein verworfenes Angebot (die Datenbank hält das). */
export function deleteQuote(id: string): Promise<void> {
  return pg.deleteQuote(id);
}

export type { AngebotImPapierkorb } from './pg/quotes';

/** Die verworfenen Angebote für den Papierkorb (M01d), die jüngsten zuerst. */
export function listVerworfeneAngebote(companyId: string, max?: number): Promise<WithId<pg.AngebotImPapierkorb>[]> {
  return pg.listVerworfeneAngebote(companyId, max);
}

/** Wie viele Angebote im Papierkorb liegen; mit `bis` nur die bis dahin verworfenen. */
export function zaehleVerworfeneAngebote(companyId: string, bis?: string): Promise<number> {
  return pg.zaehleVerworfeneAngebote(companyId, bis);
}

/** Alle bis `bis` verworfenen Angebote endgültig löschen; zurück kommt die Anzahl. */
export function deleteAbgelaufeneAngebote(companyId: string, bis: string): Promise<number> {
  return pg.deleteAbgelaufeneAngebote(companyId, bis);
}

export function reserveQuoteNumber(companyId: string, praefix?: string): Promise<string> {
  return pg.reserveQuoteNumber(companyId, praefix);
}

export type { WithId };

export const acceptQuote = pg.acceptQuote;
