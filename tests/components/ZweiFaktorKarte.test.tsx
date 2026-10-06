import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { ZweiterFaktorStand } from '@/lib/auth/sitzung';

/**
 * Runde 3, H1: die Karte „Zwei-Faktor-Anmeldung“ unter „Mein Konto“. Was
 * erlaubt ist, entscheidet die Datenbank (tests/supabase/zweiFaktor.test.ts);
 * hier: die Karte bietet nur an, was geht.
 */
let stand: ZweiterFaktorStand;
const ausschalten = vi.fn(async () => undefined);
const neueCodes = vi.fn(async () => ['AAAA-BBBB']);
vi.mock('@/lib/auth/sitzung', () => ({
  zweiterFaktorStand: vi.fn(async () => stand),
  zweitenFaktorAusschalten: ausschalten,
  neueCodes,
  einrichtenBeginnen: vi.fn(),
  einrichtenBestaetigen: vi.fn(),
}));
const updateCompany = vi.fn(async () => undefined);
vi.mock('@/lib/db/company', () => ({ updateCompany }));

const { default: ZweiFaktorKarte } = await import('@/features/settings/ZweiFaktorKarte');

const basis: ZweiterFaktorStand = {
  angeboten: true, pflicht: false, plattform: false, betriebPflicht: false,
  eingerichtet: false, codesOffen: 0, codeZuletztVerwendet: null,
};

const zeige = (betrieb?: string) =>
  render(<ToastProvider><ZweiFaktorKarte betrieb={betrieb} /></ToastProvider>);

beforeEach(() => {
  stand = { ...basis };
  updateCompany.mockClear();
  ausschalten.mockClear();
});

describe('Zwei-Faktor unter „Mein Konto“', () => {
  it('nicht eingerichtet: Einrichten ja, Pflicht erst danach', async () => {
    zeige('perl');
    expect(await screen.findByRole('button', { name: 'Einrichten' })).toBeInTheDocument();
    expect(screen.getByLabelText(/in diesem Betrieb verpflichtend/)).toBeDisabled();
    expect(screen.getByText(/Zuerst für dich selbst einrichten/)).toBeInTheDocument();
  });

  it('eingerichtet: Pflicht einschaltbar, Ausschalten nur ohne Pflicht', async () => {
    const nutzer = userEvent.setup();
    stand = { ...basis, eingerichtet: true, codesOffen: 9 };
    zeige('perl');
    expect(await screen.findByText(/Noch 9 von 10 Wiederherstellungscodes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ausschalten' })).toBeInTheDocument();
    await nutzer.click(screen.getByLabelText(/in diesem Betrieb verpflichtend/));
    expect(updateCompany).toHaveBeenCalledWith('perl', { zweiFaktorPflicht: true });
  });

  it('Gegenprobe: mit Pflicht kein Ausschalten', async () => {
    stand = { ...basis, eingerichtet: true, pflicht: true, betriebPflicht: true, codesOffen: 10 };
    zeige('perl');
    await screen.findByText(/Noch 10 von 10/);
    expect(screen.queryByRole('button', { name: 'Ausschalten' })).not.toBeInTheDocument();
    expect(screen.getByText(/Pflicht — ausschalten geht deshalb nicht/)).toBeInTheDocument();
  });

  it('wer es nicht angeboten bekommt (Monteur), sieht die Karte nicht', async () => {
    stand = { ...basis, angeboten: false };
    zeige();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('Zwei-Faktor-Anmeldung')).not.toBeInTheDocument();
  });

  it('ohne Betriebsrecht kein Schalter für die Pflicht', async () => {
    zeige();
    await screen.findByRole('button', { name: 'Einrichten' });
    expect(screen.queryByLabelText(/in diesem Betrieb verpflichtend/)).not.toBeInTheDocument();
  });
});
