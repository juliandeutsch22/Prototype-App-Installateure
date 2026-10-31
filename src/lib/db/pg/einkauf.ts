/**
 * Lager und Einkauf — was aus dem Regal kommt und was beim Grosshändler
 * bestellt wird.
 *
 * Die Anforderung des Monteurs bleibt dabei EINE Zeile mit ihrem Status; hier
 * kommt nur hinzu, woher das Material kommt. „Abholbereit" bleibt der
 * Moment, in dem der Monteur seine Meldung bekommt.
 */
import type { EinkaufPosten, Material, MaterialOrder } from '@/types';
import { abfragen, anlegen, aendern, derClient, type WithId } from './kern';
import { oderUeberSpalten } from './suche';

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
 * Der Stand, auf dem eine Zeile noch stehen muss, damit eine Aktion sie
 * ändert (Runde 7, R7-M3). Die Bedingung steht in der Abfrage selbst, nicht
 * davor in der Ansicht — zwei Personen am selben Stand sähen sonst beide
 * „noch nicht bestellt“, und der veraltete Tab überschriebe den neuen.
 */
interface Erwartet {
  /** Noch nicht beim Großhändler bestellt. */
  nurUnbestellt?: boolean;
  /** `null`: noch nicht entschieden, ob Lager oder Einkauf. */
  beschaffung?: 'lager' | 'einkauf' | null;
  status?: MaterialOrder['status'];
  /** Noch keinem Großhändler zugeordnet. */
  ohneGrosshaendler?: boolean;
}

/**
 * Mehrere Anforderungen auf einmal ändern — nur die, die noch auf dem
 * erwarteten Stand stehen. Zurück kommen die Kennungen der geänderten
 * Zeilen: weniger als gewünscht heißt, jemand anderes war schneller.
 */
async function schreiben(
  ids: string[],
  werte: Record<string, unknown>,
  erwartet: Erwartet = {},
): Promise<string[]> {
  if (ids.length === 0) return [];
  let q = derClient().from(ANFORDERUNGEN).update(werte).in('id', ids);
  if (erwartet.nurUnbestellt) q = q.is('bestellt_am', null);
  if (erwartet.beschaffung === null) q = q.is('beschaffung', null);
  else if (erwartet.beschaffung) q = q.eq('beschaffung', erwartet.beschaffung);
  if (erwartet.status) q = q.eq('status', erwartet.status);
  if (erwartet.ohneGrosshaendler) q = q.is('supplier_id', null);
  const { data, error } = await q.select('id');
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string }[]).map((z) => String(z.id));
}

/**
 * Liegt im Regal: gleich abholbereit.
 *
 * Der Statuswechsel ist es, der dem Monteur die Meldung schickt — dieselbe
 * wie bisher, wenn jemand „Abholbereit" wählte. Nur solange noch nicht
 * entschieden ist, woher das Material kommt (und, wenn genannt, auf dem
 * Stand `status`). `false`: inzwischen hat jemand anderes entschieden.
 */
export async function ausLager(orderId: string, status?: MaterialOrder['status']): Promise<boolean> {
  const geaendert = await schreiben(
    [orderId],
    { beschaffung: 'lager', status: 'Abholbereit' },
    { beschaffung: null, status },
  );
  return geaendert.length > 0;
}

/** Nicht im Lager: auf die Einkaufsliste, beim gewählten Grosshändler — dieselbe Bedingung wie „Aus Lager“. */
export async function aufEinkaufsliste(
  orderId: string,
  supplierId: string | null,
  status?: MaterialOrder['status'],
): Promise<boolean> {
  const geaendert = await schreiben(
    [orderId],
    { beschaffung: 'einkauf', supplier_id: supplierId, status: 'In Bearbeitung' },
    { beschaffung: null, status },
  );
  return geaendert.length > 0;
}

