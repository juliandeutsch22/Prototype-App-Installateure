import {
  doc,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { EinsatzMaterial, RuestPosition } from '@/types';
import { queryTenant, subscribeTenant, type WithId } from './core';

/**
 * Die Rüstliste eines Einsatzes: was der Monteur an diesem Tag auf diese
 * Baustelle mitnehmen soll.
 *
 * Warum sie ein eigenes Dokument je Paar aus Tag und Baustelle ist und nicht
 * ein Feld am Einsatz, steht am Typ `EinsatzMaterial` in `types/index.ts`.
 * Kurz: `assignments` trägt eine Zeile je Mitarbeiter, die Kiste steht aber
 * nur einmal im Bus.
 */

const COLLECTION = 'einsatzMaterial';

/**
 * Die Kennung des Dokuments — berechenbar, damit die Startseite je Einsatz
 * genau ein Dokument liest statt eine Abfrage abzusetzen.
 *
 * Die Baustellennummer wird von Hand vergeben und darf alles enthalten, auch
 * einen Schrägstrich — der wäre in einer Firestore-Kennung ein Pfadtrenner
 * und würde das Schreiben zum Scheitern bringen. `encodeURIComponent` ist
 * eindeutig umkehrbar, zwei verschiedene Nummern können sich also nicht auf
 * dieselbe Kennung abbilden.
 *
 * SICHERHEIT HÄNGT NICHT AN DIESER KENNUNG. Wer welches Dokument sehen darf,
 * entscheidet wie überall das Feld `companyId` in den Regeln. Die Kennung ist
 * eine Abkürzung beim Lesen, keine Grenze.
 */
export function einsatzMaterialId(
  companyId: string,
  date: string,
  projectNumber: string,
): string {
  return `${companyId}_${date}_${encodeURIComponent(projectNumber)}`;
}

/**
 * Alle Rüstlisten EINES TAGES.
 *
 * WARUM EINE ABFRAGE UND NICHT EIN ZUGRIFF ÜBER DIE KENNUNG, obwohl die
 * berechenbar ist: ein Zugriff auf ein Dokument, das es nicht gibt, scheitert
 * an den Regeln. `ownsExisting()` liest `resource.data.companyId`, und
 * `resource` ist bei einem fehlenden Dokument null — der Aufruf bekommt eine
 * Rechteverweigerung, die von einer echten nicht zu unterscheiden ist. „Für
 * diesen Einsatz ist nichts geplant" ist aber der Normalfall.
 *
 * Die Regel dafür aufzuweichen wäre der falsche Weg: wer die Kennung raten
 * kann — sie besteht aus Firma, Tag und Baustellennummer —, erführe damit,
 * ob es ein Dokument gibt. Eine Abfrage liefert nur, was existiert UND der
 * eigenen Firma gehört; die strenge Regel bleibt stehen.
 *
 * Ein Tag hat eine Handvoll Baustellen. Die Abfrage ist damit kleiner als
 * die Einteilung, die dieselbe Ansicht ohnehin lädt.
 */
export function listEinsatzMaterialForDate(companyId: string, date: string) {
  return queryTenant<EinsatzMaterial>(COLLECTION, companyId, where('date', '==', date));
}

/** Dasselbe, live — für die Planung, die auch die Einteilung live hält. */
export function subscribeEinsatzMaterialForDate(
  companyId: string,
  date: string,
  cb: (rows: WithId<EinsatzMaterial>[]) => void,
  onError: (e: Error) => void,
): () => void {
  return subscribeTenant<EinsatzMaterial>(
    COLLECTION,
    companyId,
    cb,
    onError,
    where('date', '==', date),
  );
}

/** Die Rüstliste eines einzelnen Einsatzes — oder null, wenn keine geplant ist. */
export async function getEinsatzMaterial(
  companyId: string,
  date: string,
  projectNumber: string,
): Promise<WithId<EinsatzMaterial> | null> {
  const tag = await listEinsatzMaterialForDate(companyId, date);
  return tag.find((r) => r.projectNumber === projectNumber) ?? null;
}

/**
 * Die Liste speichern (Planung).
 *
 * ZWEI WEGE, WEIL ZWEI FÄLLE. Gibt es das Dokument noch nicht, wird es
 * angelegt. Gibt es es schon, wird gezielt geändert — und die Haken zu
 * Positionen, die der Planer gerade entfernt hat, werden EINZELN gelöscht.
 *
 * Warum nicht einfach die ganze Karte `geladen` neu schreiben: Firestore
 * verschmilzt bei `merge` verschachtelte Karten, statt sie zu ersetzen — ein
 * Aufräumen wäre wirkungslos geblieben. Und selbst mit vollem Überschreiben
 * wäre es falsch: hätte in der Zwischenzeit jemand etwas eingeladen, würfe
 * das Speichern der Planung seinen Haken weg.
 *
 * Eine Liste ohne Positionen wird GELÖSCHT, nicht leer gespeichert. Sonst
 * bliebe für jeden je geplanten Einsatz ein leeres Dokument liegen, und die
 * Startseite müsste zwischen „keine Liste" und „leere Liste" unterscheiden,
 * ohne dass der Unterschied jemandem etwas sagt.
 */
export async function saveEinsatzMaterial(
  companyId: string,
  date: string,
  projectNumber: string,
  positionen: RuestPosition[],
  uids: string[],
  updatedBy: string,
): Promise<void> {
  /*
    Nachsehen per ABFRAGE, nicht ueber die Kennung: ein Zugriff auf ein
    Dokument, das es noch nicht gibt, scheitert an den Regeln (siehe
    `listEinsatzMaterialForDate`). Und genau dieser Fall ist hier der
    haeufigste — die erste Ruestliste eines Einsatzes.
  */
  const vorher = await getEinsatzMaterial(companyId, date, projectNumber);
  const ref = doc(db, COLLECTION, vorher?.id ?? einsatzMaterialId(companyId, date, projectNumber));

  if (positionen.length === 0) {
    if (vorher) await deleteDoc(ref);
    return;
  }

  if (!vorher) {
    await setDoc(ref, {
      companyId,
      date,
      projectNumber,
      uids,
      positionen,
      geladen: {},
      updatedAt: serverTimestamp(),
      updatedBy,
    });
    return;
  }

  const bleibt = new Set(positionen.map((p) => p.id));
  const aenderung: Record<string, unknown> = {
    positionen,
    uids,
    updatedAt: serverTimestamp(),
    updatedBy,
  };
  for (const id of Object.keys(vorher.geladen ?? {})) {
    if (!bleibt.has(id)) aenderung[`geladen.${id}`] = deleteField();
  }
  await updateDoc(ref, aenderung);
}

/**
 * Eine Position ab- oder wieder aufhaken — das darf der Monteur.
 *
 * Geschrieben wird AUSSCHLIESSLICH unter `geladen`, mit einem Punktpfad.
 * Das ist kein Stilfrage: die Sicherheitsregel lässt dem eingeteilten
 * Monteur genau diese eine Feldgruppe und sonst nichts. Ein Schreiben, das
 * `positionen` mitschickte — auch unverändert —, würde abgelehnt.
 *
 * Die Zeit kommt vom Gerät. Ein Serverzeitstempel ist in einer
 * verschachtelten Karte nicht zu haben, und die Zeit ist hier eine Anzeige
 * („eingeladen von Max, 06:12"), keine Grundlage für eine Entscheidung.
 */
export async function ladenUmschalten(
  companyId: string,
  date: string,
  projectNumber: string,
  positionId: string,
  an: boolean,
  vonName: string,
): Promise<void> {
  const ref = doc(db, COLLECTION, einsatzMaterialId(companyId, date, projectNumber));
  await updateDoc(ref, {
    [`geladen.${positionId}`]: an ? { von: vonName, am: Date.now() } : deleteField(),
    updatedAt: serverTimestamp(),
  });
}

export type { WithId };
