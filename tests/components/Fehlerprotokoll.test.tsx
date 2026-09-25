import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';

/**
 * „Problem melden" und was der Support davon zu sehen bekommt.
 *
 * Was hier zählt: wer etwas schreibt, sieht vorher, dass es an den Support
 * geht — und mit welchem Namen; es gibt nichts anzukreuzen; eine Meldung,
 * die nicht ankommt, bleibt mit Grund offen stehen. Und in der Liste steht
 * ein Absturz, der vierzigmal kam, einmal — mit der Zahl daneben.
 */

const gemeldet = vi.fn();
vi.mock('@/lib/fehlerprotokoll', () => ({
  problemMelden: (...a: unknown[]) => gemeldet(...a),
}));

const { default: ProblemMelden } = await import('@/components/ProblemMelden');
const { default: FehlerListe } = await import('@/features/plattform/FehlerListe');

function melden() {
  return render(
    <ToastProvider>
      <ProblemMelden ausloeser={(auf) => <button onClick={auf}>Problem melden</button>} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  gemeldet.mockReset();
});

describe('Problem melden', () => {
  it('sagt vorher, dass es an den Support geht und mit welchem Namen — ohne Häkchen', async () => {
    const nutzer = userEvent.setup();
    melden();
    await nutzer.click(screen.getByRole('button', { name: 'Problem melden' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/geht an den Senklot-Support, mit deinem Namen/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/Geschäftsführung/)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(dialog).getByText(/keine Gesundheitsdaten/)).toBeInTheDocument();
  });

  it('schickt den Text, schliesst und bedankt sich', async () => {
    gemeldet.mockResolvedValue(undefined);
    const nutzer = userEvent.setup();
    melden();
    await nutzer.click(screen.getByRole('button', { name: 'Problem melden' }));
    await nutzer.type(screen.getByLabelText('Was ist passiert?'), 'Schein lässt sich nicht speichern');
    await nutzer.click(screen.getByRole('button', { name: 'Senden' }));
    await waitFor(() => expect(gemeldet).toHaveBeenCalledWith('Schein lässt sich nicht speichern'));
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

describe('Die Liste für den Support', () => {
  it('trennt Meldungen mit Absender von Fehlern und fasst gleiche Abstürze zusammen', () => {
    render(
      <FehlerListe
        zeilen={[
          { id: '1', betrieb: 'Perl Installationen', wer: 'Hans Monteur · hans@perl.at', art: 'meldung', beschreibung: 'Zeit buchen hängt', pfad: '/time', createdAt: Date.UTC(2026, 8, 24, 8) },
          { id: '2', betrieb: 'Perl Installationen', art: 'absturz', nachricht: 'x is undefined', pfad: '/time', fassung: 'a1', createdAt: Date.UTC(2026, 8, 24, 7) },
          { id: '3', betrieb: 'Mayr Bad', art: 'absturz', nachricht: 'x is undefined', pfad: '/time', fassung: 'a1', createdAt: Date.UTC(2026, 8, 24, 9) },
          { id: '4', betrieb: 'Mayr Bad', art: 'fehler', nachricht: 'y failed', pfad: '/invoices', createdAt: Date.UTC(2026, 8, 23, 9) },
        ]}
      />,
    );
    expect(screen.getByText('Gemeldete Probleme (1)')).toBeInTheDocument();
    expect(screen.getByText('Zeit buchen hängt')).toBeInTheDocument();
    expect(screen.getByText(/Hans Monteur · hans@perl\.at/)).toBeInTheDocument();
    expect(screen.getByText('Technische Fehler (2)')).toBeInTheDocument();
    expect(screen.getByText(/2× · zuletzt/)).toBeInTheDocument();
    expect(screen.getByText(/2 betroffen/)).toBeInTheDocument();
    expect(screen.getByText('Absturz')).toBeInTheDocument();
  });

  it('sagt ehrlich, wenn nichts da ist', () => {
    render(<FehlerListe zeilen={[]} />);
    expect(screen.getByText('Niemand hat ein Problem gemeldet.')).toBeInTheDocument();
    expect(screen.getByText('Keine Abstürze und keine unbehandelten Fehler.')).toBeInTheDocument();
  });
});
