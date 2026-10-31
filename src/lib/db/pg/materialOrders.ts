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
import type { Ausgabe } from '@/features/invoices/ausgegebenesMaterial';
import { abfragen, abonnieren, anlegenMitKennung, loeschen, derClient, type WithId } from './kern';
import { objektAlsZeile } from './felder';
import { oderUeberSpalten } from './suche';

import { anlegenOhneEmpfang as fachAnlegen } from './ohneEmpfang';

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

/** Wie viele Treffer die Suche zeigt — wer mehr braucht, sucht genauer. */
export const ANFORDERUNG_TREFFER = 100;

/**
 * Anforderungen suchen — ÜBER ALLE, auf dem Server (17 I). Die Liste hält die
 * jüngsten; im Archiv fehlten die älteren, und die Suche fand sie nicht.
 * Dieselben Felder wie die Suche im Geladenen: Artikel, Person, Baustelle,
 * Notiz.
 */
export function sucheAnforderungen(
  companyId: string,
  begriff: string,
  max = ANFORDERUNG_TREFFER,
): Promise<WithId<MaterialOrder>[]> {
  const oder = oderUeberSpalten(['material_name', 'user_name', 'project_number', 'note'], begriff);
  if (!oder) return Promise.resolve([]);
  return abfragen<MaterialOrder>(ANFORDERUNGEN, companyId, {
    oder,
    sortiere: { feld: 'createdAt', absteigend: true },
    grenze: max,
  });
}

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

/** Dasselbe, mit dem Ausgangsfach dahinter — für die Anforderung von der Baustelle. */
export function createMaterialOrderOhneEmpfang(companyId: string, order: NewMaterialOrder) {
  return fachAnlegen(ANFORDERUNGEN, companyId, order as unknown as Record<string, unknown>);
}

/** Was im Regal liegt und was davon schon jemandem gehört — im Augenblick der Prüfung. */
export interface Regalstand {
  bestand: number;
  zugesagt: number;
  frei: number;
  angefordert: number;
  einheit: string;
}

/**
 * Was ein Statuswechsel bewirkt hat (Runde 7, R7-M3).
 *
 *   geaendert    wie gewünscht.
 *   veraltet     nichts geändert: die Anforderung stand nicht mehr auf dem
 *                Stand, den die Ansicht gesehen hat — jemand anderes war
 *                schneller, oder sie ist weg.
 *   fehlbestand  nichts geändert: „Abholbereit“ von Hand, aber im Regal ist
 *                nicht genug frei (R7-M2). Die Zahlen für die Rückfrage.
 */
export type StatusErgebnis =
  | { art: 'geaendert' }
  | { art: 'veraltet' }
  | ({ art: 'fehlbestand' } & Regalstand);

export interface StatusWie {
  /** Der Stand, den die Ansicht gesehen hat. Ohne ihn wird nicht verglichen. */
  von?: MaterialOrder['status'];
  /** Nur nach der Rückfrage mit den Zahlen: „Abholbereit“ trotz Fehlbestand, mit Protokolleintrag. */
  trotzFehlbestand?: boolean;
}

/**
 * Status ändern — nur, wenn die Anforderung noch auf dem Stand `von` steht.
 *
 * „Erledigt“ geht über `anforderung_abschliessen`: dabei wird der Bestand
 * abgezogen, atomar und idempotent (die Datenbankfunktion sperrt die Zeile,
 * zwei gleichzeitige Abschlüsse ziehen nicht doppelt ab). Alles andere über
 * `anforderung_status_setzen`, die beim Weg auf „Abholbereit“ dieselbe
 * Lagerprüfung macht wie „Aus Lager“.
 *
 * Beide sagen, ob sich etwas geändert hat. Vorher kam von einem Schreiben,
 * das nichts mehr traf, dieselbe Erfolgsmeldung wie von einem, das traf.
 */
export async function updateOrderStatus(
  orderId: string,
  newStatus: MaterialOrder['status'],
  wie: StatusWie = {},
): Promise<StatusErgebnis> {
  if (newStatus === 'Erledigt') {
    const { data, error } = await derClient().rpc('anforderung_abschliessen', {
      p_order: orderId,
      p_status: wie.von ?? null,
    });
    if (error) throw new Error(error.message);
    return Number(data ?? 0) > 0 ? { art: 'geaendert' } : { art: 'veraltet' };
  }
  const { data, error } = await derClient().rpc('anforderung_status_setzen', {
    p_id: orderId,
    p_von: wie.von ?? null,
    p_nach: newStatus,
    p_trotz_fehlbestand: wie.trotzFehlbestand === true,
  });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ergebnis === 'geaendert') return { art: 'geaendert' };
  if (r.ergebnis === 'fehlbestand') {
    return {
      art: 'fehlbestand',
      bestand: Number(r.bestand) || 0,
      zugesagt: Number(r.zugesagt) || 0,
      frei: Number(r.frei) || 0,
      angefordert: Number(r.angefordert) || 0,
      einheit: String(r.einheit ?? 'Stk'),
    };
  }
  return { art: 'veraltet' };
}

/**
 * Nachträglich eilig — oder nicht mehr (17 F). Über eine eigene
 * Datenbankfunktion: der Besteller darf es auch, wenn das Lager die
 * Anforderung schon in Arbeit hat, und dann nur dieses eine Feld.
 */
export async function anforderungEiligSetzen(orderId: string, eilig: boolean) {
  const { error } = await derClient().rpc('anforderung_eilig_setzen', { p_id: orderId, p_eilig: eilig });
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

/**
 * Was das Lager für eine Baustelle ausgegeben hat und noch nicht abgerechnet
 * ist (23.10.2026): abgeholte Anforderungen, eingeladene Rüstlisten,
 * Retouren negativ. Nur für wer Rechnungen schreibt; gerechnet in der
 * Datenbank (`ausgegebenes_material`), weil Anforderungen und Rüstlisten
 * sonst nicht für die Buchhaltung lesbar sind.
 */
export async function ausgegebenesMaterial(projectNumber: string): Promise<Ausgabe[]> {
  type Zeile = {
    art: Ausgabe['art']; beleg_id: string; datum: string; material_id: string | null;
    name: string; einheit: string | null; menge: number;
  };
  const { data, error } = await derClient().rpc('ausgegebenes_material', { p_baustelle: projectNumber });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Zeile[]).map((z) => ({
    art: z.art,
    belegId: z.beleg_id,
    datum: z.datum,
    materialId: z.material_id,
    name: z.name,
    einheit: z.einheit,
    menge: Number(z.menge) || 0,
  }));
}
