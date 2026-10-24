import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Company, Customer, Invoice } from '@/types';
import type { WithId } from '@/lib/db/core';

/**
 * DER DIALOG ZUR E-RECHNUNG (ebInterface 6.1, 19.10.2026).
 *
 * Er belegt vor, was der Kundenstamm weiß, zeigt VOR dem Laden, was fehlt,
 * und lädt erst, wenn die Datei angenommen würde. Gegenprobe: ohne den Dialog
 * gibt es keinen Weg zur Datei (rot); mit fehlenden Angaben entsteht keine.
 */

let kunden: WithId<Customer>[] = [];
const updateCustomer = vi.fn(async () => 1);
vi.mock('@/lib/db/customers', () => ({
  kundenNachNamen: vi.fn(async () => kunden),
  updateCustomer: (...a: unknown[]) => updateCustomer(...(a as [])),
}));
/*
  DIE FIRMENDATEN DER AUSSTELLUNG (seit 24.10.2026): mit Stand Anschrift und
  Bank von damals, ohne Stand die heutigen.
*/
const belegFirma = vi.fn(async (f: Company, stand?: string | null) =>
  stand ? { ...f, strasse: 'Alte Gasse 3', iban: 'AT483200000012345864' } : f);
vi.mock('@/lib/db/aussteller', () => ({
  belegFirma: (f: Company, stand?: string | null) => belegFirma(f, stand),
}));
const toast = { success: vi.fn(), error: vi.fn() };
vi.mock('@/components/Toast', () => ({ useToast: () => toast }));

const { default: EbInterfaceDialog } = await import('@/features/invoices/EbInterfaceDialog');

const firma = {
  id: 'perl', name: 'Perl Installationen GmbH', strasse: 'Hauptstraße 12', plz: '2700', ort: 'Wiener Neustadt', land: 'AT',
  contactLine: 'office@perl.at', iban: 'AT611904300234573201', vatId: 'ATU12345678',
} as Company;
const rechnung = (extra: Partial<Invoice> = {}) => ({
  id: 'r1', companyId: 'perl', invoiceNumber: 'RE-2026-1042', projectNumber: 'B-17', customerName: 'Bundesamt für Wasser',
  address: 'Ringstraße 1, 1010 Wien', invoiceDate: '2026-10-15', dueDate: '2026-10-29', leistungVon: '2026-10-01', leistungBis: '2026-10-10',
  vatRate: 0.2, positions: [{ label: 'Leistung', qty: 2, unit: 'Std', unitPrice: 70, netto: 140 }],
  subtotalNetto: 140, totalNetto: 140, totalVat: 28, totalBrutto: 168, paymentStatus: 'Offen', bestellnummer: '4700000001',
  ...extra,
}) as WithId<Invoice>;

