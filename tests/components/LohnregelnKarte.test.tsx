import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '@/components/Toast';
import type { Company } from '@/types';

/**
 * Der Durchrechnungszeitraum je Betrieb (10.10.2026) in der Karte
 * „Nachtzeit und Überstunden“: 17 Wochen ab Werk, laut Kollektivvertrag bis
 * 52. Gegenprobe: ausserhalb davon wird nicht gespeichert, und die übrigen
 * Einstellungen der Karte gehen unverändert mit.
 */

const updateCompany = vi.fn(async () => undefined);
vi.mock('@/lib/db/company', () => ({ updateCompany: (...a: unknown[]) => updateCompany(...(a as [])) }));

let firma: Partial<Company> = {};
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'gf', companyId: 'perl' }, company: firma, reloadCompany: vi.fn(async () => undefined) }),
}));

const { default: LohnregelnKarte } = await import('@/features/settings/LohnregelnKarte');

const zeige = () => render(<ToastProvider><LohnregelnKarte /></ToastProvider>);

beforeEach(() => {
  updateCompany.mockClear();
  firma = { id: 'perl', name: 'Perl' } as Partial<Company>;
});

describe('Durchrechnungszeitraum', () => {
  it('ab Werk 17 Wochen; gespeichert wird der eingetragene Zeitraum mit den übrigen Einstellungen', async () => {
    zeige();
    const feld = screen.getByLabelText(/Durchrechnung für den Schnitt von 48 Std\./);
    expect(feld).toHaveValue(17);
    fireEvent.change(feld, { target: { value: '26' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(updateCompany).toHaveBeenCalledWith('perl', {
      nachtVon: '22:00', nachtBis: '06:00', ueberstundenModell: 'zeitkonto', ueberstundenGrenze: 'tagessoll',
      ueberstundenHundertSonnFeiertag: false, durchrechnungWochen: 26,
    }));
  });

  it('zeigt den gespeicherten Zeitraum', () => {
    firma = { ...firma, durchrechnungWochen: 52 };
    zeige();
    expect(screen.getByLabelText(/Durchrechnung für den Schnitt/)).toHaveValue(52);
  });

  it('Gegenprobe: unter 17 oder über 52 Wochen wird nicht gespeichert', async () => {
    zeige();
    const feld = screen.getByLabelText(/Durchrechnung für den Schnitt/);
    for (const wert of ['16', '53', '']) {
      fireEvent.change(feld, { target: { value: wert } });
      fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/zwischen 17 Wochen .* und 52 Wochen/);
    }
    expect(updateCompany).not.toHaveBeenCalled();
  });
});
