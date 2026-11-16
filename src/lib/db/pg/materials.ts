/**
 * Materialstamm — auf Postgres.
 */
import type { Lagerbewegung, Material } from '@/types';
import { KATALOG_GRENZE } from '@/lib/listengrenzen';
import { abfragen, abonnieren, anlegen as kernAnlegen, aendern, loeschen, derClient, kanalHalten, SEITE, type WithId } from './kern';
import { zeileAlsObjekt } from './felder';
import { ohneJoker } from './suche';
import { mitNummern, nummernTreffer, type MitNummer } from './nummernSuche';

const MATERIAL = 'materials';

/*
  KEIN `orderBy` ZUR GRENZE — geerbt aus der Firestore-Zeit und hier aus einem
  anderen Grund weiterhin richtig.

  Dort lieferte eine Sortierung ausschliesslich Dokumente, die das Feld
  ueberhaupt hatten; ein importierter Artikel ohne Namen waere lautlos aus dem
  Katalog verschwunden. Postgres sortiert `null` einfach mit, das Problem gibt
  es nicht mehr. Sortiert wird trotzdem in den Ansichten: sie tun es ohnehin
  alle, und eine Sortierung ueber 500.000 Datanorm-Artikel nur zum Abschneiden
  waere Arbeit fuer nichts.
*/
export function subscribeMaterials(
  companyId: string,
  cb: (rows: WithId<Material>[]) => void,
  onError: (e: Error) => void,
  max = KATALOG_GRENZE,
) {
  return abonnieren<Material>(MATERIAL, companyId, cb, onError, { grenze: max });
}

/**
 * Nur die im Lager geführten Artikel, live — für die Lagerliste.
 *
 * Bis 18.10.2026 holte das Lager den ganzen Katalog (bis zur Grenze) und
 * filterte im Browser. Nach einem DATANORM-Import fehlten dadurch die
 * Lagerartikel, die nicht unter den ersten tausend Katalogzeilen lagen —
 * und es kamen tausend Zeilen für ein paar Dutzend Regalplätze.
 */
export function subscribeLagerartikel(
  companyId: string,
  cb: (rows: WithId<Material>[]) => void,
  onError: (e: Error) => void,
  max = KATALOG_GRENZE,
) {
  return abonnieren<Material>(MATERIAL, companyId, cb, onError, {
    wo: [{ art: 'gleich', feld: 'lagerartikel', wert: true }],
    grenze: max,
  });
}

