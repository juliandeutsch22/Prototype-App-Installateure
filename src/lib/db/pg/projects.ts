/**
 * Baustellen — auf Postgres.
 *
 * Zwei Firestore-Eigenheiten sind beim Umzug weggefallen, beide unten
 * benannt.
 */
import type { Project } from '@/types';
import { PRAEFIX_VORGABE } from '@/lib/praefixe';
import { BAUSTELLEN_AUSWAHL_GRENZE } from '@/lib/listengrenzen';
import { abfragen, abonnieren, anlegen, aendern, derClient, kanalHalten, loeschen, type WithId } from './kern';
import { zeileAlsObjekt } from './felder';

const BAUSTELLEN = 'projects';

/**
 * Laufende Baustellen — die Auswahlliste überall im Programm.
 *
 * Der Statusfilter läuft serverseitig; abgeschlossene Baustellen wandern gar
 * nicht erst über die Leitung. Das war schon in Firestore so und bleibt.
 */
export function listActiveProjects(companyId: string, max = BAUSTELLEN_AUSWAHL_GRENZE) {
  return abfragen<Project>(BAUSTELLEN, companyId, {
    wo: [{ art: 'in', feld: 'status', werte: ['Aktiv', 'Pausiert'] }],
    grenze: max,
  });
}

/**
 * Bestimmte Baustellen, nach Nummer.
 *
 * Die Blockbildung steht hier nicht mehr, sondern in `kern.ts`: Postgres
 * kennt die 30-Werte-Grenze von Firestore nicht, PostgREST hat dafür eine
 * Längengrenze für die Adresse — und keine Stelle hier, an der jemand die
 * Blockgrösse vergisst.
 */
export async function listProjectsByNumbers(companyId: string, numbers: string[]) {
  const eindeutig = [...new Set(numbers.filter(Boolean))];
  if (eindeutig.length === 0) return [];
  return abfragen<Project>(BAUSTELLEN, companyId, {
    wo: [{ art: 'in', feld: 'projectNumber', werte: eindeutig }],
  });
}

/**
 * Bestimmte Baustellen, nach Id.
 *
 * WARUM NICHT ÜBER DIE NUMMER. Die Projektnummer ist der Geschäftsschlüssel
 * und steht überall in der Oberfläche — aber sie ist ÄNDERBAR. Wird ein
 * Zahlendreher korrigiert, führt jeder Link auf die Akte ins Leere, der über
 * die Nummer gebaut war; die Kennung überlebt das. Eindeutig ist die Nummer
 * zwar (`projects_nummer_je_betrieb`), das macht sie aber nicht stabil.
 *
 * Die Blockbildung steht in `kern.ts`, nicht hier — siehe
 * `listProjectsByNumbers`.
 */
export async function listProjectsByIds(companyId: string, ids: string[]) {
  const eindeutig = [...new Set(ids.filter(Boolean))];
  if (eindeutig.length === 0) return [];
  return abfragen<Project>(BAUSTELLEN, companyId, {
    wo: [{ art: 'in', feld: 'id', werte: eindeutig }],
  });
}

export function listRecentProjects(companyId: string, max: number) {
  return abfragen<Project>(BAUSTELLEN, companyId, {
    sortiere: { feld: 'createdAt', absteigend: true },
    grenze: max,
  });
}

/** Baustellen, denen ein Mitarbeiter zugeordnet ist. */
export function listProjectsForEmployee(companyId: string, uid: string) {
  return abfragen<Project>(BAUSTELLEN, companyId, {
    wo: [{ art: 'enthaelt', feld: 'assignedEmployees', wert: uid }],
  });
}

export function subscribeRecentProjects(
  companyId: string,
  max: number,
  cb: (rows: WithId<Project>[]) => void,
  onError: (e: Error) => void,
) {
  return abonnieren<Project>(BAUSTELLEN, companyId, cb, onError, {
    sortiere: { feld: 'createdAt', absteigend: true },
    grenze: max,
  });
}

