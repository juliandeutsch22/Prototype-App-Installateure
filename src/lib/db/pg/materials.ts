/**
 * Materialstamm — auf Postgres.
 */
import type { Lagerbewegung, Material } from '@/types';
import { KATALOG_GRENZE } from '@/lib/listengrenzen';
import { abfragen, abonnieren, anlegen as kernAnlegen, aendern, loeschen, derClient, type WithId } from './kern';
import { zeileAlsObjekt } from './felder';

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

export async function lagerFrei(): Promise<Map<string, LagerStand>> {
  const { data, error } = await derClient().rpc('lager_frei');
  if (error) throw new Error(error.message);
  const karte = new Map<string, LagerStand>();
  for (const z of (data ?? []) as Array<Record<string, unknown>>) {
    karte.set(String(z.material_id), {
      bestand: Number(z.bestand),
      zugesagt: Number(z.zugesagt),
      geplant: Number(z.geplant),
      frei: Number(z.frei),
    });
  }
  return karte;
}

export function listMaterials(companyId: string, max = KATALOG_GRENZE) {
  return abfragen<Material>(MATERIAL, companyId, { grenze: max });
}
