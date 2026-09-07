import type { Material, WorkSheet } from '@/types';
import { normName } from '@/features/invoices/materialPositionen';

/**
 * Was das verbaute Material den Betrieb gekostet hat.
 *
 * WARUM DAS FEHLTE UND WARUM ES ZÄHLT. Die Nachkalkulation rechnete Erlös
 * minus Personalkosten. Bei einem Installateur ist Material schnell die
 * Hälfte der Rechnungssumme — der ausgewiesene Deckungsbeitrag war damit
 * systematisch zu hoch, und zwar in der teuersten Richtung: eine Baustelle
 * sah tragfähig aus, die es nicht war.
 *
 * WOHER DIE MENGEN KOMMEN: aus den UNTERSCHRIEBENEN Handwerksscheinen. Das
 * ist das, was nachweislich verbaut wurde — vom Kunden bestätigt. Die
 * Materialanforderung wäre die falsche Quelle: sie sagt, was bestellt wurde,
 * nicht was auf dieser Baustelle geblieben ist.
 *
 * WOHER DIE PREISE KOMMEN: aus dem Feld `einkaufspreis` im Materialstamm.
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
}

export const KEINE_MATERIALKOSTEN: Materialkosten = {
  kosten: 0,
  ohnePreis: [],
  scheine: 0,
};

/**
 * Die Materialkosten einer Baustelle.
 *
 * Gezählt wird über ALLE unterschriebenen Scheine der Baustelle — anders als
 * bei der Rechnung, die nur das noch nicht Verrechnete zusammenstellt. Für
 * die Frage „hat die Baustelle etwas verdient" zählt alles, was verbaut
 * wurde, unabhängig davon, auf welcher Rechnung es gelandet ist.
 */
export function materialkosten(
  scheine: Array<WorkSheet & { id: string }>,
  katalog: Material[],
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

  const mengen = new Map<string, { name: string; menge: number }>();
  let scheineMitMaterial = 0;

  for (const schein of scheine) {
    if (schein.status !== 'Unterschrieben') continue;
    if (!schein.material?.length) continue;
    scheineMitMaterial++;
    for (const zeile of schein.material) {
      if (!zeile.name?.trim() || !(zeile.menge > 0)) continue;
      const schluessel = normName(zeile.name);
      const vorhanden = mengen.get(schluessel);
      if (vorhanden) vorhanden.menge += zeile.menge;
      else mengen.set(schluessel, { name: zeile.name.trim(), menge: zeile.menge });
    }
  }

  let kosten = 0;
  const ohnePreis: string[] = [];
  for (const [schluessel, eintrag] of mengen) {
    const preis = preise.get(schluessel);
    if (preis === undefined) {
      ohnePreis.push(eintrag.name);
      continue;
    }
    kosten += eintrag.menge * preis;
  }

  return {
    kosten: Math.round(kosten * 100) / 100,
    // Nach Namen sortiert: die Liste steht in der Ansicht und soll bei jedem
    // Aufruf gleich aussehen, sonst liest sie sich wie eine Änderung.
    ohnePreis: ohnePreis.sort((a, b) => a.localeCompare(b, 'de')),
    scheine: scheineMitMaterial,
  };
}
