/**
 * DIE KATALOGSUCHE FINDET AUCH ÜBER DIE NUMMER DES GROSSHÄNDLERS UND DIE EAN
 * (M03a) — siehe `katalog_nummern_suche` in
 * `20261107100000_lieferantenartikel.sql`.
 *
 * Seit ein zweiter Großhändler einem Artikel als „derselbe Artikel“
 * zugeordnet sein kann, steht seine Nummer nicht mehr am Stammartikel. Wer
 * sie vom Lieferschein oder der Verpackung abtippt, soll den Artikel trotzdem
 * finden — überall, wo Artikel gesucht werden.
 *
 * WIE: Der Server nennt die Kennungen der Stammartikel, deren Nummer oder EAN
 * passt (Index, höchstens zwanzig, erst ab drei Zeichen); die Suche nimmt sie
 * mit `id.in.(…)` in ihre bestehende `or`-Bedingung. So bleiben Sortierung,
 * Grenze und Gesamtzahl die der einen Abfrage. Scheitert die Nummernsuche
 * (kein Netz, ältere Datenbank), sucht die App wie bisher.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { derClient } from './kern';
import type { MitNummer, NummernTreffer } from '@/lib/katalogTreffer';

export type { MitNummer, NummernTreffer } from '@/lib/katalogTreffer';

/** Ab so vielen Zeichen fragt die App nach Nummern — wie der Server. */
export const NUMMER_AB = 3;

export async function nummernTreffer(
  begriff: string,
  anzahl = 20,
  client?: SupabaseClient,
): Promise<Map<string, NummernTreffer>> {
  const b = begriff.trim();
  if (b.length < NUMMER_AB) return new Map();
  try {
    const { data, error } = await derClient(client)
      .rpc('katalog_nummern_suche', { p_begriff: b, p_anzahl: anzahl });
    if (error) return new Map();
    return new Map(
      ((data ?? []) as Array<{ material_id: string; nummer: string; art: 'lieferant' | 'ean'; lieferant: string }>)
        .map((z) => [z.material_id, { nummer: z.nummer, art: z.art, lieferant: z.lieferant }]),
    );
  } catch {
    return new Map();
  }
}

/** Die `or`-Bedingung der Suche, erweitert um die über Nummern gefundenen Artikel. */
export function oderMitNummern(oder: string | null, treffer: ReadonlyMap<string, unknown>): string | null {
  if (!oder || treffer.size === 0) return oder;
  // Kennungen sind UUIDs — keine Zeichen, die die `or`-Syntax stören.
  return `${oder},id.in.(${[...treffer.keys()].join(',')})`;
}

/** Hängt an die gefundenen Zeilen, über welche Nummer sie kamen. */
export function mitNummern<T extends { id: string }>(zeilen: T[], treffer: ReadonlyMap<string, NummernTreffer>): MitNummer<T>[] {
  if (treffer.size === 0) return zeilen;
  return zeilen.map((z) => (treffer.has(z.id) ? { ...z, gefundenUeber: treffer.get(z.id) } : z));
}
