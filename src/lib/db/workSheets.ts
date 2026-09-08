import {
  where,
  orderBy,
  limit,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { WorkSheet, WorkSheetUnterschrift } from '@/types';
import { queryTenant, createInTenant, type WithId } from './core';

/**
 * Handwerksscheine — der Beleg, den der Kunde auf der Baustelle unterschreibt.
 *
 * Zustände, und der Übergang zur Unterschrift ist endgültig:
 *
 *   ENTWURF          — änderbar, noch nichts unterschrieben
 *   UNTERSCHRIEBEN   — eingefroren. Weder Inhalt noch Unterschriften lassen
 *                      sich danach ändern; die Firestore-Rules verbieten es,
 *                      nicht nur die Oberfläche.
 *   VERWORFEN        — der aufgegebene Entwurf. Aus der Arbeitsliste heraus,
 *                      aber nicht aus der Datenbank; als einziger Zustand
 *                      wieder aufnehmbar.
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

/**
 * Die EIGENEN Scheine ab einem Tag — für die offenen Zeit-Nachtragungen.
 *
 * ENG GEFASST, UND ZWAR AUS GEWICHT. Ein unterschriebener Schein trägt zwei
 * Unterschriftsbilder als PNG im Dokument; nachgemessen sind das rund 70 KB
 * je Schein. Die Liste aller Betriebsscheine zu holen, um die eigenen
 * herauszufiltern, wären auf dem Telefon eines Monteurs schnell mehrere
 * Megabyte — für eine Handvoll Zeilen.
 *
 * Deshalb: nur die eigenen (`erstelltVonUid`), nur ab einem Stichtag, mit
 * Obergrenze. Ein Monteur schreibt höchstens ein oder zwei Scheine am Tag;
 * zwanzig decken zwei Wochen mit Reserve ab.
 *
 * WARUM NUR DIE EIGENEN: Der Nachtrag betrifft die Zeit, die dieser Monteur
 * selbst buchen darf und muss. Die Zeiteinträge seiner Kollegen darf er
 * weder lesen noch schreiben — das verbieten die Rules, weil dort Kranken-
 * und Urlaubstage stehen (Art. 9 DSGVO). Händisch eingetragene Kollegenzeiten
 * sieht deshalb das Büro, nicht er.
 */
export function listOwnWorkSheetsSince(
  companyId: string,
  uid: string,
  abDatum: string,
  max = 20,
) {
  return queryTenant<WorkSheet>(
    COLLECTION,
    companyId,
    where('erstelltVonUid', '==', uid),
    where('datum', '>=', abDatum),
    orderBy('datum', 'desc'),
    limit(max),
  );
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

/**
 * EINEN Schein holen — für das Weiterbearbeiten eines Entwurfs.
 *
 * WAS PASSIERT, WENN ES IHN NICHT GIBT — nachgemessen gegen den Emulator,
 * nicht angenommen (siehe „Durchstich 4"):
 *
 * Der Aufruf WIRFT, er gibt nicht `undefined` zurück. `ownsExisting()` liest
 * `resource.data.companyId`; bei einem Dokument, das es nicht gibt, ist
 * `resource` null und die Regel scheitert. Ein fehlender Schein und ein
 * fremder Schein sehen von außen deshalb GLEICH aus — beide kommen als
 * abgewiesener Zugriff zurück.
 *
 * Genau diese Falle hat bei der Rüstliste schon einmal zugeschlagen. Der
 * Aufrufer muss beide Ausgänge gleich behandeln; eine Meldung „nicht
 * gefunden" behauptete sonst etwas, das die Datenbank so gar nicht gesagt
 * hat.
 *
 * Der `undefined`-Zweig bleibt trotzdem stehen: er ist die richtige Antwort,
 * falls die Regel je gelockert wird, und kostet eine Zeile.
 */
export async function getWorkSheet(id: string): Promise<WithId<WorkSheet> | undefined> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return undefined;
  // Die echte Kennung zuletzt: der Typ traegt selbst ein Feld `id`, und ein
  // im Dokument gespeicherter Altwert duerfte die des Dokuments nicht schlagen.
  return { ...(snap.data() as WorkSheet), id: snap.id };
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

/**
 * Einen Entwurf aufgeben.
 *
 * WARUM GEKENNZEICHNET UND NICHT GELÖSCHT. `allow delete` steht für diese
 * Sammlung auf `false`, und das soll so bleiben: die Regel schützt den
 * unterschriebenen Beleg, und eine Löschbedingung, die „nur Entwürfe" meint
 * und sich um ein Feld vertut, würde genau diesen Schutz aufheben. Der Preis
 * dafür wäre ein spurlos verschwundener Kundenbeleg — dagegen ist eine
 * Zeile mehr in der Datenbank nichts.
 *
 * OHNE GRUNDANGABE, anders als beim Storno. Der Storno widerruft etwas, das
 * der Kunde unterschrieben hat und in Händen hält; da gehört gesagt, warum.
 * Ein Entwurf war nie draußen. Ein Pflichtfeld dafür wäre eine Hürde ohne
 * Adressaten — und würde nur mit „xxx" gefüllt.
 */
export function discardWorkSheetDraft(id: string, vonName: string) {
  return updateDoc(doc(db, COLLECTION, id), {
    status: 'Verworfen',
    verworfenVonName: vonName,
  });
}

/**
 * Einen verworfenen Entwurf zurückholen.
 *
 * Der einzige Rückweg im ganzen Schein. Er muss es geben: „Verwerfen" ist der
 * Knopf für den Fehlgriff, und ein Knopf gegen Fehlgriffe, dessen eigener
 * Fehlgriff das Getippte kostet, hätte den Fehler nur verschoben.
 *
 * Der Name des Verwerfenden bleibt stehen — nicht als Vorwurf, sondern damit
 * ein zweites Verwerfen dieselbe Zeile überschreibt statt eine Historie zu
 * beginnen, für die es hier kein Feld gibt.
 */
export function restoreWorkSheetDraft(id: string) {
  return updateDoc(doc(db, COLLECTION, id), { status: 'Entwurf' });
}

export type { WithId };
