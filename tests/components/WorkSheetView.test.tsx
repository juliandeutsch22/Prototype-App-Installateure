import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Assignment, Project } from '@/types';
import { todayStr } from '@/lib/time';

/**
 * Der Handwerksschein war ein Formular ohne Anschluss: er stand in einem
 * eigenen Bereich, und die erste Frage darin war „welche Baustelle?" — an
 * einen Monteur gestellt, der gerade von genau dieser Baustelle kommt.
 *
 * Diese Tests halten den Anschluss fest: die Einsätze des Tages stehen oben,
 * bei einem einzigen wird vorausgewählt, und der Abschluss-Knopf ist gesperrt,
 * solange die Stammdaten fehlen — statt anklickbar zu sein und nichts zu tun.
 */

const heute = todayStr();

const projekte: (Project & { id: string })[] = [
  {
    id: 'p1',
    companyId: 'perl',
    projectNumber: 'B-001',
    customerName: 'Familie Huber',
    address: 'Hauptstraße 12',
    contactPhone: '0664 1234567',
    status: 'Aktiv',
    billingMode: 'Regie',
  },
];

const einsaetze: (Assignment & { id: string })[] = [
  {
    id: 'a1',
    companyId: 'perl',
    userId: 'm1',
    userName: 'Max Mustermann',
    projectNumber: 'B-001',
    date: heute,
  } as Assignment & { id: string },
];

const listAssignmentsForUserInRange = vi.fn(async () => einsaetze);
const listProjectsByNumbers = vi.fn(async () => projekte);

vi.mock('@/lib/db/assignments', () => ({
  listAssignmentsForUserInRange: () => listAssignmentsForUserInRange(),
}));
vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: vi.fn(async () => projekte),
  listRecentProjects: vi.fn(async () => projekte),
  listProjectsByNumbers: () => listProjectsByNumbers(),
}));
vi.mock('@/lib/db/workSheets', () => ({
  createWorkSheet: vi.fn(async () => 's1'),
  signWorkSheet: vi.fn(async () => undefined),
  listWorkSheetsForProject: vi.fn(async () => []),
}));
vi.mock('@/lib/functions', () => ({
  callScheinVorbereiten: vi.fn(async () => ({ data: { zeiten: [], material: [] } })),
}));

const authWert = {
  user: {
    uid: 'm1',
    email: 'max@perl.at',
    name: 'Max Mustermann',
    role: 'Mitarbeiter' as const,
    companyId: 'perl',
    docId: 'm1',
  },
  company: { id: 'perl', name: 'Perl Installationen' },
  loading: false,
  error: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  resetPassword: vi.fn(),
  reloadCompany: vi.fn(),
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: WorkSheetView } = await import('@/features/worksheets/WorkSheetView');

function zeichne() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <WorkSheetView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  listAssignmentsForUserInRange.mockClear().mockResolvedValue(einsaetze);
  listProjectsByNumbers.mockClear().mockResolvedValue(projekte);
});

describe('Handwerksschein', () => {
  it('waehlt die Baustelle vor, wenn der Tag eindeutig ist', async () => {
    zeichne();
    /**
     * Ein Einsatz an diesem Tag heißt: die Frage, die das Auswahlfeld stellt,
     * ist bereits beantwortet. Sie trotzdem zu stellen ist der Unterschied
     * zwischen einem Formular und einem Werkzeug.
     */
    expect(await screen.findByText(/Deine Einsätze an diesem Tag/)).toBeInTheDocument();
    const feld = await screen.findByLabelText<HTMLSelectElement>('Baustelle');
    expect(feld.value).toBe('B-001');
  });

  it('waehlt NICHT vor, wenn der Monteur auf zwei Baustellen war', async () => {
    listAssignmentsForUserInRange.mockResolvedValue([
      ...einsaetze,
      { ...einsaetze[0], id: 'a2', projectNumber: 'B-002' },
    ]);
    zeichne();
    await screen.findByText(/Deine Einsätze an diesem Tag/);
    // Eine falsche Vorauswahl wäre schlimmer als gar keine: der Schein liefe
    // auf die falsche Baustelle und würde dort unterschrieben.
    const feld = screen.getByLabelText<HTMLSelectElement>('Baustelle');
    expect(feld.value).toBe('');
  });

  it('zeigt Adresse und Telefon der Baustelle als Handgriff', async () => {
    zeichne();
    expect(
      await screen.findByRole('link', { name: /Hauptstraße 12/ }),
    ).toHaveAttribute('href', expect.stringContaining('google.com/maps'));
    expect(screen.getByRole('link', { name: /0664 1234567/ })).toHaveAttribute(
      'href',
      'tel:06641234567',
    );
  });

  it('sperrt den Abschluss, solange Unterschriften fehlen', async () => {
    zeichne();
    await screen.findByLabelText('Baustelle');
    expect(
      screen.getByRole('button', { name: 'Unterschreiben und abschließen' }),
    ).toBeDisabled();
    // Und sagt, was genau fehlt — statt den Knopf kommentarlos zu sperren.
    expect(screen.getByText(/Unterschrift Monteur/)).toBeInTheDocument();
  });
});
