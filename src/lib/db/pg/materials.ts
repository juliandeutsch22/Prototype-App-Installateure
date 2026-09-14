/**
 * Materialstamm — auf Postgres.
 */
import type { Material } from '@/types';
import { KATALOG_GRENZE } from '@/lib/listengrenzen';
import { abfragen, abonnieren, anlegen as kernAnlegen, aendern, loeschen, derClient, type WithId } from './kern';

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

export function listMaterials(companyId: string, max = KATALOG_GRENZE) {
  return abfragen<Material>(MATERIAL, companyId, { grenze: max });
}
