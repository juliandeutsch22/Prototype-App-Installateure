/**
 * Lieferantenartikel: der Artikel, wie ihn EIN Großhändler führt, und seine
 * Zuordnung zum Stammartikel (M03a, E01–E04;
 * `20261107100000_lieferantenartikel.sql`).
 *
 * Gelesen und geschrieben wird über die Funktionen der Datenbank: sie prüfen
 * Betrieb und Recht selbst (Vergleich und Verlauf nur, wer Einkaufspreise
 * sehen darf; Zuordnen, wer Kataloge einspielt) und setzen „wer und wann“.
 * Die Antworten kommen in Spaltennamen und werden hier einmal übersetzt.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { abfragen, derClient } from './kern';

/** Wie ein Lieferantenartikel zu seinem Stammartikel kam (leer: offen). */
export type Zuordnung = 'automatisch' | 'bestaetigt' | 'bestand' | 'geloest';

/** Warum die Identität als verifiziert gilt (E02). */
export type VerifiziertDurch = 'bestaetigt' | 'automatisch' | 'bestand' | 'einziger' | 'ean';

/** Eine Zeile des Vergleichs: ein Lieferant des Stammartikels mit seinem Preisstand. */
export interface VergleichZeile {
  /** Leer bei Preisen aus der Zeit vor den Lieferantenartikeln ohne eindeutige Herkunft. */
  lieferantenartikelId: string | null;
  supplierId: string;
  lieferant: string;
  lieferantenNr: string | null;
  bezeichnung: string | null;
  einheit: string | null;
  preiseinheit: number | null;
  ean: string | null;
  zuordnung: Zuordnung | null;
  zuPruefen: boolean;
  bestaetigtVon: string | null;
  /** ISO-Zeitpunkt. */
  bestaetigtAm: string | null;
  ausgelaufen: boolean;
  listenpreis: number | null;
  rabattProzent: number | null;
  einkaufspreis: number | null;
  rabattgruppe: string | null;
  /** Gültig ab (JJJJ-MM-TT) des jüngsten Preises bis heute. */
  stand: string | null;
  verifiziertDurch: VerifiziertDurch | null;
  vergleichbar: boolean;
  /** Warum nicht vergleichbar — leer, wenn vergleichbar. */
  grund: string | null;
  /** Der Stand ist älter als die Frist des Betriebs. */
  veraltet: boolean;
  guenstigster: boolean;
}

export interface Vergleich {
  /** Der Wiener Tag, an dem verglichen wurde (JJJJ-MM-TT). */
  heute: string;
  fristTage: number;
  /** Warum es keinen „günstigsten“ gibt — leer, wenn die Basis vollständig ist. */
  basisGrund: string | null;
  zeilen: VergleichZeile[];
}

export interface VerlaufZeile {
  gueltigAb: string;
  gueltigBis: string | null;
  listenpreis: number | null;
  rabattProzent: number | null;
  einkaufspreis: number | null;
  rabattgruppe: string | null;
  /** Änderung des Einkaufspreises zum vorigen Eintrag in Prozent. */
  aenderungProzent: number | null;
}

export interface Vorschlag {
  materialId: string;
  name: string;
  articleNumber: string | null;
  grund: 'nummer' | 'ean' | 'bezeichnung';
}

export interface OffenerLieferantenartikel {
  id: string;
  supplierId: string;
  lieferant: string;
  lieferantenNr: string;
  bezeichnung: string;
  einheit: string | null;
  ean: string | null;
  /** `geloest`: von Hand gelöst; leer: nie zugeordnet. */
  zuordnung: Zuordnung | null;
  bestaetigtVon: string | null;
  bestaetigtAm: string | null;
  vorschlaege: Vorschlag[];
}

const zahl = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** Der Vergleich eines Stammartikels über seine Lieferanten (E02/E03). */
export async function artikelVergleich(materialId: string, client?: SupabaseClient): Promise<Vergleich> {
  const { data, error } = await derClient(client).rpc('artikel_vergleich', { p_material: materialId });
  if (error) throw new Error(error.message);
  const d = data as { heute: string; frist_tage: number; basis_grund: string | null; zeilen: Record<string, unknown>[] };
  return {
    heute: d.heute,
    fristTage: Number(d.frist_tage),
    basisGrund: d.basis_grund,
    zeilen: d.zeilen.map((z) => ({
      lieferantenartikelId: (z.lieferantenartikel_id as string | null) ?? null,
      supplierId: z.supplier_id as string,
      lieferant: (z.lieferant as string | null) ?? '',
      lieferantenNr: (z.lieferanten_nr as string | null) ?? null,
      bezeichnung: (z.bezeichnung as string | null) ?? null,
      einheit: (z.einheit as string | null) ?? null,
      preiseinheit: zahl(z.preiseinheit),
      ean: (z.ean as string | null) ?? null,
      zuordnung: (z.zuordnung as Zuordnung | null) ?? null,
      zuPruefen: !!z.zu_pruefen,
      bestaetigtVon: (z.bestaetigt_von_name as string | null) ?? null,
      bestaetigtAm: (z.bestaetigt_am as string | null) ?? null,
      ausgelaufen: !!z.ausgelaufen,
      listenpreis: zahl(z.listenpreis),
      rabattProzent: zahl(z.rabatt_prozent),
      einkaufspreis: zahl(z.einkaufspreis),
      rabattgruppe: (z.rabattgruppe as string | null) ?? null,
      stand: (z.stand as string | null) ?? null,
      verifiziertDurch: (z.verifiziert_durch as VerifiziertDurch | null) ?? null,
      vergleichbar: !!z.vergleichbar,
      grund: (z.grund as string | null) ?? null,
      veraltet: !!z.veraltet,
      guenstigster: !!z.guenstigster,
    })),
  };
}

