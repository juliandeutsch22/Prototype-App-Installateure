/**
 * Datenauskunft je Person (DSGVO Art. 15; offene Punkte B8).
 *
 * Die Datenbank stellt sie zusammen (`public.person_auskunft`): sie sieht
 * alle Tabellen, auch die, die die Geschäftsführung in der App nie einzeln
 * öffnet, und entscheidet, was einer ANDEREN Person gehört und deshalb
 * draussen bleibt. Hier wird sie nur abgeholt und als Datei gespeichert.
 */
import { derClient } from './kern';

export type AuskunftArt = 'mitarbeiter' | 'kunde';

export interface Auskunft {
  art: AuskunftArt;
  person: string;
  erstellt_am: string;
  hinweis: string;
  betrieb: { id: string; name: string };
  daten: Record<string, unknown>;
  anzahl: Record<string, number>;
  als_bearbeiter?: Record<string, number>;
}

export async function personAuskunft(art: AuskunftArt, id: string): Promise<Auskunft> {
  const { data, error } = await derClient().rpc('person_auskunft', { p_art: art, p_id: id });
  if (error) throw new Error(error.message);
  return data as Auskunft;
}
