import { derClient } from './pg/kern';
import type { StartWahl } from '@/features/dashboard/start/einrichtung';

/**
 * Die eigene Einrichtung der Startseite (E68) — `startseite_wahl`, nur die
 * eigene Zeile. Gibt es keine, gilt die Vorgabe der Rolle (`null`).
 */
export async function ladeStartseiteWahl(uid: string): Promise<StartWahl | null> {
  const { data, error } = await derClient()
    .from('startseite_wahl').select('wahl').eq('user_id', uid).maybeSingle();
  if (error) throw new Error(error.message);
  const wahl = (data as { wahl?: unknown } | null)?.wahl;
  return wahl && typeof wahl === 'object' && !Array.isArray(wahl) ? (wahl as StartWahl) : null;
}

/** Speichern — die Datenbank prüft die Form (`startseite_speichern`). `{}` heißt: Vorgabe der Rolle. */
export async function startseiteWahlSpeichern(wahl: StartWahl): Promise<void> {
  const { error } = await derClient().rpc('startseite_speichern', { p_wahl: wahl });
  if (error) throw new Error(error.message);
}