/** Wie viele Artikel der Katalog hat — gezählt, nicht geholt. */
export async function katalogAnzahl(companyId: string): Promise<number> {
  const { count, error } = await derClient()
    .from(MATERIAL)
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Der Anfang des Katalogs nach Namen, auf Wunsch gesucht — mit der Zahl
 * aller Treffer (Material anfordern, 18.10.2026).
 *
 * Geholt wird immer ab dem ersten Artikel bis `anzahl`: „und N weitere“
 * vergrössert die Seite, statt Stücke anzuhängen. So bleibt die Liste nach
 * jedem Neuladen (eine Änderung im Katalog, ein Wiederaufbau) in sich
 * stimmig, ohne Lücken und Doppel an einer Stückgrenze. Nach der Kennung
 * als zweitem Schlüssel, damit gleichnamige Artikel nicht springen.
 *
 * `nurAnforderbar` (Material anfordern, Prüfbericht 10.11.2026): ohne
 * ausgelaufene Artikel — was der Großhändler nicht mehr führt, wird nicht
 * neu angefordert, wie bei den übrigen Erfassungen. AUSSER es liegt noch im
 * Lager: diesen Rest aufzubrauchen ist gerade erwünscht. Der Katalog und
 * das Lager zeigen ausgelaufene Artikel weiter (mit Kennzeichen).
 */
export async function katalogSeite(
  companyId: string,
  begriff: string,
  anzahl: number,
  wie: { nurAnforderbar?: boolean } = {},
): Promise<{ zeilen: MitNummer<WithId<Material>>[]; gesamt: number }> {
  void companyId;
  // M03a: auch über die Nummer eines Großhändlers und die EAN (`nummernSuche.ts`).
  const nummern = await nummernTreffer(begriff);
  const { zeilen, gesamt } = await katalogSuchen(begriff, Math.max(1, anzahl), {
    ids: [...nummern.keys()],
    filter: wie.nurAnforderbar ? 'anforderbar' : 'alle',
    zaehlen: true,
  });
  return { zeilen: mitNummern(zeilen, nummern), gesamt: gesamt ?? zeilen.length };
}

/**
 * DIE SUCHE ÜBER DIE DATENBANKFUNKTION `katalog_suchen` (L3, Durchsicht
 * 15.11.2026) — nicht als `or(…ilike…)` über PostgREST.
 *
 * Mit Zeilenschutz darf Postgres `ilike` nicht über einen Index auswerten
 * (der Operator ist nicht „leakproof“): bei 120.000 Artikeln lief jede Suche
 * als Durchlauf, 285 ms und noch einmal 253 ms fürs Zählen, `katalogNachNamen`
 * 2,1 s. Die Funktion prüft den Betrieb selbst und nimmt die Trigramm-Indizes
 * je Spalte — seltener Begriff samt Zählung unter 3 ms. Gesucht wird wie
 * vorher (`%begriff%` in Name, Artikelnummer, Kategorie, dazu `ids`), sortiert
 * nach Name und Kennung.
 */
async function katalogSuchen(
  begriff: string,
  anzahl: number,
  wie: { ids?: string[]; filter?: 'alle' | 'anforderbar' | 'aktiv'; kategorie?: boolean; zaehlen?: boolean } = {},
): Promise<{ zeilen: WithId<Material>[]; gesamt: number | null }> {
  const { data, error } = await derClient().rpc('katalog_suchen', {
    p_begriff: begriff,
    p_anzahl: anzahl,
    p_ids: wie.ids ?? [],
    p_filter: wie.filter ?? 'alle',
    p_kategorie: wie.kategorie ?? true,
    p_zaehlen: wie.zaehlen ?? false,
  });
  if (error) throw new Error(error.message);
  const antwort = (data ?? { zeilen: [], gesamt: null }) as { zeilen: Record<string, unknown>[] | null; gesamt: number | string | null };
  return {
    zeilen: (antwort.zeilen ?? []).map((z) => zeileAlsObjekt<WithId<Material>>(MATERIAL, z)),
    gesamt: antwort.gesamt == null ? null : Number(antwort.gesamt),
  };
}

/** Die Suche im Katalog für die Einkaufsliste — siehe `artikelSuchen` in `einkauf.ts`. */
export async function katalogSuchenOhneAusgelaufene(
  begriff: string,
  anzahl: number,
  ids: string[],
): Promise<WithId<Material>[]> {
  return (await katalogSuchen(begriff, anzahl, { ids, filter: 'aktiv', kategorie: false })).zeilen;
}

/**
 * Meldet, dass sich im Katalog etwas geändert hat — und wenn der Kanal
 * (wieder) steht. Für Listen, die ihre Zeilen selbst holen: sie holen dann
 * neu, statt den ganzen Katalog live mitzuführen. Gebündelt auf höchstens
 * eine Meldung je Sekunde: ein Import schickt zehntausende Änderungen, und
 * jede offene Seite holte sonst bei jeder neu.
 */
export function katalogBeobachten(companyId: string, beiAenderung: () => void): () => void {
  let geplant: ReturnType<typeof setTimeout> | undefined;
  const bald = () => {
    if (geplant) return;
    geplant = setTimeout(() => {
      geplant = undefined;
      beiAenderung();
    }, 1000);
  };
  const stopp = kanalHalten({
    tabelle: MATERIAL,
    filter: `company_id=eq.${companyId}`,
    beiAenderung: bald,
    beiBereit: bald,
    client: derClient(),
  });
  return () => {
    if (geplant) clearTimeout(geplant);
    stopp();
  };
}

export type NewMaterial = Pick<Material, 'name' | 'category' | 'stock' | 'articleNumber' | 'unit'>;

export function createMaterial(companyId: string, m: NewMaterial) {
  return kernAnlegen(MATERIAL, companyId, m);
}

export function updateMaterial(id: string, data: Partial<Material>) {
  return aendern(MATERIAL, id, data);
}

export function deleteMaterial(id: string) {
  return loeschen(MATERIAL, id);
}

/** Was an einem Artikel hängt — für die Rückfrage vor dem Löschen (M1). */
export interface ArtikelVerwendung {
  /** Die Gründe in Worten, wie die Datenbank sie beim Löschen nennt; leer heißt: löschbar. */
  imWeg: string[];
  ausgelaufen: boolean;
  /** Vom Betrieb selbst auslaufen gelassen (nicht vom Katalog des Großhändlers). */
  vonHand: boolean;
}

/**
 * Fragt die Datenbank, was einem Löschen im Weg stünde (M1, 15.11.2026).
 *
 * DIESELBE STELLE WIE DIE SPERRE (`app.artikel_verwendung`): die Rückfrage
 * verspricht damit nichts, was das Löschen danach nicht hält. Die Sätze
 * kommen fertig aus der Datenbank, damit sie an beiden Stellen gleich lauten.
 *
 * Ein lesender Aufruf (`stable`, `LESENDE_FUNKTIONEN`): auf einer toten
 * Verbindung endet er nach der Stillstandsfrist als Netzfehler, statt die
 * Rückfrage ewig auf „wird geprüft“ stehen zu lassen. Die Rückfrage bietet
 * dann Löschen an — die Sperre in der Datenbank prüft ohnehin selbst.
 */
export async function artikelVerwendung(materialId: string): Promise<ArtikelVerwendung> {
  const { data, error } = await derClient().rpc('artikel_verwendung', { p_material: materialId });
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as { im_weg?: unknown; ausgelaufen?: unknown; von_hand?: unknown };
  return {
    imWeg: Array.isArray(d.im_weg) ? d.im_weg.map(String) : [],
    ausgelaufen: d.ausgelaufen === true,
    vonHand: d.von_hand === true,
  };
}

/**
 * KOMMISSIONSWARE, DIE SCHON IM LAGER STEHT (M6, 16.11.2026). Bis dahin
 * machte jede Lieferung für eine Anforderung den Artikel für immer zum
 * Lagerartikel. Die Datenbank nennt genau die, die nie anders als so ins
 * Lager kamen (ohne Bestand, ohne Mindest- und Sollmenge); mit `ids` nimmt
 * sie diese aus dem Lager — was inzwischen Bestand bekam, bleibt.
 */
export async function kommissionsartikelImLager(ids?: readonly string[]): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await derClient().rpc(
    'kommissionsartikel_im_lager',
    ids ? { p_ausfuehren: true, p_ids: [...ids] } : { p_ausfuehren: false },
  );
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string; name: string }>).map((z) => ({ id: String(z.id), name: String(z.name) }));
}

