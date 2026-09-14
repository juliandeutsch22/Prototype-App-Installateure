/**
 * Kundenstammdaten — auf Postgres.
 *
 * Gleiche Aussenseite wie `fs/customers.ts`, anderes Inneres. Zwei Stellen
 * werden dabei nicht nur übersetzt, sondern richtig gestellt; beide sind unten
 * kommentiert.
 */
import type { Customer, Project } from '@/types';
import { KUNDEN_GRENZE } from '@/lib/listengrenzen';
import { abfragen, anlegen, aendern, loeschen, derClient, type WithId } from './kern';
import { objektAlsZeile, zeileAlsObjekt } from './felder';
import { oderUeberSpalten } from './suche';

const KUNDEN = 'customers';
const BAUSTELLEN = 'projects';

export function listCustomers(companyId: string, max = KUNDEN_GRENZE) {
  return abfragen<Customer>(KUNDEN, companyId, {
    sortiere: { feld: 'name' },
    grenze: max,
  });
}

/**
 * Bestimmte Kunden, nach Id.
 *
 * Die Blockbildung von Firestore (höchstens 30 Werte je `in`-Abfrage) steht
 * hier nicht mehr — sie ist nach `kern.ts` gewandert. Postgres kennt die
 * Grenze wirklich nicht; PostgREST trägt die Werteliste aber in der ADRESSE,
 * und die ist ab rund 8000 Zeichen zu lang. `abfragen` stückelt deshalb
 * selbst, nach Länge statt nach Anzahl.
 */
export async function listCustomersByIds(companyId: string, ids: string[]) {
  const eindeutig = [...new Set(ids.filter(Boolean))];
  if (eindeutig.length === 0) return [];
  return abfragen<Customer>(KUNDEN, companyId, {
    wo: [{ art: 'in', feld: 'id', werte: eindeutig }],
  });
}

export function listProjectsForCustomer(companyId: string, customerId: string, max = 300) {
  return abfragen<Project>(BAUSTELLEN, companyId, {
    wo: [{ art: 'gleich', feld: 'customerId', wert: customerId }],
    grenze: max,
  });
}

/**
 * Baustellen mit diesem Kundennamen, die auf keinen Kunden zeigen.
 *
 * HIER WIRD EIN ALTER FEHLER MITERLEDIGT. In Firestore liess sich nicht auf
 * ein FEHLENDES Feld abfragen, also holte diese Funktion `max` Baustellen mit
 * passendem Namen und warf danach im Browser alle weg, die schon zugeordnet
 * waren. Ergebnis: sind die ersten fünfzig Treffer bereits zugeordnet, meldete
 * die Kundenakte „keine offenen Baustellen", obwohl weiter hinten welche
 * lagen.
 *
 * Postgres kann `customer_id is null` — die Grenze greift damit auf dem
 * richtigen Ergebnis statt davor.
 */
export async function listUnlinkedProjectsByName(
  companyId: string,
  customerName: string,
  max = 50,
) {
  const name = customerName.trim();
  if (!name) return [];
  const c = derClient();
  const { data, error } = await c
    .from(BAUSTELLEN)
    .select('*')
    .eq('company_id', companyId)
    .eq('customer_name', name)
    .is('customer_id', null)
    .limit(max);
  if (error) throw new Error(error.message);
  return (data ?? []).map((z) => zeileAlsObjekt<WithId<Project>>(BAUSTELLEN, z));
}

export type NewCustomer = Omit<Customer, 'id' | 'companyId' | 'createdAt'>;

export function createCustomer(companyId: string, c: NewCustomer) {
  return anlegen(KUNDEN, companyId, c);
}

/**
 * Kunde ändern — und den Namen bei den verknüpften Baustellen nachziehen.
 *
 * Der Batch von Firestore wird hier eine Datenbankfunktion: Postgres kennt
 * echte Transaktionen, und über die REST-Schnittstelle ist eine Funktion der
 * einzige Weg, zwei Tabellen in EINER Transaktion zu treffen. Bricht die
 * Verbindung mittendrin ab, ist entweder beides geschehen oder nichts — wie
 * bisher.
 */
export async function updateCustomer(
  companyId: string,
  id: string,
  data: Partial<NewCustomer>,
) {
  /*
   * `companyId` bleibt in der Signatur und wird hier nicht mehr gebraucht.
   *
   * Firestore musste den Mandanten mitgeben, weil die Abfrage ihn selbst
   * einschränkte. In Postgres kommt er aus dem Token, und der Zeilenschutz
   * setzt ihn durch — mitgeschickt wäre er bestenfalls überflüssig und
   * schlimmstenfalls eine zweite Wahrheit. Die Signatur bleibt trotzdem: an
   * ihr hängen die Ansichten (siehe datenschichtVertrag).
   */
  void companyId;

  if (data.name === undefined) {
    await aendern(KUNDEN, id, data);
    return 0;
  }
  const c = derClient();
  const { data: anzahl, error } = await c.rpc('kunde_umbenennen', {
    p_kunde: id,
    p_name: data.name,
    p_rest: objektAlsZeile(KUNDEN, { ...data, name: undefined }),
  });
  if (error) throw new Error(error.message);
  return Number(anzahl ?? 0);
}

/**
 * Kunde löschen — nur ohne Baustellen.
 *
 * Die Prüfung bleibt im Code und wandert nicht in einen Fremdschlüssel: die
 * Meldung nennt die ANZAHL der Baustellen, und das ist der Satz, den der
 * Benutzer braucht. Ein `on delete restrict` sagte nur „geht nicht".
 */
export async function deleteCustomer(companyId: string, id: string) {
  const betroffen = await listProjectsForCustomer(companyId, id);
  if (betroffen.length > 0) {
    throw new Error(
      `Der Kunde hat noch ${betroffen.length} ${betroffen.length === 1 ? 'Baustelle' : 'Baustellen'}.`,
    );
  }
  await loeschen(KUNDEN, id);
}

export function assignProjectToCustomer(
  projectId: string,
  customerId: string,
  customerName: string,
) {
  return aendern(BAUSTELLEN, projectId, { customerId, customerName });
}

export type { WithId };

/**
 * Kunden suchen — SERVERSEITIG, mit Treffern in der Wortmitte.
 *
 * DIE NARBE, DIE HIER FÄLLT. Unter Firestore gab es keine Volltextsuche: die
 * Ansicht lud die ersten paar hundert Kunden und filterte sie im Browser.
 * Wer den 301. suchte, fand ihn nicht — und bekam keine Auskunft darüber,
 * sondern eine leere Liste. Deshalb stand über der Liste ein Nachladeknopf,
 * den niemand verstand.
 *
 * Postgres sucht über den ganzen Bestand und findet auch mitten im Wort.
 * `ilike` und nicht `like`: wer „huber" tippt, meint „Huber".
 */
export function searchCustomers(
  companyId: string, begriff: string, max = KUNDEN_GRENZE,
): Promise<WithId<Customer>[]> {
  return abfragen<Customer>(KUNDEN, companyId, {
    oder: oderUeberSpalten(
      ['name', 'address', 'contact_name', 'contact_phone', 'email'], begriff,
    ),
    sortiere: { feld: 'name' },
    grenze: max,
  });
}
