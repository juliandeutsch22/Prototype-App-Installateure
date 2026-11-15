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
import type { Invoice, InvoiceDiscount, Mahnung, MahnungInhalt, RechnungsKopf, WorkSheet } from '@/types';
import { abfragen, aendern, derClient, kanalHalten, NACHFASSEN_MS, SEITE, type WithId } from './kern';
import { objektAlsZeile, zeileAlsObjekt } from './felder';
import { oderUeberSpalten } from './suche';
import { PRAEFIX_VORGABE } from '@/lib/praefixe';
import { RechnungsAntwortUnklar } from '@/lib/rechnungsAntwort';

const RECHNUNGEN = 'invoices';
const POSITIONEN = 'invoice_lines';
const ABDECKUNG = 'invoice_coverage';

type Position = NonNullable<Invoice['positions']>[number];

/** Der Kopf, so wie er in der Datenbank steht. */
type KopfZeile = Omit<
  Invoice,
  'positions' | 'discount' | 'linkedEntries' | 'linkedOrders' | 'linkedWorkSheets' | 'linkedWartungen'
  | 'linkedRuestPositionen'
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
  // Seit M01e: die Wartung über ihre Kennung (Muster in `20261106300000_wartung_abdeckung.sql`).
  ['wartung', 'linkedWartungen'],
  // Seit M2: die eingeladene Rüstlistenposition (`20261116060000_material_verrechnet_je_ausgabe.sql`).
  ['ruest_position', 'linkedRuestPositionen'],
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
/** Der Kopf als Rechnung, ohne Positionen und Abdeckung. */
function kopfAlsRechnung(k: WithId<KopfZeile>): WithId<RechnungsKopf> {
  const { discountMode, discountValue, discountLabel, ...rest } = k;
  const kopf = rest as WithId<RechnungsKopf>;
  /*
    Drei Spalten, ein Feld. Ein Rabatt ist entweder ein Anteil oder ein
    fester Betrag — beides zusammen gibt es bewusst nicht. Fehlt der Modus,
    gab es keinen Rabatt; ein leeres Objekt sähe aus wie einer über null.
  */
  if (discountMode) {
    const rabatt: InvoiceDiscount = { mode: discountMode, value: discountValue ?? 0 };
    if (discountLabel) rabatt.label = discountLabel;
    kopf.discount = rabatt;
  }
  return kopf;
}

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
    const pos: Position = { label: z.label, qty: z.qty, unit: z.unit, unitPrice: z.unitPrice, netto: z.netto };
    // Nur, was von der gewöhnlichen Position abweicht (M18).
    if (z.art && z.art !== 'position') pos.art = z.art;
    if (z.rabattProzent != null) pos.rabattProzent = Number(z.rabattProzent);
    if (z.materialId) pos.materialId = z.materialId;
    liste.push(pos);
    nachRechnung.set(z.invoiceId, liste);
  }

  const belege = new Map<string, Map<string, string[]>>();
  for (const a of abdeckung) {
    const proRechnung = belege.get(a.invoiceId) ?? new Map<string, string[]>();
    proRechnung.set(a.art, [...(proRechnung.get(a.art) ?? []), a.zielId]);
    belege.set(a.invoiceId, proRechnung);
  }

  return koepfe.map((k) => {
    const rechnung: WithId<Invoice> = { ...kopfAlsRechnung(k), positions: nachRechnung.get(k.id) ?? [] };
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
  return zusammensetzen(await unbezahlteKoepfe(companyId), companyId);
}

function unbezahlteKoepfe(companyId: string) {
  return abfragen<KopfZeile>(RECHNUNGEN, companyId, {
    /*
      „Teilbezahlt" GEHÖRT HIERHER. Eine Rechnung, auf die 400 von 1.000 €
      gekommen sind, ist unbezahlt — nur eben nicht ganz. Ohne sie fehlten
      dem Mahnlauf und den Summen der Startseite ausgerechnet die Fälle, bei
      denen schon einmal jemand nachgefragt hat.
    */
    wo: [{ art: 'in', feld: 'paymentStatus', werte: ['Offen', 'Überfällig', 'Teilbezahlt'] }],
  });
}

/**
 * Dieselben unbezahlten Rechnungen, nur die Köpfe — für die Startseite
 * (Nachweis mit dreifachem Bestand, 19.10.2026). Ihre Hinweise und der
 * Mahnlauf lesen Beträge, Fristen und Mahnstand, nie Positionen oder
 * Abdeckung; die kamen bis hierher mit — eine Anfrage später und bei 300
 * offenen Rechnungen rund 40 KB, auf dem Weg, an dem die Seite steht.
 */
export async function listUnpaidInvoiceKoepfe(companyId: string): Promise<WithId<RechnungsKopf>[]> {
  return (await unbezahlteKoepfe(companyId)).map(kopfAlsRechnung);
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
 *
 * `geaendert` meldet, dass sich an IRGENDEINER Rechnung des Betriebs etwas
 * getan hat — auch an einer, die zu alt für diese Liste ist — und nach
 * einem Wiederaufbau, weil in der Pause etwas geschehen sein kann. Nicht
 * beim ersten Aufbau: da lädt die Ansicht ohnehin. Damit hält die Ansicht
 * ihre offenen Forderungen aktuell (seit 11.10.2026).
 */
export function subscribeRecentInvoices(
  companyId: string,
  max: number,
  cb: (rows: WithId<Invoice>[]) => void,
  onError: (e: Error) => void,
  client?: SupabaseClient,
  geaendert?: () => void,
): () => void {
  const c = derClient(client);
  let gestoppt = false;
  let schonBereit = false;
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
    beiAenderung: () => {
      anstossen();
      geaendert?.();
    },
    beiBereit: () => {
      anstossen();
      if (schonBereit) geaendert?.();
      schonBereit = true;
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
/** Was das Belegarchiv von einer gemahnten Rechnung festhält. */
export type GemahnteRechnung = Pick<
  Invoice,
  'id' | 'invoiceNumber' | 'customerName' | 'projectNumber' | 'totalBrutto' | 'paymentStatus' | 'mahnstufe' | 'gemahntAm' | 'mahnfrist' | 'mahnspesen'
>;

/**
 * Die Rechnungen, deren LETZTE Mahnung in einen Zeitraum fällt — nur der
 * Kopf, ohne Grenze. Nach dem Tag der Mahnung, nicht der Rechnung: eine
 * Rechnung vom Dezember, im Januar gemahnt, gehört mit der Mahnung ins neue
 * Jahr.
 */
export function listGemahntInRange(companyId: string, von: string, bis: string) {
  return abfragen<GemahnteRechnung>(RECHNUNGEN, companyId, {
    spalten: 'id,invoice_number,customer_name,project_number,total_brutto,payment_status,mahnstufe,gemahnt_am,mahnfrist,mahnspesen',
    wo: [
      { art: 'ab', feld: 'gemahntAm', wert: von },
      { art: 'bis', feld: 'gemahntAm', wert: bis },
    ],
    sortiere: { feld: 'gemahntAm' },
  });
}

/** Was die Startseite von einer Rechnung mit Bankgarantie braucht. */
export type GarantieRechnung = Pick<
  Invoice,
  'invoiceNumber' | 'customerName' | 'paymentStatus' | 'ruecklassGarantieAm' | 'ruecklassGarantieBank' | 'ruecklassGarantieNr' | 'ruecklassGarantieBis'
>;

/**
 * Rechnungen, deren Bankgarantie in einem Zeitraum endet — nur der Kopf.
 * Eigene Abfrage, weil eine abgelöste Rechnung meist bezahlt ist und in den
 * offenen Posten der Startseite nicht mehr steht.
 */
export function listGarantienEndenIn(companyId: string, von: string, bis: string) {
  return abfragen<GarantieRechnung>(RECHNUNGEN, companyId, {
    spalten: 'id,invoice_number,customer_name,payment_status,ruecklass_garantie_am,ruecklass_garantie_bank,ruecklass_garantie_nr,ruecklass_garantie_bis',
    wo: [
      { art: 'ab', feld: 'ruecklassGarantieBis', wert: von },
      { art: 'bis', feld: 'ruecklassGarantieBis', wert: bis },
    ],
    sortiere: { feld: 'ruecklassGarantieBis' },
  });
}

export async function listInvoicesInRange(companyId: string, von: string, bis: string) {
  /*
    DAZU DIE RECHNUNGEN, DIE IN DIESEM ZEITRAUM STORNIERT WURDEN — auch wenn
    sie selbst aus einem früheren stammen (Prüflauf 25.09.2026, P2-14). Der
    Storno gehört als Gegenbuchung in den Zeitraum, in dem er geschah; ohne
    diese zweite Abfrage stand er in keinem Export. Gesucht wird einen Tag
    weiter, weil der Stornotag in Ortszeit zählt und die Spalte in UTC
    steht — die Exporte schneiden danach genau auf den Tag zu.
  */
  /*
    UND NACH DEM TAG DER STORNORECHNUNG (Runde 3, M7): ihr Belegdatum ist der
    Tag ihrer Ausstellung (`stornoBelegTag`), und der kann nach dem Storno
    liegen.
  */
  const [nachDatum, nachStorno, nachStornorechnung] = await Promise.all([
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
    abfragen<KopfZeile>(RECHNUNGEN, companyId, {
      wo: [
        { art: 'ab', feld: 'stornoAm', wert: tagVerschoben(von, -1) },
        { art: 'bis', feld: 'stornoAm', wert: tagVerschoben(bis, 1) },
      ],
    }),
  ]);
  const schon = new Set(nachDatum.map((k) => k.id));
  const dazu = [...nachStorno, ...nachStornorechnung].filter((k) => {
    if (schon.has(k.id)) return false;
    schon.add(k.id);
    return true;
  });
  return zusammensetzen([...nachDatum, ...dazu], companyId);
}

/**
 * Die Rechnungs- und Stornonummern desselben Jahres VOR einem Zeitraum —
 * für die Lückenprüfung an der Grenze zweier Exporte (Durchsicht 15.11.2026,
 * G8). Nur die Nummern und was es braucht, um eine Stornorechnung ihrem Tag
 * zuzuordnen; das Jahr hat so viele Rechnungen, wie es hat.
 */
export async function rechnungsnummernVorZeitraum(companyId: string, von: string): Promise<string[]> {
  const jahrBeginn = `${von.slice(0, 4)}-01-01`;
  if (von <= jahrBeginn) return [];
  const vortag = tagVerschoben(von, -1);
  const [rechnungen, stornos] = await Promise.all([
    abfragen<{ invoiceNumber: string }>(RECHNUNGEN, companyId, {
      wo: [
        { art: 'ab', feld: 'invoiceDate', wert: jahrBeginn },
        { art: 'bis', feld: 'invoiceDate', wert: vortag },
      ],
      spalten: 'id,invoice_number',
    }),
    abfragen<Pick<Invoice, 'stornoNummer' | 'stornoAm' | 'cancelledAt'>>(RECHNUNGEN, companyId, {
      wo: [
        { art: 'ab', feld: 'stornoAm', wert: tagVerschoben(jahrBeginn, -1) },
        { art: 'bis', feld: 'stornoAm', wert: tagVerschoben(von, 1) },
      ],
      spalten: 'id,storno_nummer,storno_am,cancelled_at',
    }),
  ]);
  // Der Tag der Stornorechnung zählt in Wien (`stornoBelegTag`), die Spalte steht in UTC.
  const tagIn = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date(ms));
  return [
    ...rechnungen.map((r) => r.invoiceNumber),
    ...stornos
      .filter((r) => r.stornoNummer && r.stornoAm != null && tagIn(r.stornoAm) >= jahrBeginn && tagIn(r.stornoAm) < von)
      .map((r) => r.stornoNummer!),
  ];
}

/**
 * Bestimmte Rechnungen, nach Kennung — für den Zahlungsstapel (Testbericht
 * 30.09.2026, H7 vorgebaut): eine Zahlung im Zeitraum gehört oft zu einer
 * Rechnung aus einem früheren.
 */
export async function listInvoicesByIds(companyId: string, ids: string[]) {
  const eindeutig = [...new Set(ids.filter(Boolean))];
  if (eindeutig.length === 0) return [];
  const koepfe = await abfragen<KopfZeile>(RECHNUNGEN, companyId, {
    wo: [{ art: 'in', feld: 'id', werte: eindeutig }],
  });
  return zusammensetzen(koepfe, companyId);
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
 * Alle Schreibweisen mehrerer Baustellennummern (mit und ohne „PR-“ aus
 * Altbeständen) — für die Abfrage über viele Baustellen in einem Zug.
 */
function formenAller(projectNumbers: readonly string[]): string[] {
  const formen = new Set<string>();
  for (const roh of projectNumbers) {
    const blank = (roh ?? '').trim().replace(/^PR-/i, '');
    if (!blank) continue;
    formen.add(roh.trim());
    formen.add(blank);
    formen.add(`PR-${blank}`);
  }
  return [...formen];
}

/**
 * Die Rechnungen MEHRERER Baustellen in einem Zug — für die Nachkalkulation,
 * wie `listWorkSheetsForProjects`: drei Abfragen statt drei je Baustelle.
 * Ohne Zeitgrenze und ohne Statusfilter wie `listInvoicesForProject`.
 */
export async function listInvoicesForProjects(
  companyId: string,
  projectNumbers: readonly string[],
): Promise<WithId<Invoice>[]> {
  const formen = formenAller(projectNumbers);
  if (formen.length === 0) return [];
  const koepfe = await abfragen<KopfZeile>(RECHNUNGEN, companyId, {
    wo: [{ art: 'in', feld: 'projectNumber', werte: formen }],
  });
  return zusammensetzen(koepfe, companyId);
}

/**
 * Welche dieser Handwerksscheine VERRECHNET sind: auf einer GÜLTIGEN Rechnung
 * stehen — über ALLE Rechnungen, nicht nur die geladenen —, in einer schon
 * verrechneten Pauschale stecken (Befund 09.11.2026) oder, ohne Material, an
 * einem Tag liegen, den eine gültige Rechnung schon abgerechnet hat (A1,
 * 12.11.2026).
 *
 * Gebraucht für „nicht verrechnete Leistung" (Prüflauf 25.09.2026, P2-03)
 * und die Rechnung einer Baustelle. Ein Storno zählt nicht: er gibt seine
 * Scheine frei.
 *
 * DIE REGELN STEHEN IN DER DATENBANK (Durchsicht 15.11.2026, P3):
 * `scheine_verrechnet` fragt denselben Kern wie `scheine_unverrechnet`, aus
 * dem Startseite, Rechnungen und Scheinliste ihre Liste über ALLE Scheine
 * holen. Vorher standen sie hier in vier Abfragen — und die Listen sahen nur
 * die 60 jüngsten Scheine. Eine Quelle, damit Baustellenakte und Liste nie
 * verschiedene Antworten geben.
 */
export async function scheineAufRechnung(
  companyId: string,
  scheinIds: string[],
): Promise<string[]> {
  void companyId;
  const ids = [...new Set(scheinIds.filter(Boolean))];
  if (ids.length === 0) return [];
  const { data, error } = await derClient().rpc('scheine_verrechnet', { p_ids: ids });
  if (error) throw new Error(error.message);
  return ((data ?? []) as (string | { scheine_verrechnet: string })[])
    .map((z) => (typeof z === 'string' ? z : z.scheine_verrechnet));
}

/** Ein unterschriebener Schein, der auf keiner Rechnung steht — nur der Kopf. */
export interface UnverrechneterSchein {
  id: string;
  projectNumber: string;
  customerName: string;
  datum: string;
  abrechnung: WorkSheet['abrechnung'];
}

/**
 * ALLE UNVERRECHNETEN SCHEINE DES BETRIEBS, älteste zuerst (P3,
 * `scheine_unverrechnet`). Zähler, Liste und Vier-Wochen-Schwelle kommen
 * überall aus dieser einen Antwort. Seitenweise, weil auch die Antwort einer
 * Funktion bei 1.000 Zeilen endet — eine Obergrenze wäre genau die Lücke,
 * die P3 schließt.
 */
export async function scheineUnverrechnet(seite = SEITE): Promise<UnverrechneterSchein[]> {
  type Zeile = { id: string; project_number: string; customer_name: string; datum: string; abrechnung: WorkSheet['abrechnung'] };
  const alle: Zeile[] = [];
  for (let ab = 0; ; ab += seite) {
    const { data, error } = await derClient().rpc('scheine_unverrechnet').range(ab, ab + seite - 1);
    if (error) throw new Error(error.message);
    const teil = (data ?? []) as Zeile[];
    alle.push(...teil);
    if (teil.length < seite) break;
  }
  return alle.map((z) => ({
    id: z.id, projectNumber: z.project_number, customerName: z.customer_name, datum: z.datum, abrechnung: z.abrechnung,
  }));
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
  // Auch nach der Nummer einer Stornorechnung: sie steht an der stornierten Rechnung.
  const oder = oderUeberSpalten(['invoice_number', 'storno_nummer', 'customer_name', 'project_number'], begriff);
  if (!oder) return [];
  const koepfe = await abfragen<KopfZeile>(RECHNUNGEN, companyId, {
    oder,
    sortiere: { feld: 'invoiceDate', absteigend: true },
    grenze: max,
  });
  return zusammensetzen(koepfe, companyId);
}

/** Ein Treffer im Suchfenster: nur der Kopf, ohne Positionen. */
export interface RechnungsTreffer {
  id: string;
  invoiceNumber: string;
  stornoNummer?: string | null;
  customerName: string;
  projectNumber: string;
  invoiceDate: string;
}

/**
 * RECHNUNGEN NACH NUMMER, FÜR „SUCHEN ODER SPRINGEN“ (C3, E91).
 *
 * Nur die Nummer und die Stornonummer: nach dem Kunden sucht das Fenster
 * schon unter „Kunden“ — sonst stünde zu „Huber“ jede seiner Rechnungen
 * darunter. Nur die Köpfe: fünf Treffer brauchen keine Positionen.
 */
export async function rechnungenNachNummer(
  companyId: string,
  begriff: string,
  max: number,
): Promise<RechnungsTreffer[]> {
  const oder = oderUeberSpalten(['invoice_number', 'storno_nummer'], begriff);
  if (!oder) return [];
  return abfragen<RechnungsTreffer>(RECHNUNGEN, companyId, {
    oder,
    spalten: 'id,invoice_number,storno_nummer,customer_name,project_number,invoice_date',
    sortiere: { feld: 'invoiceDate', absteigend: true },
    grenze: max,
  });
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
): Promise<WithId<Invoice>[]> {
  /*
    IN DER DATENBANK, NICHT ÜBER EINE LISTE IN DER ADRESSE (A10). Vorher
    standen die Kennungen aller Baustellen des Kunden in einer
    `or`-Zeichenkette; ab gut 220 Baustellen lehnte das Gateway die Adresse
    ab, und die Akte zeigte dauerhaft „konnte nicht geladen werden“.
    `rechnungen_des_kunden` läuft mit den Rechten des Aufrufers — derselbe
    Zeilenschutz wie bisher.
  */
  if (!KENNUNG.test(customerId)) return [];
  const { data, error } = await derClient().rpc('rechnungen_des_kunden', { p_kunde: customerId, p_grenze: RECHNUNGEN_JE_KUNDE });
  if (error) throw new Error(error.message);
  const koepfe = ((data ?? []) as Record<string, unknown>[])
    .filter((z) => z.company_id === companyId)
    .map((z) => zeileAlsObjekt<KopfZeile>(RECHNUNGEN, z));
  return zusammensetzen(koepfe, companyId);
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
    positions, discount, linkedEntries, linkedOrders, linkedWorkSheets, linkedWartungen, linkedRuestPositionen, ...roh
  } = inv;
  const kopf = {
    ...roh,
    /*
      M2: jede Rechnung dieser Fassung hält ihr Material je Ausgabe fest —
      auch eine ohne Material, denn sie deckt dann keines über ihr
      Leistungsende. Hier und nicht in der Maske, damit kein Weg zum
      Anlegen es vergisst.
    */
    materialJeAusgabe: true,
    leistungVon: leerAlsNull(roh.leistungVon),
    leistungBis: leerAlsNull(roh.leistungBis),
  };

  const belege: Record<string, string[]> = {};
  for (const [art, feld] of ABDECKUNGSARTEN) {
    const liste = { linkedEntries, linkedOrders, linkedWorkSheets, linkedWartungen, linkedRuestPositionen }[feld];
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
 *
 * DATUM UND JAHR BESTIMMT DIE DATENBANK (Durchsicht 15.11.2026, G5). Das
 * Jahr der Nummer folgt dem Rechnungsdatum, und das muss der heutige Tag in
 * Wien sein; ein Gerät mit falscher Uhr bekommt eine Absage statt einer
 * „RE-2020-…“. `datumAusdruecklich` lässt ein anderes Datum zu — nur für
 * Übernahmen und Prüfungen, die Oberfläche setzt es nie.
 */
export async function rechnungAusstellen(
  companyId: string,
  inv: Omit<NewInvoice, 'invoiceNumber'>,
  nummer: { praefix?: string; desired?: number; datumAusdruecklich?: boolean; versuch?: string },
): Promise<{ id: string; invoiceNumber: string; invoiceDate?: string; bereits?: boolean }> {
  void companyId;
  return ausstellenAufruf('rechnung_ausstellen', {
    ...anlegeDaten(inv),
    p_praefix: nummer.praefix ?? PRAEFIX_VORGABE.rechnung,
    p_wunsch: nummer.desired ?? null,
    ...(nummer.datumAusdruecklich ? { p_datum_ausdruecklich: true } : {}),
    // Die Kennung dieses Versuchs (G2) — damit lässt sich eine unterbrochene Antwort klären.
    ...(nummer.versuch ? { p_versuch: nummer.versuch } : {}),
  });
}

/**
 * Der Aufruf, der eine Rechnung entstehen lässt — mit der Unterscheidung
 * zwischen bestätigter Ablehnung und unklarer Antwort. EINE Stelle für das
 * Ausstellen und das Ersetzen (V6): zwei Fassungen liefen beim nächsten
 * Fehlerbild auseinander.
 */
async function ausstellenAufruf(
  funktion: 'rechnung_ausstellen' | 'rechnung_ersetzen',
  args: Record<string, unknown>,
): Promise<{ id: string; invoiceNumber: string; invoiceDate?: string; bereits?: boolean }> {
  const { data, error } = await derClient().rpc(funktion, args)
    .then((antwort) => antwort, () => { throw new RechnungsAntwortUnklar(); });
  if (error) {
    // SQL-Ablehnung bzw. abgewiesene Authentifizierung vor dem RPC-Aufruf.
    if (/^[0-9A-Z]{5}$/.test(error.code ?? '') || error.code === 'PGRST301' || error.code === 'PGRST302') {
      throw new Error(error.message);
    }
    throw new RechnungsAntwortUnklar();
  }
  if (!data || typeof data.id !== 'string' || !data.id.trim()
      || typeof data.invoice_number !== 'string' || !data.invoice_number.trim()) {
    throw new RechnungsAntwortUnklar();
  }
  const r = data as { id: string; invoice_number: string; invoice_date?: string; bereits?: boolean };
  return {
    id: String(r.id),
    invoiceNumber: String(r.invoice_number),
    ...(typeof r.invoice_date === 'string' ? { invoiceDate: r.invoice_date } : {}),
    ...(r.bereits === true ? { bereits: true } : {}),
  };
}

/**
 * Eine Rechnung durch eine neue ersetzen: die alte stornieren und die neue
 * ausstellen — in EINER Transaktion (Durchsicht 15.11.2026, V6/F4,
 * `public.rechnung_ersetzen`). Scheitert das Ausstellen, ist auch der Storno
 * nicht geschehen. Unklare Antworten wie beim Ausstellen; die Kennung des
 * Versuchs klärt sie (G2).
 */
export async function rechnungErsetzen(
  companyId: string,
  alt: { id: string; grund: string },
  inv: Omit<NewInvoice, 'invoiceNumber'>,
  nummer: { praefix?: string; versuch?: string },
): Promise<{ id: string; invoiceNumber: string; invoiceDate?: string; bereits?: boolean }> {
  void companyId;
  return ausstellenAufruf('rechnung_ersetzen', {
    p_alt: alt.id,
    p_grund: alt.grund,
    ...anlegeDaten(inv),
    p_praefix: nummer.praefix ?? PRAEFIX_VORGABE.rechnung,
    ...(nummer.versuch ? { p_versuch: nummer.versuch } : {}),
  });
}

/** Was die Klärung eines Erstellungsversuchs ergibt (G2). */
export type VersuchGeklaert =
  | { entstanden: true; id: string; invoiceNumber: string; invoiceDate: string }
  | { entstanden: false };

/**
 * Nach einer unterbrochenen Antwort klären, ob die Rechnung dieses Versuchs
 * entstanden ist (Durchsicht 15.11.2026, G2).
 *
 * DIE ANTWORT IST ENDGÜLTIG. Lautet sie „nicht entstanden“, hält die
 * Datenbank den Versuch fest und weist ihn ab, falls der ursprüngliche
 * Aufruf doch noch ankommt. Läuft er gerade noch, wartet die Klärung auf
 * ihn. Ohne Netz bleibt es unklar — dann wirft sie wie das Ausstellen
 * `RechnungsAntwortUnklar`, und die Ansicht versucht es später wieder.
 */
export async function rechnungVersuchKlaeren(versuch: string): Promise<VersuchGeklaert> {
  const { data, error } = await derClient().rpc('rechnung_versuch_klaeren', { p_versuch: versuch })
    .then((antwort) => antwort, () => { throw new RechnungsAntwortUnklar(); });
  if (error) {
    if (/^[0-9A-Z]{5}$/.test(error.code ?? '') || error.code === 'PGRST301' || error.code === 'PGRST302') {
      throw new Error(error.message);
    }
    throw new RechnungsAntwortUnklar();
  }
  const r = data as { entstanden?: unknown; id?: unknown; invoice_number?: unknown; invoice_date?: unknown } | null;
  if (r?.entstanden === false) return { entstanden: false };
  if (r?.entstanden === true && typeof r.id === 'string' && typeof r.invoice_number === 'string') {
    return { entstanden: true, id: r.id, invoiceNumber: r.invoice_number, invoiceDate: String(r.invoice_date ?? '') };
  }
  // Eine Antwort, die nichts sagt, ist keine Klärung.
  throw new RechnungsAntwortUnklar();
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

/** Die Ablöse eines Rücklasses durch Bankgarantie — oder `null`, um sie zurückzunehmen. */
export interface Bankgarantie {
  am: string;
  bank: string | null;
  nummer: string | null;
  bis: string | null;
}

export function bankgarantieSetzen(id: string, g: Bankgarantie | null): Promise<void> {
  return aendern(RECHNUNGEN, id, {
    ruecklassGarantieAm: g?.am ?? null,
    ruecklassGarantieBank: g?.bank?.trim() || null,
    ruecklassGarantieNr: g?.nummer?.trim() || null,
    ruecklassGarantieBis: g?.bis || null,
  });
}

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
 * Die Stornorechnung ausstellen — oder, war sie es schon, ihre Nummer holen.
 *
 * Die Nummer kommt aus dem Rechnungskreis und aus dem Jahr des Stornos; die
 * Datenbank vergibt sie (`stornorechnung_ausstellen`). Danach lässt sich der
 * Storno nicht mehr aufheben.
 */
export async function stornorechnungAusstellen(
  inv: WithId<Invoice>,
  praefix: string,
): Promise<string> {
  const { data, error } = await derClient().rpc('stornorechnung_ausstellen', {
    p_id: inv.id,
    p_praefix: praefix,
  });
  if (error) throw new Error(error.message);
  return String((data as { storno_nummer: string }).storno_nummer);
}

/** Eine gültige Schlussrechnung, neben der eine nicht abgezogene Vorrechnung steht. */
export interface SchlussOhneAbzug {
  invoiceNumber: string;
  /** Die Nummern der Anzahlungs- bzw. Teilrechnungen, die fehlen. */
  fehlend: string;
}

/**
 * Schlussrechnungen, die ihre Anzahlung nicht abgezogen haben (Testbericht
 * 30.09.2026, K2).
 *
 * Neue lässt die Datenbank nicht mehr zu; ausgestellte bleiben, wie sie
 * hinausgingen. Diese Liste macht sie vor dem Export sichtbar — berichtigt
 * wird über Storno und eine neue Schlussrechnung.
 */
export async function schlussrechnungenOhneAbzug(): Promise<SchlussOhneAbzug[]> {
  const { data, error } = await derClient().rpc('schlussrechnungen_ohne_abzug');
  if (error) throw new Error(error.message);
  return ((data ?? []) as { invoice_number: string; fehlend: string }[]).map((z) => ({
    invoiceNumber: z.invoice_number,
    fehlend: z.fehlend,
  }));
}

/**
 * Eine Mahnung festhalten — das Schreiben samt Mahnstand der Rechnung, in
 * einem Zug (`public.mahnung_festhalten`).
 *
 * Geschrieben wird NACH dem Erzeugen des Belegs, nicht davor. Scheitert das
 * PDF, ist schlimmstenfalls nichts geschehen — umgekehrt stünde die Rechnung
 * als gemahnt da, ohne dass je ein Schreiben entstanden wäre, und die
 * nächste Stufe begänne bei zwei.
 *
 * „Überfällig“ setzt die Datenbank nur aus „Offen“: bei einer angezahlten
 * Rechnung sagt „Teilbezahlt“ mehr, und den Stand bestimmen dort die
 * Zahlungseingänge.
 */
export async function mahnungFesthalten(
  id: string,
  daten: {
    stufe: number; gemahntAm: string; frist: string; spesen: number; inhalt: MahnungInhalt;
    /** Ein anderer Mahntag als heute — nur für Übernahmen und Prüfungen (G5). */
    datumAusdruecklich?: boolean;
  },
): Promise<string> {
  const { data, error } = await derClient().rpc('mahnung_festhalten', {
    p_invoice: id,
    p_stufe: daten.stufe,
    p_datum: daten.gemahntAm,
    p_frist: daten.frist,
    p_spesen: daten.spesen,
    p_inhalt: daten.inhalt,
    ...(daten.datumAusdruecklich ? { p_datum_ausdruecklich: true } : {}),
  });
  if (error) throw new Error(error.message);
  return data as string;
}

const MAHNUNGEN = 'mahnungen';

/** Die Mahnungen eines Zeitraums, nach ihrem Tag — für das Belegarchiv, ohne Grenze. */
export function listMahnungenInRange(companyId: string, von: string, bis: string) {
  return abfragen<Mahnung>(MAHNUNGEN, companyId, {
    wo: [
      { art: 'ab', feld: 'datum', wert: von },
      { art: 'bis', feld: 'datum', wert: bis },
    ],
    sortiere: { feld: 'datum' },
  });
}

/** Die Mahnungen einer Rechnung, älteste zuerst — für das erneute Laden. */
export async function listMahnungenZurRechnung(companyId: string, invoiceId: string) {
  const alle = await abfragen<Mahnung>(MAHNUNGEN, companyId, {
    wo: [{ art: 'gleich', feld: 'invoiceId', wert: invoiceId }],
    sortiere: { feld: 'datum' },
  });
  return alle.sort((x, y) => x.datum.localeCompare(y.datum) || (x.angelegtAm ?? 0) - (y.angelegtAm ?? 0));
}
