import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, TimeEntry } from '@/types';

/**
 * „Wie zuletzt buchen“ von der Startseite des Monteurs (Design-Durchgang
 * 25.09.2026).
 *
 * Die Startseite schickt `state: { wieZuletzt: true }` mit; die Zeitmaske
 * löst damit DENSELBEN Griff aus wie ihr eigener Knopf „Wie zuletzt“ —
 * einmal, sobald die Vorlage da ist. Gebucht wird weiterhin erst mit
 * „Zeit buchen“; hier wird nur vorbelegt.
 */

vi.mock('@/lib/db/timeEntries', () => ({
  createTimeEntryOhneEmpfang: vi.fn(async () => 'confirmed'),
  updateTimeEntryOhneEmpfang: vi.fn(async () => 'confirmed'),
  eintraegeAmTag: vi.fn(async () => []),
  DuplicateEntryError: class extends Error {},
}));
vi.mock('@/components/BaustellenSelect', () => ({
  default: ({ onChange, value }: { onChange: (nr: string) => void; value: string }) => (
    <input aria-label="Baustelle" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
const authWert = {
  user: {
    uid: 'u1',
    email: 'max@perl.at',
    name: 'Max Mustermann',
    role: 'Mitarbeiter',
    companyId: 'perl',
    docId: 'u1',
  } as unknown as AppUser,
  company: { id: 'perl', name: 'Perl Installationen', praefixKennzeichen: 'WZ' },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: TimeForm } = await import('@/features/time/TimeForm');

const letzte = {
  date: '2026-09-24',
  status: 'Anwesend',
  startTime: '06:30',
  endTime: '15:15',
  breakDuration: 45,
  projectNumber: 'B-2026-0147',
  customerName: 'Familie Huber',
} as TimeEntry;

function zeichne(state: unknown, props: { entry?: TimeEntry & { id: string } } = {}) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/time', state }]}>
      <ToastProvider>
        <TimeForm onSaved={vi.fn()} lastEntry={letzte} {...props} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('Wie zuletzt — von der Startseite', () => {
  it('belegt Zeiten, Pause und Baustelle vom letzten Eintrag vor', async () => {
    zeichne({ projectNumber: 'B-2026-0147', wieZuletzt: true });
    expect(await screen.findByDisplayValue('06:30')).toBeInTheDocument();
    expect(screen.getByDisplayValue('15:15')).toBeInTheDocument();
    expect(screen.getByDisplayValue('45')).toBeInTheDocument();
    expect(screen.getByLabelText('Baustelle')).toHaveValue('B-2026-0147');
  });

  it('tut ohne den Wunsch nichts — die Maske bleibt bei ihren Vorgaben', () => {
    zeichne({ projectNumber: 'B-2026-0147' });
    expect(screen.queryByDisplayValue('06:30')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('15:15')).not.toBeInTheDocument();
  });

  it('überschreibt beim Bearbeiten nichts', () => {
    zeichne(
      { wieZuletzt: true },
      {
        entry: {
          id: 'e1',
          date: '2026-09-25',
          status: 'Anwesend',
          startTime: '08:00',
          endTime: '12:00',
          breakDuration: 0,
          projectNumber: 'B-2026-0148',
        } as TimeEntry & { id: string },
      },
    );
    expect(screen.getByDisplayValue('08:00')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('06:30')).not.toBeInTheDocument();
  });
});

/*
  DER KNOPF IN DER MASKE trägt die Form des Hauptknopfs der Startseite:
  zwei Zeilen, oben was er tut, darunter Zeiten, Pause, Dauer und Kunde
  (Mockup S. 1) — als Zweitknopf, weil „Zeit buchen“ die Hauptaktion der
  Maske ist. Der Griff dahinter ist derselbe wie vorher.
*/
describe('Wie zuletzt — der Knopf in der Maske', () => {
  it('nennt Zeiten, Pause, Dauer und Kunde und belegt beim Tippen vor', async () => {
    zeichne(undefined);
    const knopf = screen.getByRole('button', { name: /Wie zuletzt eintragen/ });
    expect(knopf).toHaveTextContent('06:30–15:15 · 45 min Pause · 08:00 Std · Familie Huber');
    expect(knopf).toHaveClass('einsatz-zweitknopf');
    expect(screen.queryByDisplayValue('06:30')).not.toBeInTheDocument();

    await userEvent.setup().click(knopf);
    expect(screen.getByDisplayValue('06:30')).toBeInTheDocument();
    expect(screen.getByDisplayValue('15:15')).toBeInTheDocument();
    expect(screen.getByDisplayValue('45')).toBeInTheDocument();
    expect(screen.getByLabelText('Baustelle')).toHaveValue('B-2026-0147');
  });
});