/**
 * Reserviert eine Baustellennummer — als VORSCHLAG, nicht als Zwang.
 *
 * WARUM ES DAS VORHER NICHT GAB: die Baustellennummer war ein Pflichtfeld,
 * das ein Mensch tippt. Automatisch entstand sie an genau einer Stelle, beim
 * Annehmen eines Angebots. Damit hätte ein einstellbarer Vorsatz für
 * Baustellen nichts bewirkt — es gäbe niemanden, der ihn anwendet.
 *
 * ÜBERSCHREIBBAR BLEIBT SIE. Manche Betriebe führen die Nummer des
 * Bauträgers oder des Architekten; ein Pflichtschema nähme ihnen das weg. Der
 * Zähler läuft dabei trotzdem weiter — sonst schlüge er beim nächsten Mal
 * dieselbe Nummer wieder vor.
 */
export async function reserveProjectNumber(
  companyId: string,
  opts: { seedFrom: number; praefix?: string },
): Promise<string> {
  void companyId;
  /*
    DAS JAHR VOM SERVER (Durchsicht 15.11.2026, G10): die Datenbank baut die
    ganze Nummer. Vorher kam das Jahr von der Uhr des Geräts — eine falsche
    ergab „B-2020-0001“. `seedFrom` liest die Datenbank längst selbst
    (`app.hoechste_lfd`); es bleibt nur im Aufruf.
  */
  void opts.seedFrom;
  const { data, error } = await derClient().rpc('naechste_belegnummer', {
    p_art: 'projects',
    p_praefix: opts.praefix ?? PRAEFIX_VORGABE.baustelle,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export type NewProject = Omit<Project, 'id' | 'companyId' | 'createdAt'>;

/**
 * EIN LEERES DATUM IST KEIN DATUM.
 *
 * DER FEHLER, DEN DAS BEHEBT — und er war schon im Betrieb, nicht neu. Ein
 * Datumsfeld, das niemand ausfüllt, liefert `''`. Postgres nimmt das für eine
 * `date`-Spalte nicht an („invalid input syntax for type date"), und die Maske
 * meldete „Die Baustelle konnte nicht gespeichert werden." Eine Baustelle OHNE
 * Beginn und Ende — der Normalfall bei einem kurzfristigen Auftrag — liess
 * sich damit gar nicht anlegen.
 *
 * Gefunden hat das der Durchklick im echten Browser. Die Ansichtstests konnten
 * es nicht finden: dort ist die Datenschicht ersetzt, und eine Nachbildung
 * nimmt jede Zeichenkette an.
 *
 * WARUM HIER UND NICHT IN DER MASKE. Beide Masken — Anlegen in der Liste,
 * Ändern in der Akte — gehen hier durch. In der Maske behoben wäre es zweimal
 * dieselbe Regel, und die dritte Maske hätte den Fehler wieder. Und der Grund
 * ist ein Postgres-Grund: Firestore nahm `''` klaglos an.
 *
 * Die App-Typen sagen ohnehin `startDate?: string` — „nicht angegeben" heisst
 * dort `undefined`, nie die leere Zeichenkette.
 */
const DATUMSFELDER = ['startDate', 'endDate'] as const;

export function createProject(companyId: string, p: NewProject) {
  const rein = { ...p };
  // Weglassen: `anlegen` überspringt `undefined`, die Spalte bleibt leer.
  for (const feld of DATUMSFELDER) if (rein[feld] === '') delete rein[feld];
  return anlegen(BAUSTELLEN, companyId, rein);
}

/**
 * Was beim Ändern einer Baustelle mitgeschickt wird.
 *
 * ABRECHNUNGSART UND STUNDENBUDGET LASSEN SICH AUSDRÜCKLICH LEEREN (`null`).
 * Gelesen heißen sie leer „nicht festgelegt“ bzw. „kein Budget“ und sind
 * dann `undefined` — beim Ändern heißt `undefined` aber „nicht
 * mitgeschickt“ und lässt die Spalte stehen (`objektAlsZeile`). So meldete
 * die Akte „Baustelle gespeichert“, und das geleerte Budget stand weiter in
 * der Datenbank. `null` trägt die Absicht „leeren“ bis in die Zeile; wer ein
 * Feld weglässt, ändert es weiterhin nicht.
 */
export type ProjektAenderung = Omit<Partial<Project>, 'billingMode' | 'estimatedHours'> & {
  billingMode?: Project['billingMode'] | null;
  estimatedHours?: number | null;
};

export function updateProject(id: string, data: ProjektAenderung) {
  /*
    BEIM ÄNDERN REICHT WEGLASSEN NICHT. Wer ein eingetragenes Datum wieder
    LEERT, will es los sein — ein weggelassenes Feld bliebe in der Datenbank
    stehen, und die Baustelle behielte ein Enddatum, das gerade gelöscht
    wurde. Deshalb `null`: das heisst „diese Spalte leeren".
  */
  const rein: Record<string, unknown> = { ...data };
  for (const feld of DATUMSFELDER) if (rein[feld] === '') rein[feld] = null;
  return aendern(BAUSTELLEN, id, rein as Partial<Project>);
}

/**
 * Die Nummer einer Baustelle ändern — mit allem, was an ihr hängt.
 *
 * Buchungen, Einsätze, Rüstlisten, Schein-Entwürfe, Anforderungen, Angebote
 * und Wartungen tragen die Nummer als Text; ein einfaches `update` der
 * Baustelle liesse sie auf der alten stehen. Die Datenbankfunktion zieht
 * alles in EINEM Schritt nach — oder lehnt mit Grund ab, sobald die Nummer
 * auf einer Rechnung oder einem unterschriebenen Schein steht.
 */
export async function baustelleUmnummern(id: string, neu: string): Promise<void> {
  const { error } = await derClient().rpc('baustelle_umnummern', {
    p_projekt: id,
    p_neu: neu,
  });
  if (error) throw new Error(error.message);
}

export function deleteProject(id: string) {
  return loeschen(BAUSTELLEN, id);
}

/**
 * Baustellen suchen — serverseitig, mit Treffern in der Wortmitte.
 *
 * Dieselbe Narbe wie bei den Kunden: unter Firestore lud die Ansicht die
 * jüngsten paar hundert und filterte im Browser. Eine Baustelle aus dem
 * Vorjahr war damit unauffindbar, ohne dass irgendwo stand, warum.
 */
export function searchProjects(
  companyId: string, begriff: string, max = 300,
): Promise<WithId<Project>[]> {
  return abfragen<Project>(BAUSTELLEN, companyId, {
    suche: { spalten: ['project_number', 'customer_name', 'bezeichnung', 'address'], begriff },
    sortiere: { feld: 'projectNumber', absteigend: true },
    grenze: max,
  });
}

/** Was die Akte über das Material einer Baustelle zeigt (E84) — gezählt in der Datenbank. */
export interface Materialstand {
  angefordert: number;
  abholbereit: number;
  abgeholt: number;
  zurueck: number;
  zuletzt: string | null;
  scheineMitMaterial: number;
  positionen: number;
}

/**
 * Der Materialstand einer Baustelle (`baustelle_materialstand`). `null`, wenn
 * die Rolle die Anforderungen anderer nicht lesen darf — die Funktion gibt
 * dann nichts zurück, und „nichts“ ist nicht „null Anforderungen“.
 */
export async function baustelleMaterialstand(companyId: string, projectNumber: string): Promise<Materialstand | null> {
  type Zeile = { angefordert: number; abholbereit: number; abgeholt: number; zurueck: number; zuletzt: string | null; scheine_mit_material: number; positionen: number };
  const { data, error } = await derClient().rpc('baustelle_materialstand', { p_company: companyId, p_projekt: projectNumber });
  if (error) throw new Error(error.message);
  const z = ((data ?? []) as Zeile[])[0];
  if (!z) return null;
  return {
    angefordert: Number(z.angefordert) || 0,
    abholbereit: Number(z.abholbereit) || 0,
    abgeholt: Number(z.abgeholt) || 0,
    zurueck: Number(z.zurueck) || 0,
    zuletzt: z.zuletzt,
    scheineMitMaterial: Number(z.scheine_mit_material) || 0,
    positionen: Number(z.positionen) || 0,
  };
}

/**
 * Was an einer Baustelle hängt (`baustelle_verwendung`) — dieselbe Zählung,
 * mit der die Rücknahme einer Annahme zwischen Löschen und Abschließen
 * entscheidet (A1). Der Löschdialog nennt damit den wahren Grund und den Weg.
 */
export interface BaustellenVerwendung {
  zeitbuchungen: number;
  einsaetze: number;
  scheine: number;
  rechnungen: number;
  anforderungen: number;
  ruestlisten: number;
  dokumente: number;
  /** Gehen beim Löschen mit (`on delete cascade`). */
  termine: number;
  /** Nachrichten im Thread der Baustelle — gehen beim Löschen mit. */
  nachrichten: number;
  angebote: { id: string; nummer: string; status: string }[];
}

export async function baustelleVerwendung(id: string): Promise<BaustellenVerwendung> {
  const { data, error } = await derClient().rpc('baustelle_verwendung', { p_projekt: id });
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  const n = (k: string) => Number(d[k]) || 0;
  return {
    zeitbuchungen: n('zeitbuchungen'),
    einsaetze: n('einsaetze'),
    scheine: n('scheine'),
    rechnungen: n('rechnungen'),
    anforderungen: n('anforderungen'),
    ruestlisten: n('ruestlisten'),
    dokumente: n('dokumente'),
    termine: n('termine'),
    nachrichten: n('nachrichten'),
    angebote: (Array.isArray(d.angebote) ? d.angebote : []).map((a: Record<string, unknown>) => ({
      id: String(a.id), nummer: String(a.nummer ?? ''), status: String(a.status ?? ''),
    })),
  };
}

/**
 * Die laufenden Baustellen EINES Kunden, die jüngsten zuerst — für die
 * Suche nach einer Baustelle (A3: Nachtrag), bevor jemand tippt. Mit Grenze:
 * mehr findet die Suche.
 */
export function listLaufendeDesKunden(companyId: string, customerId: string, max: number) {
  return abfragen<Project>(BAUSTELLEN, companyId, {
    wo: [
      { art: 'gleich', feld: 'customerId', wert: customerId },
      { art: 'in', feld: 'status', werte: ['Aktiv', 'Pausiert'] },
    ],
    sortiere: { feld: 'createdAt', absteigend: true },
    grenze: max,
  });
}

/**
 * Was vor dem Abschließen einer Baustelle offen ist (A11, F1) — je Art
 * gezählt in der Datenbank (`baustelle_abschluss_lage`). Rechnungsangaben
 * sind `null`, wenn die Rolle die Rechnungen dieser Baustelle nicht liest:
 * „nicht einsehbar“ ist nicht „nichts offen“.
 */
export interface AbschlussLage {
  status: Project['status'];
  kommendeEinsaetze: number;
  /** `JJJJ-MM-TT` */
  naechsterEinsatz: string | null;
  scheinEntwuerfe: number;
  offeneAnforderungen: number;
  unverrechneteScheine: number | null;
  unverrechneteMinuten: number | null;
  unverrechnetesMaterial: number | null;
  offeneRechnungen: number | null;
}

function lageLesen(d: Record<string, unknown>): AbschlussLage {
  const n = (k: string) => Number(d[k]) || 0;
  const vielleicht = (k: string) => (d[k] === null || d[k] === undefined ? null : Number(d[k]) || 0);
  return {
    status: d.status as Project['status'],
    kommendeEinsaetze: n('kommende_einsaetze'),
    naechsterEinsatz: typeof d.naechster_einsatz === 'string' ? d.naechster_einsatz : null,
    scheinEntwuerfe: n('schein_entwuerfe'),
    offeneAnforderungen: n('offene_anforderungen'),
    unverrechneteScheine: vielleicht('unverrechnete_scheine'),
    unverrechneteMinuten: vielleicht('unverrechnete_minuten'),
    unverrechnetesMaterial: vielleicht('unverrechnetes_material'),
    offeneRechnungen: vielleicht('offene_rechnungen'),
  };
}

export async function baustelleAbschlussLage(id: string): Promise<AbschlussLage> {
  const { data, error } = await derClient().rpc('baustelle_abschluss_lage', { p_projekt: id });
  if (error) throw new Error(error.message);
  return lageLesen((data ?? {}) as Record<string, unknown>);
}

/** Abschließen — kommende Einsätze halten es auf (die Datenbank sagt, welche). */
export async function baustelleAbschliessen(id: string): Promise<AbschlussLage> {
  const { data, error } = await derClient().rpc('baustelle_abschliessen', { p_projekt: id });
  if (error) throw new Error(error.message);
  return lageLesen((data ?? {}) as Record<string, unknown>);
}

/** Die Baustellenliste aus der Datenbank (`baustellen_liste`): je Statusgruppe Zahl und gezeigte Seite. */
export interface BaustellenListe {
  gruppen: { status: string; anzahl: number; zeilen: WithId<Project>[] }[];
  aktiv: number;
  ende: number;
  gesamt: number;
  /** Die Nummern der 300 jüngsten — für den Vorschlag der nächsten Nummer. */
  neuesteNummern: string[];
}

/**
 * NUR, WAS DIE LISTE ZEIGT (Durchsicht 15.11.2026, Budget B3): vorher die
 * jüngsten 300 als Live-Liste und alle laufenden (zusammen 720 Zeilen), um im
 * Browser zu filtern, zu suchen, zu gruppieren und zu zählen. Die Datenbank
 * tut das nach denselben Regeln über alle und gibt je Gruppe die ersten
 * `anzahl[Status]`, neueste zuerst.
 */
export async function baustellenListe(f: {
  heute: string;
  status: 'offen' | 'archiv' | 'alle';
  filter?: string | null;
  nummern?: readonly string[] | null;
  meine?: boolean;
  begriff?: string;
  anzahl: Record<string, number>;
}): Promise<BaustellenListe> {
  const { data, error } = await derClient().rpc('baustellen_liste', {
    p_heute: f.heute,
    p_status: f.status,
    p_filter: f.filter || null,
    p_nummern: f.nummern ? [...f.nummern] : null,
    p_meine: !!f.meine,
    p_begriff: f.begriff ?? '',
    p_anzahl: f.anzahl,
  });
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as { gruppen?: { status: string; anzahl: number; zeilen: Record<string, unknown>[] }[]; aktiv?: number; ende?: number; gesamt?: number; neueste_nummern?: string[] };
  return {
    gruppen: (d.gruppen ?? []).map((g) => ({
      status: g.status,
      anzahl: Number(g.anzahl),
      zeilen: (g.zeilen ?? []).map((z) => zeileAlsObjekt<WithId<Project>>(BAUSTELLEN, z)),
    })),
    aktiv: Number(d.aktiv ?? 0),
    ende: Number(d.ende ?? 0),
    gesamt: Number(d.gesamt ?? 0),
    neuesteNummern: d.neueste_nummern ?? [],
  };
}

/** Budgetstand über alle aktiven Baustellen mit Budget (`baustellen_budget_lage`) — nur für die Leitung. */
export async function baustellenBudgetLage(abProzent: number): Promise<{ ueber: number; nah: number; nummern: string[] }> {
  const { data, error } = await derClient().rpc('baustellen_budget_lage', { p_ab: abProzent });
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as { ueber?: number; nah?: number; nummern?: string[] };
  return { ueber: Number(d.ueber ?? 0), nah: Number(d.nah ?? 0), nummern: d.nummern ?? [] };
}

/** Meldet Änderungen an den Baustellen — gebündelt, auch nach jedem Wiederaufbau des Kanals. */
export function baustellenBeobachten(companyId: string, beiAenderung: () => void): () => void {
  let geplant: ReturnType<typeof setTimeout> | undefined;
  const bald = () => {
    if (geplant) return;
    geplant = setTimeout(() => {
      geplant = undefined;
      beiAenderung();
    }, 1000);
  };
  const stopp = kanalHalten({ tabelle: BAUSTELLEN, filter: `company_id=eq.${companyId}`, beiAenderung: bald, beiBereit: bald, client: derClient() });
  return () => {
    if (geplant) clearTimeout(geplant);
    stopp();
  };
}
