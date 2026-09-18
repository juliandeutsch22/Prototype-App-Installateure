import { where, orderBy, limit, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { belegNummer, PRAEFIX_VORGABE } from '@/lib/praefixe';
import { db } from '@/lib/firebase';
import type { Quote } from '@/types';
import {
  queryTenant,
  createInTenant,
  updateInTenant,
  deleteInTenant,
  type WithId,
} from './core';

/**
 * Angebote.
 *
 * Die Kette beginnt in der App bisher bei der Baustelle — in Wirklichkeit
 * beginnt sie bei Anfrage → Angebot → Auftrag. Die konkrete Folge dieses
 * Lochs: die kalkulierten Stunden, gegen die die Budget-Ampel misst, tippt
 * jemand ein zweites Mal von Hand ins Baustellenformular ab. Die Ampel misst
 * damit gegen eine Zahl, die niemand nachvollziehen kann und der deshalb auch
 * niemand traut.
 *
 * Ein angenommenes Angebot legt die Baustelle an und bringt sein
 * Stundenbudget mit. Erst damit bedeutet die Ampel etwas.
 */

const COLLECTION = 'quotes';

/** Die jüngsten Angebote, mit Obergrenze — eine Arbeitsliste, kein Archiv. */
export function listRecentQuotes(companyId: string, max = 100) {
  return queryTenant<Quote>(COLLECTION, companyId, orderBy('createdAt', 'desc'), limit(max));
}

/** Die Angebote EINES Kunden. */
export function listQuotesForCustomer(companyId: string, customerId: string, max = 100) {
  return queryTenant<Quote>(
    COLLECTION,
    companyId,
    where('customerId', '==', customerId),
    limit(max),
  );
}

export type NewQuote = Omit<Quote, 'id' | 'companyId' | 'createdAt'>;

export function createQuote(companyId: string, q: NewQuote) {
  return createInTenant(COLLECTION, companyId, q);
}

/**
 * Über die gemeinsamen Helfer, nicht an ihnen vorbei.
 *
 * Vorher ging das hier direkt auf `updateDoc`. Damit fehlten zwei Dinge, die
 * `updateInTenant` mitbringt: das Entfernen von `undefined` — Firestore lehnt
 * das hart ab, ein leer gelassenes Optionalfeld hätte das Speichern des
 * ganzen Angebots scheitern lassen — und `updatedAt`. Die Angebote waren die
 * einzige Sammlung, die aus der Reihe tanzte.
 */
export function updateQuote(id: string, data: Partial<NewQuote>) {
  return updateInTenant(COLLECTION, id, data);
}

/** Nur ein Entwurf lässt sich löschen — alles Versendete bleibt nachvollziehbar. */
export function deleteQuote(id: string) {
  return deleteInTenant(COLLECTION, id);
}

/**
 * Angebotsnummer verbindlich ziehen — in einer Transaktion.
 *
 * Dieselbe Überlegung wie bei den Rechnungsnummern: würde die Nummer aus der
 * geladenen Liste abgeleitet (max + 1), bekämen zwei Personen, die gleichzeitig
 * kalkulieren, dieselbe. Bei Rechnungen ist das ein Fall für den
 * Steuerberater; bei Angeboten „nur" ein peinlicher Doppler beim Kunden —
 * vermeidbar ist beides mit demselben Handgriff.
 *
 * Ein eigener Zähler, getrennt von den Rechnungen: Angebote und Rechnungen
 * sind verschiedene Nummernkreise, und ein gemeinsamer Zähler würde beide
 * löchrig machen.
 */
export async function reserveQuoteNumber(companyId: string, praefix?: string): Promise<string> {
  const ref = doc(db, 'counters', `${companyId}_quotes`);
  const jahr = new Date().getFullYear();

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const daten = snap.exists() ? (snap.data() as { lastSeq?: number; year?: number }) : null;
    // Jahreswechsel: der Kreis beginnt neu bei 1.
    const letzte = daten?.year === jahr ? Number(daten.lastSeq ?? 0) : 0;
    const seq = letzte + 1;
    tx.set(ref, { companyId, lastSeq: seq, year: jahr, updatedAt: serverTimestamp() }, { merge: true });
    return belegNummer(praefix ?? PRAEFIX_VORGABE.angebot, jahr, seq);
  });
}

export type { WithId };
