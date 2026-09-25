/**
 * Rechnungen — auf Postgres.
 *
 * Der Bereich mit den härtesten Regeln, und zwar nicht aus Vorsicht: § 132
 * BAO verlangt sieben Jahre Aufbewahrung, § 11 UStG schreibt vor, was auf
 * einer Rechnung zu stehen hat. Eine ausgestellte Rechnung wird nicht
 * geändert und nicht gelöscht — sie wird storniert.
 *
 * AUS EINEM DOKUMENT WERDEN DREI TABELLEN: Kopf, Positionen und die
 * Abdeckung (welche Belege diese Rechnung verbraucht hat). Zusammen
 * geschrieben werden sie von `public.rechnung_anlegen`; eine Rechnung ohne
 * Positionen wäre eine Rechnung über nichts, mit einer verbrauchten Nummer,
 * die sich auch nicht mehr wegräumen lässt.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Invoice, InvoiceDiscount } from '@/types';
import { abfragen, aendern, derClient, kanalHalten, NACHFASSEN_MS, type WithId } from './kern';
import { objektAlsZeile } from './felder';
import { oderUeberSpalten } from './suche';
import { belegNummer, PRAEFIX_VORGABE } from '@/lib/praefixe';

const RECHNUNGEN = 'invoices';
const POSITIONEN = 'invoice_lines';
const ABDECKUNG = 'invoice_coverage';

type Position = NonNullable<Invoice['positions']>[number];

/** Der Kopf, so wie er in der Datenbank steht. */
type KopfZeile = Omit<
  Invoice,
  'positions' | 'discount' | 'linkedEntries' | 'linkedOrders' | 'linkedWorkSheets'
> & {
  discountMode?: InvoiceDiscount['mode'];
  discountValue?: number;
  discountLabel?: string;
};

/**
 * Die Art, unter der ein Beleg in der Abdeckung steht, und das Feld der
 * Rechnung, das ihn trägt.
 *
 * Eine Tabelle statt dreier Arrays: so lässt sich die Frage auch andersherum
 * stellen — „ist diese Buchung schon verrechnet?" —, ohne sich auf das Feld
 * `isBilled` zu verlassen, das eine Kopie ist und auseinanderlaufen kann.
 */
const ABDECKUNGSARTEN = [
  ['time_entry', 'linkedEntries'],
  ['material_order', 'linkedOrders'],
  ['work_sheet', 'linkedWorkSheets'],
] as const;

interface Abdeckungszeile {
  invoiceId: string;
  art: string;
  zielId: string;
}

/**
 * Köpfe, Positionen und Abdeckung zu ganzen Rechnungen zusammenfügen.
 *
 * ZWEI ABFRAGEN FÜR BELIEBIG VIELE RECHNUNGEN. Ein Journal über ein Quartal
 * holt sonst je Rechnung zwei — und der Buchhaltungs-Export läuft über
 * Hunderte.
 */
