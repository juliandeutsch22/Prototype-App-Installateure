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

/** Was die Löschung tut oder täte — derselbe Bericht für Probelauf und Ausführung. */
export interface LoeschBericht {
  art: AuskunftArt;
  person: string;
  geloescht: boolean;
  /** Ein Kunde ohne Belege geht ganz. */
  ganz: boolean;
  hinweis: string;
  /** Was sofort gelöscht wird, je Art die Anzahl. */
  sofort: Record<string, number>;
  /** Was aufbewahrt werden muss, und bis wann (ISO-Datum). */
  aufbewahren: { was: string; anzahl: number; bis: string; grund: string }[];
}

/**
 * Löschen nach Art. 17 — mit `nurPruefen` der Probelauf, der nichts anfasst.
 * Was gehen darf und was aufbewahrt werden muss, entscheidet die Datenbank
 * (`public.person_loeschen`).
 */
export async function personLoeschen(
  art: AuskunftArt,
  id: string,
  nurPruefen: boolean,
): Promise<LoeschBericht> {
  const { data, error } = await derClient().rpc('person_loeschen', {
    p_art: art, p_id: id, p_nur_pruefen: nurPruefen,
  });
  if (error) throw new Error(error.message);
  return data as LoeschBericht;
}

export async function personAuskunft(art: AuskunftArt, id: string): Promise<Auskunft> {
  const { data, error } = await derClient().rpc('person_auskunft', { p_art: art, p_id: id });
  if (error) throw new Error(error.message);
  return data as Auskunft;
}
