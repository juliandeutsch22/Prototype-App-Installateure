/**
 * Urlaubsanträge — auf Postgres.
 *
 * Wer entscheiden darf, steht nicht hier, sondern in der Datenbank
 * (`app.urlaub_entscheidung_geschuetzt`): über den eigenen Urlaub entscheidet
 * niemand selbst. Entschieden wird weiterhin serverseitig, aus demselben
 * Grund wie bisher — Zeiteinträge tragen Kranken- und Urlaubstage und damit
 * Gesundheitsdaten nach Art. 9 DSGVO, die der Genehmigende nicht zu sehen
 * bekommen soll.
 */
import type { Vacation } from '@/types';
import { abfragen, anlegen, loeschen, derClient } from './kern';

const URLAUB = 'vacations';

/**
 * Die eigenen Anträge, jüngste zuerst.
 *
 * Begrenzt: ein Mitarbeiter sammelt über zehn Jahre vielleicht fünfzig
 * Anträge an, und die Ansicht zeigt seinen Stand, nicht sein Archiv.
 */
export function listOwnVacations(companyId: string, uid: string, max = 60) {
  return abfragen<Vacation>(URLAUB, companyId, {
    wo: [{ art: 'gleich', feld: 'userId', wert: uid }],
    sortiere: { feld: 'von', absteigend: true },
    grenze: max,
  });
}

/** Die offenen Anträge des Betriebs — die Arbeitsliste der Genehmigenden. */
export function listOpenVacations(companyId: string, max = 100) {
  return abfragen<Vacation>(URLAUB, companyId, {
    wo: [{ art: 'gleich', feld: 'status', wert: 'Beantragt' }],
    grenze: max,
  });
}

/**
 * Genehmigter Urlaub, der in einen Zeitraum hineinreicht — für die Planung.
 *
 * HIER VERSCHWINDET EIN NACHFILTER. Firestore konnte Bereichsfilter nur auf
 * EINEM Feld führen; die zweite Bedingung (`von <= bis des Zeitraums`) lief
 * deshalb im Browser — NACH der Obergrenze. Damit konnte die Grenze Zeilen
 * wegschneiden, die der Nachfilter ohnehin verworfen hätte, und die Liste
 * war kürzer als nötig, ohne dass es jemandem auffiel.
 *
 * Postgres nimmt beide Bedingungen. Die Grenze greift jetzt auf die richtige
 * Menge.
 *
 * Beide Seiten überlappen einschliesslich: ein Urlaub, der VOR dem Zeitraum
 * beginnt und in ihn hineinragt, muss gefunden werden — sonst fehlte im
 * Kalender genau der längere Urlaub, der am ehesten stört.
 */
export function listApprovedVacationsInRange(
  companyId: string,
  vonIso: string,
  bisIso: string,
  max = 200,
) {
  return abfragen<Vacation>(URLAUB, companyId, {
    wo: [
      { art: 'gleich', feld: 'status', wert: 'Genehmigt' },
      { art: 'ab', feld: 'bis', wert: vonIso },
      { art: 'bis', feld: 'von', wert: bisIso },
    ],
    sortiere: { feld: 'bis' },
    grenze: max,
  });
}

export type NewVacation = Omit<Vacation, 'id' | 'companyId' | 'createdAt'>;

export function createVacation(companyId: string, v: NewVacation) {
  return anlegen(URLAUB, companyId, v);
}

/**
 * Einen noch nicht entschiedenen Antrag zurückziehen.
 *
 * Dass „noch nicht entschieden" wirklich gilt, hält die Richtlinie fest
 * (`vacations_loeschen`): gelöscht werden darf nur der eigene Antrag im
 * Status „Beantragt". Der Client prüft es nicht — er könnte es auch nicht
 * verbindlich.
 */
export function deleteVacation(id: string) {
  return loeschen(URLAUB, id);
}

/** Was die Entscheidung zurückmeldet — Zahlen, keine fremden Buchungen. */
export interface UrlaubsEntscheidung {
  status: string;
  angelegt: number;
  uebersprungen: number;
  entfernt: number;
}

/**
 * Über einen Urlaubsantrag entscheiden.
 *
 * WARUM DAS NICHT DIE ANSICHT TUT, obwohl sie es könnte: die Genehmigung muss
 * fremde Zeiteinträge LESEN (um bereits gebuchte Tage nicht zu überschreiben)
 * und fremde Zeiteinträge SCHREIBEN. Beides darf ein Genehmigender nicht —
 * Zeiteinträge tragen Kranken- und Urlaubstage und damit Gesundheitsdaten
 * nach Art. 9 DSGVO.
 *
 * Die Datenbankfunktion darf es, der Aufrufer nicht. Zurück kommen nur
 * Zahlen; zu sehen bekommt er nichts, was er nicht ohnehin sehen dürfte.
 *
 * Bis zum Umzug war das eine Cloud Function. Der Unterschied ist nicht der
 * Ort, sondern die Klammer: Statuswechsel und Zeitkonto gehen jetzt in EINER
 * Transaktion hinaus.
 */
export async function entscheiden(daten: {
  vacationId: string;
  entscheidung: 'Genehmigt' | 'Abgelehnt' | 'Storniert';
  grund?: string;
  entscheiderName?: string;
}): Promise<UrlaubsEntscheidung> {
  const { data, error } = await derClient().rpc('urlaub_entscheiden', {
    p_antrag: daten.vacationId,
    p_entscheidung: daten.entscheidung,
    p_grund: daten.grund ?? '',
    p_entscheider_name: daten.entscheiderName ?? null,
  });
  if (error) throw new Error(error.message);
  return data as UrlaubsEntscheidung;
}