/**
 * Zurück von der Liste — nur solange nicht bestellt.
 *
 * Was schon beim Grosshändler liegt, kommt; es wieder zu „Offen" zu machen,
 * hiesse, eine Lieferung zu erwarten, von der die App nichts mehr weiss.
 */
export async function vonEinkaufslisteNehmen(orderId: string): Promise<boolean> {
  const geaendert = await schreiben(
    [orderId],
    { beschaffung: null, supplier_id: null, status: 'Offen' },
    { nurUnbestellt: true, beschaffung: 'einkauf' },
  );
  return geaendert.length > 0;
}

/** Einen Grosshändler zuordnen — für Zeilen, die noch keinen haben. Zurück: wie viele. */
export async function grosshaendlerZuordnen(orderIds: string[], supplierId: string): Promise<number> {
  return (await schreiben(orderIds, { supplier_id: supplierId }, { ohneGrosshaendler: true })).length;
}

/**
 * Die Liste ist hinaus: diese Zeilen sind bestellt. Zurück kommen die
 * Kennungen, die DIESER Aufruf bestellt hat — nur an ihnen darf danach der
 * Liefertermin stehen, nicht an denen, die jemand anderes bestellt hat.
 */
export function alsBestelltMarkieren(orderIds: string[]): Promise<string[]> {
  return schreiben(
    orderIds,
    { bestellt_am: new Date().toISOString() },
    { nurUnbestellt: true, beschaffung: 'einkauf' },
  );
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
 *
 * Über `lieferant_vorschlag`, nicht über die Preisliste selbst: die liest nur,
 * wer Einkaufspreise sehen darf (Testbericht Runde 6, 8.4). Die Einkaufsliste
 * führt auch die Verwaltung ohne diese Freigabe — sie bekommt den
 * Großhändler, keinen Preis. Der Tag ist der in Wien, wie bisher.
 */
export async function lieferantVorschlag(
  _companyId: string,
  materialId: string,
): Promise<string | null> {
  if (!materialId) return null;
  const { data, error } = await derClient().rpc('lieferant_vorschlag', { p_material: materialId });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

// ---------------------------------------------------------------------------
// Eigene Posten — Material, das das Büro selbst auf die Liste setzt
// ---------------------------------------------------------------------------

const POSTEN = 'einkauf_posten';

/**
 * Wie viele offene eigene Posten ein Betrieb hat — eine Einkaufsliste, kein
 * Archiv. Gelieferte fallen heraus, und mehr als ein paar Dutzend offene
 * sind schon viel.
 */
const POSTEN_GRENZE = 500;

/** Die offenen eigenen Posten — was noch nicht geliefert ist. */
export function listLagerPosten(companyId: string): Promise<WithId<EinkaufPosten>[]> {
  return abfragen<EinkaufPosten>(POSTEN, companyId, {
    wo: [{ art: 'leer', feld: 'geliefertAm' }],
    sortiere: { feld: 'createdAt' },
    grenze: POSTEN_GRENZE,
  });
}

export type NeuerLagerPosten = Pick<
  EinkaufPosten,
  'materialId' | 'materialName' | 'menge' | 'einheit' | 'supplierId' | 'notiz'
> & { angelegtVonUid: string; angelegtVonName: string };

export function lagerPostenAnlegen(companyId: string, p: NeuerLagerPosten): Promise<string> {
  return anlegen(POSTEN, companyId, {
    materialId: p.materialId || null,
    materialName: p.materialName.trim(),
    menge: p.menge,
    einheit: p.einheit?.trim() || null,
    supplierId: p.supplierId || null,
    notiz: p.notiz?.trim() || null,
    angelegtVonUid: p.angelegtVonUid,
    angelegtVonName: p.angelegtVonName,
  });
}

/**
 * Posten ändern — wie bei den Anforderungen nur auf dem erwarteten Stand,
 * damit zwei Personen am selben Stand nicht beide „noch nicht bestellt"
 * sehen. Zurück: die Kennungen der geänderten Posten.
 */
async function postenSchreiben(
  ids: string[],
  werte: Record<string, unknown>,
  erwartet: Pick<Erwartet, 'nurUnbestellt' | 'ohneGrosshaendler'> = {},
): Promise<string[]> {
  if (ids.length === 0) return [];
  let q = derClient().from(POSTEN).update(werte).in('id', ids);
  if (erwartet.nurUnbestellt) q = q.is('bestellt_am', null);
  if (erwartet.ohneGrosshaendler) q = q.is('supplier_id', null);
  const { data, error } = await q.select('id');
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string }[]).map((z) => String(z.id));
}

