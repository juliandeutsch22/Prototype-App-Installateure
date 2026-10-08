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

const { default: ZweiFaktorKarte } = await import('@/features/settings/ZweiFaktorKarte');

const basis: ZweiterFaktorStand = {
  angeboten: true, pflicht: false, plattform: false, betriebPflicht: false,
  eingerichtet: false, codesOffen: 0, codeZuletztVerwendet: null,
};

const zeige = () => render(<ToastProvider><ZweiFaktorKarte /></ToastProvider>);

beforeEach(() => {
  stand = { ...basis };
  ausschalten.mockClear();
});

describe('Zwei-Faktor unter „Mein Konto“', () => {
  it('nicht eingerichtet: freiwillig einrichten, kein Betriebspflicht-Schalter', async () => {
    zeige();
    expect(await screen.findByRole('button', { name: 'Einrichten' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/in diesem Betrieb verpflichtend/)).not.toBeInTheDocument();
  });

  it('freiwillig eingerichtet: lässt den Faktor wieder ausschalten', async () => {
    const nutzer = userEvent.setup();
    stand = { ...basis, eingerichtet: true, codesOffen: 9 };
    zeige();
    expect(await screen.findByText(/Noch 9 von 10 Wiederherstellungscodes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ausschalten' })).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Ausschalten' }));
    expect(ausschalten).toHaveBeenCalled();
  });

  it('Gegenprobe: mit Pflicht kein Ausschalten', async () => {
    stand = { ...basis, eingerichtet: true, pflicht: true, plattform: true, codesOffen: 10 };
    zeige();
    await screen.findByText(/Noch 10 von 10/);
    expect(screen.queryByRole('button', { name: 'Ausschalten' })).not.toBeInTheDocument();
    expect(screen.getByText(/Für den globalen Administrator ist sie Pflicht/)).toBeInTheDocument();
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
