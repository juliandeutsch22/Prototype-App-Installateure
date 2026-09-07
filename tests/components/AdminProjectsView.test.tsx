import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, Customer, Project } from '@/types';
import AdminProjectsView from '@/features/projects/AdminProjectsView';

/**
 * Die Baustellenverwaltung — die vierte der bisher ungetesteten Kernansichten.
 *
 * Die Baustelle ist der Anker, an dem Zeiten, Material, Scheine und
 * Rechnungen hängen. Zwei Dinge daran sind mehr als Formularkosmetik: das
 * Stundenbudget (an ihm misst die Ampel der Nachkalkulation) und die
 * Zuordnung von Team und Projektleitung (sie entscheidet, wer die Baustelle
 * überhaupt sieht).
 */

const KUNDE: Customer & { id: string } = {
  id: 'k1', companyId: 'perl', name: 'Familie Huber',
} as Customer & { id: string };

const MONTEUR: AppUser = {
  id: 'u1', companyId: 'perl', uid: 'u1', name: 'Max Mustermann', email: 'max@perl.at',
  role: 'Mitarbeiter', active: true,
} as AppUser;

let baustellen: (Project & { id: string })[] = [];
let ladefehler = false;

const lege = vi.fn();
const aendere = vi.fn();
const loesche = vi.fn();

vi.mock('@/lib/db/projects', () => ({
  subscribeRecentProjects: (
    _c: string,
    _g: number,
    cb: (rows: (Project & { id: string })[]) => void,
  ) => {
    cb(baustellen);
    return () => undefined;
  },
  createProject: (c: string, data: unknown) => {
    lege(c, data);
    return Promise.resolve('neu');
  },
  updateProject: (id: string, data: unknown) => {
    aendere(id, data);
    return Promise.resolve();
  },
  deleteProject: (id: string) => {
    loesche(id);
    return Promise.resolve();
  },
}));

vi.mock('@/lib/db/users', () => ({
  listUsers: vi.fn(async () => {
    if (ladefehler) throw new Error('kein Netz');
    return [MONTEUR];
  }),
}));
vi.mock('@/lib/db/customers', () => ({ listCustomers: vi.fn(async () => [KUNDE]) }));

/*
  Die Stunden der Übersicht. Sie hängen an einer eigenen Abfrage, und diese
  Datei prüft nicht die Übersicht selbst (das tut
  `BaustellenUebersicht.test.tsx`), sondern DASS sie überhaupt geöffnet wird —
  und erst dann lädt.
*/
const listEntriesForProjects = vi.fn(async () => [
  {
    id: 'z1',
    companyId: 'perl',
    date: '2026-09-01',
    status: 'Anwesend',
    startTime: '07:00',
    endTime: '15:00',
    breakDuration: 0,
    userId: 'u1',
    userName: 'Max Mustermann',
    projectNumber: '2026-001',
  },
]);
vi.mock('@/lib/db/timeEntries', () => ({
  listEntriesForProjects: () => listEntriesForProjects(),
}));

const authWert = {
  user: { uid: 'gf', companyId: 'perl', name: 'Chefin', role: 'Geschäftsführung' as const },
  company: { id: 'perl', name: 'Perl Installationen' },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

function zeige() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AdminProjectsView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 1, 9, 0, 0));
  baustellen = [];
  ladefehler = false;
  lege.mockClear();
  aendere.mockClear();
  loesche.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Baustellen — anlegen', () => {
  it('übernimmt den Kundennamen aus dem Stammdatensatz', async () => {
    /**
     * Der Kunde ist kein Textfeld mehr. Würde der Name hier frei getippt,
     * stünde auf der Rechnung ein anderer als in der Kundenakte — und die
     * Akte fände ihre eigene Baustelle nicht wieder.
     */
    zeige();
    await userEvent.type(await screen.findByLabelText('Projektnummer'), '2026-042');
    await userEvent.selectOptions(screen.getByLabelText('Kunde'), 'k1');
    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    await waitFor(() => expect(lege).toHaveBeenCalled());
    expect(lege.mock.calls[0][1]).toMatchObject({
      projectNumber: '2026-042',
      customerId: 'k1',
      customerName: 'Familie Huber',
    });
  });

  it('lässt ein leeres Stundenbudget UNGESETZT, statt 0 daraus zu machen', async () => {
    /**
     * „Kein Budget" und „Budget null" sind zwei verschiedene Aussagen. Aus
     * einem leeren Feld eine 0 zu machen hieße, dass die Ampel der
     * Nachkalkulation jede Baustelle sofort als überzogen meldet.
     */
    zeige();
    await userEvent.type(await screen.findByLabelText('Projektnummer'), '2026-043');
    await userEvent.selectOptions(screen.getByLabelText('Kunde'), 'k1');
    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    await waitFor(() => expect(lege).toHaveBeenCalled());
    expect(lege.mock.calls[0][1].estimatedHours).toBeUndefined();
  });

  it('nimmt ein gesetztes Stundenbudget als Zahl mit', async () => {
    zeige();
    await userEvent.type(await screen.findByLabelText('Projektnummer'), '2026-044');
    await userEvent.selectOptions(screen.getByLabelText('Kunde'), 'k1');
    await userEvent.type(screen.getByLabelText(/Stundenbudget/), '40');
    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    await waitFor(() => expect(lege).toHaveBeenCalled());
    expect(lege.mock.calls[0][1].estimatedHours).toBe(40);
  });
});