async function zusammensetzen(
  koepfe: WithId<KopfZeile>[],
  companyId: string,
  client?: SupabaseClient,
): Promise<WithId<Invoice>[]> {
  if (koepfe.length === 0) return [];
  const kennungen = koepfe.map((k) => k.id);

  const [zeilen, abdeckung] = await Promise.all([
    abfragen<Position & { invoiceId: string; position: number }>(
      POSITIONEN,
      companyId,
      {
        wo: [{ art: 'in', feld: 'invoiceId', werte: kennungen }],
        sortiere: { feld: 'position' },
      },
      client,
    ),
    abfragen<Abdeckungszeile>(
      ABDECKUNG,
      companyId,
      { wo: [{ art: 'in', feld: 'invoiceId', werte: kennungen }] },
      client,
    ),
  ]);

  const nachRechnung = new Map<string, Position[]>();
  for (const z of zeilen) {
    const liste = nachRechnung.get(z.invoiceId) ?? [];
    // Nur die Felder einer Position — `id`, `companyId`, `invoiceId` und
    // `position` sind Buchhaltung der Datenbank und gehören nicht auf den Beleg.
    liste.push({ label: z.label, qty: z.qty, unit: z.unit, unitPrice: z.unitPrice, netto: z.netto });
    nachRechnung.set(z.invoiceId, liste);
  }

  const belege = new Map<string, Map<string, string[]>>();
  for (const a of abdeckung) {
    const proRechnung = belege.get(a.invoiceId) ?? new Map<string, string[]>();
    proRechnung.set(a.art, [...(proRechnung.get(a.art) ?? []), a.zielId]);
    belege.set(a.invoiceId, proRechnung);
  }

  return koepfe.map((k) => {
    const { discountMode, discountValue, discountLabel, ...rest } = k;
    const rechnung: WithId<Invoice> = {
      ...(rest as unknown as WithId<Invoice>),
      positions: nachRechnung.get(k.id) ?? [],
    };
    /*
      Drei Spalten, ein Feld. Ein Rabatt ist entweder ein Anteil oder ein
      fester Betrag — beides zusammen gibt es bewusst nicht. Fehlt der Modus,
      gab es keinen Rabatt; ein leeres Objekt sähe aus wie einer über null.
    */
    if (discountMode) {
      const rabatt: InvoiceDiscount = { mode: discountMode, value: discountValue ?? 0 };
      if (discountLabel) rabatt.label = discountLabel;
      rechnung.discount = rabatt;
    }
    const proRechnung = belege.get(k.id);
    for (const [art, feld] of ABDECKUNGSARTEN) {
      const liste = proRechnung?.get(art);
      if (liste && liste.length > 0) rechnung[feld] = liste;
    }
    return rechnung;
  });
}

/**
 * Nur die UNBEZAHLTEN Rechnungen — für die Summen auf der Startseite und für
 * den Mahnlauf.
 *
 * Ohne Zeitgrenze und von Natur aus klein: offene Forderungen sind der
 * Ausnahmezustand, nicht der Bestand. Der Mahnlauf lief früher über die
 * Arbeitsliste, und die schneidet nach Anlagedatum ab — damit sah er
 * ausgerechnet die Forderungen NICHT, die am längsten offen sind.
 */
export async function listUnpaidInvoices(companyId: string) {
  const koepfe = await abfragen<KopfZeile>(RECHNUNGEN, companyId, {
    /*
      „Teilbezahlt" GEHÖRT HIERHER. Eine Rechnung, auf die 400 von 1.000 €
      gekommen sind, ist unbezahlt — nur eben nicht ganz. Ohne sie fehlten
      dem Mahnlauf und den Summen der Startseite ausgerechnet die Fälle, bei
      denen schon einmal jemand nachgefragt hat.
    */
    wo: [{ art: 'in', feld: 'paymentStatus', werte: ['Offen', 'Überfällig', 'Teilbezahlt'] }],
  });
  return zusammensetzen(koepfe, companyId);
}

/**
 * Die jüngsten Rechnungen, live — mit ausdrücklicher Obergrenze.
 *
 * EIGENES ABONNEMENT STATT `abonnieren`: eine Rechnung besteht aus drei
 * Tabellen, der allgemeine Weg meldet aber einzelne Zeilen einer einzigen.
 * Beobachtet wird deshalb der KOPF, und bei jeder Meldung wird die Liste neu
 * zusammengesetzt.
 *
 * Das trägt, weil Positionen und Abdeckung sich nach dem Anlegen nicht mehr
 * ändern — die Richtlinien lassen an `invoice_lines` weder ein Ändern noch
 * ein Löschen zu. Jede Bewegung an einer Rechnung berührt also ihren Kopf.
 */