/**
 * Von der Liste nehmen — nur, solange nicht bestellt. Zurück: wie viele.
 *
 * Was schon beim Grosshändler liegt, kommt; den Posten zu löschen hiesse,
 * eine Lieferung zu erwarten, von der die App nichts mehr weiss.
 */
export async function lagerPostenLoeschen(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { data, error } = await derClient().from(POSTEN).delete().in('id', ids).is('bestellt_am', null).select('id');
  if (error) throw new Error(error.message);
  return (data ?? []).length;
}

export async function lagerPostenZuordnen(ids: string[], supplierId: string): Promise<number> {
  return (await postenSchreiben(ids, { supplier_id: supplierId }, { ohneGrosshaendler: true })).length;
}

/** Bestellt — zurück die Kennungen, die DIESER Aufruf bestellt hat. */
export function lagerPostenBestellt(ids: string[]): Promise<string[]> {
  return postenSchreiben(ids, { bestellt_am: new Date().toISOString() }, { nurUnbestellt: true });
}

/**
 * Der erwartete Liefertermin (Nachtest 01.10.2026, Paket B) — für
 * Anforderungen und eigene Posten zugleich. `null` nimmt ihn zurück.
 *
 * Nur an BESTELLTEN Zeilen: die Datenbank weist einen Termin an einer noch
 * nicht bestellten Zeile ab (`…_liefertermin_bestellt`); die Bedingung steht
 * deshalb auch in der Abfrage, damit eine inzwischen zurückgenommene Zeile
 * nicht den ganzen Aufruf scheitern lässt.
 */
export async function lieferterminSetzen(
  anforderungen: string[],
  posten: string[],
  datum: string | null,
): Promise<void> {
  const wert = { liefertermin: datum || null };
  if (anforderungen.length > 0) {
    const { error } = await derClient().from(ANFORDERUNGEN).update(wert)
      .in('id', anforderungen).not('bestellt_am', 'is', null);
    if (error) throw new Error(error.message);
  }
  if (posten.length > 0) {
    const { error } = await derClient().from(POSTEN).update(wert)
      .in('id', posten).not('bestellt_am', 'is', null);
    if (error) throw new Error(error.message);
  }
}

/** Wie viele Artikel die Suche zeigt — genug zum Wählen, nicht der Katalog. */
const ARTIKEL_TREFFER = 20;

/**
 * Artikel im Katalog suchen — auf dem Server, nach Name und Artikelnummer.
 *
 * Nicht über das Katalog-Abo der Anforderungen: nach einem Datanorm-Import
 * liegen dort zehntausende Artikel, und die Einkaufsliste braucht zwanzig
 * passende, nicht alle. Ausgelaufene bleiben draussen — der Grosshändler
 * führt sie nicht mehr.
 */
export async function artikelSuchen(
  companyId: string,
  begriff: string,
): Promise<WithId<Material>[]> {
  const oder = oderUeberSpalten(['name', 'article_number'], begriff);
  if (!oder) return [];
  return abfragen<Material>('materials', companyId, {
    wo: [{ art: 'gleich', feld: 'ausgelaufen', wert: false }],
    oder,
    sortiere: { feld: 'name' },
    grenze: ARTIKEL_TREFFER,
  });
}
