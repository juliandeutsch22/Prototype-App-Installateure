import { where, orderBy, limit, doc, collection, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AppUser, TimeEntry, Vacation } from '@/types';
import { urlaubsTage } from '@/lib/time';
import { queryTenant, createInTenant, updateInTenant, deleteInTenant, type WithId } from './core';

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
const ZEITEN = 'timeEntries';

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

/** Ablehnen — mit Grund, ohne Nebenwirkung auf das Zeitkonto. */
export function rejectVacation(
  id: string,
  entscheider: { uid: string; name: string },
  grund: string,
) {
  return updateInTenant(COLLECTION, id, {
    status: 'Abgelehnt',
    entschiedenVonUid: entscheider.uid,
    entschiedenVonName: entscheider.name,
    entschiedenAm: Date.now(),
    grund,
  });
}

/**
 * Genehmigen — und dabei die Zeiteinträge anlegen.
 *
 * DAS IST DER EIGENTLICHE PUNKT DER GENEHMIGUNG. Ohne die Einträge wäre ein
 * genehmigter Urlaub für die Stundenrechnung unsichtbar: der Saldo zöge für
 * jeden Urlaubstag das Tagessoll ab, und die Startseite meldete zwei Wochen
 * lang „Zeit fehlt". Der Mitarbeiter müsste seinen genehmigten Urlaub also
 * ein zweites Mal von Hand eintragen — und genau das ist die Doppelarbeit,
 * die diese Funktion abschafft.
 *
 * IN EINEM BATCH mit der Statusänderung: bricht die Verbindung dazwischen ab,
 * wäre der Urlaub sonst genehmigt und die Tage fehlten. Ein Batch fasst bis zu
 * 500 Schreibvorgänge; ein Urlaub mit mehr als 499 Arbeitstagen ist kein
 * Urlaub mehr.
 *
 * `belegteTage` sind Tage, an denen dieser Mitarbeiter schon gebucht hat. Sie
 * werden ÜBERSPRUNGEN, nicht überschrieben: eine bereits erfasste
 * Arbeitsleistung darf eine Genehmigung nicht stillschweigend wegwerfen. Wie
 * viele es waren, gibt die Funktion zurück, damit die Oberfläche es sagen
 * kann.
 */
export async function approveVacation(
  companyId: string,
  antrag: WithId<Vacation>,
  mitarbeiter: Pick<AppUser, 'workDays'>,
  entscheider: { uid: string; name: string },
  belegteTage: Set<string>,
): Promise<{ angelegt: number; uebersprungen: number }> {
  const tage = urlaubsTage(mitarbeiter, antrag.von, antrag.bis);
  const offen = tage.filter((t) => !belegteTage.has(t));

  const batch = writeBatch(db);
  batch.update(doc(db, COLLECTION, antrag.id), {
    status: 'Genehmigt',
    entschiedenVonUid: entscheider.uid,
    entschiedenVonName: entscheider.name,
    entschiedenAm: Date.now(),
    updatedAt: serverTimestamp(),
  });

  for (const datum of offen) {
    const eintrag: Omit<TimeEntry, 'id'> = {
      companyId,
      date: datum,
      status: 'Urlaub',
      userId: antrag.userId,
      userName: antrag.userName,
      breakDuration: 0,
      vacationId: antrag.id,
      comment: 'Genehmigter Urlaub',
    };
    batch.set(doc(collection(db, ZEITEN)), { ...eintrag, createdAt: serverTimestamp() });
  }

  await batch.commit();
  return { angelegt: offen.length, uebersprungen: tage.length - offen.length };
}

/**
 * Einen genehmigten Urlaub zurücknehmen — samt der erzeugten Zeiteinträge.
 *
 * Ohne das Aufräumen bliebe der Urlaub im Zeitkonto stehen, obwohl er
 * zurückgenommen wurde. Entfernt werden ausschließlich Einträge, die diese
 * Genehmigung angelegt hat (`vacationId`); ein von Hand gebuchter Urlaubstag
 * im selben Zeitraum bleibt unangetastet.
 */
export async function cancelApprovedVacation(
  antrag: WithId<Vacation>,
  erzeugteEintraege: WithId<TimeEntry>[],
  entscheider: { uid: string; name: string },
  grund: string,
) {
  const batch = writeBatch(db);
  batch.update(doc(db, COLLECTION, antrag.id), {
    status: 'Storniert',
    entschiedenVonUid: entscheider.uid,
    entschiedenVonName: entscheider.name,
    entschiedenAm: Date.now(),
    grund,
    updatedAt: serverTimestamp(),
  });
  for (const e of erzeugteEintraege) {
    if (e.vacationId !== antrag.id) continue;
    batch.delete(doc(db, ZEITEN, e.id));
  }
  await batch.commit();
}

export type { WithId };
