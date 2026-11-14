import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import RechnungDetail from '@/features/invoices/RechnungDetail';
import type { Invoice } from '@/types';

/**
 * Die Rechnung im Seitenfenster (Testbericht Runde 6, G1): der Kopf „Menge“
 * brach zu „Meng/e“, und die Zeile las sich „1 Stk7 500,50“. Layout rechnet
 * jsdom nicht — geprüft wird, was es verhindert: Köpfe und Zahlen brechen
 * nicht, und die Zahlenspalten halten Abstand zur Spalte davor.
 */
const RECHNUNG = {
  id: 'r1', companyId: 'perl', invoiceNumber: 'RE-2026-1502', projectNumber: 'PR-2026-0190', customerName: 'Familie Huber',
  address: 'Hauptplatz 1, 8200 Gleisdorf', invoiceDate: '2026-10-20', dueDate: '2026-11-03', vatRate: 0.2,
  positions: [{ label: 'Therme samt Montage', qty: 1, unit: 'Stk', unitPrice: 7500.5, netto: 7500.5 }],
  subtotalNetto: 7500.5, totalNetto: 7500.5, totalVat: 1500.1, totalBrutto: 9000.6, paymentStatus: 'Offen',
} as unknown as Invoice;

describe('Rechnung im Seitenfenster: Spalten (G1)', () => {
  it('Köpfe „Menge“ und „Netto“ brechen nicht, und die Zahlen kleben nicht aneinander', () => {
    render(<RechnungDetail inv={RECHNUNG} onClose={() => undefined} aktionen={[]} />);
    const tabelle = within(screen.getByRole('region', { name: 'Leistungen' })).getByRole('table');
    for (const [name, abstand] of [['Menge', 'stueck-menge'], ['Netto', 'stueck-betrag']]) {
      const kopf = within(tabelle).getByRole('columnheader', { name });
      expect(kopf.className).toContain('whitespace-nowrap');
      expect(kopf.className).toContain(abstand);
    }
    const zellen = within(tabelle).getAllByRole('cell');
    // Vorne die Pos-Nummer der Stückliste (Planlinie B6).
    expect(zellen.map((z) => z.textContent)).toEqual(['01', 'Therme samt Montage', '1 Stk', expect.stringContaining('7')]);
    for (const zelle of zellen.slice(2)) expect(zelle.className).toContain('whitespace-nowrap');
    expect(zellen[2].className).toContain('stueck-menge');
    expect(zellen[3].className).toContain('stueck-betrag');
    // Gleich bleibt: die Bezeichnung darf weiter umbrechen.
    expect(zellen[1].className).not.toContain('whitespace-nowrap');
  });
});

// Durchsicht 09.11.2026: bezahlte Mahnspesen und Zinsen stehen neben „Bezahlt“, nicht darin.
describe('Rechnung im Seitenfenster: Zahlstand mit Mahnspesen', () => {
  it('nennt bezahlte Mahnspesen und Zinsen eigens — und nur, wenn welche da sind', () => {
    const { unmount } = render(<RechnungDetail
      inv={{ ...RECHNUNG, paymentStatus: 'Bezahlt', bezahltBetrag: 9000.6, mahnkostenBetrag: 13.16 } as Invoice}
      onClose={() => undefined} aktionen={[]} />);
    const stand = screen.getByRole('region', { name: 'Zahlstand' });
    expect(within(stand).getByText('Mahnspesen und Zinsen bezahlt')).toBeInTheDocument();
    expect(within(stand).getByText('€ 13,16')).toBeInTheDocument();
    expect(within(stand).queryByText('Guthaben des Kunden')).toBeNull();
    unmount();
    render(<RechnungDetail inv={RECHNUNG} onClose={() => undefined} aktionen={[]} />);
    expect(within(screen.getByRole('region', { name: 'Zahlstand' })).queryByText('Mahnspesen und Zinsen bezahlt')).toBeNull();
  });
});