let geladen: Blob[] = [];
beforeEach(() => {
  kunden = [{ id: 'k1', companyId: 'perl', name: 'Bundesamt für Wasser', lieferantennummer: '50012345', email: 'rechnung@wasser.gv.at' } as WithId<Customer>];
  updateCustomer.mockClear();
  toast.success.mockClear();
  toast.error.mockClear();
  geladen = [];
  URL.createObjectURL = vi.fn((b: Blob) => { geladen.push(b); return 'blob:x'; }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  // jsdom navigiert nicht; der Klick auf den Download-Verweis bleibt still.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

/** jsdom kennt `Blob.text()` nicht. */
const lesen = (b: Blob) => new Promise<string>((ok) => {
  const f = new FileReader();
  f.onload = () => ok(String(f.result));
  f.readAsText(b);
});

function zeige(o: { inv?: WithId<Invoice>; storno?: boolean; pflegen?: boolean } = {}) {
  const onClose = vi.fn();
  render(<EbInterfaceDialog inv={o.inv ?? rechnung()} storno={o.storno} company={firma} darfKundenPflegen={o.pflegen ?? true} onClose={onClose} />);
  return onClose;
}

describe('E-Rechnung: Dialog', () => {
  it('belegt Bestellnummer und Lieferantennummer vor', async () => {
    zeige();
    expect(screen.getByRole('dialog', { name: 'E-Rechnung — RE-2026-1042' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Bestellnummer des Kunden/)).toHaveValue('4700000001');
    await waitFor(() => expect(screen.getByLabelText(/Unsere Lieferantennummer/)).toHaveValue('50012345'));
  });

  it('lädt die Datei für ein Unternehmen — mit der E-Mail des Kunden darin', async () => {
    const onClose = zeige();
    await waitFor(() => expect(screen.getByLabelText(/Unsere Lieferantennummer/)).toHaveValue('50012345'));
    await userEvent.click(screen.getByRole('button', { name: 'Datei laden' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(geladen).toHaveLength(1);
    const xml = await lesen(geladen[0]);
    expect(xml).toContain('<InvoiceNumber>RE-2026-1042</InvoiceNumber>');
    expect(xml).toContain('<Email>rechnung@wasser.gv.at</Email>');
    expect(toast.success).toHaveBeenCalledWith('E-Rechnung RE-2026-1042 geladen');
    // Nichts geändert: am Kunden wird nichts gespeichert.
    expect(updateCustomer).not.toHaveBeenCalled();
  });

  it('Bund: fragt nach der Bestellposition und lädt mit ihr', async () => {
    zeige();
    await userEvent.click(screen.getByRole('button', { name: 'Bund' }));
    expect(screen.getByLabelText(/Auftragsreferenz/)).toHaveValue('4700000001');
    expect(screen.getByLabelText(/Bestellposition/)).toHaveValue('10');
    await waitFor(() => expect(screen.getByLabelText(/Unsere Lieferantennummer/)).toHaveValue('50012345'));
    await userEvent.click(screen.getByRole('button', { name: 'Datei laden' }));
    await waitFor(() => expect(geladen).toHaveLength(1));
    const xml = await lesen(geladen[0]);
    expect(xml).toContain('<OrderPositionNumber>10</OrderPositionNumber>');
    expect(xml).toContain('<InvoiceRecipientsBillerID>50012345</InvoiceRecipientsBillerID>');
  });

  it('zeigt, was fehlt, und lädt dann nichts', async () => {
    kunden = [];
    const onClose = zeige();
    await userEvent.click(screen.getByRole('button', { name: 'Bund' }));
    expect(await screen.findByText(/Lieferantennummer des Bundes ist achtstellig/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Datei laden' }));
    expect(await screen.findByText(/Erst die Angaben unten ergänzen/)).toBeInTheDocument();
    expect(geladen).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('eine neue Lieferantennummer merkt sich beim Kunden, wer Kunden pflegt', async () => {
    kunden = [{ ...kunden[0], lieferantennummer: null }];
    zeige();
    await userEvent.type(screen.getByLabelText(/Unsere Lieferantennummer/), '50099999');
    expect(await screen.findByLabelText('Lieferantennummer beim Kunden merken')).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Datei laden' }));
    await waitFor(() => expect(updateCustomer).toHaveBeenCalledWith('perl', 'k1', { lieferantennummer: '50099999' }));
  });

  it('ohne das Recht, Kunden zu pflegen, gilt sie nur für diese Datei', async () => {
    kunden = [{ ...kunden[0], lieferantennummer: null }];
    zeige({ pflegen: false });
    await userEvent.type(screen.getByLabelText(/Unsere Lieferantennummer/), '50099999');
    expect(await screen.findByText(/Gilt nur für diese Datei/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Datei laden' }));
    await waitFor(() => expect(geladen).toHaveLength(1));
    expect(updateCustomer).not.toHaveBeenCalled();
  });

  it('die Stornorechnung: mit ihrer Nummer und dem Verweis auf die Rechnung', async () => {
    zeige({
      storno: true,
      inv: rechnung({ paymentStatus: 'Storniert', stornoNummer: 'RE-2026-1050', stornoAm: Date.parse('2026-10-20T09:00:00Z') }),
    });
    expect(screen.getByRole('dialog', { name: 'E-Rechnung — Stornorechnung RE-2026-1050' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Datei laden' }));
    await waitFor(() => expect(geladen).toHaveLength(1));
    expect(await lesen(geladen[0])).toContain('<CancelledOriginalDocument>');
  });
});

describe('E-Rechnung mit den Firmendaten der Ausstellung (24.10.2026)', () => {
  it('der Rechnungssteller steht so darin, wie er auf der Rechnung stand', async () => {
    const onClose = zeige({ inv: rechnung({ ausstellerStand: 'st-1' }) });
    await waitFor(() => expect(screen.getByLabelText(/Unsere Lieferantennummer/)).toHaveValue('50012345'));
    await userEvent.click(screen.getByRole('button', { name: 'Datei laden' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const xml = await lesen(geladen[0]);
    expect(xml).toContain('Alte Gasse 3');
    expect(xml).toContain('AT483200000012345864');
    expect(xml).not.toContain('Hauptstraße 12');
  });

  it('die Stornorechnung mit ihrem eigenen Stand', async () => {
    belegFirma.mockClear();
    zeige({ inv: rechnung({ ausstellerStand: 'st-1', stornoAusstellerStand: 'st-2', stornoNummer: 'RE-2026-1050' }), storno: true });
    await waitFor(() => expect(belegFirma).toHaveBeenCalled());
    expect(belegFirma.mock.calls[0][1]).toBe('st-2');
  });

  it('kommen die Firmendaten nicht, sagt es der Dialog und lädt nichts', async () => {
    belegFirma.mockRejectedValueOnce(new Error('Die Firmendaten dieses Belegs konnten nicht geladen werden.'));
    const onClose = zeige({ inv: rechnung({ ausstellerStand: 'st-1' }) });
    expect(await screen.findAllByText(/Firmendaten dieses Belegs/)).not.toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Datei laden' }));
    expect(geladen).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
  });
});
