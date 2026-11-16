/**
 * Kundenstammdaten — auf Postgres.
 *
 * Zwei Stellen wurden beim Umzug von Firestore nicht nur übersetzt, sondern
 * richtig gestellt; beide sind unten kommentiert.
 */
import type { Customer, Project, UidPruefung } from '@/types';
import { KUNDEN_GRENZE } from '@/lib/listengrenzen';
import { abfragen, anlegen, aendern, loeschen, derClient, zaehlen, type Bedingung, type WithId } from './kern';
import { objektAlsZeile, zeileAlsObjekt } from './felder';
import { ohneJoker } from './suche';

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

/** So viele Namen je Anfrage — `suche_customers` nimmt höchstens 200 Muster. */
const NAMEN_JE_ANFRAGE = 100;

/**
 * DIE KUNDEN ZU GENANNTEN NAMEN (Ladezeit, 19.10.2026) — für Rechnungen und
 * Baustellen aus der Zeit vor der Verknüpfung, die ihren Kunden nur beim
 * Namen kennen.
 *
 * Bis hierher holten die Rechnungen und die Sicherung dafür die ersten 500
 * Kunden und suchten darin: was dahinter lag, fand die UID für den Export
 * nicht und galt beim Mahnen als Verbraucher. Jetzt kommen genau die Kunden,
 * deren Namen passen — wie bei den Katalogartikeln (`katalogNachNamen`):
 * ohne Rücksicht auf Gross- und Kleinschreibung, Leerräume als beliebige
 * Zeichen. Genau verglichen wird danach in der Ansicht.
 */
export async function kundenNachNamen(companyId: string, namen: readonly string[]): Promise<WithId<Customer>[]> {
  const muster = [...new Set(
    namen
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => n.split(/\s+/).map(ohneJoker).join('%')),
  )];
  const teile: string[][] = [];
  for (let i = 0; i < muster.length; i += NAMEN_JE_ANFRAGE) teile.push(muster.slice(i, i + NAMEN_JE_ANFRAGE));
  const treffer = await Promise.all(
    teile.map((teil) =>
      // Über `suche_customers` (Befund 1 zu L3): je Muster über den Index.
      abfragen<Customer>(KUNDEN, companyId, { suche: { spalten: ['name'], muster: teil } }),
    ),
  );
  return [...new Map(treffer.flat().map((k) => [k.id, k])).values()];
}

/**
 * Die Baustellen EINES Kunden, die jüngste Nummer zuerst — seitenweise (A12).
 *
 * Vorher ohne Reihenfolge und mit stiller Grenze von 300: bei mehr fehlten
 * beliebige, und der Titel sagte „Baustellen (300)“. Jetzt geordnet, und
 * `zaehleProjekteDesKunden` sagt, wie viele es wirklich sind.
 */
export function listProjectsForCustomer(companyId: string, customerId: string, max = 100) {
  return abfragen<Project>(BAUSTELLEN, companyId, {
    wo: [{ art: 'gleich', feld: 'customerId', wert: customerId }],
    sortiere: { feld: 'projectNumber', absteigend: true },
    grenze: max,
  });
}

