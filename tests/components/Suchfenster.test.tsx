/**
 * „Suchen oder springen“ (Strg + K) — zusätzlich zu jedem bisherigen Weg,
 * und nie eine Tür, die das Menü der Rolle nicht hat.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { AppUser, Company } from '@/types';

let nutzer = { uid: 'u1', companyId: 'perl', name: 'Max', role: 'Mitarbeiter', email: 'm@perl.at' } as AppUser;
const betrieb = { id: 'perl', name: 'Perl' } as Company;
vi.mock('@/app/AuthContext', () => ({ useAuth: () => ({ user: nutzer, company: betrieb }) }));
vi.mock('./AuthContext', () => ({ useAuth: () => ({ user: nutzer, company: betrieb }) }));

const kundenSuche = vi.fn();
const baustellenSuche = vi.fn();
vi.mock('@/lib/db/customers', () => ({ searchCustomers: (...a: unknown[]) => kundenSuche(...a) }));
vi.mock('@/lib/db/projects', () => ({ searchProjects: (...a: unknown[]) => baustellenSuche(...a) }));

const { default: Suchfenster } = await import('@/app/Suchfenster');

function Ort() {
  return <p data-testid="ort">{useLocation().pathname}</p>;
}

function zeige(onSchliessen = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Suchfenster offen onSchliessen={onSchliessen} />
      <Routes>
        <Route path="*" element={<Ort />} />
      </Routes>
    </MemoryRouter>,
  );
  return onSchliessen;
}

beforeEach(() => {
  nutzer = { uid: 'u1', companyId: 'perl', name: 'Max', role: 'Mitarbeiter', email: 'm@perl.at' } as AppUser;
  kundenSuche.mockReset().mockResolvedValue([{ id: 'k1', name: 'Familie Huber', ort: 'Gleisdorf' }]);
  baustellenSuche.mockReset().mockResolvedValue([{ id: 'b1', projectNumber: '2026-014', customerName: 'Familie Huber' }]);
});

describe('Suchen oder springen', () => {
  it('kennt genau die Seiten der Rolle — der Monteur keine Rechnungen', () => {
    zeige();
    const liste = screen.getByRole('listbox', { name: 'Treffer' });
    expect(within(liste).getByRole('option', { name: /Zeiterfassung/ })).toBeInTheDocument();
    expect(within(liste).queryByRole('option', { name: /Rechnungen/ })).toBeNull();
    expect(within(liste).queryByRole('option', { name: /Benutzerverwaltung/ })).toBeNull();
  });

  it('springt mit Pfeil und Enter zur Seite und schliesst', async () => {
    const zu = zeige();
    await userEvent.type(screen.getByRole('combobox'), 'urlaub');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('ort')).toHaveTextContent('/vacations');
    expect(zu).toHaveBeenCalled();
  });

  it('findet auch Unterseiten — die Geschäftsführung „Nummernkreise“', async () => {
    nutzer = { ...nutzer, role: 'Geschäftsführung' };
    zeige();
    await userEvent.type(screen.getByRole('combobox'), 'nummern');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('ort')).toHaveTextContent('/settings/nummern');
  });

  it('sucht Kunden und Baustellen nur, wo die Rolle die Liste sehen darf', async () => {
    nutzer = { ...nutzer, role: 'Geschäftsführung' };
    zeige();
    await userEvent.type(screen.getByRole('combobox'), 'Huber');
    expect(await screen.findByRole('option', { name: /Familie Huber Gleisdorf/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /2026-014/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: /Familie Huber Gleisdorf/ }));
    expect(screen.getByTestId('ort')).toHaveTextContent('/customers/k1');
  });

  it('Gegenprobe: der Monteur fragt die Datenbank gar nicht erst', async () => {
    zeige();
    await userEvent.type(screen.getByRole('combobox'), 'Huber');
    await waitFor(() => expect(screen.getByText('Nichts gefunden.')).toBeInTheDocument(), { timeout: 1000 });
    await new Promise((r) => setTimeout(r, 300));
    expect(kundenSuche).not.toHaveBeenCalled();
    expect(baustellenSuche).not.toHaveBeenCalled();
  });

  it('Esc schliesst', async () => {
    const zu = zeige();
    await userEvent.keyboard('{Escape}');
    expect(zu).toHaveBeenCalled();
  });

  /*
    Ein Klick auf eine Gruppenüberschrift (oder sonst neben die Treffer)
    nimmt dem Suchfeld den Fokus; er liegt dann am Dokument. Esc muss das
    Fenster trotzdem schliessen — gefunden in der Vorschau: es blieb offen.
  */
  it('Esc schliesst auch, wenn das Suchfeld den Fokus verloren hat', async () => {
    const zu = zeige();
    await userEvent.click(screen.getAllByText('Seiten')[0]);
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    await userEvent.keyboard('{Escape}');
    expect(zu).toHaveBeenCalledTimes(1);
  });

  it('entfernt alte Datentreffer sofort, wenn der Suchbegriff wechselt', async () => {
    nutzer = { ...nutzer, role: 'Geschäftsführung' };
    zeige();
    const feld = screen.getByRole('combobox');
    await userEvent.type(feld, 'Huber');
    await screen.findByRole('option', { name: /Familie Huber Gleisdorf/ });
    await userEvent.type(feld, 'x');
    expect(screen.queryByRole('option', { name: /Familie Huber Gleisdorf/ })).toBeNull();
  });

  it('beendet die Ladeanzeige beim Leeren einer noch laufenden Suche', async () => {
    nutzer = { ...nutzer, role: 'Geschäftsführung' };
    let fertig!: (daten: []) => void;
    kundenSuche.mockImplementationOnce(() => new Promise<[]>((r) => { fertig = r; }));
    zeige();
    const feld = screen.getByRole('combobox');
    await userEvent.type(feld, 'Huber');
    await screen.findByRole('status');
    await waitFor(() => expect(kundenSuche).toHaveBeenCalled());
    await userEvent.clear(feld);
    expect(screen.queryByRole('status')).toBeNull();
    fertig([]);
  });

  it('nennt eine gescheiterte Suche und behält die erfolgreichen Treffer', async () => {
    nutzer = { ...nutzer, role: 'Geschäftsführung' };
    kundenSuche.mockRejectedValueOnce(new Error('Verbindung unterbrochen'));
    zeige();
    await userEvent.type(screen.getByRole('combobox'), 'Huber');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Kunden.*nicht.*geladen/);
    expect(screen.getByRole('option', { name: /2026-014/ })).toBeInTheDocument();
    expect(screen.queryByText('Nichts gefunden.')).toBeNull();
  });
});