/**
 * Auslaufen lassen (`aus = true`) oder wieder aufnehmen (M1).
 *
 * Über eine Datenbankfunktion, nicht über `updateMaterial`: nur sie setzt
 * den Merker „von Hand“, an dem der Import des Großhändlers erkennt, dass er
 * den Artikel nicht zurückholen darf.
 */
export async function artikelAuslaufen(materialId: string, aus: boolean): Promise<void> {
  const { error } = await derClient().rpc('artikel_auslaufen', { p_material: materialId, p_aus: aus });
  if (error) throw new Error(error.message);
}

/**
 * Lageranpassung. `delta < 0` ist ein Abgang, `delta > 0` eine Rückbuchung.
 *
 * Als Datenbankfunktion, nicht als Lesen-Rechnen-Schreiben: zwei gleichzeitige
 * Abgänge würden sonst denselben Ausgangswert lesen und einer ginge verloren.
 * Bei null ist Schluss — ein negativer Lagerstand ist keine Aussage über ein
 * Lager, sondern ein Zeichen, dass die Buchführung nicht mehr stimmt.
 */
export async function adjustStock(materialId: string, delta: number) {
  if (!materialId) return; // Ad-hoc-Material ohne Katalogeintrag
  const { error } = await derClient().rpc('bestand_anpassen', {
    p_material: materialId,
    p_delta: delta,
  });
  if (error) throw new Error(error.message);
}