/*
  DER STAND AM BELEG (V10, 13.11.2026; Auftrag 11.5): Betrag, Offen mit
  Fälligkeit und Zustand stehen oben im Seitenfenster, vor den Handlungen —
  Beträge in Plex Mono (`rechnung-stand-betrag`, `rechnung-detail-betrag`).
*/
describe('V10: Stand am Beleg', () => {
  it('nennt Betrag, Offen mit Fälligkeit und den Zustand über den Handlungen', () => {
    render(<RechnungDetail inv={{ ...RECHNUNG, paymentStatus: 'Überfällig' } as Invoice} onClose={() => undefined}
      aktionen={[{ label: 'Zahlung erfassen', onSelect: () => undefined, haupt: true }]} />);
    const stand = document.querySelector('dl[aria-label="Stand der Rechnung"]') as HTMLElement;
    expect(stand).not.toBeNull();
    expect(within(stand).getByText('Betrag')).toBeInTheDocument();
    expect(within(stand).getByText('Offen')).toBeInTheDocument();
    expect(within(stand).getByText('fällig 03.11.2026')).toBeInTheDocument();
    expect(within(stand).getByText('Überfällig')).toBeInTheDocument();
    for (const b of within(stand).getAllByText(/€\s9\s000,60/)) expect(b.className).toBe('rechnung-stand-betrag');
    // Vor den Handlungen: wer zum Zahlen kommt, sieht zuerst, was offen ist.
    const knopf = screen.getByRole('button', { name: 'Zahlung erfassen' });
    expect(stand.compareDocumentPosition(knopf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('eine stornierte Rechnung hat kein „Offen“ im Stand', () => {
    render(<RechnungDetail inv={{ ...RECHNUNG, paymentStatus: 'Storniert' } as Invoice} onClose={() => undefined} aktionen={[]} />);
    const stand = document.querySelector('dl[aria-label="Stand der Rechnung"]') as HTMLElement;
    expect(within(stand).queryByText('Offen')).toBeNull();
    expect(within(stand).getByText('Storniert')).toBeInTheDocument();
  });

  it('Summen und Zahlstand in Mono, Sätze in der Textschrift', () => {
    render(<RechnungDetail inv={{ ...RECHNUNG, mahnstufe: 1, gemahntAm: '2026-11-05' } as Invoice} onClose={() => undefined} aktionen={[]} />);
    const summe = screen.getByRole('region', { name: 'Belegsumme' });
    for (const dd of summe.querySelectorAll('dd')) expect(dd.className).toBe('rechnung-detail-betrag');
    const zahl = screen.getByRole('region', { name: 'Zahlstand' });
    expect(within(zahl).getByText(/9\s000,60/).className).toBe('rechnung-detail-wert');
    // Gleich bleibt: der Satz „Stufe 1 am …“ steht nicht in Mono.
    expect(within(zahl).getByText(/^Stufe 1 am/).className).toBe('text-right text-ink');
  });
});

/*
  DER ABSTAND WIRKT (14.11.2026). `pl-3` an den Zellen verlor gegen die
  spezifischere Regel `.tabelle-eng td` (5 px) — jsdom rechnet keine Kaskade,
  deshalb prüft diese Prüfung die Regeln selbst: zwei Klassen, spezifischer
  als `.tabelle-eng td`, 12 px vor der Menge und 24 px vor dem Betrag.
  Die gemessene Lücke im Browser prüft tests/links/interaktionen.spec.ts.
*/
describe('Rechnung im Seitenfenster: Abstand der Zahlenspalten', () => {
  it('kommt aus Regeln, die gegen .tabelle-eng td gewinnen', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/styles/lot-rechnungen.css', 'utf8');
    expect(css).toContain('.rechnung-stueckliste .stueck-menge { padding-left: 0.75rem; }');
    expect(css).toContain('.rechnung-stueckliste .stueck-betrag { padding-left: 1.5rem; }');
    const quelle = readFileSync('src/features/invoices/RechnungDetail.tsx', 'utf8');
    // Gegenprobe: die wirkungslosen Utility-Abstände sind weg.
    expect(quelle).not.toMatch(/className="r whitespace-nowrap pl-\d"/);
  });
});
