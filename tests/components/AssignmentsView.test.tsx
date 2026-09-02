import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, Assignment, Project, Vacation } from '@/types';
import AssignmentsView from '@/features/assignments/AssignmentsView';

/**
 * Die Einsatzplanung — die Ansicht, die als einzige Daten LÖSCHT, und bis
 * jetzt ohne eigenen Test.
 *
 * Das Speichern ist ein „alles weg, dann alles neu" für das Paar aus Tag und
 * Baustelle. Das ist richtig so — aber es heißt, dass ein Speichern mit
 * leerer Auswahl die Planung eines Tages spurlos entfernen würde. Genau
 * daran hängt hier der wichtigste Test.
 */

const PROJEKT: Project & { id: string } = {
  id: 'p1',
  companyId: 'perl',
  projectNumber: '2026-042',
  customerName: 'Familie Huber',
  status: 'Aktiv',
} as Project & { id: string };

const MONTEUR: AppUser = {
  id: 'u1', companyId: 'perl', uid: 'u1', name: 'Max Mustermann', email: 'max@perl.at',
  role: 'Mitarbeiter', active: true, weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5],
} as AppUser;
const KOLLEGE: AppUser = { ...MONTEUR, id: 'u2', uid: 'u2', name: 'Erna Beispiel' } as AppUser;

const HEUTE = '2026-09-01';

let einsaetze: (Assignment & { id: string })[] = [];
let urlaube: (Vacation & { id: string })[] = [];
let ladefehler = false;

const speichere = vi.fn();
const loesche = vi.fn();

vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: vi.fn(async () => {
    if (ladefehler) throw new Error('kein Netz');
    return [PROJEKT];
  }),
  listProjectsByNumbers: vi.fn(async () => [PROJEKT]),
}));
vi.mock('@/lib/db/users', () => ({ listUsers: vi.fn(async () => [MONTEUR, KOLLEGE]) }));
vi.mock('@/lib/db/vacations', () => ({
  listApprovedVacationsInRange: vi.fn(async () => urlaube),
}));
vi.mock('@/lib/db/assignments', () => ({
  subscribeAssignmentsForMonth: (
    _c: string,
    _j: number,
    _m: number,
    cb: (rows: (Assignment & { id: string })[]) => void,
  ) => {
    cb(einsaetze);
    return () => undefined;
  },
  saveAssignments: (...a: unknown[]) => {
    speichere(...a);
    return Promise.resolve();
  },
  deleteAssignment: (id: string) => {
    loesche(id);
    return Promise.resolve();
  },
}));

const authWert = {
  user: { uid: 'pl', companyId: 'perl', name: 'Planer', role: 'Projektleiter' as const },
  company: { id: 'perl', name: 'Perl Installationen' },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

function zeige() {
  return render(
    <ToastProvider>
      <AssignmentsView />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 1, 9, 0, 0));
  einsaetze = [];
  urlaube = [];
  ladefehler = false;
  speichere.mockClear();
  loesche.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Einsatzplanung — speichern', () => {
  it('schickt genau die gewählten Leute an den Tag und die Baustelle', async () => {
    zeige();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: /Baustelle/ }), '2026-042');
    await userEvent.click(screen.getByRole('checkbox', { name: /^Max Mustermann/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Einsatz speichern' }));

    await waitFor(() => expect(speichere).toHaveBeenCalled());
    const [, datum, baustelle, zeilen] = speichere.mock.calls[0];
    expect(datum).toBe(HEUTE);
    expect(baustelle).toBe('2026-042');
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatchObject({ userId: 'u1', asHelper: false, projectNumber: '2026-042' });
  });

  it('nimmt den Helfer-Haken mit — er kostet bare Münze', async () => {
    // Ein Helfer wird mit einem anderen Satz verrechnet. Geht der Haken beim
    // Speichern verloren, steht am Monatsende der falsche Betrag auf der
    // Rechnung, und niemand sucht ihn in der Einsatzplanung.
    zeige();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: /Baustelle/ }), '2026-042');
    await userEvent.click(screen.getByRole('checkbox', { name: /^Max Mustermann/ }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'als Helfer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Einsatz speichern' }));

    await waitFor(() => expect(speichere).toHaveBeenCalled());
    expect(speichere.mock.calls[0][3][0].asHelper).toBe(true);
  });

  it('übernimmt eine vorhandene Planung ins Formular', async () => {
    /**
     * DER GEFÄHRLICHSTE FALL DIESER ANSICHT — und er ist bereits abgesichert.
     * Speichern heißt „alle Einsätze dieses Tages auf dieser Baustelle
     * löschen, dann die ausgewählten neu anlegen". Startete das Formular
     * leer, hätte eine Änderung am Kommentar die ganze Mannschaft entfernt.
     * Deshalb kommt die bestehende Planung mit, sobald Tag und Baustelle
     * stehen.
     */
    einsaetze = [
      {
        id: 'a1', companyId: 'perl', date: HEUTE, projectNumber: '2026-042',
        userId: 'u1', userName: 'Max Mustermann', asHelper: true,
      } as Assignment & { id: string },
    ];
    zeige();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: /Baustelle/ }), '2026-042');

    await waitFor(() => expect(screen.getByRole('checkbox', { name: /^Max Mustermann/ })).toBeChecked());
    // Auch der Helfer-Haken kommt mit — sonst wäre er nach dem nächsten
    // Speichern weg, und die Stunden gingen zum vollen Satz auf die Rechnung.
    expect(screen.getByRole('checkbox', { name: 'als Helfer' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /^Erna Beispiel/ })).not.toBeChecked();
  });

  it('verweigert das Speichern, wenn die Auswahl leer gemacht wird', async () => {
    /**
     * Wer alle Haken entfernt und speichert, meint fast nie „lösche den Tag".
     * Weil das Speichern aber genau das täte, sagt die Ansicht, wo das
     * Löschen wirklich steht — statt es stillschweigend auszuführen.
     */
    einsaetze = [
      {
        id: 'a1', companyId: 'perl', date: HEUTE, projectNumber: '2026-042',
        userId: 'u1', userName: 'Max Mustermann',
      } as Assignment & { id: string },
    ];
    zeige();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: /Baustelle/ }), '2026-042');
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /^Max Mustermann/ })).toBeChecked());

    await userEvent.click(screen.getByRole('checkbox', { name: /^Max Mustermann/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Einsatz speichern' }));

    expect(await screen.findByText(/Kein Mitarbeiter ausgewählt/)).toBeInTheDocument();
    expect(speichere).not.toHaveBeenCalled();
  });
});

