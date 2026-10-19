/**
 * Materialstamm — auf Postgres.
 */
import type { Lagerbewegung, Material } from '@/types';
import { KATALOG_GRENZE } from '@/lib/listengrenzen';
import { abfragen, abonnieren, anlegen as kernAnlegen, aendern, loeschen, derClient, kanalHalten, SEITE, type WithId } from './kern';
import { zeileAlsObjekt } from './felder';
import { alsOderWert, ohneJoker, oderUeberSpalten } from './suche';

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
 */
export async function katalogSeite(
  companyId: string,
  begriff: string,
  anzahl: number,
): Promise<{ zeilen: WithId<Material>[]; gesamt: number }> {
  let abfrage = derClient()
    .from(MATERIAL)
    .select('*', { count: 'exact' })
    .eq('company_id', companyId);
  const oder = oderUeberSpalten(['name', 'article_number', 'category'], begriff);
  if (oder) abfrage = abfrage.or(oder);
  const { data, error, count } = await abfrage.order('name').order('id').range(0, Math.max(0, anzahl - 1));
  if (error) throw new Error(error.message);
  const zeilen = (data ?? []).map((z) => zeileAlsObjekt<WithId<Material>>(MATERIAL, z));
  return { zeilen, gesamt: count ?? zeilen.length };
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
 */
export async function lagerEingang(eingang: {
  materialId: string; menge: number; lieferant: string; lieferschein?: string; bezug?: string;
}): Promise<number> {
  const { data, error } = await derClient().rpc('lager_eingang', {
    p_material: eingang.materialId,
    p_menge: eingang.menge,
    p_lieferant: eingang.lieferant,
    p_lieferschein: eingang.lieferschein ?? null,
    p_bezug: eingang.bezug ?? null,
  });
  if (error) throw new Error(error.message);
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
export async function lagerInventur(materialId: string, bestand: number, grund: string): Promise<number> {
  const { data, error } = await derClient().rpc('lager_inventur', {
    p_material: materialId, p_bestand: bestand, p_grund: grund,
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
export function sucheKatalog(companyId: string, begriff: string, max = 20) {
  return abfragen<Material>(MATERIAL, companyId, {
    oder: oderUeberSpalten(['name', 'article_number', 'category'], begriff),
    sortiere: { feld: 'name' },
    grenze: max,
  });
}

/** So viele Namen je Anfrage — die `or`-Bedingung steht in der Adresse. */
const NAMEN_JE_ANFRAGE = 20;

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
  const teile: string[][] = [];
  for (let i = 0; i < muster.length; i += NAMEN_JE_ANFRAGE) teile.push(muster.slice(i, i + NAMEN_JE_ANFRAGE));
  const treffer = await Promise.all(
    teile.map((teil) =>
      abfragen<Material>(MATERIAL, companyId, {
        oder: teil.map((m) => `name.ilike.${alsOderWert(m)}`).join(','),
      }),
    ),
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
 * Die Lagerartikel mit nur dem, was „knapp“ braucht — für die Startseite
 * (Ladezeit, 19.10.2026). Preise, Warengruppe und Beschreibung gehören
 * nicht zur Frage, welche Fächer leer werden.
 */
export function listLagerartikelKurz(companyId: string) {
  return abfragen<Pick<Material, 'name' | 'unit' | 'stock' | 'mindestmenge' | 'lagerartikel'>>(MATERIAL, companyId, {
    wo: [{ art: 'gleich', feld: 'lagerartikel', wert: true }],
    spalten: 'id,name,unit,stock,mindestmenge,lagerartikel',
  });
}
