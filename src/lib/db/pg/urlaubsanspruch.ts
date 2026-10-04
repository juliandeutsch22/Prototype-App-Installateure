/**
 * Anpassungen des Urlaubsanspruchs — auf Postgres.
 *
 * Geschrieben wird nur über die beiden Datenbankfunktionen: sie prüfen die
 * Rolle und setzen den Namen dessen, der anpasst, aus der Tabelle. Gelesen
 * wird direkt; der Zeilenschutz zeigt der Person die eigenen, dem Büro und
 * den Entscheidenden alle.
 */
import type { UrlaubsanspruchAnpassung } from '@/types';
import { abfragen, derClient } from './kern';

/**
 * Die geltenden Anpassungen — einer Person oder, ohne `uid`, aller, die der
 * Aufrufer lesen darf. Entfernte zählen nicht und kommen nicht mit.
 */
export function listAnpassungen(companyId: string, uid?: string) {
  return abfragen<UrlaubsanspruchAnpassung>('urlaubsanspruch_anpassungen', companyId, {
    wo: [
      { art: 'leer', feld: 'entferntAm' },
      ...(uid ? [{ art: 'gleich' as const, feld: 'userId', wert: uid }] : []),
    ],
    sortiere: { feld: 'urlaubsjahr' },
    grenze: 1000,
  });
}

export async function anspruchAnpassen(daten: {
  userId: string;
  urlaubsjahr: number;
  tage: number;
  grund: string;
}): Promise<string> {
  const { data, error } = await derClient().rpc('urlaubsanspruch_anpassen', {
    p_user: daten.userId,
    p_urlaubsjahr: daten.urlaubsjahr,
    p_tage: daten.tage,
    p_grund: daten.grund,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function anpassungEntfernen(id: string, grund: string): Promise<void> {
  const { error } = await derClient().rpc('urlaubsanspruch_anpassung_entfernen', {
    p_id: id,
    p_grund: grund,
  });
  if (error) throw new Error(error.message);
}
