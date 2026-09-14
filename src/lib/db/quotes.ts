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
import { nutztPostgres } from './quelle';
import type { WithId } from './core';
import * as fs from './fs/quotes';
import * as pg from './pg/quotes';

export type NewQuote = Omit<Quote, 'id' | 'companyId' | 'createdAt'>;

export function listRecentQuotes(companyId: string, max = 100): Promise<WithId<Quote>[]> {
  return nutztPostgres()
    ? pg.listRecentQuotes(companyId, max)
    : fs.listRecentQuotes(companyId, max);
}

export function listQuotesForCustomer(
  companyId: string, customerId: string, max = 100,
): Promise<WithId<Quote>[]> {
  return nutztPostgres()
    ? pg.listQuotesForCustomer(companyId, customerId, max)
    : fs.listQuotesForCustomer(companyId, customerId, max);
}

export function createQuote(companyId: string, q: NewQuote): Promise<string> {
  return nutztPostgres() ? pg.createQuote(companyId, q) : fs.createQuote(companyId, q);
}

export function updateQuote(id: string, data: Partial<NewQuote>): Promise<void> {
  return nutztPostgres() ? pg.updateQuote(id, data) : fs.updateQuote(id, data);
}

export function deleteQuote(id: string): Promise<void> {
  return nutztPostgres() ? pg.deleteQuote(id) : fs.deleteQuote(id);
}

export function reserveQuoteNumber(companyId: string): Promise<string> {
  return nutztPostgres() ? pg.reserveQuoteNumber(companyId) : fs.reserveQuoteNumber(companyId);
}

export type { WithId };