/** Der Preisverlauf eines Lieferanten am Stammartikel, jüngster zuerst (E04). */
export async function preisverlauf(
  materialId: string,
  supplierId: string,
  anzahl = 50,
  client?: SupabaseClient,
): Promise<VerlaufZeile[]> {
  const { data, error } = await derClient(client)
    .rpc('preisverlauf', { p_material: materialId, p_supplier: supplierId, p_anzahl: anzahl });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((z) => ({
    gueltigAb: z.gueltig_ab as string,
    gueltigBis: (z.gueltig_bis as string | null) ?? null,
    listenpreis: zahl(z.listenpreis),
    rabattProzent: zahl(z.rabatt_prozent),
    einkaufspreis: zahl(z.einkaufspreis),
    rabattgruppe: (z.rabattgruppe as string | null) ?? null,
    aenderungProzent: zahl(z.aenderung_prozent),
  }));
}

/** Die offenen Lieferantenartikel, seitenweise, mit Vorschlägen. */
export async function offeneLieferantenartikel(
  suche: string,
  von: number,
  anzahl: number,
  client?: SupabaseClient,
): Promise<{ gesamt: number; zeilen: OffenerLieferantenartikel[] }> {
  const { data, error } = await derClient(client)
    .rpc('offene_lieferantenartikel', { p_suche: suche, p_von: von, p_anzahl: anzahl });
  if (error) throw new Error(error.message);
  const d = data as { gesamt: number; zeilen: Record<string, unknown>[] };
  return {
    gesamt: Number(d.gesamt),
    zeilen: d.zeilen.map((z) => ({
      id: z.id as string,
      supplierId: z.supplier_id as string,
      lieferant: z.lieferant as string,
      lieferantenNr: z.lieferanten_nr as string,
      bezeichnung: (z.bezeichnung as string | null) ?? '',
      einheit: (z.einheit as string | null) ?? null,
      ean: (z.ean as string | null) ?? null,
      zuordnung: (z.zuordnung as Zuordnung | null) ?? null,
      bestaetigtVon: (z.bestaetigt_von_name as string | null) ?? null,
      bestaetigtAm: (z.bestaetigt_am as string | null) ?? null,
      vorschlaege: ((z.vorschlaege ?? []) as Record<string, unknown>[]).map((v) => ({
        materialId: v.material_id as string,
        name: v.name as string,
        articleNumber: (v.article_number as string | null) ?? null,
        grund: v.grund as Vorschlag['grund'],
      })),
    })),
  };
}

/** Einem vorhandenen Stammartikel zuordnen — „derselbe Artikel“. */
export async function zuordnen(id: string, materialId: string, client?: SupabaseClient): Promise<void> {
  const { error } = await derClient(client)
    .rpc('lieferantenartikel_zuordnen', { p_id: id, p_material: materialId });
  if (error) throw new Error(error.message);
}

/** Einen neuen Stammartikel aus dem Lieferantenartikel anlegen; gibt dessen Kennung zurück. */
export async function alsNeuerArtikel(id: string, client?: SupabaseClient): Promise<string> {
  const { data, error } = await derClient(client).rpc('lieferantenartikel_als_neu', { p_id: id });
  if (error) throw new Error(error.message);
  return (data as { material_id: string }).material_id;
}

/** Die Zuordnung lösen — die Preise gehen mit dem Lieferantenartikel. */
export async function loesen(id: string, client?: SupabaseClient): Promise<void> {
  const { error } = await derClient(client).rpc('lieferantenartikel_loesen', { p_id: id });
  if (error) throw new Error(error.message);
}

interface NummerZeile {
  materialId: string | null;
  supplierId: string;
  lieferantenNr: string;
}

/**
 * Die Nummern der Großhändler für diese Stammartikel — für die Bestellung:
 * bei Händler B steht B's Nummer, nicht die des Stammartikels. Je
 * `materialId|supplierId` eine Nummer. Ohne Preise; lesen dürfen sie
 * Verwaltung und Führung (wer den Einkauf führt).
 */
export async function lieferantenNummern(
  companyId: string,
  materialIds: readonly string[],
  client?: SupabaseClient,
): Promise<Map<string, string>> {
  const ids = [...new Set(materialIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const zeilen = await abfragen<NummerZeile>(
    'lieferantenartikel',
    companyId,
    {
      wo: [{ art: 'in', feld: 'materialId', werte: ids }],
      spalten: 'id, material_id, supplier_id, lieferanten_nr',
    },
    client,
  );
  return new Map(
    zeilen.filter((z) => z.materialId).map((z) => [`${z.materialId}|${z.supplierId}`, z.lieferantenNr]),
  );
}
