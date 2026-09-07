import type { Material, InvoiceDiscount, InvoiceRates, TimeEntry, WorkSheet } from '@/types';
import { calcWorkMin } from '@/lib/time';
import { calcTotals, cent, positionNetto, type InvoicePosition } from './totals';
import { leistungszeitraum, materialPositionen } from './materialPositionen';

export type { InvoicePosition } from './totals';

/**
 * Ausgangswerte, solange ein Betrieb seine Sätze noch nicht gepflegt hat.
 * Die tatsächlichen Werte stehen in companies/{id}.rates und werden in den
 * Einstellungen von der Geschäftsführung festgelegt.
 */
export const INVOICE_DEFAULTS: InvoiceRates = {
  fach: 65,
  helper: 45,
  nightSurcharge: 0.5, // +50 %
  emergencySurcharge: 1, // +100 %
  vatRate: 0.2,
  dueDays: 14,
};

export interface AssembledInvoice {
  positions: InvoicePosition[];
  /** Summe der Positionen vor Rabatt. */
  subtotalNetto: number;
  discount?: InvoiceDiscount | null;
  discountAmount: number;
  totalNetto: number;
  totalVat: number;
  totalBrutto: number;
  linkedEntries: string[];
  linkedOrders: string[];
  /** Scheine, deren Material eingeflossen ist — die Rechnung merkt sie sich. */
  linkedWorkSheets: string[];
  /**
   * Vorschlag für den Leistungszeitraum, aus den Belegen abgeleitet.
   *
   * `null` heisst: es gibt keinen datierten Beleg. Dann bleibt das Feld leer
   * und will ausgefüllt werden — eine erfundene Angabe wäre gegenüber dem
   * Finanzamt falsch.
   */
  leistung: { von: string; bis: string } | null;
  /** Materialzeilen ohne Preis im Katalog — die Ansicht weist darauf hin. */
  materialOhnePreis: string[];
  entries: TimeEntry[]; // für optionalen Leistungsnachweis
}

/**
 * Rechnet die Summen einer bearbeiteten Rechnung neu.
 *
 * Positionen sind seit der flexiblen Rechnung veraenderlich: Mengen und
 * Preise lassen sich anpassen, eigene Zeilen hinzufuegen. Diese Funktion ist
 * die EINE Stelle, an der aus Positionen und Rabatt die Summen entstehen —
 * damit Vorschau, gespeicherte Rechnung und PDF nicht auseinanderlaufen.
 */
