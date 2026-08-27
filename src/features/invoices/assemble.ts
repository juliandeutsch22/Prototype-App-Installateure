import type { TimeEntry, MaterialOrder, Material } from '@/types';
import { calcWorkMin } from '@/lib/time';

/** Standard-Stundensätze (€/h) und Parameter (docs §4.5). */
export const INVOICE_DEFAULTS = {
  fach: 65,
  helper: 45,
  lehrling: 35,
  vatRate: 0.2,
  materialMarkup: 0.15,
  dueDays: 14,
};

export interface InvoicePosition {
  label: string;
  qty: number;
  unit: string;
  unitPrice: number;
  netto: number;
}

export interface AssembledInvoice {
  positions: InvoicePosition[];
  totalNetto: number;
  totalVat: number;
  totalBrutto: number;
  linkedEntries: string[];
  linkedOrders: string[];
  entries: TimeEntry[]; // für optionalen Leistungsnachweis
}

/**
 * Vergleichsschlüssel für Projektnummern.
 *
 * Historisch stehen Nummern mal als `2024-001`, mal als `PR-2024-001` in den
 * Daten. Ohne Angleichung des Präfixes finden ein Zeiteintrag und sein Projekt
 * nicht zusammen — die Stunden fielen dann stillschweigend aus der Rechnung
 * und der Umsatz wäre verloren, ohne dass es jemandem auffällt.
 */
export function norm(n?: string) {
  return (n ?? '')
    .trim()
    .toLowerCase()
    .replace(/^pr-/, '');
}

/**
 * Stellt die Rechnungspositionen für ein Projekt zusammen (docs §4.5):
 * Facharbeiter-/Helferstunden aus nicht verrechneten Anwesend-Zeiteinträgen,
 * Material als Pauschale aus erledigten, nicht verrechneten Bestellungen.
 */
export function assembleInvoice(
  projectNumber: string,
  timeEntries: Array<TimeEntry & { id: string }>,
  orders: Array<MaterialOrder & { id: string }>,
  materials: Material[],
  rates = INVOICE_DEFAULTS,
): AssembledInvoice {
  const pn = norm(projectNumber);

  const eligibleEntries = timeEntries.filter(
    (e) => e.status === 'Anwesend' && norm(e.projectNumber) === pn && !e.isBilled,
  );
  let fachMin = 0;
  let helperMin = 0;
  for (const e of eligibleEntries) {
    const min = calcWorkMin(e);
    if (e.isHelper) helperMin += min;
    else fachMin += min;
  }
  const fachH = Math.round((fachMin / 60) * 100) / 100;
  const helperH = Math.round((helperMin / 60) * 100) / 100;

  const eligibleOrders = orders.filter(
    (o) =>
      norm(o.projectNumber) === pn &&
      o.transactionType !== 'return' &&
      o.status === 'Erledigt' &&
      !o.isBilled,
  );
  let matNetto = 0;
  for (const o of eligibleOrders) {
    const price = materials.find((m) => m.id === o.materialId)?.purchasePrice ?? 0;
    // Fehlende Menge als 1 werten, nicht als 0 — sonst fällt die Position
    // kommentarlos aus der Rechnung.
    matNetto += price * (1 + rates.materialMarkup) * (o.quantity || 1);
  }

  const positions: InvoicePosition[] = [];
  if (fachH > 0)
    positions.push({ label: 'Facharbeiterstunden', qty: fachH, unit: 'h', unitPrice: rates.fach, netto: fachH * rates.fach });
  if (helperH > 0)
    positions.push({ label: 'Helferstunden', qty: helperH, unit: 'h', unitPrice: rates.helper, netto: helperH * rates.helper });
  if (matNetto > 0)
    positions.push({
      // Positionszahl und Aufschlag benennen — sonst ist für den Kunden nicht
      // nachvollziehbar, was in der Materialpauschale steckt.
      label: `Material (${eligibleOrders.length} Pos., inkl. ${Math.round(rates.materialMarkup * 100)} % Aufschlag)`,
      qty: 1,
      unit: 'pauschal',
      unitPrice: matNetto,
      netto: matNetto,
    });

  const totalNetto = Math.round(positions.reduce((s, p) => s + p.netto, 0) * 100) / 100;
  const totalVat = Math.round(totalNetto * rates.vatRate * 100) / 100;
  const totalBrutto = Math.round((totalNetto + totalVat) * 100) / 100;

  return {
    positions,
    totalNetto,
    totalVat,
    totalBrutto,
    linkedEntries: eligibleEntries.map((e) => e.id),
    linkedOrders: eligibleOrders.map((o) => o.id),
    entries: eligibleEntries,
  };
}