/**
 * Wareneingang mit Lieferant, Lieferschein und Bezug (Testbericht 30.09.2026,
 * M29). Zurück kommt der neue Bestand.
 *
 * `vorgang`: die Kennung des Vorgangs nach dem Schreibbefehls-Vertrag (E58),
 * EINMAL je geöffnetem Dialog. Ein zweiter Tipp nach einem Netzabbruch bucht
 * so nicht ein zweites Mal ein; mit anderen Angaben weist die Datenbank ihn
 * ab, statt still den ersten Stand zu melden.
 */
export async function lagerEingang(eingang: {
  materialId: string; menge: number; lieferant: string; lieferschein?: string; bezug?: string; ortId?: string;
  vorgang?: string;
  /**
   * Die offenen Bestellungen, die diese Lieferung erledigt (M12) — in der
   * Reihenfolge, in der die Menge sie füllt. Ohne: nur der Bestand, wie bisher.
   */
  bestellungen?: readonly string[];
}): Promise<number> {
  /*
    DER ORT NUR, WENN EINER GEWÄHLT IST (M04a): ins Hauptlager geht derselbe
    Aufruf wie vor den Lagerorten.
  */
  const { data, error } = await derClient().rpc('lager_eingang', {
    p_material: eingang.materialId,
    p_menge: eingang.menge,
    p_lieferant: eingang.lieferant,
    p_lieferschein: eingang.lieferschein ?? null,
    p_bezug: eingang.bezug ?? null,
    ...(eingang.ortId ? { p_ort: eingang.ortId } : {}),
    ...(eingang.vorgang ? { p_vorgang: eingang.vorgang } : {}),
    ...(eingang.bestellungen?.length ? { p_bestellungen: eingang.bestellungen } : {}),
  });
  if (error) {
    // 23505: dieselbe Kennung mit anderen Angaben — der erste Eingang ist schon gebucht.
    if (error.code === '23505') {
      throw new Error('Dieser Wareneingang ist schon gebucht — mit anderen Angaben. Bitte das Bewegungsprotokoll ansehen, bevor erneut gebucht wird.');
    }
    throw new Error(error.message);
  }
  return Number(data);
}

/**
 * Verkaufspreise aus Einkaufspreis und Aufschlag setzen — nur, wo keiner
 * steht (M31). Zurück kommt, wie viele gesetzt wurden und wie viele ohne
 * Einkaufspreis oder ohne Aufschlag offen blieben.
 */
export async function verkaufspreiseVorschlagen(): Promise<{ gesetzt: number; ohneEinkauf: number; ohneAufschlag: number }> {
  const { data, error } = await derClient().rpc('verkaufspreise_vorschlagen');
  if (error) throw new Error(error.message);
  const d = data as { gesetzt: number; ohneEinkauf: number; ohneAufschlag: number };
  return { gesetzt: Number(d.gesetzt), ohneEinkauf: Number(d.ohneEinkauf), ohneAufschlag: Number(d.ohneAufschlag) };
}

/** Inventur: der gezählte Bestand, mit Grund (M28). */
export async function lagerInventur(materialId: string, bestand: number, grund: string, ortId?: string): Promise<number> {
  const { data, error } = await derClient().rpc('lager_inventur', {
    p_material: materialId, p_bestand: bestand, p_grund: grund,
    ...(ortId ? { p_ort: ortId } : {}),
  });
  if (error) throw new Error(error.message);
  return Number(data);
}

/** Das Bewegungsprotokoll eines Artikels, jüngste zuerst (M28). */
export async function listLagerbewegungen(materialId: string, max = 200): Promise<Lagerbewegung[]> {
  const { data, error } = await derClient()
    .from('lagerbewegungen')
    .select('*')
    .eq('material_id', materialId)
    .order('created_at', { ascending: false })
    .limit(max);
  if (error) throw new Error(error.message);
  return (data ?? []).map((z) => zeileAlsObjekt<WithId<Lagerbewegung>>('lagerbewegungen', z));
}

/** Was je Artikel frei ist (Testbericht 30.09.2026, M32, G19). */
export interface LagerStand {
  bestand: number;
  /** Zugesagte, noch nicht abgeholte Anforderungen. */
  zugesagt: number;
  /** Auf Rüstlisten ab heute geplant. */
  geplant: number;
  /** Bestand minus beides — unter null heisst „fehlt“. */
  frei: number;
}