export function recalc(
  base: AssembledInvoice,
  positions: InvoicePosition[],
  vatRate: number,
  discount?: InvoiceDiscount | null,
): AssembledInvoice {
  const gerundet = positions.map((p) => ({ ...p, netto: positionNetto(p.qty, p.unitPrice) }));
  return { ...base, positions: gerundet, discount: discount ?? null, ...calcTotals(gerundet, vatRate, discount) };
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

/** Ein Abrechnungstopf: gleiche Qualifikation, gleiche Zuschläge. */
interface Bucket {
  helper: boolean;
  night: boolean;
  emergency: boolean;
  minutes: number;
}

function bucketKey(e: TimeEntry): string {
  return `${e.isHelper ? 'h' : 'f'}|${e.isNightWork ? 'n' : '-'}|${e.isEmergency ? 'e' : '-'}`;
}

/** Beschriftung der Position, damit der Kunde den Aufschlag nachvollziehen kann. */
function positionLabel(b: Bucket, rates: InvoiceRates): string {
  const base = b.helper ? 'Helferstunden' : 'Facharbeiterstunden';
  const extras: string[] = [];
  if (b.emergency) extras.push(`Notdienst +${Math.round(rates.emergencySurcharge * 100)} %`);
  if (b.night) extras.push(`Nachtarbeit +${Math.round(rates.nightSurcharge * 100)} %`);
  return extras.length ? `${base} (${extras.join(', ')})` : base;
}

/**
 * Stellt die Rechnungspositionen für ein Projekt zusammen.
 *
 * ZWEI QUELLEN, und die zweite kam spät dazu: Zeiteinträge und das Material
 * aus den unterschriebenen Handwerksscheinen. Bis dahin verrechnete diese App
 * ausschließlich Stunden — bei einem Installateur schnell die Hälfte der
 * Rechnungssumme, die das Büro von Hand nachtippen musste.
 *
 * Die Materialquelle ist der SCHEIN, nicht die Anforderung: was angefordert
 * wurde, ist nicht, was verbaut wurde, und die Anforderung hat der Kunde nie
 * gesehen. Näheres in `materialPositionen.ts`.
 *
 * BEIDES BLEIBT ÄNDERBAR. Die Positionen dieser Vorschau lassen sich in der
 * Ansicht bearbeiten und entfernen, eigene Zeilen kommen dazu. Automatisch
 * heisst hier „vorbereitet", nicht „festgelegt" — der Betrieb entscheidet, was
 * beim Kunden landet.
 *
 * Zuschläge für Nachtarbeit und Notdienst sind Anteile des Stundensatzes und
 * ADDIEREN sich: ein Notdiensteinsatz in der Nacht kostet den Grundsatz plus
 * beide Zuschläge. Jede Kombination wird als eigene Position ausgewiesen,
 * damit die Rechnung nachvollziehbar bleibt.
 */
export function assembleInvoice(
  projectNumber: string,
  timeEntries: Array<TimeEntry & { id: string }>,
  rates: InvoiceRates = INVOICE_DEFAULTS,
  material?: {
    scheine: Array<WorkSheet & { id: string }>;
    katalog: Material[];
    bereitsVerrechnet?: ReadonlySet<string>;
  },
): AssembledInvoice {
  const pn = norm(projectNumber);

  const eligibleEntries = timeEntries.filter(
    (e) => e.status === 'Anwesend' && norm(e.projectNumber) === pn && !e.isBilled,
  );

  const buckets = new Map<string, Bucket>();
  for (const e of eligibleEntries) {
    const min = calcWorkMin(e);
    if (min <= 0) continue;
    const key = bucketKey(e);
    const cur = buckets.get(key) ?? {
      helper: !!e.isHelper,
      night: !!e.isNightWork,
      emergency: !!e.isEmergency,
      minutes: 0,
    };
    cur.minutes += min;
    buckets.set(key, cur);
  }

  const positions: InvoicePosition[] = [];
  // Feste Reihenfolge: erst Facharbeiter, dann Helfer; innerhalb davon
  // Grundleistung vor Zuschlagsarbeit.
  const ordered = [...buckets.values()].sort((a, b) => {
    if (a.helper !== b.helper) return a.helper ? 1 : -1;
    const rank = (x: Bucket) => (x.emergency ? 2 : 0) + (x.night ? 1 : 0);
    return rank(a) - rank(b);
  });

  for (const b of ordered) {
    const hours = Math.round((b.minutes / 60) * 100) / 100;
    if (hours <= 0) continue;
    const baseRate = b.helper ? rates.helper : rates.fach;
    const factor =
      1 +
      (b.night ? rates.nightSurcharge : 0) +
      (b.emergency ? rates.emergencySurcharge : 0);
    const unitPrice = cent(baseRate * factor);
    positions.push({
      label: positionLabel(b, rates),
      qty: hours,
      unit: 'h',
      unitPrice,
      netto: positionNetto(hours, unitPrice),
    });
  }

  /*
    Material NACH den Stunden.

    Der Kunde liest die Rechnung von oben: erst die Arbeit, für die er jemanden
    gerufen hat, dann das, was dabei verbaut wurde. Umgekehrt stünde eine
    Liste von Kleinteilen vor der Leistung.
  */
  const mat = material
    ? materialPositionen(material.scheine, material.katalog, material.bereitsVerrechnet)
    : { positionen: [], herkunft: { scheine: [], ohnePreis: [] } };
  positions.push(...mat.positionen);

  /*
    Der Leistungszeitraum spannt sich über BEIDE Quellen.

    Ein Schein kann einen Tag betreffen, an dem keine Stunden gebucht sind —
    etwa wenn nur geliefert und verbaut wurde. Nähme man nur die Zeiteinträge,
    fiele dieser Tag aus dem Zeitraum, den die Rechnung behauptet.
  */
  const verbraucht = new Set(mat.herkunft.scheine);
  const leistung = leistungszeitraum([
    ...eligibleEntries.map((e) => e.date),
    ...material?.scheine.filter((s) => verbraucht.has(s.id)).map((s) => s.datum) ?? [],
  ]);

  return {
    positions,
    discount: null,
    ...calcTotals(positions, rates.vatRate),
    linkedEntries: eligibleEntries.map((e) => e.id),
    linkedOrders: [],
    linkedWorkSheets: mat.herkunft.scheine,
    leistung,
    materialOhnePreis: mat.herkunft.ohnePreis,
    entries: eligibleEntries,
  };
}
