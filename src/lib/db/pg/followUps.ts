/**
 * Nachfassungen — auf Postgres.
 *
 * „Beim Kunden nochmal wegen der Therme anrufen." Entsteht meist aus einer
 * Sprachnotiz und ist erledigt oder nicht; mehr Zustand braucht es nicht.
 */
import type { FollowUp } from '@/types';
import { abfragen, anlegen, aendern } from './kern';

const NACHFASSUNGEN = 'follow_ups';

/**
 * Die offenen Nachfassungen.
 *
 * Ohne Obergrenze, und das ist hier vertretbar: erledigte fallen heraus, und
 * eine Liste offener Nachfassungen, die lang wird, ist selbst der Befund.
 */
export function listOpenFollowUps(companyId: string) {
  return abfragen<FollowUp>(NACHFASSUNGEN, companyId, {
    wo: [{ art: 'gleich', feld: 'done', wert: false }],
  });
}

export type NewFollowUp = Omit<FollowUp, 'id' | 'companyId' | 'createdAt'>;

export function createFollowUp(companyId: string, f: NewFollowUp): Promise<string> {
  return anlegen(NACHFASSUNGEN, companyId, f);
}

export function markFollowUpDone(id: string): Promise<void> {
  return aendern(NACHFASSUNGEN, id, { done: true });
}