describe('Einsatzplanung — Urlaub', () => {
  it('warnt, bevor jemand im genehmigten Urlaub eingeteilt wird', async () => {
    /**
     * Verboten wird es nicht — bei einem Notdienst holt man auch mal jemanden
     * aus dem Urlaub. Aber es muss dabeistehen, BEVOR der Haken sitzt: ein
     * Urlaub, der erst am Einsatztag auffällt, ist doppelte Arbeit für alle.
     */
    urlaube = [
      {
        id: 'v1', companyId: 'perl', userId: 'u1', userName: 'Max Mustermann',
        von: '2026-08-30', bis: '2026-09-05', status: 'Genehmigt', tage: 5,
      } as Vacation & { id: string },
    ];
    zeige();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: /Baustelle/ }), '2026-042');
    await userEvent.click(screen.getByRole('checkbox', { name: /^Max Mustermann/ }));

    expect(await screen.findByText(/im genehmigten/)).toBeInTheDocument();
    expect(screen.getByText('Max Mustermann', { selector: 'strong' })).toBeInTheDocument();
  });

  it('warnt NICHT bei jemandem, der nicht im Urlaub ist', async () => {
    urlaube = [
      {
        id: 'v1', companyId: 'perl', userId: 'u1', userName: 'Max Mustermann',
        von: '2026-08-30', bis: '2026-09-05', status: 'Genehmigt', tage: 5,
      } as Vacation & { id: string },
    ];
    zeige();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: /Baustelle/ }), '2026-042');
    await userEvent.click(screen.getByRole('checkbox', { name: /^Erna Beispiel/ }));

    expect(screen.queryByText(/im genehmigten/)).toBeNull();
  });
});

describe('Einsatzplanung — löschen', () => {
  it('fragt vor dem Löschen nach und löscht erst nach der Bestätigung', async () => {
    einsaetze = [
      {
        id: 'a1', companyId: 'perl', date: HEUTE, projectNumber: '2026-042',
        userId: 'u1', userName: 'Max Mustermann',
      } as Assignment & { id: string },
    ];
    zeige();

    const zeile = (await screen.findAllByText('Max Mustermann'))[0].closest('li') as HTMLElement;
    await userEvent.click(within(zeile).getByRole('button', { name: /löschen|entfernen/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Einsatz löschen?');
    expect(loesche).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(loesche).toHaveBeenCalledWith('a1'));
  });
});

describe('Einsatzplanung — wenn etwas nicht lädt', () => {
  it('sagt es, statt eine leere Baustellenliste zu zeigen', async () => {
    ladefehler = true;
    zeige();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Die Baustellen konnte nicht geladen werden.',
    );
  });
});
