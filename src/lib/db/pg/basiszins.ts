/**
 * Der Basiszinssatz der OeNB, zentral vom Betreiber gepflegt (seit 05.10.2026).
 *
 * Lesen darf jeder Angemeldete, schreiben nur das Plattformkonto über
 * `basiszinssatz_setzen` und `basiszinssatz_entfernen`. Die Tabelle hängt an
 * keinem Betrieb: der Satz gilt für ganz Österreich.
 */
import { derClient } from './kern';

export interface ZentralerBasiszinssatz {
  /** 1. Jänner oder 1. Juli. */
  ab: string;
  /** % — darf negativ sein. */
  satz: number;
}

export async function listBasiszinssaetze(): Promise<ZentralerBasiszinssatz[]> {
  const { data, error } = await derClient()
    .from('basiszinssaetze')
    .select('ab, satz')
    .order('ab')
    // Zwei je Jahr; zweihundert reichen für ein Jahrhundert.
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((z: { ab: string; satz: number | string }) => ({ ab: String(z.ab), satz: Number(z.satz) }));
}

export async function basiszinssatzSetzen(ab: string, satz: number): Promise<void> {
  const { error } = await derClient().rpc('basiszinssatz_setzen', { p_ab: ab, p_satz: satz });
  if (error) throw new Error(error.message);
}

export async function basiszinssatzEntfernen(ab: string): Promise<void> {
  const { error } = await derClient().rpc('basiszinssatz_entfernen', { p_ab: ab });
  if (error) throw new Error(error.message);
}