const IST_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Das Freie der genannten Artikel.
 *
 * NACH DEN ARTIKELN, DIE DIE ANSICHT ZEIGT, nicht nach allen: PostgREST
 * deckelt auch die Antwort einer Funktion still bei 1000 Zeilen, und mit
 * einem eingespielten Großhandelskatalog fehlten sonst beliebige Artikel
 * (Analyse 09.10.2026). Gefragt wird in Portionen unter der Grenze; jede
 * Portion antwortet mit höchstens so vielen Zeilen, wie sie Artikel nennt.
 *
 * Eine Id, die kein Artikel sein kann (Vorschau, frei getippte Zeile), wird
 * übergangen — sie liesse sonst die ganze Portion scheitern.
 */
export async function lagerFrei(ids: readonly string[], seite = SEITE): Promise<Map<string, LagerStand>> {
  const gefragt = [...new Set(ids.filter((id) => IST_UUID.test(id)))];
  const portionen: string[][] = [];
  for (let von = 0; von < gefragt.length; von += seite) portionen.push(gefragt.slice(von, von + seite));
  const antworten = await Promise.all(portionen.map(async (p_ids) => {
    const { data, error } = await derClient().rpc('lager_frei', { p_ids });
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<Record<string, unknown>>;
  }));
  const karte = new Map<string, LagerStand>();
  for (const z of antworten.flat()) {
    karte.set(String(z.material_id), {
      bestand: Number(z.bestand),
      zugesagt: Number(z.zugesagt),
      geplant: Number(z.geplant),
      frei: Number(z.frei),
    });
  }
  return karte;
}

/**
 * Alle Artikel, die der Betrieb im Lager führt — ohne die Grenze des
 * Katalogs. Die Startseite sucht darunter die knappen; mit einem
 * eingespielten Großhandelskatalog standen sie sonst nicht unter den ersten
 * 1.000 Artikeln. Ein Katalogimport führt nichts im Lager (`lagerartikel`
 * entsteht erst mit Bestand), die Menge wächst mit dem Regal.
 */
export function listLagerartikel(companyId: string) {
  return abfragen<Material>(MATERIAL, companyId, { wo: [{ art: 'gleich', feld: 'lagerartikel', wert: true }] });
}

export function listMaterials(companyId: string, max = KATALOG_GRENZE) {
  return abfragen<Material>(MATERIAL, companyId, { grenze: max });
}

/**
 * Artikel aus dem Katalog suchen — auf dem Server, nach Name, Artikelnummer
 * und Kategorie (M18). Ein eingespielter Großhandelskatalog hat leicht
 * zehntausende Artikel; geladen wird davon nur, was zur Suche passt.
 */
export async function sucheKatalog(
  companyId: string,
  begriff: string,
  max = 20,
): Promise<MitNummer<WithId<Material>>[]> {
  // M03a: auch über die Nummer eines Großhändlers und die EAN (`nummernSuche.ts`).
  void companyId;
  const nummern = await nummernTreffer(begriff, max);
  const { zeilen } = await katalogSuchen(begriff, Math.max(1, max), { ids: [...nummern.keys()] });
  return mitNummern(zeilen, nummern);
}

/** So viele Namen je Anfrage — `katalog_nach_namen` nimmt höchstens 200. */
const NAMEN_JE_ANFRAGE = 100;

/**
 * DIE KATALOGARTIKEL ZU GENANNTEN NAMEN (19.10.2026) — für die Preise auf
 * der Rechnung und in der Nachkalkulation.
 *
 * Material steht auf dem Schein mit seinem NAMEN, nicht mit einer Kennung;
 * Preis und Einheit schlägt die App über den Namen nach. Bis hierher holte
 * sie dafür den Katalog bis zur Grenze von tausend Artikeln: nach einem
 * DATANORM-Import fand ein Artikel dahinter seinen Preis nicht und stand
 * als „ohne Preis“ da. Jetzt kommen genau die Artikel, deren Namen passen.
 *
 * DAS MUSTER IST WEITER ALS DER VERGLEICH: ohne Rücksicht auf Gross- und
 * Kleinschreibung, Leerräume im Namen als beliebige Zeichen. Die Ansicht
 * vergleicht danach genau, wie bisher (`normName`); hier darf nur nichts
 * fehlen, was dort passen würde.
 */
