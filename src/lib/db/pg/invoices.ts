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

/** Die Sammlungsnamen der alten Datenschicht auf Tabellen abbilden. */
const TABELLEN: Record<string, string> = {
  timeEntries: 'time_entries',
  materialOrders: 'material_orders',
};

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
  const koepfe = await abfragen<KopfZeile>(RECHNUNGEN, companyId, {
    wo: [
      { art: 'ab', feld: 'invoiceDate', wert: von },
      { art: 'bis', feld: 'invoiceDate', wert: bis },
    ],
    sortiere: { feld: 'invoiceDate' },
  });
  return zusammensetzen(koepfe, companyId);
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

export async function createInvoice(companyId: string, inv: NewInvoice): Promise<string> {
  void companyId;
  const {
    positions, discount, linkedEntries, linkedOrders, linkedWorkSheets, ...kopf
  } = inv;

  const belege: Record<string, string[]> = {};
  for (const [art, feld] of ABDECKUNGSARTEN) {
    const liste = { linkedEntries, linkedOrders, linkedWorkSheets }[feld];
    if (liste && liste.length > 0) belege[art] = liste;
  }

  const { data, error } = await derClient().rpc('rechnung_anlegen', {
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
  });
  if (error) throw new Error(error.message);
  return String(data);
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

/**
 * Markiert Belege als verrechnet — beim ANLEGEN einer Rechnung.
 *
 * Die Reihenfolge beim Anlegen ist selbst die Sicherung: Nummer ziehen,
 * Belege sperren, DANN die Rechnung anlegen. Bricht es dazwischen ab, sind
 * Belege gesperrt, zu denen es keine Rechnung gibt — die harmlose Richtung,
 * denn nichts wird dadurch doppelt verrechnet. Umgekehrt wäre es der teure
 * Fall.
 *
 * `coll` trägt noch den Sammlungsnamen der Firestore-Schicht. Er bleibt in
 * der Signatur, weil die Weiche beide Seiten bedienen muss; hier wird er auf
 * die Tabelle abgebildet. Ein unbekannter Name fällt auf, statt still nichts
 * zu tun.
 */
export async function markBilled(
  coll: string,
  ids: string[],
  invoiceNumber: string,
): Promise<void> {
  if (ids.length === 0) return;
  const tabelle = TABELLEN[coll];
  if (!tabelle) throw new Error(`Unbekannte Belegart: ${coll}`);
  const { error } = await derClient()
    .from(tabelle)
    .update({ is_billed: true, invoice_number: invoiceNumber })
    .in('id', ids);
  if (error) throw new Error(error.message);
}
