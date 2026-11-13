import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';

/**
 * Die Leseliste der Projektleitung (Testbericht 30.09.2026, M38): welche
 * Rechnungen ankommen, entscheidet die Datenbank; hier steht nur, was da ist
 * — und kein Weg zum Anlegen, Ändern oder Mahnen.
 *
 * Seit der Linie „Lot“ hat sie wie jede Liste Segmente und eine Suche
 * (Protokoll E6); geladen wird dieselbe Abfrage wie vorher.
 */
const authWert = { user: { uid: 'pl', companyId: 'perl', name: 'Paula Leitung', role: 'Projektleiter' } };
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

let zeilen: unknown[] = [];
vi.mock('@/lib/db/invoices', () => ({
  subscribeRecentInvoices: (_c: string, _m: number, cb: (r: unknown[]) => void) => {
    cb(zeilen);
    return () => {};
  },
}));

const TEILBEZAHLT = {
  id: 'r1', invoiceNumber: 'RE-2026-0007', customerName: 'Familie Huber', projectNumber: 'PR-2026-0003',
  invoiceDate: '2026-09-01', dueDate: '2099-01-01', totalBrutto: 1200, bezahltBetrag: 200, paymentStatus: 'Teilbezahlt',
};
const BEZAHLT = {
  id: 'r2', invoiceNumber: 'RE-2026-0003', customerName: 'Gasthof Post', projectNumber: 'PR-2026-0001',
  invoiceDate: '2026-07-01', dueDate: '2026-07-15', totalBrutto: 500, bezahltBetrag: 500, paymentStatus: 'Bezahlt',
};

const { default: RechnungenLesen } = await import('@/features/invoices/RechnungenLesen');

function zeige(adresse = '/invoices') {
  return render(
    <MemoryRouter initialEntries={[adresse]}>
      <RechnungenLesen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  zeilen = [TEILBEZAHLT];
});

describe('Rechnungen lesen', () => {
  it('zeigt die Rechnung mit Baustelle, Stand und offenem Betrag — und keinen Knopf, der etwas tut', () => {
    zeige();
    expect(screen.getByText('RE-2026-0007')).toBeInTheDocument();
    expect(screen.getByText(/Baustelle PR-2026-0003/)).toBeInTheDocument();
    expect(screen.getByText(/offen € 1[.\s]000,00/)).toBeInTheDocument();
    expect(screen.getByText('Teilbezahlt')).toBeInTheDocument();
    // Die einzigen Knöpfe sind die der Auswahl; keine Zeile öffnet etwas, nichts legt an oder mahnt.
    // Die Hilfe der Seite zählt nicht: sie trägt am Handy den Untertitel (E86) und tut sonst nichts.
    const knoepfe = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-label') !== 'Hilfe zu dieser Seite').map((b) => b.textContent);
    expect(knoepfe).toEqual(['Offen', 'Erledigt', 'Alle']);
  });

  it('hält Baustelle und offenen Betrag am Stück — am Handy brach „Baustelle B-“ vom Rest (17 J)', () => {
    // Gegenprobe: vorher stand die zweite Zeile als ein Text da, umbrechbar an jedem Bindestrich.
    zeige();
    expect(screen.getByText('Baustelle PR-2026-0003')).toHaveClass('whitespace-nowrap');
    expect(screen.getByText(/^offen € 1[.\s]000,00$/)).toHaveClass('whitespace-nowrap');
  });

  it('zeigt zuerst den Arbeitsstand — Bezahltes steht unter „Alle“', async () => {
    zeilen = [TEILBEZAHLT, BEZAHLT];
    zeige();
    expect(screen.getByText('RE-2026-0007')).toBeInTheDocument();
    expect(screen.queryByText('RE-2026-0003')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Alle' }));
    expect(screen.getByText('RE-2026-0003')).toBeInTheDocument();
  });

  it('Gegenprobe: „Erledigt“ zeigt nur das Bezahlte', () => {
    zeilen = [TEILBEZAHLT, BEZAHLT];
    zeige('/invoices?ansicht=erledigt');
    expect(screen.getByText('RE-2026-0003')).toBeInTheDocument();
    expect(screen.queryByText('RE-2026-0007')).toBeNull();
  });

  it('sucht nach Nummer, Kunde oder Baustelle', async () => {
    zeilen = [TEILBEZAHLT, { ...BEZAHLT, paymentStatus: 'Offen', bezahltBetrag: 0 }];
    zeige();
    expect(screen.getByText('RE-2026-0003')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Suche'), 'PR-2026-0003');
    expect(screen.getByText('RE-2026-0007')).toBeInTheDocument();
    expect(screen.queryByText('RE-2026-0003')).toBeNull();
  });
});

/*
  AUS „SUCHEN ODER SPRINGEN“ (C3, E91): die Nummer kommt als `?suche=`. Die
  gesuchte Rechnung ist oft bezahlt — also gilt „Alle“, sonst stünde sie
  nicht da.
*/
describe('Rechnungen lesen — Nummer aus der Adresse (E91)', () => {
  it('filtert auf die Nummer und zeigt auch die bezahlte', () => {
    zeilen = [TEILBEZAHLT, BEZAHLT];
    zeige('/invoices?suche=RE-2026-0003');
    expect(screen.getByText('RE-2026-0003')).toBeInTheDocument();
    expect(screen.queryByText('RE-2026-0007')).toBeNull();
    expect(screen.getByRole('searchbox')).toHaveValue('RE-2026-0003');
  });

  it('übernimmt eine neue Nummer auch, wenn die Liste schon offen ist', async () => {
    zeilen = [TEILBEZAHLT, BEZAHLT];
    let springen: (ziel: string) => void = () => undefined;
    function Springer() {
      const navigate = useNavigate();
      springen = navigate;
      return null;
    }
    render(
      <MemoryRouter initialEntries={['/invoices?suche=RE-2026-0003']}>
        <Springer />
        <RechnungenLesen />
      </MemoryRouter>,
    );
    expect(screen.queryByText('RE-2026-0007')).toBeNull();
    const { act } = await import('@testing-library/react');
    act(() => springen('/invoices?suche=RE-2026-0007'));
    expect(await screen.findByText('RE-2026-0007')).toBeInTheDocument();
    expect(screen.queryByText('RE-2026-0003')).toBeNull();
  });

  it('Gegenprobe: ohne Suche bleibt es beim Arbeitsstand „Offen“', () => {
    zeilen = [TEILBEZAHLT, BEZAHLT];
    zeige();
    expect(screen.getByText('RE-2026-0007')).toBeInTheDocument();
    expect(screen.queryByText('RE-2026-0003')).toBeNull();
  });
});