export async function katalogNachNamen(companyId: string, namen: readonly string[]): Promise<WithId<Material>[]> {
  const muster = [...new Set(
    namen
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => n.split(/\s+/).map(ohneJoker).join('%')),
  )];
  void companyId;
  const teile: string[][] = [];
  for (let i = 0; i < muster.length; i += NAMEN_JE_ANFRAGE) teile.push(muster.slice(i, i + NAMEN_JE_ANFRAGE));
  // Über `katalog_nach_namen` (L3): je Muster über den Index statt eines Durchlaufs je Anfrage.
  const treffer = await Promise.all(
    teile.map(async (teil) => {
      const { data, error } = await derClient().rpc('katalog_nach_namen', { p_muster: teil });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((z) => zeileAlsObjekt<WithId<Material>>(MATERIAL, z));
    }),
  );
  return eindeutig(treffer.flat());
}

/** Die Katalogartikel zu Kennungen — für Angebotszeilen, die ihren Artikel kennen. */
export async function katalogNachIds(companyId: string, ids: readonly string[]): Promise<WithId<Material>[]> {
  const eindeutigeIds = [...new Set(ids.filter(Boolean))];
  if (eindeutigeIds.length === 0) return [];
  return eindeutig(await abfragen<Material>(MATERIAL, companyId, { wo: [{ art: 'in', feld: 'id', werte: eindeutigeIds }] }));
}

/**
 * Jeder Artikel einmal, nach Kennung geordnet. Heissen zwei Artikel gleich,
 * gewinnt beim Nachschlagen der letzte — mit fester Ordnung bei jedem Laden
 * derselbe, nicht der, den die Datenbank zufällig zuletzt liefert.
 */
