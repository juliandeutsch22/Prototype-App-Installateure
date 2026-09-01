import { where, orderBy, limit } from 'firebase/firestore';
import type { Vacation } from '@/types';
import { queryTenant, createInTenant, deleteInTenant, type WithId } from './core';

/**
 * Urlaubsanträge.
 *
 * Der Ablauf hat drei Beteiligte und muss für alle drei ehrlich sein:
 *
 *  - Der Monteur stellt den Antrag und will jederzeit wissen, woran er ist.
 *    „Beantragt" ist kein Urlaub; danach zu planen wäre ein Missverständnis
 *    mit Folgen.
 *  - Geschäftsführung, Administration und Buchhaltung entscheiden. Eine
 *    Ablehnung trägt einen Grund, sonst ist sie von Willkür nicht zu
 *    unterscheiden.
 *  - Wer Einsätze plant, muss den genehmigten Urlaub SEHEN, bevor er jemanden
 *    einteilt. Ein Urlaub, der erst am Einsatztag auffällt, ist doppelte
 *    Arbeit für alle.
 */

const COLLECTION = 'vacations';

/**
 * Die eigenen Anträge, jüngste zuerst.
 *
 * Nach `von` sortiert und begrenzt: ein Mitarbeiter sammelt über zehn Jahre
 * vielleicht fünfzig Anträge an, und die Ansicht zeigt seinen Stand, nicht
 * sein Archiv.
 */
export function listOwnVacations(companyId: string, uid: string, max = 60) {
  return queryTenant<Vacation>(
    COLLECTION,
    companyId,
    where('userId', '==', uid),
    orderBy('von', 'desc'),
    limit(max),
  );
}

/**
 * Die offenen Anträge des Betriebs — die Arbeitsliste der Genehmigenden.
 *
 * Gleichheitsfilter auf einen kleinen Statuswert: die Menge bleibt klein,
 * egal wie viele Anträge über die Jahre entschieden wurden.
 */
export function listOpenVacations(companyId: string, max = 100) {
  return queryTenant<Vacation>(
    COLLECTION,
    companyId,
    where('status', '==', 'Beantragt'),
    limit(max),
  );
}

/**
 * Genehmigter Urlaub, der in einen Zeitraum hineinreicht — für die Planung.
 *
 * Abgefragt wird über `bis >= vonDesZeitraums`, danach wird im Browser auf
 * `von <= bisDesZeitraums` eingeengt. Firestore kann Bereichsfilter nur auf
 * EINEM Feld führen, und ein Urlaub, der vor dem Zeitraum beginnt und in ihn
 * hineinragt, muss gefunden werden — sonst fehlte im Kalender genau der
 * längere Urlaub, der am ehesten stört.
 */
export async function listApprovedVacationsInRange(
  companyId: string,
  vonIso: string,
  bisIso: string,
  max = 200,
) {
  const rows = await queryTenant<Vacation>(
    COLLECTION,
    companyId,
    where('status', '==', 'Genehmigt'),
    where('bis', '>=', vonIso),
    orderBy('bis', 'asc'),
    limit(max),
  );
  return rows.filter((v) => v.von <= bisIso);
}

export type NewVacation = Omit<Vacation, 'id' | 'companyId' | 'createdAt'>;

export function createVacation(companyId: string, v: NewVacation) {
  return createInTenant(COLLECTION, companyId, v);
}

/** Einen noch nicht entschiedenen Antrag zurückziehen. */
export function deleteVacation(id: string) {
  return deleteInTenant(COLLECTION, id);
}

/**
 * Entschieden wird SERVERSEITIG — siehe `lib/functions.ts:callUrlaubEntscheiden`.
 *
 * Hier stand die Genehmigung ursprünglich als Batch im Browser. Das ging,
 * solange nur Buchhaltung und Leitung entscheiden durften: sie dürfen fremde
 * Zeiteinträge ohnehin lesen und schreiben. Sobald die Geschäftsführung frei
 * festlegen kann, WER genehmigt — etwa eine Bürokraft —, ginge es nicht mehr.
 * Der naheliegende Ausweg wäre gewesen, dieser Person das Lesen aller
 * Zeiteinträge zu erlauben; Zeiteinträge tragen aber Kranken- und Urlaubstage
 * und damit Gesundheitsdaten nach Art. 9 DSGVO.
 *
 * Deshalb entscheidet der Server, und der Aufrufer bekommt nichts zu sehen,
 * was er nicht ohnehin sehen darf. Dieselbe Überlegung wie beim
 * Handwerksschein.
 */

export type { WithId };
