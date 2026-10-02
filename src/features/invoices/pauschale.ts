import type { Invoice, Quote, RechnungsArt } from '@/types';
import type { AssembledInvoice } from './assemble';
import { norm } from './assemble';
import { calcTotals, istPreiszeile, zeilenNetto, type InvoicePosition } from './totals';

/**
 * Die Rechnung einer PAUSCHALBAUSTELLE.
 *
 * Aus dem Launch-Check (25.09.2026, K3): eine Baustelle aus einem Angebot
 * über 275 € netto ist „Pauschal", der Schein sagt „Stunden keine Grundlage
 * für Nachverrechnung" — und die Rechnung stellte trotzdem 6 h × 65 € plus
 * Material in Rechnung. Die Vorschau kannte das Angebot gar nicht; sie
 * rechnete jede Baustelle wie eine Regiebaustelle.
 *
 * WAS JETZT GILT. Auf einer Pauschalbaustelle ist das angenommene Angebot die
 * Rechnung: seine Positionen, sein Rabatt, sein Betrag. Stunden und Material
 * der Scheine sind darin enthalten und werden nicht einzeln verrechnet —
 * aber als verrechnet MARKIERT, damit sie weder bei der nächsten Rechnung
 * wieder auftauchen noch als „nicht verrechnete Leistung" mahnen.
 *
 * Ohne angenommenes Angebot (die Baustelle wurde von Hand auf Pauschal
 * gestellt) steht eine Zeile mit 0,00 € da — wie bei der Anzahlung: die Null
 * sieht aus wie ein Preis, ist aber eine fehlende Entscheidung.
 */

/**
 * Art und Positionsrabatt gehen aus dem Angebot mit (M18): ein Titel bleibt
 * ein Titel, und der Rabatt, den das Angebot einer Position gab, gibt auch
 * die Rechnung. Nur gesetzt, wo vorhanden — ältere Angebote ergeben
 * dieselben Zeilen wie bisher.
 */
function mitArt(
  quelle: Pick<InvoicePosition, 'art' | 'rabattProzent'>,
  zeile: InvoicePosition,
): InvoicePosition {
  return {
    ...zeile,
    ...(quelle.art && quelle.art !== 'position' ? { art: quelle.art } : {}),
    ...(quelle.rabattProzent != null ? { rabattProzent: quelle.rabattProzent } : {}),
  };
}

/** Das Angebot, das diese Baustelle trägt — das jüngste angenommene. */
export function pauschalAngebot<T extends Quote>(angebote: T[]): T | null {
  return (
    angebote
      .filter((q) => q.status === 'Angenommen')
      .sort((a, b) => (b.quoteDate ?? '').localeCompare(a.quoteDate ?? ''))[0] ?? null
  );
}

/**
 * Ist die Pauschale dieser Baustelle schon verrechnet — und womit?
 *
 * Eine Einzel- oder Schlussrechnung, die nicht storniert ist, hat sie
 * verrechnet. Anzahlung und Teilrechnung zählen nicht: sie werden in der
 * Schlussrechnung abgezogen.
 */
export function pauschaleVerrechnetMit(rechnungen: Invoice[], projectNumber: string): string | null {
  const pn = norm(projectNumber);
  const treffer = rechnungen.find(
    (r) =>
      norm(r.projectNumber) === pn &&
      r.paymentStatus !== 'Storniert' &&
      (r.art ?? 'einzel') !== 'anzahlung' &&
      (r.art ?? 'einzel') !== 'teil',
  );
  return treffer?.invoiceNumber ?? null;
}

/** Die Vorschau einer Pauschalbaustelle aus dem, was die Belege ergeben hätten. */
export function pauschalVorschau(
  art: RechnungsArt,
  belege: AssembledInvoice,
  angebot: Quote | null,
  vatRate: number,
): AssembledInvoice {
  /*
    EINE TEILRECHNUNG AUF EINE PAUSCHALE ist ein Teilbetrag, kein
    Bauabschnitt: sie verbraucht keine Belege und wird deshalb in der
    Schlussrechnung abgezogen, wie eine Anzahlung. Den Betrag legt die
    Vereinbarung fest, nicht die Stunden.
  */
  if (art === 'teil') {
    const zeile: InvoicePosition = {
      label: angebot ? `Teilbetrag der Pauschale laut Angebot ${angebot.quoteNumber}` : 'Teilbetrag der Pauschale',
      qty: 1,
      unit: 'Pauschale',
      unitPrice: 0,
      netto: 0,
    };
    return {
      ...belege,
      positions: [zeile],
      discount: null,
      ...calcTotals([zeile], vatRate),
      linkedEntries: [],
      linkedOrders: [],
      linkedWorkSheets: [],
      materialOhnePreis: [],
      entries: [],
    };
  }

  const positionen: InvoicePosition[] = angebot
    ? angebot.positions.map((p) => mitArt(p, {
        label: p.label,
        qty: p.qty,
        unit: p.unit,
        unitPrice: p.unitPrice,
        netto: zeilenNetto(p),
      }))
    : [{ label: 'Pauschale gemäß Vereinbarung', qty: 1, unit: 'Pauschale', unitPrice: 0, netto: 0 }];
  const discount = angebot?.discount ?? null;
  return {
    ...belege,
    positions: positionen,
    discount,
    ...calcTotals(positionen, vatRate, discount),
    // Enthalten, nicht verrechnet: kein Material ohne Preis zu beklagen.
    materialOhnePreis: [],
  };
}

/**
 * Die Vorschau einer EINHEITSPREIS-Baustelle (Testbericht 30.09.2026, M16).
 *
 * Positionen und Einheitspreise kommen aus dem angenommenen Angebot, die
 * MENGEN aus dem Aufmaß. Vorbelegt sind die Mengen des Angebots — bei einer
 * Teilrechnung null, denn dort zählt, was bisher gemessen wurde; die Null ist
 * rot und damit eine offene Entscheidung, keine Zahl. Wie bei der Pauschale
 * sind Stunden und Material der Scheine enthalten und werden nicht einzeln
 * verrechnet; eine Teilrechnung verbraucht keine Belege und wird in der
 * Schlussrechnung abgezogen.
 *
 * Ohne Angebot steht eine leere Zeile da — Positionen, Mengen und Preise
 * trägt dann das Büro ein.
 */
export function einheitspreisVorschau(
  art: RechnungsArt,
  belege: AssembledInvoice,
  angebot: Quote | null,
  vatRate: number,
): AssembledInvoice {
  const teil = art === 'teil';
  const positionen: InvoicePosition[] = angebot
    ? angebot.positions.map((p) => {
        // Titel und Text haben keine Menge, auch nicht nach Aufmaß.
        const qty = teil && istPreiszeile(p) ? 0 : p.qty;
        return mitArt(p, { label: p.label, qty, unit: p.unit, unitPrice: p.unitPrice, netto: zeilenNetto({ ...p, qty }) });
      })
    : [{ label: 'Leistung nach Aufmaß', qty: 0, unit: '', unitPrice: 0, netto: 0 }];
  const discount = angebot?.discount ?? null;
  return {
    ...belege,
    positions: positionen,
    discount,
    ...calcTotals(positionen, vatRate, discount),
    materialOhnePreis: [],
    ...(teil
      ? { linkedEntries: [], linkedOrders: [], linkedWorkSheets: [], entries: [] }
      : {}),
  };
}