function eindeutig(zeilen: WithId<Material>[]): WithId<Material>[] {
  const nachId = new Map(zeilen.map((m) => [m.id, m]));
  return [...nachId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * DIE KNAPPEN LAGERARTIKEL, AUS DER DATENBANK (Ladezeit, 19.10.2026).
 *
 * Bis hierher holte die Startseite alle Lagerartikel und danach ihr Freies,
 * um darunter die knappen zu finden — vier Wege durchs Netz hintereinander,
 * mit jedem Artikel mehr länger. `lager_knapp` rechnet dieselbe Regel wie die
 * Lagerliste (`istKnapp`) in der Datenbank und gibt nur die knappen zurück.
 * Seitenweise, weil auch die Antwort einer Funktion bei 1.000 Zeilen endet.
 */
export async function lagerKnapp(
  grenze: number,
  seite = SEITE,
): Promise<{ id: string; name: string; unit?: string; mindestmenge: number | null; frei: number }[]> {
  type Zeile = { id: string; name: string; unit: string | null; mindestmenge: number | string | null; frei: number | string };
  const alle: Zeile[] = [];
  for (let von = 0; ; von += seite) {
    const { data, error } = await derClient().rpc('lager_knapp', { p_grenze: grenze }).range(von, von + seite - 1);
    if (error) throw new Error(error.message);
    const teil = (data ?? []) as Zeile[];
    alle.push(...teil);
    if (teil.length < seite) break;
  }
  return alle.map((z) => ({
    id: z.id,
    name: z.name,
    ...(z.unit ? { unit: z.unit } : {}),
    mindestmenge: z.mindestmenge == null ? null : Number(z.mindestmenge),
    frei: Number(z.frei),
  }));
}

/** Eine Zeile der Lagerliste: der Artikel mit Reserviertem und Freiem (wie `lager_frei`). */
export type LagerZeile = WithId<Material> & {
  /** Zugesagte Anforderungen und Rüstlisten ab heute zusammen. */
  reserved: number;
  /** Davon auf Rüstlisten geplant. */
  geplant: number;
  /** Bestand minus Reserviertes — unter null heisst „fehlt“. */
  free: number;
  /** Am gefragten weiteren Ort: die Menge dort. */
  amOrt?: number;
};

/** Was die Lagerliste zeigt: die erste Seite und die Zahlen über alle Lagerartikel. */
export interface LagerListe {
  zeilen: LagerZeile[];
  /** Wie viele Artikel zu Suche, Filter und Ort passen — die Seite ist ihr Anfang. */
  treffer: number;
  imLager: number;
  knapp: number;
  /** Knapp nach dem reinen Bestand (ohne Reserviertes) — für den Kopf des Katalogs. */
  knappBestand: number;
  fehlt: number;
  reserviert: number;
  warengruppen: string[];
}

export interface LagerListeFrage {
  begriff?: string;
  /** Kennungen, die die Suche über Nummern der Großhändler und die EAN fand. */
  treffer?: readonly string[];
  filter?: 'alle' | 'knapp' | 'fehlt';
  reihenfolge?: 'frei' | 'name';
  anzahl: number;
  grenze: number;
  ort?: string | null;
  nur?: readonly string[] | null;
}

/**
 * DIE LAGERLISTE AUS DER DATENBANK (`lager_liste`, Durchsicht 15.11.2026,
 * Budget B3). Bis dahin kam jeder Lagerartikel samt seinem Freien in den
 * Browser — beim gewachsenen Bestand 2.000 und 1.000 Zeilen —, um 20 davon
 * zu zeigen. Jetzt sucht, filtert, sortiert und zählt die Datenbank nach
 * denselben Regeln; zurück kommt die gezeigte Seite und die Zahlen über alle.
 */
export async function lagerListe(f: LagerListeFrage): Promise<LagerListe> {
  const { data, error } = await derClient().rpc('lager_liste', {
    p_begriff: f.begriff ?? '',
    p_treffer: (f.treffer ?? []).filter((id) => IST_UUID.test(id)),
    p_filter: f.filter ?? 'alle',
    p_reihenfolge: f.reihenfolge ?? 'frei',
    p_anzahl: Math.max(0, f.anzahl),
    p_grenze: f.grenze,
    p_ort: f.ort || null,
    p_nur: f.nur ? f.nur.filter((id) => IST_UUID.test(id)) : null,
  });
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  const zeilen = ((d.zeilen ?? []) as Array<Record<string, unknown>>).map((z) => {
    const { zugesagt, geplant, frei, am_ort: amOrt, ...artikel } = z;
    return {
      ...zeileAlsObjekt<WithId<Material>>(MATERIAL, artikel),
      reserved: Number(zugesagt ?? 0) + Number(geplant ?? 0),
      geplant: Number(geplant ?? 0),
      free: Number(frei ?? 0),
      ...(amOrt != null ? { amOrt: Number(amOrt) } : {}),
    };
  });
  return {
    zeilen,
    treffer: Number(d.treffer ?? 0),
    imLager: Number(d.im_lager ?? 0),
    knapp: Number(d.knapp ?? 0),
    knappBestand: Number(d.knapp_bestand ?? 0),
    fehlt: Number(d.fehlt ?? 0),
    reserviert: Number(d.reserviert ?? 0),
    warengruppen: (d.warengruppen ?? []) as string[],
  };
}

/**
 * Meldet Änderungen, die die Lagerliste betreffen — Artikel (Bestand,
 * Mindestmenge) und Anforderungen (Zusagen) —, gebündelt nach einer Sekunde
 * und nach jedem Wiederaufbau der Kanäle. Die Liste fragt dann neu; die
 * Zeilen selbst kommen nicht über den Kanal.
 */
export function lagerBeobachten(companyId: string, beiAenderung: () => void): () => void {
  let geplant: ReturnType<typeof setTimeout> | undefined;
  const bald = () => {
    if (geplant) return;
    geplant = setTimeout(() => {
      geplant = undefined;
      beiAenderung();
    }, 1000);
  };
  const stopps = [MATERIAL, 'material_orders'].map((tabelle) => kanalHalten({
    tabelle,
    filter: `company_id=eq.${companyId}`,
    beiAenderung: bald,
    beiBereit: bald,
    client: derClient(),
  }));
  return () => {
    if (geplant) clearTimeout(geplant);
    for (const s of stopps) s();
  };
}
