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

export type NewQuote = Omit<Quote, 'id' | 'companyId' | 'createdAt'>;

export function listRecentQuotes(companyId: string, max = 100): Promise<WithId<Quote>[]> {
  return pg.listRecentQuotes(companyId, max);
}

export function listQuotesForCustomer(
  companyId: string, customerId: string, max = 100,
): Promise<WithId<Quote>[]> {
  return pg.listQuotesForCustomer(companyId, customerId, max);
}

export function createQuote(companyId: string, q: NewQuote): Promise<string> {
  return pg.createQuote(companyId, q);
}

export function updateQuote(id: string, data: Partial<NewQuote>): Promise<void> {
  return pg.updateQuote(id, data);
}

export function deleteQuote(id: string): Promise<void> {
  return pg.deleteQuote(id);
}

export function reserveQuoteNumber(companyId: string, praefix?: string): Promise<string> {
  return pg.reserveQuoteNumber(companyId, praefix);
}

export type { WithId };
