import { where, orderBy, limit } from 'firebase/firestore';
import type { Wartung } from '@/types';
import { naechsterTermin } from '@/features/maintenance/wartungsplan';
import {
  queryTenant,
  createInTenant,
  updateInTenant,
  deleteInTenant,
  type WithId,
} from '../core';

/**
 * Wiederkehrende Wartungen — die Datenschicht.
 *
 * Die Sammlung bleibt klein: eine Vereinbarung je Anlage, nicht je Termin.
 * Ein Betrieb mit dreihundert gewarteten Thermen hat dreihundert Dokumente,
 * und zwar dauerhaft — die Ausführungen wachsen nicht mit, sie rücken den
 * Termin nur weiter.
 */

const COLLECTION = 'wartungen';

/**
 * Alle Vereinbarungen, nach Termin.
 *
 * Sortiert nach `faelligAm` statt nach Name: diese Liste beantwortet „was
 * kommt", nicht „wo steht Huber". Zum Nachschlagen gibt es die Suche in der
 * Ansicht.
 */
export function listWartungen(companyId: string, max = 500) {
  return queryTenant<Wartung>(COLLECTION, companyId, orderBy('faelligAm'), limit(max));
}

/**
 * Was bis zu einem Stichtag fällig ist.
 *
 * Der Ruht-Filter läuft ABSICHTLICH im Browser und nicht in der Abfrage. Ein
 * zweiter Gleichheitsfilter verlangte einen weiteren zusammengesetzten Index,
 * und vor allem: Firestore findet Dokumente nicht, denen das Feld ganz fehlt.
 * Eine Vereinbarung ohne `aktiv` verschwände damit stillschweigend aus der
 * Liste der fälligen Wartungen — und das ist der eine Fall, in dem Schweigen
 * teuer ist. Ruhende Vereinbarungen sind selten; sie kosten hier ein paar
 * gelesene Dokumente und keinen Termin.
 */
export function listFaelligeWartungen(companyId: string, bis: string, max = 200) {
  return queryTenant<Wartung>(
    COLLECTION,
    companyId,
    where('faelligAm', '<=', bis),
    orderBy('faelligAm'),
    limit(max),
  ).then((rows) => rows.filter((w) => w.aktiv !== false));
}

/** Die Vereinbarungen EINES Kunden — für die Kundenakte. */
export function listWartungenForCustomer(companyId: string, customerId: string, max = 100) {
  return queryTenant<Wartung>(
    COLLECTION,
    companyId,
    where('customerId', '==', customerId),
    limit(max),
  );
}

export type NewWartung = Omit<Wartung, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>;

export function createWartung(companyId: string, w: NewWartung) {
  return createInTenant(COLLECTION, companyId, w);
}

export function updateWartung(id: string, data: Partial<NewWartung>) {
  return updateInTenant(COLLECTION, id, data);
}

export function deleteWartung(id: string) {
  return deleteInTenant(COLLECTION, id);
}

/**
 * Eine Wartung als erledigt eintragen — und damit den nächsten Termin setzen.
 *
 * DAS IST DER SCHRITT, AN DEM DIE VEREINBARUNG LEBT. Ohne ihn wäre die Liste
 * nach dem ersten Frühjahr eine Sammlung überfälliger Zeilen, die niemand
 * mehr ernst nimmt. Beides geschieht in EINEM Schreibvorgang: ein Zustand
 * „gewartet, aber ohne nächsten Termin" darf nicht entstehen.
 *
 * Das Intervall wird MITGEGEBEN, nicht aus dem Dokument nachgelesen. Wer beim
 * Eintragen der erledigten Wartung zugleich das Intervall ändert (aus zwei
 * Jahren wird eines), erwartet, dass der neue Termin schon danach rechnet.
 */
export async function wartungErledigt(
  id: string,
  args: { erledigtAm: string; intervallMonate: number; projectNumber?: string },
) {
  /*
    `async`, obwohl der Rumpf nur weiterreicht: ein unbrauchbares Intervall
    lässt `naechsterTermin` werfen, und zwar SYNCHRON. Ohne `async` käme der
    Fehler nicht als abgelehntes Versprechen zurück, sondern flöge an jedem
    `.catch()` vorbei — ein Aufrufer, der nicht `await` benutzt, sähe einen
    Absturz statt einer Meldung.
  */
  return updateWartung(id, {
    zuletztAm: args.erledigtAm,
    faelligAm: naechsterTermin(args.erledigtAm, args.intervallMonate),
    intervallMonate: args.intervallMonate,
    letzteBaustelle: args.projectNumber,
    /*
      Die eingeplante Baustelle ist mit dem Eintrag GEWESEN — sie wandert nach
      `letzteBaustelle` und wird hier geleert, im selben Schreibvorgang. Bliebe
      sie stehen, zeigte die Liste die Wartung bis zum nächsten Termin als
      „eingeplant", obwohl der Einsatz vorbei ist; beim nächsten Mal führe der
      Monteur auf eine abgeschlossene Baustelle.

      Leerstring statt `undefined`: Firestore lässt `undefined` nicht zu, und
      `deleteField()` wäre hier zu viel Maschinerie für eine Angabe, die die
      Ansicht ohnehin auf „gesetzt oder nicht" prüft.
    */
    offeneBaustelle: '',
  });
}

/**
 * Die Baustelle vormerken, die für die anstehende Wartung angelegt wurde.
 *
 * Getrennt von `wartungErledigt`, weil es der Schritt DAVOR ist: hier ist noch
 * nichts gewartet, es steht nur fest, wohin gefahren wird. Wer beides in eine
 * Funktion legte, müsste beim Anlegen schon ein Ausführungsdatum erfinden —
 * und der nächste Termin rückte, bevor jemand da war.
 */
export function wartungEingeplant(id: string, projectNumber: string) {
  return updateWartung(id, { offeneBaustelle: projectNumber.trim() });
}

export type { WithId };
