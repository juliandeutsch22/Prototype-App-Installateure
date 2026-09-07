import {
  collection,
  doc,
  orderBy,
  limit,
  where,
  addDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Invoice } from '@/types';
import { queryTenant, subscribeTenant, createInTenant, updateInTenant, type WithId } from './core';
import { decideInvoiceSeq, formatInvoiceNumber } from '@/lib/invoiceNumbers';

// Die reinen Rechenregeln liegen in lib/invoiceNumbers — ohne Firestore und
// damit ohne Emulator prüfbar. Hier durchgereicht, damit die Aufrufer wie
// bisher aus einem Modul importieren.
export {
  nextInvoiceNumber,
  isInvoiceNumberTaken,
  highestInvoiceSeq,
  invoiceSeqOf,
  formatInvoiceNumber,
  decideInvoiceSeq,
} from '@/lib/invoiceNumbers';

const COLLECTION = 'invoices';

/**
 * Nur die UNBEZAHLTEN Rechnungen — fuer die Summen auf der Startseite.
 *
 * Die Startseite zeigt dort „offen" und „ueberfaellig". Bezahlte Rechnungen
 * gehen in keine der beiden Summen ein, wurden aber trotzdem alle geladen:
 * nach zehn Jahren die gesamte Rechnungshistorie des Betriebs, um zwei
 * Zahlen zu bilden. Unbezahlte Rechnungen sind dagegen von Natur aus wenige
 * — wird die Liste lang, hat der Betrieb ein anderes Problem als die
 * Ladezeit.
 */
export function listUnpaidInvoices(companyId: string) {
  return queryTenant<Invoice>(
    COLLECTION,
    companyId,
    where('paymentStatus', 'in', ['Offen', 'Überfällig']),
  );
}

/**
 * Die juengsten Rechnungen, live — mit ausdruecklicher Obergrenze.
 *
 * Die Rechnungsliste ist eine Arbeitsliste, kein Archiv: gearbeitet wird an
 * dem, was zuletzt entstanden ist. Ohne Grenze abonnierte sie jede jemals
 * geschriebene Rechnung. `max` laesst die Ansicht nachladen, wenn jemand
 * weiter zurueck will.
 */
export function subscribeRecentInvoices(
  companyId: string,
  max: number,
  cb: (rows: WithId<Invoice>[]) => void,
  onError: (e: Error) => void,
) {
  return subscribeTenant<Invoice>(
    COLLECTION,
    companyId,
    cb,
    onError,
    orderBy('createdAt', 'desc'),
    limit(max),
  );
}

/**
 * Reserviert eine Rechnungsnummer verbindlich, in einer Transaktion.
 *
 * Vorher wurde die Nummer aus der Liste im Browser abgeleitet (max + 1).
 * Rechneten Buchhaltung und Geschäftsführung im selben Moment ab, bekamen
 * beide dieselbe Nummer — bei fortlaufender Nummerierung kein
 * Schönheitsfehler, sondern ein Fall für den Steuerberater.
 *
 * Der Zähler liegt in `counters/{companyId}_invoices` und ist monoton: er
 * geht nie zurück, auch nicht, wenn jemand von Hand eine höhere Nummer
 * vergibt. `desired` bildet genau diesen Fall ab — ein Betrieb, der seinen
 * bestehenden Nummernkreis fortführt. Eine bereits verbrauchte Nummer lehnt
 * die Transaktion ab, statt sie ein zweites Mal auszugeben. Dieselbe Grenze
 * steht in firestore.rules, damit sie auch am Client vorbei gilt.
 *
 * `seedFrom` ist die höchste Nummer aus den vorhandenen Rechnungen. Sie zählt
 * nur beim allerersten Aufruf, wenn es den Zähler noch nicht gibt: ohne sie
 * würde ein Betrieb mit Altbestand wieder bei 1001 anfangen.
 */
