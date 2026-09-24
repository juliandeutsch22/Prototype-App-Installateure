import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';

/**
 * „Problem melden" und das Protokoll der Geschäftsführung.
 *
 * Was hier zählt: wer etwas schreibt, sieht vorher, wer es liest; das
 * Häkchen für den Support ist aus, bis jemand es setzt; eine Meldung, die
 * nicht ankommt, bleibt mit Grund offen stehen. Und im Protokoll steht ein
 * Absturz, der vierzigmal kam, einmal — mit der Zahl daneben.
 */

const gemeldet = vi.fn();
vi.mock('@/lib/fehlerprotokoll', () => ({
  problemMelden: (...a: unknown[]) => gemeldet(...a),
}));

const liste = vi.fn();
vi.mock('@/lib/db/fehlerprotokoll', () => ({
  listFehlerprotokoll: (...a: unknown[]) => liste(...a),
  FEHLER_GRENZE: 500,
}));
vi.mock('@/lib/db/users', () => ({
  listUsers: vi.fn(async () => [
    { uid: 'u-hans', name: 'Hans Monteur' },
    { uid: 'u-eva', name: 'Eva Büro' },
  ]),
}));
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'gf', companyId: 'perl', name: 'Chefin', role: 'Geschäftsführung' } }),
}));

const { default: ProblemMelden } = await import('@/components/ProblemMelden');
const { default: FehlerprotokollView } = await import('@/features/settings/FehlerprotokollView');

function melden() {
  return render(
    <ToastProvider>
      <ProblemMelden ausloeser={(auf) => <button onClick={auf}>Problem melden</button>} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  gemeldet.mockReset();
  liste.mockReset();
});

describe('Problem melden', () => {
  it('sagt vorher, wer es liest — das Häkchen für den Support ist aus', async () => {
    const nutzer = userEvent.setup();
    melden();
    await nutzer.click(screen.getByRole('button', { name: 'Problem melden' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Geschäftsführung und die Administration deines Betriebs/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Auch an den Senklot-Support senden')).not.toBeChecked();
    expect(within(dialog).getByText(/keine Gesundheitsdaten/)).toBeInTheDocument();
  });

  it('schickt Text und Häkchen, schliesst und bedankt sich', async () => {
    gemeldet.mockResolvedValue(undefined);
    const nutzer = userEvent.setup();
    melden();
    await nutzer.click(screen.getByRole('button', { name: 'Problem melden' }));
    await nutzer.type(screen.getByLabelText('Was ist passiert?'), 'Schein lässt sich nicht speichern');
    await nutzer.click(screen.getByLabelText('Auch an den Senklot-Support senden'));
    await nutzer.click(screen.getByRole('button', { name: 'Senden' }));
    await waitFor(() => expect(gemeldet).toHaveBeenCalledWith('Schein lässt sich nicht speichern', true));
    expect(await screen.findByText('Danke — die Meldung ist angekommen.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('bleibt offen und sagt warum, wenn die Meldung nicht ankommt', async () => {
    gemeldet.mockRejectedValue(new Error('Bitte beschreiben, was passiert ist.'));
    const nutzer = userEvent.setup();
    melden();
    await nutzer.click(screen.getByRole('button', { name: 'Problem melden' }));
    await nutzer.click(screen.getByRole('button', { name: 'Senden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bitte beschreiben');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('Das Fehlerprotokoll', () => {
  function zeige() {
    return render(
      <ToastProvider>
        <FehlerprotokollView />
      </ToastProvider>,
    );
  }

  it('trennt Meldungen von Fehlern und fasst gleiche Abstürze zusammen', async () => {
    liste.mockResolvedValue([
      { id: '1', companyId: 'perl', userId: 'u-hans', art: 'meldung', beschreibung: 'Zeit buchen hängt', pfad: '/time', createdAt: Date.UTC(2026, 8, 24, 8) },
      { id: '2', companyId: 'perl', userId: 'u-hans', art: 'absturz', nachricht: 'x is undefined', pfad: '/time', fassung: 'a1', createdAt: Date.UTC(2026, 8, 24, 7) },
      { id: '3', companyId: 'perl', userId: 'u-eva', art: 'absturz', nachricht: 'x is undefined', pfad: '/time', fassung: 'a1', createdAt: Date.UTC(2026, 8, 24, 9) },
      { id: '4', companyId: 'perl', userId: 'u-weg', art: 'fehler', nachricht: 'y failed', pfad: '/invoices', createdAt: Date.UTC(2026, 8, 23, 9) },
    ]);
    zeige();
    expect(await screen.findByText('Gemeldete Probleme (1)')).toBeInTheDocument();
    expect(screen.getByText('Zeit buchen hängt')).toBeInTheDocument();
    expect(screen.getByText(/Hans Monteur/)).toBeInTheDocument();
    expect(screen.getByText('Technische Fehler (2)')).toBeInTheDocument();
    expect(screen.getByText(/2× · zuletzt/)).toBeInTheDocument();
    expect(screen.getByText(/2 betroffen/)).toBeInTheDocument();
    expect(screen.getByText('Absturz')).toBeInTheDocument();
    // Wer nicht mehr in der Belegschaft steht, steht nicht als Kennung da.
    expect(screen.getByText(/ehemaliges Konto/)).toBeInTheDocument();
    expect(liste).toHaveBeenCalledWith('perl');
  });

  it('sagt ehrlich, wenn nichts da ist — und wenn das Laden scheitert', async () => {
    liste.mockResolvedValueOnce([]);
    const { unmount } = zeige();
    expect(await screen.findByText('Niemand hat ein Problem gemeldet.')).toBeInTheDocument();
    expect(screen.getByText('Keine Abstürze und keine unbehandelten Fehler.')).toBeInTheDocument();
    unmount();

    liste.mockRejectedValueOnce(new Error('permission denied'));
    zeige();
    expect(await screen.findByText(/permission denied/)).toBeInTheDocument();
  });
});
