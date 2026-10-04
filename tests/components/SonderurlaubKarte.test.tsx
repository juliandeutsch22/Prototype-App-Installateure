import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';

/**
 * Sonderurlaub in den Einstellungen (Plan 10.3): gespeichert wird nur, was
 * von der Vorbelegung abweicht, und die Schwelle für den Kürzungsvorschlag.
 */
const updateCompany = vi.fn<(id: string, daten: Record<string, unknown>) => Promise<void>>(async () => undefined);
let firma: Record<string, unknown> = { id: 'perl' };
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'gf', companyId: 'perl', role: 'Geschäftsführung' }, company: firma, reloadCompany: vi.fn(async () => undefined) }),
}));
vi.mock('@/lib/db/company', () => ({ updateCompany: (id: string, d: Record<string, unknown>) => updateCompany(id, d) }));

const { default: SonderurlaubKarte } = await import('@/features/settings/SonderurlaubKarte');

const zeige = () => render(<ToastProvider><SonderurlaubKarte /></ToastProvider>);

beforeEach(() => {
  updateCompany.mockClear();
  firma = { id: 'perl' };
});

describe('Sonderurlaub in den Einstellungen', () => {
  it('ab Werk stehen die Tage des Kollektivvertrags da, und unverändert wird nichts abweichend gespeichert', async () => {
    const nutzer = userEvent.setup();
    zeige();
    expect(screen.getByRole('textbox', { name: /Eheschließung/ })).toHaveValue('3');
    expect(screen.getByRole('textbox', { name: /Kürzung vorschlagen ab/ })).toHaveValue('14');
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(updateCompany).toHaveBeenCalledWith('perl', { freistellungAnlaesse: null, kuerzungAbTagen: 14 }));
  });

  it('eine geänderte Tageszahl wird als Abweichung gespeichert', async () => {
    const nutzer = userEvent.setup();
    zeige();
    const feld = screen.getByRole('textbox', { name: /Wohnungswechsel/ });
    await nutzer.clear(feld);
    await nutzer.type(feld, '3');
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(updateCompany).toHaveBeenCalledWith('perl', { freistellungAnlaesse: { wohnungswechsel: 3 }, kuerzungAbTagen: 14 }));
  });

  it('Unsinn wird nicht gespeichert', async () => {
    const nutzer = userEvent.setup();
    zeige();
    const feld = screen.getByRole('textbox', { name: /Kürzung vorschlagen ab/ });
    await nutzer.clear(feld);
    await nutzer.type(feld, '0');
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText(/ganze Kalendertage zwischen 1 und 366/)).toBeInTheDocument();
    expect(updateCompany).not.toHaveBeenCalled();
  });

  it('zeigt die gespeicherten Abweichungen des Betriebs', () => {
    firma = { id: 'perl', freistellungAnlaesse: { geburt: 3 }, kuerzungAbTagen: 21 };
    zeige();
    expect(screen.getByRole('textbox', { name: /Geburt/ })).toHaveValue('3');
    expect(screen.getByRole('textbox', { name: /Kürzung vorschlagen ab/ })).toHaveValue('21');
  });
});
