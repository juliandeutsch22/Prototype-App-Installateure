/**
 * Materialanforderungen und Retouren — auf Postgres.
 *
 * HIER VEREINFACHT DER UMZUG WIRKLICH. Eine Firestore-Transaktion durfte
 * einzelne Dokumente lesen, aber nicht SUCHEN; die Suche nach dem
 * Katalogeintrag lief deshalb ausserhalb, und die Transaktion musste danach
 * noch einmal prüfen. In Postgres liegt beides in einem Vorgang — siehe
 * `supabase/migrations/…_lager.sql`.
 */
import type { MaterialOrder } from '@/types';
import { abfragen, abonnieren, anlegenMitKennung, loeschen, derClient, type WithId } from './kern';
import { objektAlsZeile } from './felder';

const ANFORDERUNGEN = 'material_orders';

export function subscribeOwnOrders(
  companyId: string,
  uid: string,
  max: number,
  cb: (rows: WithId<MaterialOrder>[]) => void,
  onError: (e: Error) => void,
) {
  return abonnieren<MaterialOrder>(ANFORDERUNGEN, companyId, cb, onError, {
    wo: [{ art: 'gleich', feld: 'userId', wert: uid }],
    sortiere: { feld: 'createdAt', absteigend: true },
    grenze: max,
  });
}

export function subscribeAllOrders(
  companyId: string,
  max: number,
  cb: (rows: WithId<MaterialOrder>[]) => void,
  onError: (e: Error) => void,
) {
  return abonnieren<MaterialOrder>(ANFORDERUNGEN, companyId, cb, onError, {
    sortiere: { feld: 'createdAt', absteigend: true },
    grenze: max,
  });
}

export type NewMaterialOrder = Omit<MaterialOrder, 'id' | 'companyId' | 'createdAt'>;

/**
 * Legt an — mit einer Kennung VOM GERÄT.
 *
 * Deshalb trägt `material_orders.id` in der Datenbank auch keinen
 * Standardwert: eine Anforderung entsteht im Keller, geht ohne Empfang in die
 * Warteschlange und wird später nachgesendet. Nur wenn die Kennung schon
 * feststeht, bevor der Server sie bestätigt, darf derselbe Vorgang zweimal
 * ankommen, ohne zweimal zu landen. Ein Standardwert würde genau das
 * verdecken und aus einem nachgesendeten Vorgang eine zweite Anforderung
 * machen.
 */
export function createMaterialOrder(companyId: string, order: NewMaterialOrder) {
  return anlegenMitKennung(ANFORDERUNGEN, companyId, crypto.randomUUID(), order);
}

/**
 * Status ändern. Beim Übergang auf „Erledigt" wird der Bestand abgezogen —
 * atomar und idempotent.
 *
 * Die Idempotenz hängt am Feld `processed`, und die Datenbankfunktion sperrt
 * die Zeile, bevor sie rechnet: zwei gleichzeitige Abschlüsse ziehen nicht
 * doppelt ab.
 */
export async function updateOrderStatus(orderId: string, newStatus: MaterialOrder['status']) {
  if (newStatus !== 'Erledigt') {
    const { error } = await derClient()
      .from(ANFORDERUNGEN).update({ status: newStatus }).eq('id', orderId);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await derClient().rpc('anforderung_abschliessen', { p_order: orderId });
  if (error) throw new Error(error.message);
}

/**
 * Retoure: Beleg und Gutschrift in EINEM Schritt.
 *
 * Vorher wurde erst der Beleg geschrieben und danach der Bestand
 * gutgeschrieben. Scheiterte der zweite Vorgang, stand der Beleg schon da und
 * der Bestand war nicht erhöht; die Ansicht meldete „konnte nicht erfasst
 * werden", was nicht stimmte. Wer es noch einmal versuchte, legte einen
 * zweiten Beleg an.
 */
export async function createReturn(
  companyId: string,
  ret: Omit<NewMaterialOrder, 'status' | 'transactionType'> & { condition: string },
): Promise<string> {
  // Auch die Retoure bekommt ihre Kennung vom Gerät — siehe oben.
  const beleg = {
    ...objektAlsZeile(ANFORDERUNGEN, ret),
    id: crypto.randomUUID(),
    company_id: companyId,
  };
  const { data, error } = await derClient().rpc('retoure_anlegen', { p_beleg: beleg });
  if (error) throw new Error(error.message);
  return String(data);
}

export function deleteOrder(orderId: string) {
  return loeschen(ANFORDERUNGEN, orderId);
}

const OFFEN = ['Offen', 'In Bearbeitung', 'Abholbereit'];

export function listOpenOrders(companyId: string) {
  return abfragen<MaterialOrder>(ANFORDERUNGEN, companyId, {
    wo: [{ art: 'in', feld: 'status', werte: OFFEN }],
  });
}

export function listOwnOpenOrders(companyId: string, uid: string) {
  return abfragen<MaterialOrder>(ANFORDERUNGEN, companyId, {
    wo: [
      { art: 'gleich', feld: 'userId', wert: uid },
      { art: 'in', feld: 'status', werte: OFFEN },
    ],
  });
}
