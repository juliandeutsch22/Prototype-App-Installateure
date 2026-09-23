/**
 * Lager und Einkauf — was aus dem Regal kommt und was beim Grosshändler
 * bestellt wird.
 *
 * Die Anforderung des Monteurs bleibt dabei EINE Zeile mit ihrem Status; hier
 * kommt nur hinzu, woher das Material kommt. „Abholbereit" bleibt der
 * Moment, in dem der Monteur seine Meldung bekommt.
 */
import type { Material } from '@/types';
import { todayStr } from '@/lib/time';
import { abfragen, anlegen, aendern, derClient, type WithId } from './kern';

const ANFORDERUNGEN = 'material_orders';

/** Ein Grosshändler, so weit die Einkaufsliste ihn braucht. */
export interface Grosshaendler {
  companyId: string;
  name: string;
  customerNumber?: string | null;
  contactLine?: string | null;
  /** Wohin Bestellungen gehen — meist der Vertreter. */
  bestellEmail?: string | null;
  active: boolean;
}

/** Wie viele Grosshändler ein Betrieb führt — eine Handvoll, nicht tausend. */
const GROSSHAENDLER_GRENZE = 200;

export function listGrosshaendler(companyId: string): Promise<WithId<Grosshaendler>[]> {
  return abfragen<Grosshaendler>('suppliers', companyId, {
    sortiere: { feld: 'name' },
    grenze: GROSSHAENDLER_GRENZE,
  });
}

export type GrosshaendlerDaten = Pick<Grosshaendler, 'name' | 'customerNumber' | 'contactLine' | 'bestellEmail'>;

export async function grosshaendlerSpeichern(
  companyId: string,
  id: string | null,
  daten: GrosshaendlerDaten,
): Promise<string> {
  // Leere Felder als NULL: „keine Kundennummer" ist nicht die Kundennummer „".
  const sauber: Record<string, unknown> = {
    name: daten.name.trim(),
    customerNumber: daten.customerNumber?.trim() || null,
    contactLine: daten.contactLine?.trim() || null,
    bestellEmail: daten.bestellEmail?.trim() || null,
  };
  if (id) {
    await aendern('suppliers', id, sauber);
    return id;
  }
  return anlegen('suppliers', companyId, { ...sauber, active: true });
}

/**
 * Mehrere Anforderungen auf einmal ändern.
 *
 * `nurUnbestellt`: nur Zeilen, die noch nicht bestellt sind. Die Bedingung
 * steht in der Abfrage selbst, nicht davor in der Ansicht — zwei Personen am
 * selben Stand sähen sonst beide „noch nicht bestellt".
 */
async function schreiben(
  ids: string[],
  werte: Record<string, unknown>,
  nurUnbestellt = false,
): Promise<void> {
  if (ids.length === 0) return;
  const q = derClient().from(ANFORDERUNGEN).update(werte).in('id', ids);
  const { error } = await (nurUnbestellt ? q.is('bestellt_am', null) : q);
  if (error) throw new Error(error.message);
}

/**
 * Liegt im Regal: gleich abholbereit.
 *
 * Der Statuswechsel ist es, der dem Monteur die Meldung schickt — dieselbe
 * wie bisher, wenn jemand „Abholbereit" wählte.
 */
export function ausLager(orderId: string): Promise<void> {
  return schreiben([orderId], { beschaffung: 'lager', status: 'Abholbereit' });
}

/** Nicht im Lager: auf die Einkaufsliste, beim gewählten Grosshändler. */
export function aufEinkaufsliste(orderId: string, supplierId: string | null): Promise<void> {
  return schreiben([orderId], {
    beschaffung: 'einkauf',
    supplier_id: supplierId,
    status: 'In Bearbeitung',
  });
}

/**
 * Zurück von der Liste — nur solange nicht bestellt.
 *
 * Was schon beim Grosshändler liegt, kommt; es wieder zu „Offen" zu machen,
 * hiesse, eine Lieferung zu erwarten, von der die App nichts mehr weiss.
 */
export function vonEinkaufslisteNehmen(orderId: string): Promise<void> {
  return schreiben([orderId], { beschaffung: null, supplier_id: null, status: 'Offen' }, true);
}

/** Einen Grosshändler zuordnen — für Zeilen, die noch keinen haben. */
export function grosshaendlerZuordnen(orderIds: string[], supplierId: string): Promise<void> {
  return schreiben(orderIds, { supplier_id: supplierId });
}

/** Die Liste ist hinaus: diese Zeilen sind bestellt. */
export function alsBestelltMarkieren(orderIds: string[]): Promise<void> {
  return schreiben(orderIds, { bestellt_am: new Date().toISOString() }, true);
}

/**
 * Die Ware ist da: Bestand hinein, Anforderung abholbereit.
 *
 * Als EIN Aufruf (`einkauf_geliefert`): zweimal gedrückt bucht nicht zweimal
 * ein, und Bestand und Status laufen nie auseinander.
 */
export async function geliefert(orderIds: string[]): Promise<number> {
  if (orderIds.length === 0) return 0;
  const { data, error } = await derClient().rpc('einkauf_geliefert', { p_ids: orderIds });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/** Artikelnummer und Einheit der Artikel auf der Liste. */
export async function katalogFuer(
  companyId: string,
  materialIds: string[],
): Promise<Map<string, Pick<Material, 'articleNumber' | 'unit'>>> {
  const ids = [...new Set(materialIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const zeilen = await abfragen<Material>('materials', companyId, {
    wo: [{ art: 'in', feld: 'id', werte: ids }],
    grenze: ids.length,
  });
  return new Map(zeilen.map((m) => [m.id, { articleNumber: m.articleNumber, unit: m.unit }]));
}

/**
 * Bei wem ein Artikel zuletzt einen Preis hatte — als VORSCHLAG für den
 * Grosshändler, wenn er auf die Einkaufsliste kommt.
 *
 * Der jüngste gültige Preis gewinnt: der Katalog, der zuletzt eingespielt
 * wurde, ist der, bei dem der Betrieb gerade einkauft. Gewählt wird trotzdem
 * vom Menschen — ein Vorschlag, keine Vorgabe.
 */
export async function lieferantVorschlag(
  companyId: string,
  materialId: string,
): Promise<string | null> {
  if (!materialId) return null;
  // Der Tag in Wien, nicht in UTC — kurz nach Mitternacht wäre es sonst gestern.
  const heute = todayStr();
  const preise = await abfragen<{ supplierId: string; gueltigAb: string }>('material_prices', companyId, {
    wo: [
      { art: 'gleich', feld: 'materialId', wert: materialId },
      { art: 'bis', feld: 'gueltigAb', wert: heute },
    ],
    sortiere: { feld: 'gueltigAb', absteigend: true },
    grenze: 1,
  });
  return preise[0]?.supplierId ?? null;
}