export async function reserveInvoiceNumber(
  companyId: string,
  opts: { seedFrom: number; desired?: number },
): Promise<string> {
  const ref = doc(db, 'counters', `${companyId}_invoices`);
  const year = new Date().getFullYear();

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    // Ohne Zähler zählt der Altbestand; ohne Altbestand ist gar nichts
    // vergeben. Der Sprung auf 1001 passiert nur im zweiten Fall — ein
    // Betrieb, der bei 500 steht, führt seinen Kreis bei 501 fort.
    const last = snap.exists()
      ? Number((snap.data() as { lastSeq?: number }).lastSeq ?? 0)
      : Math.max(opts.seedFrom, 0);

    const seq = decideInvoiceSeq(last, opts.desired, year);

    tx.set(
      ref,
      { companyId, lastSeq: seq, year, updatedAt: serverTimestamp() },
      { merge: true },
    );
    return formatInvoiceNumber(seq, year);
  });
}

/**
 * Hebt einen Storno wieder auf. Ein Fehlstorno war sonst nur durch Löschen
 * und vollständiges Neuerstellen zu heilen — inklusive neuer Nummer.
 */
export async function reactivateInvoice(inv: WithId<Invoice>) {
  await updateInTenant(COLLECTION, inv.id, {
    paymentStatus: 'Offen',
    cancellationNote: null,
    cancelledAt: null,
  });
  await markBilled('timeEntries', inv.linkedEntries ?? [], inv.invoiceNumber);
  await markBilled('materialOrders', inv.linkedOrders ?? [], inv.invoiceNumber);
}

export type NewInvoice = Omit<Invoice, 'id' | 'companyId' | 'createdAt'>;

export function createInvoice(companyId: string, inv: NewInvoice) {
  return createInTenant(COLLECTION, companyId, inv);
}

export function updateInvoiceStatus(id: string, paymentStatus: Invoice['paymentStatus']) {
  return updateDoc(doc(db, COLLECTION, id), { paymentStatus, updatedAt: serverTimestamp() });
}

/** Storniert eine Rechnung und gibt die verknüpften Belege wieder frei. */
export async function cancelInvoice(inv: WithId<Invoice>, note: string) {
  await updateDoc(doc(db, COLLECTION, inv.id), {
    paymentStatus: 'Storniert',
    cancellationNote: note,
    cancelledAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await releaseBilled('timeEntries', inv.linkedEntries ?? []);
  await releaseBilled('materialOrders', inv.linkedOrders ?? []);
}

/*
  `deleteInvoice` IST WEG, und zwar ersatzlos.

  Sie stand hier und wurde aus einem Zeilenmenü ohne Rückfrage aufgerufen. §
  132 BAO verlangt sieben Jahre Aufbewahrung, und die gezogene Nummer
  hinterliesse eine Lücke im Kreis, die der Buchhaltungs-Export danach zu
  Recht meldet. Die Korrektur heisst Storno (`cancelInvoice`): der Beleg
  bleibt stehen, trägt seinen Grund und lässt sich mit `reactivateInvoice`
  wieder aufheben. Die Rules sagen dasselbe — `allow delete: if false`.
*/

/**
 * Eine Mahnung festhalten.
 *
 * GESCHRIEBEN WIRD NACH dem Erzeugen des Belegs, nicht davor. Scheitert das
 * PDF, ist schlimmstenfalls nichts geschehen — umgekehrt stünde die Rechnung
 * als gemahnt da, ohne dass je ein Schreiben entstanden wäre, und die nächste
 * Stufe begänne bei zwei.
 *
 * Der Status geht auf „Überfällig", falls er noch auf „Offen" stand: wer
 * mahnt, hat den Verzug festgestellt.
 */
export function mahnungFesthalten(
  id: string,
  daten: { stufe: number; gemahntAm: string; frist: string; spesen: number },
) {
  return updateDoc(doc(db, COLLECTION, id), {
    mahnstufe: daten.stufe,
    gemahntAm: daten.gemahntAm,
    mahnfrist: daten.frist,
    mahnspesen: daten.spesen,
    paymentStatus: 'Überfällig',
    updatedAt: serverTimestamp(),
  });
}

/** Markiert Belege als verrechnet (isBilled + invoiceNumber). */
export async function markBilled(coll: string, ids: string[], invoiceNumber: string) {
  await Promise.all(
    ids.map((id) => updateDoc(doc(db, coll, id), { isBilled: true, invoiceNumber })),
  );
}

/** Gibt Belege wieder frei (Firestore kann Felder nicht löschen -> ''). */
async function releaseBilled(coll: string, ids: string[]) {
  await Promise.all(
    ids.map((id) => updateDoc(doc(db, coll, id), { isBilled: false, invoiceNumber: '' })),
  );
}

export { collection, addDoc };
