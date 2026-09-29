/**
 * Das Fehlerprotokoll — auf Postgres.
 *
 * Geschrieben wird OHNE Betrieb und OHNE Person: beides setzt die Datenbank
 * aus dem Token. Ein Melder, der es mitschickte, könnte es auch falsch
 * mitschicken.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FehlerEintrag } from '@/types';
import { istBenutzerkonto } from '@shared/benutzername';
import { derClient } from './kern';

const TABELLE = 'fehlerprotokoll';

export type NeuerFehlerEintrag = Pick<
  FehlerEintrag,
  'art' | 'nachricht' | 'stapel' | 'pfad' | 'fassung' | 'geraet' | 'beschreibung'
>;

/**
 * Einen Eintrag schreiben.
 *
 * OHNE `.select()`: im Betrieb liest niemand das Protokoll, nur die Plattform
 * über ihre eigene Funktion. Ein Rücklesen des eigenen Eintrags scheiterte am
 * Zeilenschutz — und das Schreiben sähe dann aus, als wäre es gescheitert.
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
  });
  if (error) throw new Error(error.message);
}

/**
 * Einen Absturz VOR DER ANMELDUNG festhalten — ohne Betrieb, ohne Person.
 *
 * Nur über die Datenbankfunktion: schreiben darf hier jeder im Netz, und die
 * Funktion kürzt, filtert Wiederholungen und begrenzt die Menge je Stunde
 * (`20260929190000_fehler_vor_anmeldung.sql`).
 */
export async function fehlerVorAnmeldungEintragen(
  e: Omit<NeuerFehlerEintrag, 'beschreibung' | 'art'> & { art: 'absturz' | 'fehler' },
  client?: SupabaseClient,
): Promise<void> {
  const { error } = await derClient(client).rpc('fehler_vor_anmeldung_eintragen', {
    p_art: e.art,
    p_nachricht: e.nachricht ?? '',
    p_stapel: e.stapel ?? null,
    p_pfad: e.pfad ?? null,
    p_fassung: e.fassung ?? null,
    p_geraet: e.geraet ?? null,
  });
  if (error) throw new Error(error.message);
}

/**
 * Ob gerade jemand angemeldet ist — entscheidet, wohin ein Absturz geht.
 *
 * Aus der gespeicherten Sitzung, ohne Anfrage an den Server: im Fehlerfall
 * ist das Netz womöglich der Grund.
 */
export async function angemeldet(client?: SupabaseClient): Promise<boolean> {
  const { data } = await derClient(client).auth.getSession();
  return !!data.session;
}

/** Was die Plattform sieht: Technik aus allen Betrieben ohne Person, Meldungen mit Absender. */
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
  /** Nur bei einer Meldung: wer sie geschrieben hat, damit der Support nachfragen kann. */
  wer?: string;
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
    wer: absender(z.melder as string | null, z.melder_email as string | null),
  }));
}

/*
  Die Kunstadresse eines Benutzerkontos ist keine Adresse, an die der Support
  schreiben könnte — dann bleibt der Name, und nachgefragt wird im Betrieb.
*/
function absender(name: string | null, email: string | null): string | undefined {
  if (!name) return undefined;
  return email && !istBenutzerkonto(email) ? `${name} · ${email}` : name;
}
