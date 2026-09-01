import { where, orderBy, limit, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { WorkSheet, WorkSheetUnterschrift } from '@/types';
import { queryTenant, createInTenant, type WithId } from './core';

/**
 * Handwerksscheine — der Beleg, den der Kunde auf der Baustelle unterschreibt.
 *
 * Zwei Zustände, und der Übergang dazwischen ist endgültig:
 *
 *   ENTWURF          — änderbar, noch nichts unterschrieben
 *   UNTERSCHRIEBEN   — eingefroren. Weder Inhalt noch Unterschriften lassen
 *                      sich danach ändern; die Firestore-Rules verbieten es,
 *                      nicht nur die Oberfläche.
 *
 * Korrekturen laufen ausschließlich über einen Storno und einen neuen Schein
 * — dasselbe Muster wie bei den Rechnungen. Ein nachträglich geänderter Beleg
 * wäre wertlos: der Kunde hat etwas anderes unterschrieben, als im System
 * steht, und niemand könnte den Unterschied nachweisen.
 */

const COLLECTION = 'workSheets';

/**
 * Die jüngsten Scheine, mit Obergrenze.
 *
 * Eine Arbeitsliste, kein Archiv: gearbeitet wird an dem, was zuletzt
 * entstanden ist.
 */
export function listRecentWorkSheets(companyId: string, max = 100) {
  return queryTenant<WorkSheet>(COLLECTION, companyId, orderBy('createdAt', 'desc'), limit(max));
}

/** Die Scheine EINER Baustelle. */
export function listWorkSheetsForProject(companyId: string, projectNumber: string, max = 100) {
  return queryTenant<WorkSheet>(
    COLLECTION,
    companyId,
    where('projectNumber', '==', projectNumber),
    limit(max),
  );
}

export type NewWorkSheet = Omit<WorkSheet, 'id' | 'companyId' | 'createdAt'>;

export function createWorkSheet(companyId: string, s: NewWorkSheet) {
  return createInTenant(COLLECTION, companyId, s);
}

/** Ändern — nur im Entwurf. Nach der Unterschrift lehnen die Rules ab. */
export function updateWorkSheetDraft(id: string, data: Partial<NewWorkSheet>) {
  return updateDoc(doc(db, COLLECTION, id), { ...data });
}

/**
 * Unterschreiben und einfrieren — in EINEM Schreibvorgang.
 *
 * Beide Unterschriften, der Status und die Serverzeit gehen zusammen raus.
 * Zwei getrennte Schreibvorgänge hätten einen Zustand dazwischen erlaubt, in
 * dem der Schein unterschrieben, aber noch änderbar ist — genau das Fenster,
 * das es nicht geben darf.
 *
 * Die Serverzeit kommt vom Server, die Gerätezeit steckt in den
 * Unterschriften. Beide werden gebraucht: offline im Keller erfasst, ist die
 * Serverzeit die der späteren Übertragung.
 */
export function signWorkSheet(
  id: string,
  monteur: WorkSheetUnterschrift,
  kunde: WorkSheetUnterschrift,
) {
  return updateDoc(doc(db, COLLECTION, id), {
    status: 'Unterschrieben',
    unterschriften: { monteur, kunde },
    unterschriebenAm: serverTimestamp(),
  });
}

/**
 * Stornieren.
 *
 * Der einzige Weg, einen unterschriebenen Schein aus dem Verkehr zu ziehen.
 * Er bleibt bestehen und sichtbar — ein spurlos verschwundener Beleg wäre
 * schlimmer als ein falscher.
 */
export function cancelWorkSheet(id: string, grund: string, vonName: string) {
  return updateDoc(doc(db, COLLECTION, id), {
    status: 'Storniert',
    stornoGrund: grund,
    storniertVonName: vonName,
  });
}

export type { WithId };
