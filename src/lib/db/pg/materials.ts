/**
 * Materialstamm — auf Postgres.
 */
import type { Lagerbewegung, Material } from '@/types';
import { KATALOG_GRENZE } from '@/lib/listengrenzen';
import { abfragen, abonnieren, anlegen as kernAnlegen, aendern, loeschen, derClient, SEITE, type WithId } from './kern';
import { zeileAlsObjekt } from './felder';
import { oderUeberSpalten } from './suche';

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
  nurLager = false,
) {
  return abonnieren<Material>(MATERIAL, companyId, cb, onError, {
    grenze: max,
    ...(nurLager ? { wo: [{ art: 'gleich' as const, feld: 'lagerartikel', wert: true }] } : {}),
  });
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

export async function lagerFrei(materialIds?: string[]): Promise<Map<string, LagerStand>> {
  const client = derClient();
  const zeilen: Array<Record<string, unknown>> = [];
  const jeSeite = SEITE;
  if (materialIds) {
    // Nur die in der Ansicht benötigten Artikel, unter der API-Zeilengrenze.
    const ids = [...new Set(materialIds)];
    for (let i = 0; i < ids.length; i += jeSeite) {
      const { data, error } = await client.rpc('lager_frei', { p_material_ids: ids.slice(i, i + jeSeite) });
      if (error) throw new Error(error.message);
      zeilen.push(...(data ?? []));
    }
  } else {
    // Der bisherige Gesamtaufruf bleibt vollständig, auch nach 1.000 Artikeln.
    for (let ab = 0; ; ab += jeSeite) {
      const { data, error } = await client.rpc('lager_frei').order('material_id').range(ab, ab + jeSeite - 1);
      if (error) throw new Error(error.message);
      zeilen.push(...(data ?? []));
      if ((data ?? []).length < jeSeite) break;
    }
  }
  const karte = new Map<string, LagerStand>();
  for (const z of zeilen) {
    karte.set(String(z.material_id), {
      bestand: Number(z.bestand),
      zugesagt: Number(z.zugesagt),
      geplant: Number(z.geplant),
      frei: Number(z.frei),
    });
  }
  return karte;
}

export interface KnapperLagerArtikel {
  id: string;
  name: string;
  unit?: string;
  frei: number;
  mindestmenge?: number;
}

/** Vollständige Knappheitsliste; Katalogartikel und Bildschirmgrenze zählen nicht. */
export async function listKnappeLagerArtikel(grenze: number): Promise<KnapperLagerArtikel[]> {
  const ergebnis: KnapperLagerArtikel[] = [];
  for (let ab = 0; ; ab += SEITE) {
    const { data, error } = await derClient().rpc('lager_knapp', { p_grenze: grenze })
      .order('id').range(ab, ab + SEITE - 1);
    if (error) throw new Error(error.message);
    const zeilen = (data ?? []) as Array<Record<string, unknown>>;
    ergebnis.push(...zeilen.map((z) => ({
      id: String(z.id), name: String(z.name), unit: z.unit == null ? undefined : String(z.unit),
      frei: Number(z.frei), mindestmenge: z.mindestmenge == null ? undefined : Number(z.mindestmenge),
    })));
    if (zeilen.length < SEITE) break;
  }
  return ergebnis;
}

export function listMaterials(companyId: string, max = KATALOG_GRENZE, nurLager = false) {
  return abfragen<Material>(MATERIAL, companyId, {
    grenze: max,
    ...(nurLager ? { wo: [{ art: 'gleich' as const, feld: 'lagerartikel', wert: true }] } : {}),
  });
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
