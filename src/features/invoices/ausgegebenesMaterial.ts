import type { Material, WorkSheet } from '@/types';
import { normName } from './materialPositionen';
import { positionNetto, type InvoicePosition } from './totals';

/**
 * Ausgegebenes Material ohne Schein (Auftrag 23.10.2026).
 *
 * WARUM. Material kam bisher nur über unterschriebene Scheine auf die
 * Rechnung. Eine Baustelle über Wochen hat nicht für jeden Tag einen Schein;
 * was das Lager für sie ausgegeben hat, fiel beim Verrechnen niemandem auf.
 *
 * WAS. Je Artikel: ausgegeben (abgeholte Anforderungen, eingeladene
 * Rüstlisten) minus zurückgegeben minus das, was auf den Scheinen dieser
 * Rechnung steht. Was übrig bleibt, schlägt die Vorschau vor — UNVERBINDLICH:
 * übernommen wird nur auf Klick, zum Katalogpreis, und die Zeile bleibt
 * änderbar wie jede andere.
 *
 * DER ARTIKEL IST DIE KATALOGKENNUNG, sonst der Name (angeglichen wie beim
 * Material der Scheine, `normName`). Seit 24.10.2026 trägt eine Zeile, die am
 * Schein aus dem Katalog gewählt wurde, die Kennung des Artikels; ältere
 * Zeilen und freie Zeilen haben keine. Deshalb zählt die Kennung, wo es sie
 * auf beiden Seiten gibt — ein umbenannter Artikel steht dann nicht doppelt
 * da —, und sonst wie bisher der Name.
 */

export interface Ausgabe {
  art: 'anforderung' | 'retoure' | 'ruestliste';
  belegId: string;
  datum: string;
  materialId: string | null;
  name: string;
  einheit: string | null;
  /** Bei einer Retoure negativ. */
  menge: number;
}

export interface MaterialVorschlag {
  schluessel: string;
  name: string;
  einheit: string;
  materialId: string | null;
  ausgegeben: number;
  zurueck: number;
  aufScheinen: number;
  /** Ausgegeben − zurück − auf Scheinen; nur Vorschläge über null. */
  offen: number;
  /** Verkaufspreis aus dem Katalog; 0, wenn keiner gepflegt ist. */
  preis: number;
}

const menge = (x: number) => Math.round(x * 1000) / 1000;

export function materialOhneSchein(
  ausgaben: Ausgabe[],
  /** Die Scheine, deren Material auf dieser Rechnung steht oder noch stehen wird. */
  scheine: Array<Pick<WorkSheet, 'material'>>,
  katalog: Material[],
): MaterialVorschlag[] {
  const je = new Map<string, MaterialVorschlag>();
  // Beide Wege zum selben Artikel: über die Kennung und über den Namen.
  const nachId = new Map<string, MaterialVorschlag>();
  const nachName = new Map<string, MaterialVorschlag>();
  for (const a of ausgaben) {
    const schluessel = normName(a.name);
    if (!schluessel) continue;
    const v = (a.materialId ? nachId.get(a.materialId) : undefined) ?? nachName.get(schluessel) ?? {
      schluessel, name: a.name.trim(), einheit: a.einheit || '', materialId: a.materialId,
      ausgegeben: 0, zurueck: 0, aufScheinen: 0, offen: 0, preis: 0,
    };
    if (a.menge < 0) v.zurueck = menge(v.zurueck - a.menge);
    else v.ausgegeben = menge(v.ausgegeben + a.menge);
    if (!v.einheit && a.einheit) v.einheit = a.einheit;
    if (!v.materialId && a.materialId) v.materialId = a.materialId;
    je.set(v.schluessel, v);
    if (a.materialId && !nachId.has(a.materialId)) nachId.set(a.materialId, v);
    if (!nachName.has(schluessel)) nachName.set(schluessel, v);
  }
  for (const s of scheine) {
    for (const z of s.material ?? []) {
      const v = (z.materialId ? nachId.get(z.materialId) : undefined) ?? nachName.get(normName(z.name));
      if (v && z.menge > 0) v.aufScheinen = menge(v.aufScheinen + z.menge);
    }
  }
  const preise = new Map<string, Material>();
  for (const m of katalog) preise.set(normName(m.name), m);

  const out: MaterialVorschlag[] = [];
  for (const v of je.values()) {
    v.offen = menge(v.ausgegeben - v.zurueck - v.aufScheinen);
    if (v.offen <= 0) continue;
    const k = preise.get(v.schluessel);
    if (typeof k?.verkaufspreis === 'number' && k.verkaufspreis > 0) v.preis = k.verkaufspreis;
    if (!v.einheit) v.einheit = k?.unit || 'Stk';
    out.push(v);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Der Vorschlag als Rechnungsposition — mit Katalogbezug, wenn es ihn gibt. */
export function alsPosition(v: MaterialVorschlag): InvoicePosition {
  return {
    label: v.name,
    qty: v.offen,
    unit: v.einheit,
    unitPrice: v.preis,
    netto: positionNetto(v.offen, v.preis),
    ...(v.materialId ? { materialId: v.materialId } : {}),
  };
}