describe('Baustellen — bearbeiten', () => {
  it('ändert die vorhandene Baustelle, statt eine zweite anzulegen', async () => {
    /**
     * Bei einer Nummer, die zweimal existiert, wüsste keine Zeitbuchung mehr,
     * zu welcher Baustelle sie gehört.
     */
    baustellen = [
      {
        id: 'p1', companyId: 'perl', projectNumber: '2026-042',
        customerName: 'Familie Huber', customerId: 'k1', status: 'Aktiv',
      } as Project & { id: string },
    ];
    zeige();

    const zeile = (await screen.findByText(/2026-042/)).closest('li') as HTMLElement;
    await userEvent.click(within(zeile).getByRole('button', { name: /bearbeiten/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(aendere).toHaveBeenCalled());
    expect(aendere.mock.calls[0][0]).toBe('p1');
    expect(lege).not.toHaveBeenCalled();
  });
});

describe('Baustellen — löschen', () => {
  it('fragt vorher nach', async () => {
    // An einer Baustelle haengen Zeiten, Scheine und Rechnungen. Ein Loeschen
    // ohne Rueckfrage waere hier besonders teuer.
    baustellen = [
      {
        id: 'p1', companyId: 'perl', projectNumber: '2026-042',
        customerName: 'Familie Huber', status: 'Aktiv',
      } as Project & { id: string },
    ];
    zeige();

    const zeile = (await screen.findByText(/2026-042/)).closest('li') as HTMLElement;
    await userEvent.click(within(zeile).getByRole('button', { name: 'Baustelle löschen' }));

    const dialog = await screen.findByRole('dialog');
    expect(loesche).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: /löschen/i }));
    await waitFor(() => expect(loesche).toHaveBeenCalledWith('p1'));
  });
});

describe('Baustellen — wenn etwas nicht lädt', () => {
  it('sagt es, statt eine leere Belegschaft zu zeigen', async () => {
    // Sonst liesse sich eine Baustelle ohne Mannschaft anlegen, und niemand
    // wuesste, dass die Liste nur nicht geladen hat.
    ladefehler = true;
    zeige();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Die Belegschaft konnte nicht geladen werden.',
    );
  });
});

/**
 * DIE ÜBERSICHT JE BAUSTELLE.
 *
 * Sie beantwortet die Frage, die man beim Blick auf eine Baustelle
 * tatsächlich hat — „wie steht DIESE Baustelle?" —, und zwar dort, wo man sie
 * stellt. Bisher stand die Auswertung nur unter der Mitarbeiterübersicht, wo
 * sie eine Monatsfrage über alle Baustellen beantwortet.
 */
describe('Baustellen — Übersicht je Baustelle', () => {
  beforeEach(() => {
    baustellen = [
      {
        id: 'p1',
        companyId: 'perl',
        projectNumber: '2026-001',
        customerName: 'Familie Huber',
        status: 'Aktiv',
        estimatedHours: 40,
      } as Project & { id: string },
    ];
    listEntriesForProjects.mockClear();
  });

  it('lädt die Stunden erst beim Aufklappen', async () => {
    zeige();
    await screen.findByText(/Familie Huber/);
    /*
      Der Punkt: zwanzig Baustellen im Voraus zu laden hiesse zwanzig
      Abfragen für die eine, die jemanden interessiert.
    */
    expect(listEntriesForProjects).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Übersicht' }));
    await waitFor(() => expect(listEntriesForProjects).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Fachzeit')).toBeInTheDocument();
  });

  it('klappt wieder zu', async () => {
    zeige();
    await screen.findByText(/Familie Huber/);
    await userEvent.click(screen.getByRole('button', { name: 'Übersicht' }));
    await screen.findByText('Fachzeit');

    await userEvent.click(screen.getByRole('button', { name: 'Übersicht zu' }));
    await waitFor(() => expect(screen.queryByText('Fachzeit')).not.toBeInTheDocument());
  });
});
