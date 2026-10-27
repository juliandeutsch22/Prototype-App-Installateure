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
  /**
   * Was spätere Scheine über das danach Ausgegebene hinaus tragen und deshalb
   * hier abgezogen ist (Testbericht Runde 6, M4). Nur gesetzt, wenn es etwas
   * abzuziehen gab.
   */
  spaeterAbgezogen?: number;
  /** Die späteren Scheine mit diesem Artikel — Tag und Menge, für den Hinweis. */
  spaetereScheine?: SpaetererSchein[];
}

export interface SpaetererSchein {
  datum: string;
  menge: number;
}

/**
 * Was nach dem Stichtag liegt (Testbericht Runde 6, M4): die Ausgaben danach
 * und die unterschriebenen, noch nicht verrechneten Scheine danach.
 */
export interface NachDemStichtag {
  ausgaben: Ausgabe[];
  scheine: Array<Pick<WorkSheet, 'datum' | 'material'>>;
}

const menge = (x: number) => Math.round(x * 1000) / 1000;

/*
  SPÄTERE SCHEINE (Testbericht Runde 6, M4). Mit Stichtag kennt der Abzug nur
  die Scheine bis dahin. Lädt der Monteur am Montag die Rüstliste ein und
  trägt das Material erst auf dem Schein vom Donnerstag ein, schlug eine
  Teilrechnung „bis Dienstag“ es als ausgegeben vor — und die nächste
  Rechnung brachte es mit dem Schein ein zweites Mal.

  Abgezogen wird deshalb auch, was spätere Scheine ÜBER das danach Ausgegebene
  hinaus tragen: das muss aus dem stammen, was bis zum Stichtag ausgegeben
  wurde. Was nach dem Stichtag ausgegeben wurde, bringt sein Schein selbst
  mit; eine Retoure danach zeigt, dass weniger verbaut wurde. Gleichwertig:
  vorgeschlagen wird höchstens, was über alle offenen Scheine hinweg auf
  keinem steht. Nur unterschriebene Scheine — ein späterer Entwurf ist noch
  änderbar, sein Material wird vorgeschlagen wie bisher.
*/
export function materialAbgleich(
  ausgaben: Ausgabe[],
  /** Die Scheine, deren Material auf dieser Rechnung steht oder noch stehen wird. */
  scheine: Array<Pick<WorkSheet, 'material'>>,
  katalog: Material[],
  /** Mit Stichtag: was danach kommt (siehe oben). */
  spaeter?: NachDemStichtag,
): {
  /** Was vorgeschlagen wird — offen über null. */
  vorschlaege: MaterialVorschlag[];
  /** Jeder Artikel, von dem spätere Scheine etwas tragen — auch ganz abgezogene. */
  spaeterGetragen: MaterialVorschlag[];
} {
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
  // Was nach dem Stichtag ausgegeben wurde und was spätere Scheine tragen, je Artikel.
  const spaeterAus = new Map<MaterialVorschlag, number>();
  const spaeterAuf = new Map<MaterialVorschlag, SpaetererSchein[]>();
  const artikel = (materialId: string | null | undefined, name: string) =>
    (materialId ? nachId.get(materialId) : undefined) ?? nachName.get(normName(name));
  for (const a of spaeter?.ausgaben ?? []) {
    const v = artikel(a.materialId, a.name);
    if (v) spaeterAus.set(v, menge((spaeterAus.get(v) ?? 0) + a.menge));
  }
  for (const s of spaeter?.scheine ?? []) {
    for (const z of s.material ?? []) {
      const v = artikel(z.materialId, z.name);
      if (!v || !(z.menge > 0)) continue;
      spaeterAuf.set(v, [...(spaeterAuf.get(v) ?? []), { datum: s.datum, menge: z.menge }]);
    }
  }
  for (const [v, liste] of spaeterAuf) {
    const getragen = liste.reduce((sum, x) => menge(sum + x.menge), 0);
    // Abgezogen wird höchstens, was bis zum Stichtag noch offen war.
    const vorher = Math.max(0, menge(v.ausgegeben - v.zurueck - v.aufScheinen));
    const abzug = Math.min(vorher, menge(getragen - (spaeterAus.get(v) ?? 0)));
    if (abzug <= 0) continue;
    v.spaeterAbgezogen = abzug;
    v.spaetereScheine = [...liste].sort((a, b) => a.datum.localeCompare(b.datum));
  }

  const preise = new Map<string, Material>();
  for (const m of katalog) preise.set(normName(m.name), m);
  // Über die Kennung gilt genau dieser Artikel, sonst wie bisher der Name.
  const nachKennung = new Map(katalog.map((m) => [m.id, m]));

  const alle: MaterialVorschlag[] = [];
  for (const v of je.values()) {
    v.offen = menge(v.ausgegeben - v.zurueck - v.aufScheinen - (v.spaeterAbgezogen ?? 0));
    const k = (v.materialId ? nachKennung.get(v.materialId) : undefined) ?? preise.get(v.schluessel);
    if (typeof k?.verkaufspreis === 'number' && k.verkaufspreis > 0) v.preis = k.verkaufspreis;
    if (!v.einheit) v.einheit = k?.unit || 'Stk';
    alle.push(v);
  }
  alle.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return {
    vorschlaege: alle.filter((v) => v.offen > 0),
    spaeterGetragen: alle.filter((v) => (v.spaeterAbgezogen ?? 0) > 0),
  };
}

/** Nur die Vorschläge — ohne `spaeter` genau wie vor M4. */
export function materialOhneSchein(
  ausgaben: Ausgabe[],
  scheine: Array<Pick<WorkSheet, 'material'>>,
  katalog: Material[],
  spaeter?: NachDemStichtag,
): MaterialVorschlag[] {
  return materialAbgleich(ausgaben, scheine, katalog, spaeter).vorschlaege;
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
