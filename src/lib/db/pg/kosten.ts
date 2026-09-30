/**
 * Kostensätze und Einkaufspreise — was der Betrieb zahlt (offene Punkte B1).
 *
 * LESEN HIER, SCHREIBEN WIE BISHER. Beides liegt seit dem 29.09.2026 in
 * eigenen Tabellen, die nur Geschäftsführung und Administration lesen
 * (`betrieb_kostensaetze`, `material_einkaufspreise`). Geschrieben wird
 * weiter über `companies.costRates` und `materials.einkaufspreis`: die
 * Spalten sind ein Einlass, der das Geschriebene in derselben Anweisung
 * umlegt. So bleibt Speichern ein einziger Schritt — und die alte Fassung
 * der App, die noch auf manchem Telefon läuft, speichert ebenso richtig.
 *
 * Für jede andere Rolle kommt hier nichts zurück — kein Fehler, sondern
 * dasselbe wie „nicht hinterlegt".
 */
import { abfragen } from './kern';
import type { Stufensaetze } from '@/lib/einstufung';

export interface Kostensaetze {
  fach: number;
  helper: number;
  /** Kosten je Stufe (Testbericht 4.1) — nur, was eingetragen ist. */
  stufen?: Stufensaetze;
}

/** Nur Zahlen durchlassen: ein leeres Feld heisst „wie Facharbeiter bzw. Helfer“. */
function stufenAus(roh: unknown): Stufensaetze | undefined {
  if (!roh || typeof roh !== 'object') return undefined;
  const raus: Stufensaetze = {};
  for (const [k, v] of Object.entries(roh as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) raus[k as keyof Stufensaetze] = v;
  }
  return Object.keys(raus).length ? raus : undefined;
}

export async function kostensaetze(companyId: string): Promise<Kostensaetze | null> {
  const [zeile] = await abfragen<{ fach: number | null; helper: number | null; stufen?: unknown }>(
    'betrieb_kostensaetze',
    companyId,
    { grenze: 1 },
  );
  if (!zeile || zeile.fach == null || zeile.helper == null) return null;
  const stufen = stufenAus(zeile.stufen);
  return { fach: Number(zeile.fach), helper: Number(zeile.helper), ...(stufen ? { stufen } : {}) };
}

/** Die Einkaufspreise genau dieser Artikel, nach Kennung. */
export async function einkaufspreise(
  companyId: string,
  materialIds: readonly string[],
): Promise<Map<string, number>> {
  const ids = [...new Set(materialIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const zeilen = await abfragen<{ materialId: string; einkaufspreis: number | null }>(
    'material_einkaufspreise',
    companyId,
    { wo: [{ art: 'in', feld: 'materialId', werte: ids }] },
  );
  const raus = new Map<string, number>();
  for (const z of zeilen) {
    if (z.einkaufspreis != null) raus.set(z.materialId, Number(z.einkaufspreis));
  }
  return raus;
}
