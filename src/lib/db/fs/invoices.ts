import {
  collection,
  doc,
  orderBy,
  limit,
  where,
  addDoc,
  updateDoc,
  runTransaction,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Invoice } from '@/types';
import { queryTenant, subscribeTenant, createInTenant, type WithId } from './core';
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
/*
  ER TRÄGT SEIT DEM 08.09.2026 AUCH DEN MAHNLAUF. Der lief vorher über die
  Rechnungs-Arbeitsliste, und die schneidet nach Anlagedatum ab — damit sah er
  ausgerechnet die Forderungen NICHT, die am längsten offen sind. Die ältesten
  fallen als erste aus einer solchen Liste.

  Eine zweite Abfrage dafür wäre eine zweite Wahrheit über denselben Zustand
  gewesen. Diese hier ist ohne Zeitgrenze und von Natur aus klein: offene
  Forderungen sind der Ausnahmezustand, nicht der Bestand.
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
 * Die Rechnungen EINES ZEITRAUMS — nach Rechnungsdatum.
 *
 * WARUM DAS NICHT AUS DER LISTE KOMMEN DARF. Der Buchhaltungs-Export filterte
 * bisher die geladene Rechnungsliste nach Datum. Die ist aber eine
 * Arbeitsliste mit Obergrenze: voreingestellt die fünfzig jüngsten. Ein
 * Export für einen Monat, der weiter zurückliegt, lieferte damit eine LEERE
 * Datei — und zwar eine, die wie ein erfolgreicher Export aussah, mit „0
 * Rechnungen" und ohne einen einzigen Hinweis.
 *
 * Schlimmer noch war die Lückenprüfung im Nummernkreis: sie meldete Lücken,
 * die keine sind, weil die fehlenden Nummern schlicht nicht geladen waren.
 * Ein Befund, den es nicht gibt, kostet in einer Kanzlei einen halben Tag.
 *
 * Gefiltert wird nach `invoiceDate`, dem RECHNUNGSdatum — nicht nach
 * `createdAt`. Eine im Jänner nachgetragene Dezember-Rechnung gehört ins
 * Dezember-Journal; danach fragt der Steuerberater.
 *
 * KEINE Obergrenze. Der Zeitraum IST die Grenze, und ein Export, der
 * stillschweigend bei tausend Rechnungen aufhört, wäre genau der Fehler, den
 * diese Funktion behebt.
 */
export function listInvoicesInRange(companyId: string, von: string, bis: string) {
  return queryTenant<Invoice>(
    COLLECTION,
    companyId,
    where('invoiceDate', '>=', von),
    where('invoiceDate', '<=', bis),
    orderBy('invoiceDate'),
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
 * Storno und Storno-Aufhebung — in EINEM Schreibvorgang.
 *
 * WARUM DAS EINE KLAMMER BRAUCHT, und es fehlte hier. Beide Wege schrieben
 * erst die Rechnung und danach die Freigabe bzw. Sperre der Belege; die
 * Freigabe selbst war ein `Promise.all` einzelner Schreibvorgänge. Bricht die
 * Verbindung dazwischen ab — im Funkloch der Normalfall —, bleibt ein Zustand
 * stehen, den niemand sieht und den nichts wieder einrenkt:
 *
 *   Storno halb durch   → Rechnung storniert, Stunden weiter `isBilled`.
 *                         Sie stehen auf keiner gültigen Rechnung und lassen
 *                         sich auf keine neue nehmen. Geld, das nie wieder
 *                         eingefordert wird.
 *
 *   Aufhebung halb durch → Rechnung wieder offen, Stunden frei. Sie können
 *                         ein ZWEITES Mal verrechnet werden — dieselbe Stunde
 *                         auf zwei Rechnungen an denselben Kunden.
 *
 * Genau dieser Fall wurde beim Lagerabzug schon einmal geschlossen (siehe
 * `materialOrders`). Hier stand er noch offen, weil die Wege einzeln
 * geschrieben und einzeln geprüft worden waren.
 *
 * WARUM `writeBatch` UND NICHT `runTransaction`: gelesen wird nichts. Die
 * Kennungen der Belege stehen in der Rechnung, der neue Zustand steht fest.
 * Ein Stapel ist dafür das richtige Werkzeug — er geht ganz durch oder gar
 * nicht, und er wird OFFLINE VORGEHALTEN und nachgeschickt, was eine
 * Transaktion nicht tut.
 *
 * DIE GRENZE VON 500 SCHREIBVORGÄNGEN je Stapel gilt und wird hier nicht
 * umgangen: eine Rechnung mit mehr als 499 verknüpften Belegen gäbe es nur
 * bei einer Baustelle mit über 499 Zeiteinträgen und Anforderungen zugleich.
 * Sollte es sie geben, schlägt der Aufruf hörbar fehl, statt still die Hälfte
 * zu schreiben — eine geteilte Klammer wäre keine Klammer mehr.
 */
function belegZustand(
  batch: ReturnType<typeof writeBatch>,
  coll: string,
  ids: string[],
  invoiceNumber: string,
  isBilled: boolean,
) {
  for (const id of ids) {
    // Firestore kann Felder nicht löschen — die leere Nummer ist das Zeichen
    // für „gehört zu keiner Rechnung mehr".
    batch.update(doc(db, coll, id), { isBilled, invoiceNumber });
  }
}

/**
 * Hebt einen Storno wieder auf. Ein Fehlstorno war sonst nur durch Löschen
 * und vollständiges Neuerstellen zu heilen — inklusive neuer Nummer.
 */
export async function reactivateInvoice(inv: WithId<Invoice>) {
  const batch = writeBatch(db);
  batch.update(doc(db, COLLECTION, inv.id), {
    paymentStatus: 'Offen',
    cancellationNote: null,
    cancelledAt: null,
    updatedAt: serverTimestamp(),
  });
  belegZustand(batch, 'timeEntries', inv.linkedEntries ?? [], inv.invoiceNumber, true);
  belegZustand(batch, 'materialOrders', inv.linkedOrders ?? [], inv.invoiceNumber, true);
  await batch.commit();
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
  const batch = writeBatch(db);
  batch.update(doc(db, COLLECTION, inv.id), {
    paymentStatus: 'Storniert',
    cancellationNote: note,
    cancelledAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  belegZustand(batch, 'timeEntries', inv.linkedEntries ?? [], '', false);
  belegZustand(batch, 'materialOrders', inv.linkedOrders ?? [], '', false);
  await batch.commit();
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

/**
 * Markiert Belege als verrechnet — beim ANLEGEN einer Rechnung.
 *
 * ABSICHTLICH KEIN STAPEL, anders als bei Storno und Aufhebung. Die
 * Reihenfolge beim Anlegen ist selbst die Sicherung: Nummer ziehen, Belege
 * sperren, DANN die Rechnung anlegen. Bricht es dazwischen ab, sind Belege
 * gesperrt, zu denen es keine Rechnung gibt — die harmlose Richtung, denn
 * nichts wird dadurch doppelt verrechnet. Umgekehrt wäre es der teure Fall.
 *
 * Ein gemeinsamer Stapel ginge auch, brauchte aber die Kennung der Rechnung,
 * bevor sie existiert. Der Gewinn wäre gering, die Umstellung berührte den
 * einzigen Weg, auf dem Rechnungsnummern entstehen — und dessen Reihenfolge
 * ist gegen den Emulator geprüft.
 */
export async function markBilled(coll: string, ids: string[], invoiceNumber: string) {
  await Promise.all(
    ids.map((id) => updateDoc(doc(db, coll, id), { isBilled: true, invoiceNumber })),
  );
}

export { collection, addDoc };