export function subscribeRecentInvoices(
  companyId: string,
  max: number,
  cb: (rows: WithId<Invoice>[]) => void,
  onError: (e: Error) => void,
  client?: SupabaseClient,
): () => void {
  const c = derClient(client);
  let gestoppt = false;
  let laeuft: Promise<void> | null = null;
  let nochmal = false;
  let nachfassen: ReturnType<typeof setTimeout> | undefined;

  const holen = async (): Promise<WithId<Invoice>[]> => {
    const koepfe = await abfragen<KopfZeile>(RECHNUNGEN, companyId, {
      sortiere: { feld: 'createdAt', absteigend: true },
      grenze: max,
    }, c);
    return zusammensetzen(koepfe, companyId, c);
  };

  // Meldungen werden zusammengefasst, nicht gestapelt: liefen zwei
  // Nachladungen nebeneinander, könnte die ältere als letzte zurückkommen
  // und die Ansicht auf einen überholten Stand zurückwerfen.
  const anstossen = (): void => {
    if (laeuft) { nochmal = true; return; }
    laeuft = holen()
      .then((zeilen) => { if (!gestoppt) cb(zeilen); })
      .catch((e: unknown) => { if (!gestoppt) onError(e as Error); })
      .finally(() => {
        laeuft = null;
        if (nochmal && !gestoppt) { nochmal = false; anstossen(); }
      });
  };

  // Wiederaufbau wie überall — siehe `kanalHalten`. Ein Abriss war hier
  // vorher sofort ein roter Kasten mitten in der Rechnungsansicht.
  const stoppKanal = kanalHalten({
    tabelle: RECHNUNGEN,
    filter: `company_id=eq.${companyId}`,
    beiAenderung: () => anstossen(),
    beiBereit: () => {
      anstossen();
      nachfassen = setTimeout(anstossen, NACHFASSEN_MS);
    },
    client: c,
  });

  return () => {
    gestoppt = true;
    if (nachfassen) clearTimeout(nachfassen);
    stoppKanal();
  };
}

/**
 * Die Rechnungen EINES ZEITRAUMS — nach RECHNUNGSdatum, nicht nach Anlagedatum.
 *
 * Eine im Jänner nachgetragene Dezember-Rechnung gehört ins Dezember-Journal;
 * danach fragt der Steuerberater.
 *
 * KEINE Obergrenze. Der Zeitraum IST die Grenze, und ein Export, der
 * stillschweigend bei tausend Rechnungen aufhört, wäre genau der Fehler, den
 * diese Funktion behebt: die Lückenprüfung im Nummernkreis meldete sonst
 * Lücken, die keine sind.
 */
export async function listInvoicesInRange(companyId: string, von: string, bis: string) {
  /*
    DAZU DIE RECHNUNGEN, DIE IN DIESEM ZEITRAUM STORNIERT WURDEN — auch wenn
    sie selbst aus einem früheren stammen (Prüflauf 25.09.2026, P2-14). Der
    Storno gehört als Gegenbuchung in den Zeitraum, in dem er geschah; ohne
    diese zweite Abfrage stand er in keinem Export. Gesucht wird einen Tag
    weiter, weil der Stornotag in Ortszeit zählt und die Spalte in UTC
    steht — die Exporte schneiden danach genau auf den Tag zu.
  */
  const [nachDatum, nachStorno] = await Promise.all([
    abfragen<KopfZeile>(RECHNUNGEN, companyId, {
      wo: [
        { art: 'ab', feld: 'invoiceDate', wert: von },
        { art: 'bis', feld: 'invoiceDate', wert: bis },
      ],
      sortiere: { feld: 'invoiceDate' },
    }),
    abfragen<KopfZeile>(RECHNUNGEN, companyId, {
      wo: [
        { art: 'ab', feld: 'cancelledAt', wert: tagVerschoben(von, -1) },
        { art: 'bis', feld: 'cancelledAt', wert: tagVerschoben(bis, 1) },
      ],
    }),
  ]);
  const schon = new Set(nachDatum.map((k) => k.id));
  return zusammensetzen([...nachDatum, ...nachStorno.filter((k) => !schon.has(k.id))], companyId);
}

