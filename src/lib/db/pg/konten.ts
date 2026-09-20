/**
 * Der Kontenrahmen des Betriebs.
 *
 * KEIN UPSERT, SONDERN ANLEGEN/ÄNDERN/LÖSCHEN EINZELN. Der Eindeutigkeitsindex
 * steht auf einem Ausdruck (`coalesce(ust_satz, -1)`), weil der Steuersatz nur
 * beim Erlöskonto gesetzt ist — ein Upsert müsste ihn benennen können und kann
 * es nicht. Die Ansicht hält ohnehin die ganze Liste und weiss, was neu ist.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { abfragen, aendern, anlegen, loeschen, type WithId } from './kern';
import type { Kontozweck } from '@/features/invoices/bmdExport';

export interface Buchungskonto {
  companyId: string;
  zweck: Kontozweck;
  /** Nur beim Erlöskonto gesetzt: der Steuersatz als Anteil (0.2 = 20 %). */
  ustSatz?: number | null;
  konto: string;
  steuercode?: string | null;
}

const TABELLE = 'buchungskonten';

export function buchungskonten(
  companyId: string,
  client?: SupabaseClient,
): Promise<WithId<Buchungskonto>[]> {
  return abfragen<Buchungskonto>(TABELLE, companyId, { sortiere: { feld: 'zweck' } }, client);
}

export function kontoAnlegen(
  companyId: string,
  k: Omit<Buchungskonto, 'companyId'>,
  client?: SupabaseClient,
): Promise<string> {
  return anlegen(TABELLE, companyId, { ...k, ustSatz: k.ustSatz ?? null }, client);
}

export function kontoAendern(
  id: string,
  k: Partial<Omit<Buchungskonto, 'companyId' | 'zweck'>>,
  client?: SupabaseClient,
): Promise<void> {
  return aendern(TABELLE, id, k, client);
}

export function kontoLoeschen(id: string, client?: SupabaseClient): Promise<void> {
  return loeschen(TABELLE, id, client);
}
