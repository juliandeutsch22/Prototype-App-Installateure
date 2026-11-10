import type { Material, WorkSheet } from '@/types';
import { artikelZuordnung, normName } from '@/features/invoices/materialPositionen';
import type { Ausgabe } from '@/features/invoices/ausgegebenesMaterial';

/**
 * Was das verbaute Material den Betrieb gekostet hat.
 *
 * WARUM DAS FEHLTE UND WARUM ES ZÄHLT. Die Nachkalkulation rechnete Erlös
 * minus Personalkosten. Bei einem Installateur ist Material schnell die
 * Hälfte der Rechnungssumme — der ausgewiesene Deckungsbeitrag war damit
 * systematisch zu hoch, und zwar in der teuersten Richtung: eine Baustelle
 * sah tragfähig aus, die es nicht war.
 *
 * WOHER DIE MENGEN KOMMEN: aus den UNTERSCHRIEBENEN Handwerksscheinen — das
 * ist, was nachweislich verbaut wurde, vom Kunden bestätigt — und aus dem,
 * was das LAGER für die Baustelle ausgegeben hat (abgeholte Anforderungen,
 * eingeladene Rüstlisten, abzüglich Retouren). Je Artikel zählt die größere
 * der beiden Mengen (Befund 09.11.2026): steht ein ausgegebener Artikel auch
 * auf einem Schein, ist es dasselbe Stück und zählt einmal; trägt kein
 * Schein es, ist es trotzdem weg. Vorher zählten nur die Scheine, während
 * die Regie-Rechnung das Ausgegebene als Erlös vorschlug
 * (`materialAbgleich`) — Erlös ohne Kosten, die Marge zu hoch.
 *
 * WOHER DIE PREISE KOMMEN: aus dem Feld `einkaufspreis` im Materialstamm —
 * über den Artikel, aus dem die Zeile am Schein gewählt wurde, sonst über den
 * Namen (wie bei der Rechnung, `materialPositionen`).
 * Es ist NICHT der Verkaufspreis — der bestimmt den Erlös, nicht die Kosten.
 * Wer beide verwechselt, bekommt für jedes Material einen Deckungsbeitrag von
 * null und hält ihn für ein Ergebnis; dieselbe Falle wie beim Stundensatz.
 *
 * WAS PASSIERT, WENN EIN PREIS FEHLT: nichts wird geschätzt. Der Artikel wird
 * beim Namen genannt und fliesst nicht in die Kosten ein. Ein angenommener
 * Preis wäre eine erfundene Zahl in einer Rechnung, auf der jemand
 * Preisentscheidungen trifft — und sie wäre nicht als erfunden erkennbar.
 * Ein zu hoher Deckungsbeitrag, der SAGT, dass ihm etwas fehlt, ist besser
 * als ein falscher, der nichts sagt.
 */

export interface Materialkosten {
  /** Summe aus Menge × Einkaufspreis, in Euro. */
  kosten: number;
  /** Artikel ohne hinterlegten Einkaufspreis — beim Namen genannt. */
  ohnePreis: string[];
  /** Wie viele Scheine überhaupt Material getragen haben. */
  scheine: number;
  /**
   * Bei wie vielen Artikeln die Menge aus dem Lager zählt — mehr ausgegeben,
   * als auf den Scheinen steht. Fehlt es, ist nichts aus dem Lager
   * eingerechnet.
   */
  ausLager?: number;
}

export const KEINE_MATERIALKOSTEN: Materialkosten = {
  kosten: 0,
  ohnePreis: [],
  scheine: 0,
  ausLager: 0,
};

/** Eine Ausgabe des Lagers, wie die Nachkalkulation sie braucht (Retoure negativ). */
export type LagerAusgabe = Pick<Ausgabe, 'materialId' | 'name' | 'menge'>;

