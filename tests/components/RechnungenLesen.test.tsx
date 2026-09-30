import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * Die Leseliste der Projektleitung (Testbericht 30.09.2026, M38): welche
 * Rechnungen ankommen, entscheidet die Datenbank; hier steht nur, was da ist
 * — und kein Weg zum Anlegen, Ändern oder Mahnen.
 */
const authWert = { user: { uid: 'pl', companyId: 'perl', name: 'Paula Leitung', role: 'Projektleiter' } };
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));
vi.mock('@/lib/db/invoices', () => ({
  subscribeRecentInvoices: (_c: string, _m: number, cb: (r: unknown[]) => void) => {
    cb([{
      id: 'r1', invoiceNumber: 'RE-2026-0007', customerName: 'Familie Huber', projectNumber: 'PR-2026-0003',
      invoiceDate: '2026-09-01', totalBrutto: 1200, bezahltBetrag: 200, paymentStatus: 'Teilbezahlt',
    }]);
    return () => {};
  },
}));

const { default: RechnungenLesen } = await import('@/features/invoices/RechnungenLesen');

describe('Rechnungen lesen', () => {
  it('zeigt die Rechnung mit Baustelle, Stand und offenem Betrag — und keinen Knopf', () => {
    render(<RechnungenLesen />);
    expect(screen.getByText('RE-2026-0007 · Familie Huber')).toBeInTheDocument();
    expect(screen.getByText(/Baustelle PR-2026-0003/)).toBeInTheDocument();
    expect(screen.getByText(/offen € 1[.\s]000,00/)).toBeInTheDocument();
    expect(screen.getByText('Teilbezahlt')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
