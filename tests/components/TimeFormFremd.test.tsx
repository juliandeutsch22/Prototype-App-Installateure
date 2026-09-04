import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, TimeEntry } from '@/types';

/**
 * Die Doppelbuchungs-Warnung, wenn die Buchhaltung FÜR jemanden erfasst.
 *
 * AUS DEM BETRIEB GEMELDET: „wenn ich in der Mitarbeiterübersicht eine Zeit
 * buchen möchte und noch kein Mitarbeiter ausgewählt ist, steht die Meldung,
 * dass eine Zeit bereits erfasst wurde."
 *
 * Die Prüfung fiel ohne Auswahl auf den ANGEMELDETEN Benutzer zurück und
 * warnte vor DESSEN Buchungen — vor einem Formular, das gleich einem ganz
 * anderen Menschen gehören wird. Für den Monteur, der seine eigene Zeit
 * bucht, ist derselbe Rückfall richtig: dort gibt es keine Auswahl.
 *
 * Diese beiden Fälle stehen hier nebeneinander, weil sie sich nur in einer
 * einzigen Bedingung unterscheiden.
 */

const CHEFIN = 'chefin';

const monteur: AppUser = {
  id: 'u1',
  companyId: 'perl',
  uid: 'u1',
  name: 'Max Mustermann',
  email: 'max@perl.at',
  role: 'Mitarbeiter',
  active: true,
} as AppUser;

/** Was `eintraegeAmTag` je Kennung zurückgibt. */
const amTag: Record<string, (TimeEntry & { id: string })[]> = {};
const eintraegeAmTag = vi.fn(async (_c: string, uid: string) => amTag[uid] ?? []);

vi.mock('@/lib/db/timeEntries', () => ({
  createTimeEntry: vi.fn(async () => 'neu'),
  updateTimeEntry: vi.fn(async () => undefined),
  eintraegeAmTag: (c: string, uid: string) => eintraegeAmTag(c, uid),
  DuplicateEntryError: class extends Error {},
}));
vi.mock('@/components/BaustellenSelect', () => ({
  default: () => null,
}));

const authWert = {
  user: {
    uid: CHEFIN,
    email: 'chefin@perl.at',
    name: 'Petra Perl',
    role: 'Geschäftsführung' as const,
    companyId: 'perl',
    docId: CHEFIN,
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

const { default: TimeForm } = await import('@/features/time/TimeForm');

function zeichne(props: Partial<Parameters<typeof TimeForm>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <TimeForm onSaved={vi.fn()} {...props} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  eintraegeAmTag.mockClear();
  for (const k of Object.keys(amTag)) delete amTag[k];
  // Die Chefin hat an diesem Tag selbst gebucht — der Auslöser des Fehlers.
  amTag[CHEFIN] = [
    {
      id: 'eigen',
      companyId: 'perl',
      date: new Date().toISOString().slice(0, 10),
      status: 'Anwesend',
      userId: CHEFIN,
      userName: 'Petra Perl',
    } as TimeEntry & { id: string },
  ];
});

const warnung = () => screen.queryByText(/Für diesen Tag ist bereits gebucht/);

describe('Zeit für einen Mitarbeiter erfassen', () => {
  it('warnt NICHT, solange kein Mitarbeiter gewählt ist', async () => {
    /*
      DER GEMELDETE FEHLER. Ohne Auswahl gibt es keinen Eigentümer — und
      damit nichts zu prüfen. Eine Warnung über die Buchungen der
      Buchhalterin ist an dieser Stelle schlicht eine Aussage über den
      falschen Menschen.
    */
    zeichne({ staff: [monteur] });

    await waitFor(() => expect(screen.getByLabelText('Mitarbeiter')).toBeInTheDocument());
    expect(warnung()).not.toBeInTheDocument();
    // Und es wird gar nicht erst gefragt.
    expect(eintraegeAmTag).not.toHaveBeenCalled();
  });

  it('prüft den GEWÄHLTEN Mitarbeiter, sobald einer feststeht', async () => {
    // Der eigentliche Zweck der Warnung bleibt erhalten.
    const heute = new Date().toISOString().slice(0, 10);
    amTag['u1'] = [
      {
        id: 'fremd',
        companyId: 'perl',
        date: heute,
        status: 'Anwesend',
        userId: 'u1',
        userName: monteur.name,
      } as TimeEntry & { id: string },
    ];
    const nutzer = userEvent.setup();
    zeichne({ staff: [monteur] });

    await nutzer.selectOptions(await screen.findByLabelText('Mitarbeiter'), 'u1');

    expect(await screen.findByText(/Für diesen Tag ist bereits gebucht/)).toBeInTheDocument();
    expect(eintraegeAmTag).toHaveBeenCalledWith('perl', 'u1');
  });

  it('prüft weiterhin den Angemeldeten, wenn es keine Auswahl gibt', async () => {
    /*
      Der Monteur bucht seine EIGENE Zeit; dort ist der Rückfall auf den
      angemeldeten Benutzer richtig und die Warnung gemeint.
    */
    zeichne();

    expect(await screen.findByText(/Für diesen Tag ist bereits gebucht/)).toBeInTheDocument();
    expect(eintraegeAmTag).toHaveBeenCalledWith('perl', CHEFIN);
  });
});