const menge3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Die Materialkosten einer Baustelle.
 *
 * Gezählt wird über ALLE unterschriebenen Scheine und ALLE Ausgaben des
 * Lagers der Baustelle — anders als bei der Rechnung, die nur das noch
 * nicht Verrechnete zusammenstellt. Für die Frage „hat die Baustelle etwas
 * verdient" zählt alles, was verbaut wurde, unabhängig davon, auf welcher
 * Rechnung es gelandet ist.
 */
export function materialkosten(
  scheine: Array<WorkSheet & { id: string }>,
  katalog: Material[],
  ausgaben: readonly LagerAusgabe[] = [],
): Materialkosten {
  const preise = new Map<string, number>();
  for (const m of katalog) {
    // Wie beim Verkaufspreis: ein Katalogeintrag ohne gepflegten Einkaufspreis
    // ist dasselbe wie kein Eintrag. `0` ist das, was ein leeres Formularfeld
    // speichert — und keine Kostenangabe.
    if (typeof m.einkaufspreis === 'number' && m.einkaufspreis > 0) {
      preise.set(normName(m.name), m.einkaufspreis);
    }
  }

  // Über die Kennung gilt genau dieser Artikel, auch ohne gepflegten Preis.
  const nachId = new Map(katalog.map((m) => [m.id, m]));
  const preisVon = (name: string, materialId?: string | null): number | undefined => {
    const ausKatalog = materialId ? nachId.get(materialId) : undefined;
    return ausKatalog
      ? (typeof ausKatalog.einkaufspreis === 'number' && ausKatalog.einkaufspreis > 0 ? ausKatalog.einkaufspreis : undefined)
      : preise.get(normName(name));
  };
  const mengen = new Map<string, { name: string; aufScheinen: number; ausLager: number; preis: number | undefined }>();
  // Scheinzeilen und Ausgaben über DIESELBE Zuordnung: Kennung, sonst Name.
  const zuordnen = artikelZuordnung();
  const eintrag = (name: string, materialId?: string | null) => {
    const schluessel = zuordnen(name, materialId);
    const vorhanden = mengen.get(schluessel);
    // Der Preis kommt wie bisher aus der ersten Zeile des Artikels.
    if (vorhanden) return vorhanden;
    const neu = { name: name.trim(), aufScheinen: 0, ausLager: 0, preis: preisVon(name, materialId) };
    mengen.set(schluessel, neu);
    return neu;
  };
  let scheineMitMaterial = 0;

  for (const schein of scheine) {
    if (schein.status !== 'Unterschrieben') continue;
    if (!schein.material?.length) continue;
    scheineMitMaterial++;
    for (const zeile of schein.material) {
      if (!zeile.name?.trim() || !(zeile.menge > 0)) continue;
      const e = eintrag(zeile.name, zeile.materialId);
      e.aufScheinen = menge3(e.aufScheinen + zeile.menge);
    }
  }
  for (const a of ausgaben) {
    if (!a.name?.trim() || !a.menge) continue;
    const e = eintrag(a.name, a.materialId);
    e.ausLager = menge3(e.ausLager + a.menge);
  }

  let kosten = 0;
  let ausLager = 0;
  const ohnePreis: string[] = [];
  for (const e of mengen.values()) {
    // Mehr zurückgegeben als ausgegeben heißt: nichts aus dem Lager verbaut.
    const lager = Math.max(0, e.ausLager);
    const menge = Math.max(e.aufScheinen, lager);
    if (!(menge > 0)) continue;
    if (lager > e.aufScheinen) ausLager++;
    if (e.preis === undefined) {
      ohnePreis.push(e.name);
      continue;
    }
    kosten += menge * e.preis;
  }

  return {
    kosten: Math.round(kosten * 100) / 100,
    // Nach Namen sortiert: die Liste steht in der Ansicht und soll bei jedem
    // Aufruf gleich aussehen, sonst liest sie sich wie eine Änderung.
    ohnePreis: ohnePreis.sort((a, b) => a.localeCompare(b, 'de')),
    scheine: scheineMitMaterial,
    ausLager,
  };
}
