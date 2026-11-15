/**
 * Auszug und Datenauskunft in Teilen abholen (K4, Durchsicht 15.11.2026).
 *
 * Die Datenbank legt eine Arbeitskopie an (`betrieb_auszug_start`,
 * `person_auskunft_start`) und gibt sie Seite für Seite heraus
 * (`auszug_teil`); was hineingehört, entscheidet sie. Hier wird nur
 * abgeholt, gezählt und zur Datei zusammengesetzt (`lib/auszugTeile.ts`).
 * Danach wird die Kopie sofort verworfen — sie enthält, je nach Art, den
 * ganzen Betrieb.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { jsonAusTeilen, type AuszugZeile } from '@/lib/auszugTeile';
import { derClient } from './kern';

export interface AuszugUmfang {
  lauf: string;
  seiten: number;
  zeilen: number;
  bytes: number;
}

export interface AuszugDatei {
  blob: Blob;
  /** Die Werte der obersten Ebene — Betrieb, Zeitpunkt, Anzahlen, Person. */
  kopf: Record<string, unknown>;
}

/** Wie weit es ist: abgeholte Teile von allen. */
export type Fortschritt = (fertig: number, gesamt: number) => void;

export async function auszugHolen(
  start: () => Promise<AuszugUmfang>,
  fortschritt?: Fortschritt,
  client?: SupabaseClient,
): Promise<AuszugDatei> {
  const c = derClient(client);
  const umfang = await start();
  const json = jsonAusTeilen();
  let gezaehlt = 0;
  try {
    fortschritt?.(0, umfang.seiten);
    for (let seite = 1; seite <= umfang.seiten; seite += 1) {
      const { data, error } = await c.rpc('auszug_teil', { p_lauf: umfang.lauf, p_seite: seite });
      if (error) throw new Error(error.message);
      for (const z of (data ?? []) as AuszugZeile[]) {
        json.zeile(z);
        gezaehlt += 1;
      }
      fortschritt?.(seite, umfang.seiten);
    }
    /*
      VOLLSTÄNDIG ODER GAR NICHT. Eine Auskunft, der still ein Teil fehlt,
      wäre schlimmer als keine: sie ginge als vollständig hinaus.
    */
    if (gezaehlt !== umfang.zeilen) {
      throw new Error('Der Auszug kam nicht vollständig an. Bitte den Download neu beginnen.');
    }
    const { teile, kopf } = json.fertig();
    return { blob: new Blob(teile, { type: 'application/json' }), kopf };
  } finally {
    await c.rpc('auszug_verwerfen', { p_lauf: umfang.lauf }).then(() => undefined, () => undefined);
  }
}

async function umfangVon(
  aufruf: PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<AuszugUmfang> {
  const { data, error } = await aufruf;
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  return { lauf: String(d.lauf), seiten: Number(d.seiten ?? 0), zeilen: Number(d.zeilen ?? 0), bytes: Number(d.bytes ?? 0) };
}

/** Der ganze Bestand des eigenen Betriebs (DSGVO Art. 15/20) — in Teilen, ohne Obergrenze. */
export function betriebAuszugDatei(fortschritt?: Fortschritt, client?: SupabaseClient): Promise<AuszugDatei> {
  return auszugHolen(() => umfangVon(derClient(client).rpc('betrieb_auszug_start')), fortschritt, client);
}

/** Die Datenauskunft einer Person (Art. 15) — in Teilen, ohne Obergrenze. */
export function personAuskunftDatei(
  art: 'mitarbeiter' | 'kunde', id: string, fortschritt?: Fortschritt, client?: SupabaseClient,
): Promise<AuszugDatei> {
  return auszugHolen(
    () => umfangVon(derClient(client).rpc('person_auskunft_start', { p_art: art, p_id: id })),
    fortschritt,
    client,
  );
}