/** Wie viele Baustellen ein Kunde hat — dieselbe Bedingung wie die Liste (A12). */
export function zaehleProjekteDesKunden(companyId: string, customerId: string): Promise<number> {
  return zaehlen(BAUSTELLEN, companyId, { wo: [{ art: 'gleich', feld: 'customerId', wert: customerId }] });
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

/*
  WAS AM KUNDEN HÄNGT UND DAS LÖSCHEN VERHINDERT. Diese fünf Tabellen zeigen
  ohne `on delete` auf den Kunden — die Datenbank lehnt ab, solange eine
  Zeile darauf zeigt. Was mitgeht (`on delete cascade`: Termine,
  UID-Prüfungen, Beteiligungen an Liegenschaften) oder nur den Verweis
  verliert (`set null`: Auftragseingänge), steht hier nicht: es hindert nicht.
  Kommt eine Tabelle mit Verweis ohne `on delete` dazu, gehört sie hierher.
*/
const HAENGT: { tabelle: string; eins: string; mehr: string }[] = [
  { tabelle: BAUSTELLEN, eins: 'Baustelle', mehr: 'Baustellen' },
  { tabelle: 'quotes', eins: 'Angebot', mehr: 'Angebote' },
  { tabelle: 'wartungen', eins: 'Wartung', mehr: 'Wartungen' },
  { tabelle: 'work_sheets', eins: 'Handwerksschein', mehr: 'Handwerksscheine' },
  { tabelle: 'invoices', eins: 'Rechnung', mehr: 'Rechnungen' },
];

function aufzaehlen(teile: string[]): string {
  return teile.length <= 1 ? teile.join('') : `${teile.slice(0, -1).join(', ')} und ${teile[teile.length - 1]}`;
}

/**
 * Kunde löschen — nur, solange nichts mehr an ihm hängt.
 *
 * Die Prüfung bleibt im Code und wandert nicht in einen Fremdschlüssel: die
 * Meldung nennt, WAS hängt und wie viel, und das ist der Satz, den der
 * Benutzer braucht. Ein `on delete restrict` sagte nur „geht nicht".
 *
 * VORHER ZÄHLTE NUR DIE BAUSTELLE. Ein Kunde mit Angebot, Wartung,
 * Handwerksschein oder Rechnung lief durch die Prüfung, und die Datenbank
 * lehnte mit „update or delete on table "customers" violates foreign key
 * constraint …“ ab — auf Englisch, im Büro. Verworfene Angebote zählen mit:
 * sie liegen im Papierkorb, zeigen aber weiter auf den Kunden.
 *
 * WAS DIE ROLLE NICHT SIEHT, ZÄHLT SIE NICHT. Kunden pflegen darf auch die
 * Verwaltung; Angebote und Rechnungen liest sie nicht. Dann bleibt die Zahl
 * bei null, und die Datenbank lehnt doch ab — deshalb wird auch deren
 * Ablehnung übersetzt, mit der Art, die sie nennt.
 */
export async function deleteCustomer(companyId: string, id: string) {
  const kunde: Bedingung = { art: 'gleich', feld: 'customerId', wert: id };
  const [anzahlen, verworfen] = await Promise.all([
    Promise.all(HAENGT.map((h) => zaehlen(h.tabelle, companyId, { wo: [kunde] }))),
    zaehlen('quotes', companyId, { wo: [kunde, { art: 'gleich', feld: 'status', wert: 'Verworfen' }] }),
  ]);
  const teile = HAENGT.flatMap((h, i) => {
    const n = anzahlen[i];
    if (n === 0) return [];
    const text = `${n} ${n === 1 ? h.eins : h.mehr}`;
    if (h.tabelle !== 'quotes' || verworfen === 0) return [text];
    return [verworfen === n ? `${text} im Papierkorb` : `${text} (davon ${verworfen} im Papierkorb)`];
  });
  if (teile.length > 0) {
    throw new Error(`Der Kunde lässt sich nicht löschen: an ihm hängen noch ${aufzaehlen(teile)}.`);
  }
  try {
    await loeschen(KUNDEN, id);
  } catch (e) {
    const tabelle = /violates foreign key constraint "(\w+?)_customer_id_fkey"/.exec((e as Error).message)?.[1];
    const art = HAENGT.find((h) => h.tabelle === tabelle);
    if (art) throw new Error(`Der Kunde lässt sich nicht löschen: an ihm hängen noch ${art.mehr}.`);
    throw e;
  }
}

export function assignProjectToCustomer(
  projectId: string,
  customerId: string,
  customerName: string,
) {
  return aendern(BAUSTELLEN, projectId, { customerId, customerName });
}

/**
 * Welche dieser Kunden es im Betrieb schon gibt — Stellen in der Liste, ab 0.
 *
 * Die Datenbank beantwortet das und nicht der Browser: sie kennt den ganzen
 * Bestand, auch den, der nie geladen wurde. Bei der Übernahme gilt dieselbe
 * Antwort (`kunden_einspielen`).
 */
export async function kundenVorhanden(kunden: Pick<NewCustomer, 'name'>[]): Promise<number[]> {
  const { data, error } = await derClient().rpc('kunden_einspielen', {
    p_kunden: kunden.map((k) => ({ name: k.name })),
    p_nur_pruefen: true,
  });
  if (error) throw new Error(error.message);
  return ((data as { vorhanden?: number[] } | null)?.vorhanden ?? []).map(Number);
}

/**
 * Kunden in EINER Transaktion übernehmen — alle oder keiner.
 *
 * Schon vorhandene überspringt die Datenbank, auch wenn sie erst nach dem
 * Probelauf angelegt wurden.
 */
export async function kundenEinspielen(
  kunden: NewCustomer[],
): Promise<{ angelegt: number; uebersprungen: number }> {
  const { data, error } = await derClient().rpc('kunden_einspielen', {
    p_kunden: kunden,
    p_nur_pruefen: false,
  });
  if (error) throw new Error(error.message);
  const d = data as { angelegt: number; uebersprungen: number };
  return { angelegt: Number(d.angelegt), uebersprungen: Number(d.uebersprungen) };
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
/** Worin die Suche der Kundenliste sucht — in der Alle-Liste wie in den Prüflisten. */
const SUCHSPALTEN = ['name', 'address', 'contact_name', 'contact_phone', 'email'];

export function searchCustomers(
  companyId: string, begriff: string, max = KUNDEN_GRENZE,
): Promise<WithId<Customer>[]> {
  return abfragen<Customer>(KUNDEN, companyId, {
    suche: { spalten: SUCHSPALTEN, begriff },
    sortiere: { feld: 'name' },
    grenze: max,
  });
}

/**
 * Kunden, deren alte Anschrift sich nicht eindeutig zerlegen liess — die
 * Liste „zu prüfen“ (Testbericht 30.09.2026, M12).
 */
/*
  Runde 3, M10: Altkunden ohne Kundenart. Sie entscheidet über Zinsen und
  Mahnspesen; ohne sie gehen Rechnung und Mahnung nicht.
*/
const OHNE_KUNDENART: Bedingung[] = [{ art: 'leer', feld: 'kundenart' }];
/*
  Runde 6, M6: nicht nur die unzerlegbare alte Zeile, auch eine PLZ, die
  nicht zum Land passt, und eine E-Mail ohne Endung (`angaben_pruefen`).
*/
const ADRESSE_PRUEFEN: Bedingung[] = [{ art: 'gleich', feld: 'angabenPruefen', wert: true }];

/*
  DIE PRÜFLISTEN BLÄTTERN UND SUCHEN WIE DIE ALLE-LISTE (11.11.2026). Bis
  hierher holten sie fest die ersten 500 und übergingen den Suchbegriff: nach
  einem Import mit 800 Kunden ohne Kundenart fehlten 300 ohne ein Wort, „Weitere
  Kunden laden“ holte nichts nach, und wer im Suchfeld tippte, sah dieselbe
  Liste. Jetzt bestimmt die Ansicht die Seitengröße, und der Begriff geht mit.
*/
export function kundenOhneKundenart(companyId: string, max = KUNDEN_GRENZE, begriff = ''): Promise<WithId<Customer>[]> {
  return abfragen<Customer>(KUNDEN, companyId, {
    wo: OHNE_KUNDENART, suche: { spalten: SUCHSPALTEN, begriff }, sortiere: { feld: 'name' }, grenze: max,
  });
}

export function kundenAdressePruefen(companyId: string, max = KUNDEN_GRENZE, begriff = ''): Promise<WithId<Customer>[]> {
  return abfragen<Customer>(KUNDEN, companyId, {
    wo: ADRESSE_PRUEFEN, suche: { spalten: SUCHSPALTEN, begriff }, sortiere: { feld: 'name' }, grenze: max,
  });
}

/**
 * Wie viele Kunden jemand prüfen muss — die Zahlen an den Reitern der
 * Kundenliste (Design-Entwurf, Punkt 2). Über dieselben Bedingungen wie die
 * beiden Listen, und über den ganzen Bestand, nicht nur die geladenen.
 */
export async function kundenZuPruefenAnzahl(companyId: string): Promise<{ adressePruefen: number; ohneKundenart: number }> {
  const [adressePruefen, ohneKundenart] = await Promise.all([
    zaehlen(KUNDEN, companyId, { wo: ADRESSE_PRUEFEN }),
    zaehlen(KUNDEN, companyId, { wo: OHNE_KUNDENART }),
  ]);
  return { adressePruefen, ohneKundenart };
}

/** Die nächste freie Kundennummer — ein Vorschlag (M12). */
export async function naechsteKundennummer(): Promise<string> {
  const { data, error } = await derClient().rpc('naechste_kundennummer');
  if (error) throw new Error(error.message);
  return String(data ?? '');
}

/**
 * Die VIES-Abfragen eines Kunden, neueste zuerst (offene Punkte E2). Lesen
 * dürfen sie alle, die den Kunden lesen; geschrieben werden sie nur in
 * `uid-pruefen`.
 */
export async function listUidPruefungen(companyId: string, customerId: string, max = 20): Promise<UidPruefung[]> {
  const { data, error } = await derClient()
    .from('uid_pruefungen')
    .select('*')
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .order('am', { ascending: false })
    .limit(max);
  if (error) throw new Error(error.message);
  return (data ?? []).map((z) => {
    const u = zeileAlsObjekt<WithId<UidPruefung>>('uid_pruefungen', z as Record<string, unknown>);
    return { ...u, id: String(u.id) };
  });
}

/**
 * Die gespeicherte UID des Kunden bei VIES prüfen lassen. Gefragt wird mit
 * der UID am Kunden, nicht mit dem Formular. `hinweis` sagt, warum eine
 * Abfrage-ID fehlt, wenn VIES die eigene UID nicht anerkannt hat.
 */
export async function uidBeiViesPruefen(customerId: string): Promise<{ pruefung: UidPruefung; hinweis?: string }> {
  const { data, error } = await derClient().functions.invoke('uid-pruefen', { body: { kunde: customerId } });
  if (error) {
    const rumpf = await (error as { context?: Response }).context?.json?.()
      .catch(() => undefined);
    throw new Error(rumpf?.error ?? error.message);
  }
  const d = data as { pruefung: Record<string, unknown>; hinweis?: string };
  const u = zeileAlsObjekt<WithId<UidPruefung>>('uid_pruefungen', d.pruefung);
  return { pruefung: { ...u, id: String(u.id) }, ...(d.hinweis ? { hinweis: d.hinweis } : {}) };
}

/** Was beim Zusammenführen mit der Kennung der Dublette wandert (F9) — je Bereich die Zahl. */
export interface KundenZahlen {
  baustellen: number;
  angebote: number;
  rechnungen: number;
  scheine: number;
  wartungen: number;
  termine: number;
  eingaenge: number;
  beteiligungen: number;
  uidPruefungen: number;
  verlauf: number;
  /** Beteiligungen, die der bleibende Kunde schon genauso hat — sie werden zusammengelegt. */
  beteiligungenDoppelt: number;
}

/** Belege ohne Kundenbezug mit dem Namen der Dublette (Altdaten) — wandern mit, wenn der Name eindeutig ist. */
export interface KundenUeberNamen {
  baustellen: number;
  angebote: number;
  rechnungen: number;
  scheine: number;
  wartungen: number;
}

export interface ZusammenfuehrenVorschau {
  bleibt: WithId<Customer>;
  geht: WithId<Customer>;
  zahlen: KundenZahlen;
  ueberNamen: KundenUeberNamen;
  /** Trägt kein dritter Kunde den Namen der Dublette? Sonst bleiben ihre Altbelege, wie sie sind. */
  nameEindeutig: boolean;
  /** Der Stand der Vorschau — geht mit dem Zusammenführen zurück (Schreibbefehls-Vertrag). */
  stand: string;
}

/** Die Stammfelder, die das Zusammenführen kennt — und ob sie von der Dublette kommen. */
export type Stammfeld =
  | 'name' | 'anschrift' | 'contact_name' | 'contact_phone' | 'email' | 'vat_id'
  | 'kundennummer' | 'kundenart' | 'lieferantennummer' | 'notes';
export type StammfeldHerkunft = 'bleibt' | 'geht' | 'beide';

export type ZusammenfuehrenErgebnis =
  | { art: 'zusammengefuehrt'; kunde: string; name: string }
  | { art: 'veraltet'; vorschau: ZusammenfuehrenVorschau };

const zahl = (w: unknown) => Number(w ?? 0);

function alsVorschau(d: Record<string, unknown>): ZusammenfuehrenVorschau {
  const z = (d.zahlen ?? {}) as Record<string, unknown>;
  const n = (d.ueber_namen ?? {}) as Record<string, unknown>;
  const kunde = (r: unknown) => {
    const k = zeileAlsObjekt<WithId<Customer>>(KUNDEN, r as Record<string, unknown>);
    return { ...k, id: String(k.id) };
  };
  return {
    bleibt: kunde(d.bleibt),
    geht: kunde(d.geht),
    zahlen: {
      baustellen: zahl(z.baustellen), angebote: zahl(z.angebote), rechnungen: zahl(z.rechnungen),
      scheine: zahl(z.scheine), wartungen: zahl(z.wartungen), termine: zahl(z.termine),
      eingaenge: zahl(z.eingaenge), beteiligungen: zahl(z.beteiligungen),
      uidPruefungen: zahl(z.uid_pruefungen), verlauf: zahl(z.verlauf),
      beteiligungenDoppelt: zahl(z.beteiligungen_doppelt),
    },
    ueberNamen: {
      baustellen: zahl(n.baustellen), angebote: zahl(n.angebote), rechnungen: zahl(n.rechnungen),
      scheine: zahl(n.scheine), wartungen: zahl(n.wartungen),
    },
    nameEindeutig: d.name_eindeutig !== false,
    stand: String(d.stand ?? ''),
  };
}

/** Was beim Zusammenführen wohin wandert — ohne etwas zu ändern (F9). */
export async function kundenZusammenfuehrenVorschau(bleibt: string, geht: string): Promise<ZusammenfuehrenVorschau> {
  const { data, error } = await derClient().rpc('kunden_zusammenfuehren_vorschau', { p_bleibt: bleibt, p_geht: geht });
  if (error) throw new Error(error.message);
  return alsVorschau(data as Record<string, unknown>);
}

/**
 * Zwei Kunden zusammenführen (F9) — in einer Transaktion der Datenbank.
 *
 * NACH DEM SCHREIBBEFEHLS-VERTRAG: der Stand der Vorschau geht mit. Hat sich
 * seither etwas geändert (ein neuer Beleg, eine Änderung an einem der
 * beiden), führt die Datenbank nichts zusammen und gibt die neue Vorschau
 * zurück — gefragt wird dann mit dem, was jetzt gilt.
 */
export async function kundenZusammenfuehren(
  bleibt: string,
  geht: string,
  felder: Partial<Record<Stammfeld, StammfeldHerkunft>>,
  stand: string,
): Promise<ZusammenfuehrenErgebnis> {
  const { data, error } = await derClient().rpc('kunden_zusammenfuehren', {
    p_bleibt: bleibt, p_geht: geht, p_felder: felder, p_stand: stand,
  });
  if (error) throw new Error(error.message);
  const d = data as Record<string, unknown>;
  if (d.art === 'veraltet') return { art: 'veraltet', vorschau: alsVorschau(d.vorschau as Record<string, unknown>) };
  return { art: 'zusammengefuehrt', kunde: String(d.kunde), name: String(d.name ?? '') };
}