/** '2026-09-01' und −1 → '2026-08-31'. Gerechnet in UTC, damit keine Zeitumstellung dazwischenfunkt. */
function tagVerschoben(iso: string, tage: number): string {
  const ms = Date.parse(`${iso}T00:00:00Z`) + tage * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Alle Rechnungen EINER BAUSTELLE — ohne Zeitgrenze und ohne Statusfilter.
 *
 * Gebraucht für den Abzug auf der Schlussrechnung: abgezogen wird eine
 * Anzahlung, die der Kunde längst BEZAHLT hat. Sie steht damit weder in den
 * offenen Posten noch verlässlich in der Liste der jüngsten Rechnungen — bei
 * einer Baustelle über vier Monate liegen Dutzende andere dazwischen. Ohne
 * diese Abfrage stünde die eine Rechnung, um die es geht, nicht zur Auswahl.
 *
 * Nach mehreren SCHREIBWEISEN gesucht, wie bei den Zeiteinträgen: Altbestände
 * schreiben die Nummer mal mit, mal ohne „PR-".
 */
export async function listInvoicesForProject(
  companyId: string,
  projectNumber: string,
): Promise<WithId<Invoice>[]> {
  const blank = (projectNumber ?? '').trim().replace(/^PR-/i, '');
  if (!blank) return [];
  const formen = [...new Set([projectNumber.trim(), blank, `PR-${blank}`])];
  const koepfe = await abfragen<KopfZeile>(RECHNUNGEN, companyId, {
    wo: [{ art: 'in', feld: 'projectNumber', werte: formen }],
  });
  return zusammensetzen(koepfe, companyId);
}

/**
 * Welche dieser Handwerksscheine auf einer GÜLTIGEN Rechnung stehen — über
 * ALLE Rechnungen, nicht nur die geladenen.
 *
 * Gebraucht für „nicht verrechnete Leistung" (Prüflauf 25.09.2026, P2-03).
 * Die Ansicht fragte bisher die fünfzig jüngsten Rechnungen und die offenen
 * Forderungen; ein Schein auf einer älteren, längst BEZAHLTEN Rechnung stand
 * damit als unverrechnet da — eine falsche Anschuldigung, der jemand
 * nachgeht. Gefragt wird deshalb die Abdeckung selbst, und ein Storno zählt
 * nicht: er gibt seine Scheine frei.
 */
export async function scheineAufRechnung(
  companyId: string,
  scheinIds: string[],
): Promise<string[]> {
  const ids = [...new Set(scheinIds.filter(Boolean))];
  if (ids.length === 0) return [];
  const abdeckung = await abfragen<Abdeckungszeile>(ABDECKUNG, companyId, {
    wo: [
      { art: 'gleich', feld: 'art', wert: 'work_sheet' },
      { art: 'in', feld: 'zielId', werte: ids },
    ],
  });
  const rechnungsIds = [...new Set(abdeckung.map((a) => a.invoiceId))];
  if (rechnungsIds.length === 0) return [];
  const koepfe = await abfragen<Pick<Invoice, 'paymentStatus'>>(RECHNUNGEN, companyId, {
    wo: [{ art: 'in', feld: 'id', werte: rechnungsIds }],
  });
  const gueltig = new Set(koepfe.filter((k) => k.paymentStatus !== 'Storniert').map((k) => k.id));
  return [...new Set(abdeckung.filter((a) => gueltig.has(a.invoiceId)).map((a) => a.zielId))];
}

/** Wie viele Treffer die Suche zeigt — wer mehr braucht, sucht genauer. */
export const RECHNUNG_TREFFER = 100;

/**
 * Rechnungen suchen — ÜBER ALLE, auf dem Server.
 *
 * Die Liste lädt nur die jüngsten; die Suche lief bisher im Browser über
 * genau diese. Wer eine Rechnung aus dem Vorjahr suchte, fand sie nicht und
 * musste erst „Ältere laden" drücken — ohne zu wissen, wie oft. Gesucht wird
 * nach Nummer, Kunde und Baustelle, auch mitten im Wort, jüngste zuerst.
 */
export async function sucheRechnungen(
  companyId: string,
  begriff: string,
  max = RECHNUNG_TREFFER,
): Promise<WithId<Invoice>[]> {
  const oder = oderUeberSpalten(['invoice_number', 'customer_name', 'project_number'], begriff);
  if (!oder) return [];
  const koepfe = await abfragen<KopfZeile>(RECHNUNGEN, companyId, {
    oder,
    sortiere: { feld: 'invoiceDate', absteigend: true },
    grenze: max,
  });
  return zusammensetzen(koepfe, companyId);
}

/** Wie viele Rechnungen die Kundenakte zeigt — die jüngsten zuerst. */
const RECHNUNGEN_JE_KUNDE = 500;

const KENNUNG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Die Rechnungen EINES KUNDEN — für die Kundenakte.
 *
 * NICHT NUR ÜBER DIE KUNDENKENNUNG: die App schreibt auf eine Rechnung den
 * Namen, nicht die Kennung — ihr Kunde ergibt sich aus der Baustelle. Gesucht
 * wird deshalb über beides: die Kennung, wo sie steht, und die Baustellen
 * des Kunden. Nach dem Namen gerade NICHT: ein umbenannter Kunde behält auf
 * seinen alten Rechnungen den alten Namen, und zwei Kunden gleichen Namens
 * sähen die Rechnungen des anderen.
 */
export async function listInvoicesForCustomer(
  companyId: string,
  customerId: string,
  projektIds: string[],
): Promise<WithId<Invoice>[]> {
  // Die Kennungen stehen in einer `or`-Zeichenkette — nur, was wirklich eine
  // Kennung ist, kommt hinein.
  const ids = projektIds.filter((id) => KENNUNG.test(id));
  if (!KENNUNG.test(customerId)) return [];
  const teile = [`customer_id.eq.${customerId}`];
  if (ids.length > 0) teile.push(`project_id.in.(${ids.join(',')})`);
  const koepfe = await abfragen<KopfZeile>(RECHNUNGEN, companyId, {
    oder: teile.join(','),
    sortiere: { feld: 'invoiceDate', absteigend: true },
    grenze: RECHNUNGEN_JE_KUNDE,
  });
  return zusammensetzen(koepfe, companyId);
}

/**
 * Reserviert eine Rechnungsnummer verbindlich.
 *
 * Die Transaktion, die in der Firestore-Fassung von Hand geschrieben war,
 * ist jetzt die Datenbankfunktion `naechste_nummer`: sie sperrt die
 * Zählerzeile, und zwei gleichzeitige Abrechnungen können sich damit nicht
 * dieselbe Nummer holen. Bei fortlaufender Nummerierung ist das kein
 * Schönheitsfehler, sondern ein Fall für den Steuerberater.
 *
 * `seedFrom` ist die höchste Nummer aus den vorhandenen Rechnungen. Sie zählt
 * nur beim allerersten Aufruf, wenn es den Zähler noch nicht gibt: ohne sie
 * würde ein Betrieb mit Altbestand wieder bei 1001 anfangen.
 */
export async function reserveInvoiceNumber(
  companyId: string,
  opts: { seedFrom: number; desired?: number; praefix?: string },
): Promise<string> {
  void companyId;
  const jahr = new Date().getFullYear();
  const { data, error } = await derClient().rpc('naechste_nummer', {
    p_art: 'invoices',
    p_jahr: jahr,
    p_seed: Math.max(opts.seedFrom, 0),
    p_wunsch: opts.desired ?? null,
  });
  if (error) throw new Error(error.message);
  /*
    DER VORSATZ KOMMT VOM AUFRUFER. Hier stand `RE-` fest, ein zweites Mal
    neben `invoiceNumbers.ts`. Diese Stelle ist die verbindliche: was hier
    gebaut wird, steht danach auf dem Beleg und lässt sich nicht mehr ändern
    (`app.rechnung_eingefroren`).
  */
  return belegNummer(opts.praefix ?? PRAEFIX_VORGABE.rechnung, jahr, Number(data));
}

export type NewInvoice = Omit<Invoice, 'id' | 'companyId' | 'createdAt'>;

/**
 * Ein leeres Datumsfeld ist NICHT angegeben, nicht „der 1. Jänner".
 *
 * In der App heisst „nicht angegeben" ein Leerstring — so gibt es ein
 * `<input type="date">` ein leeres Feld heraus, und so steht es im Zustand
 * der Ansicht. Eine Datumsspalte kennt dafür nur NULL; `""` weist Postgres
 * mit „invalid input syntax for type date" ab.
 *
 * WAS OHNE DIESE UMSETZUNG PASSIERTE: eine Rechnung ohne Leistungszeitraum
 * liess sich gar nicht anlegen — und sie scheiterte an der SCHLECHTESTEN
 * Stelle, nämlich nachdem die Nummer verbindlich gezogen und die Belege
 * gesperrt waren. Zurück blieben eine verbrauchte Nummer und Zeiteinträge,
 * die auf eine Rechnung verwiesen, die es nicht gibt. Aufgefallen ist es an
 * der Anzahlung, die nie einen Leistungszeitraum hat; zu treffen war es aber
 * schon vorher — das Feld ist änderbar, und der fehlende Zeitraum wird nur
 * gemeldet, nicht erzwungen.
 */
function leerAlsNull(wert: string | undefined): string | null | undefined {
  return wert === '' ? null : wert;
}

/**
 * Kopf, Positionen und Belege in der Form, die `rechnung_anlegen` erwartet.
 *
 * EINE STELLE FÜR BEIDE WEGE — das Anlegen mit fester Nummer und das
 * Ausstellen mit gezogener. Zwei Fassungen desselben Umbaus liefen beim
 * nächsten neuen Feld auseinander, und eine Rechnung verlöre es still.
 */
function anlegeDaten(inv: Omit<NewInvoice, 'invoiceNumber'> & { invoiceNumber?: string }) {
  const {
    positions, discount, linkedEntries, linkedOrders, linkedWorkSheets, ...roh
  } = inv;
  const kopf = {
    ...roh,
    leistungVon: leerAlsNull(roh.leistungVon),
    leistungBis: leerAlsNull(roh.leistungBis),
  };

  const belege: Record<string, string[]> = {};
  for (const [art, feld] of ABDECKUNGSARTEN) {
    const liste = { linkedEntries, linkedOrders, linkedWorkSheets }[feld];
    if (liste && liste.length > 0) belege[art] = liste;
  }

  return {
    p_kopf: {
      ...objektAlsZeile(RECHNUNGEN, kopf),
      // Ein Rabatt ist ein Objekt in der App und drei Spalten in der
      // Datenbank. `null` heisst ausdrücklich „kein Rabatt".
      discount_mode: discount?.mode ?? null,
      discount_value: discount?.value ?? null,
      discount_label: discount?.label ?? null,
    },
    p_positionen: (positions ?? []).map((p) => objektAlsZeile(POSITIONEN, p)),
    p_belege: belege,
  };
}

/**
 * Eine Rechnung mit einer schon feststehenden Nummer anlegen — für
 * Übernahmen und Prüfungen. Die Ansicht stellt über `rechnungAusstellen` aus.
 */
export async function createInvoice(companyId: string, inv: NewInvoice): Promise<string> {
  void companyId;
  const { data, error } = await derClient().rpc('rechnung_anlegen', anlegeDaten(inv));
  if (error) throw new Error(error.message);
  return String(data);
}

/**
 * Eine Rechnung AUSSTELLEN: Nummer ziehen, Belege sperren, anlegen — in EINER
 * Transaktion (`public.rechnung_ausstellen`).
 *
 * WARUM NICHT MEHR DREI AUFRUFE (Prüflauf 25.09.2026, P2-04). Vorher zog die
 * Ansicht die Nummer, sperrte danach die Zeiteinträge und legte zuletzt die
 * Rechnung an. Brach es dazwischen ab, blieben eine verbrauchte Nummer — eine
 * Lücke im Kreis — und gesperrte Stunden ohne Rechnung zurück; und das
 * Sperren fragte nicht, ob die Stunde noch frei war, sodass zwei
 * gleichzeitige Abrechnungen dieselben Stunden verrechneten. Jetzt geht alles
 * ganz durch oder gar nicht, und ein bereits verrechneter Beleg bricht ab.
 *
 * `desired` ist die eigene Nummer beim Umstieg — die Datenbank nimmt sie nur
 * bei der allerersten Rechnung an (K8).
 */
export async function rechnungAusstellen(
  companyId: string,
  inv: Omit<NewInvoice, 'invoiceNumber'>,
  nummer: { praefix?: string; desired?: number },
): Promise<{ id: string; invoiceNumber: string }> {
  void companyId;
  const { data, error } = await derClient().rpc('rechnung_ausstellen', {
    ...anlegeDaten(inv),
    p_praefix: nummer.praefix ?? PRAEFIX_VORGABE.rechnung,
    p_jahr: new Date().getFullYear(),
    p_wunsch: nummer.desired ?? null,
  });
  if (error) throw new Error(error.message);
  const r = data as { id: string; invoice_number: string };
  return { id: String(r.id), invoiceNumber: String(r.invoice_number) };
}

/**
 * Den Fälligkeitsstand setzen — und NUR den.
 *
 * „Bezahlt", „Teilbezahlt" und „Überzahlt" stehen hier bewusst nicht zur
 * Auswahl: sie ergeben sich aus den Zahlungseingängen, und die Datenbank
 * weist einen Schreibversuch von Hand ab (`app.rechnung_eingefroren`). Ein
 * Aufruf, der dort scheitert, gehört gar nicht erst in den Typ — sonst sieht
 * die Ansicht eine Möglichkeit, die es nicht gibt.
 */
export type SetzbarerStand = Extract<Invoice['paymentStatus'], 'Offen' | 'Überfällig'>;

export function updateInvoiceStatus(
  id: string,
  paymentStatus: SetzbarerStand,
): Promise<void> {
  return aendern(RECHNUNGEN, id, { paymentStatus });
}

/**
 * Storniert eine Rechnung und gibt die verknüpften Belege wieder frei — in
 * EINEM Vorgang.
 *
 * Welche Belege betroffen sind, holt sich die Datenbankfunktion aus der
 * Abdeckung und nicht aus dem übergebenen Objekt: eine unvollständige Liste
 * hinterliesse genau den halben Zustand, den die Klammer verhindern soll.
 */
export async function cancelInvoice(inv: WithId<Invoice>, note: string): Promise<void> {
  const { error } = await derClient().rpc('rechnung_stornieren', {
    p_id: inv.id,
    p_grund: note,
  });
  if (error) throw new Error(error.message);
}

/**
 * Hebt einen Storno wieder auf. Ein Fehlstorno war sonst nur durch Löschen
 * und vollständiges Neuerstellen zu heilen — inklusive neuer Nummer, also
 * einer Lücke im Kreis.
 */
export async function reactivateInvoice(inv: WithId<Invoice>): Promise<void> {
  const { error } = await derClient().rpc('rechnung_storno_aufheben', { p_id: inv.id });
  if (error) throw new Error(error.message);
}

/**
 * Eine Mahnung festhalten.
 *
 * Geschrieben wird NACH dem Erzeugen des Belegs, nicht davor. Scheitert das
 * PDF, ist schlimmstenfalls nichts geschehen — umgekehrt stünde die Rechnung
 * als gemahnt da, ohne dass je ein Schreiben entstanden wäre, und die
 * nächste Stufe begänne bei zwei.
 */
export function mahnungFesthalten(
  id: string,
  daten: {
    stufe: number; gemahntAm: string; frist: string; spesen: number;
    /** Wo die Rechnung gerade steht — entscheidet, ob „Überfällig" mitgeht. */
    standJetzt: Invoice['paymentStatus'];
  },
): Promise<void> {
  /*
    „ÜBERFÄLLIG" GEHT NUR MIT, WENN DIE RECHNUNG OFFEN IST.

    Wer mahnt, hat den Verzug festgestellt — das war und bleibt der Grund für
    diese Zeile. Bei einer TEILBEZAHLTEN Rechnung wäre sie aber ein
    Rückschritt: „Teilbezahlt" sagt mehr als „Überfällig" (es ist beides), und
    die Datenbank weist den Schreibversuch ohnehin ab, weil der Stand sich aus
    den Zahlungseingängen ergibt. Ohne diese Unterscheidung liefe das Mahnen
    einer angezahlten Rechnung in einen Fehler — und die Mahnung wäre
    erzeugt, aber nirgends festgehalten.
  */
  const verzug = daten.standJetzt === 'Offen';
  return aendern(RECHNUNGEN, id, {
    mahnstufe: daten.stufe,
    gemahntAm: daten.gemahntAm,
    mahnfrist: daten.frist,
    mahnspesen: daten.spesen,
    ...(verzug ? { paymentStatus: 'Überfällig' as const } : {}),
  });
}
