import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import KatalogEinstellungenKarte from '@/features/settings/KatalogEinstellungenKarte';
import EinstellungenUebersicht from '@/features/settings/EinstellungenUebersicht';
import { MemoryRouter } from 'react-router-dom';

/**
 * Katalog und Preisvergleich in den Einstellungen (M03a, E03/E04): ab welcher
 * Änderung ein Preissprung, wie alt ein Preisstand höchstens. Vorgaben 10 %
 * und 180 Tage; was die Datenbank abweist, weist schon die Karte ab; die
 * Übersicht findet die Unterseite über ihre Stichworte. GEGENPROBE: vor M03a
 * gab es weder Karte noch Stichwort.
 */

const updateCompany = vi.fn<(id: string, d: Record<string, unknown>) => Promise<void>>(async () => undefined);
vi.mock('@/lib/db/company', () => ({ updateCompany: (id: string, d: Record<string, unknown>) => updateCompany(id, d) }));
vi.mock('@/features/settings/einrichtungZusatz', () => ({
  einrichtungZusatzLaden: async () => ({}),
  einrichtungZusatzPunkte: () => [],
}));
const auth = {
  user: { uid: 'g1', companyId: 'perl', name: 'Chefin', role: 'Geschäftsführung' as const },
  company: { id: 'perl', name: 'Perl' } as Record<string, unknown>,
  reloadCompany: vi.fn(async () => undefined),
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => auth }));

function zeige() {
  render(
    <ToastProvider>
      <KatalogEinstellungenKarte />
    </ToastProvider>,
  );
}

beforeEach(() => {
  updateCompany.mockClear();
  auth.company = { id: 'perl', name: 'Perl' };
});

describe('Katalog und Preisvergleich', () => {
  it('zeigt die Vorgaben, solange nichts gesetzt ist', () => {
    zeige();
    expect(screen.getByLabelText('Preissprung ab (%)')).toHaveValue('10');
    expect(screen.getByLabelText('Preisstand gilt höchstens (Tage)')).toHaveValue('180');
  });

  it('speichert beide Werte — Komma als Dezimalzeichen', async () => {
    auth.company = { id: 'perl', name: 'Perl', preissprungSchwelleProzent: 12.5, katalogVeraltetTage: 90 };
    zeige();
    expect(screen.getByLabelText('Preissprung ab (%)')).toHaveValue('12,5');
    await userEvent.clear(screen.getByLabelText('Preisstand gilt höchstens (Tage)'));
    await userEvent.type(screen.getByLabelText('Preisstand gilt höchstens (Tage)'), '120');
    await userEvent.click(screen.getByRole('button', { name: 'Katalog-Einstellungen speichern' }));
    await waitFor(() =>
      expect(updateCompany).toHaveBeenCalledWith('perl', { preissprungSchwelleProzent: 12.5, katalogVeraltetTage: 120 }),
    );
  });

  it('weist ab, was die Datenbank abweisen würde', async () => {
    zeige();
    await userEvent.clear(screen.getByLabelText('Preisstand gilt höchstens (Tage)'));
    await userEvent.type(screen.getByLabelText('Preisstand gilt höchstens (Tage)'), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Katalog-Einstellungen speichern' }));
    expect(await screen.findByText(/ganze Tage zwischen 1 und 3650/)).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Preisstand gilt höchstens (Tage)'));
    await userEvent.type(screen.getByLabelText('Preisstand gilt höchstens (Tage)'), '180');
    await userEvent.clear(screen.getByLabelText('Preissprung ab (%)'));
    await userEvent.type(screen.getByLabelText('Preissprung ab (%)'), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Katalog-Einstellungen speichern' }));
    expect(await screen.findByText(/über 0 und höchstens 1000/)).toBeInTheDocument();
    expect(updateCompany).not.toHaveBeenCalled();
  });

  it('die Übersicht findet sie unter „Sätze“', async () => {
    render(
      <MemoryRouter>
        <EinstellungenUebersicht />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText('Einstellung suchen'), 'Preissprung');
    expect(await screen.findByText('Treffer (1)')).toBeInTheDocument();
    expect(screen.getByText('Sätze und Kosten')).toBeInTheDocument();
  });
});
