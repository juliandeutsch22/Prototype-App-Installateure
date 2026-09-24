/**
 * Das Fehlerprotokoll — auf Postgres.
 *
 * Geschrieben wird OHNE Betrieb und OHNE Person: beides setzt die Datenbank
 * aus dem Token. Ein Melder, der es mitschickte, könnte es auch falsch
 * mitschicken.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FehlerEintrag } from '@/types';
import { abfragen, derClient, type WithId } from './kern';

const TABELLE = 'fehlerprotokoll';

/** Wie viele Einträge die Ansicht holt — 90 Tage eines Betriebs passen hinein. */
export const FEHLER_GRENZE = 500;

export type NeuerFehlerEintrag = Pick<
  FehlerEintrag,
  'art' | 'nachricht' | 'stapel' | 'pfad' | 'fassung' | 'geraet' | 'beschreibung' | 'anSupport'
>;

/**
 * Einen Eintrag schreiben.
 *
 * OHNE `.select()`: lesen darf das Protokoll nur die Spitze des Betriebs. Ein
 * Rücklesen des eigenen Eintrags scheiterte beim Monteur am Zeilenschutz —
 * und das Schreiben sähe dann aus, als wäre es gescheitert.
 */
export async function fehlerEintragen(e: NeuerFehlerEintrag, client?: SupabaseClient): Promise<void> {
  const { error } = await derClient(client).from(TABELLE).insert({
    art: e.art,
    nachricht: e.nachricht ?? null,
    stapel: e.stapel ?? null,
    pfad: e.pfad ?? null,
    fassung: e.fassung ?? null,
    geraet: e.geraet ?? null,
    beschreibung: e.beschreibung ?? null,
    an_support: e.anSupport ?? false,
  });
  if (error) throw new Error(error.message);
}

/** Das Protokoll des eigenen Betriebs, jüngste zuerst. */
export function listFehlerprotokoll(companyId: string): Promise<WithId<FehlerEintrag>[]> {
  return abfragen<FehlerEintrag>(TABELLE, companyId, {
    sortiere: { feld: 'createdAt', absteigend: true },
    grenze: FEHLER_GRENZE,
  });
}

/** Was die Plattform sieht: Technik aus allen Betrieben, Meldungen nur mit Häkchen. */
export interface PlattformFehler {
  id: string;
  companyId: string;
  betrieb: string;
  art: FehlerEintrag['art'];
  nachricht: string | null;
  stapel: string | null;
  pfad: string | null;
  fassung: string | null;
  geraet: string | null;
  beschreibung: string | null;
  createdAt: number;
}

export async function plattformFehler(tage = 14, client?: SupabaseClient): Promise<PlattformFehler[]> {
  const { data, error } = await derClient(client).rpc('fehlerprotokoll_plattform', { p_tage: tage });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((z) => ({
    id: String(z.id),
    companyId: String(z.company_id),
    betrieb: String(z.betrieb),
    art: z.art as FehlerEintrag['art'],
    nachricht: (z.nachricht as string | null) ?? null,
    stapel: (z.stapel as string | null) ?? null,
    pfad: (z.pfad as string | null) ?? null,
    fassung: (z.fassung as string | null) ?? null,
    geraet: (z.geraet as string | null) ?? null,
    beschreibung: (z.beschreibung as string | null) ?? null,
    createdAt: Date.parse(String(z.created_at)),
  }));
}
