import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import AntragKnopf from '@/features/time/AntragKnopf';
import type { Role, Vacation } from '@/types';

/**
 * Der Tag aus einem Antrag, wenn der Betrieb das Modul Urlaub ausgeschaltet
 * hat (Handbuch „Was noch fehlt", 29.09.2026).
 *
 * Urlaub trägt das Büro dann weiter über die Zeiterfassung ein — daraus wird
 * ein genehmigter Antrag. Zurücknehmen liess er sich nirgends, weil es die
 * Urlaubsseite nicht gibt.
 */

let modulAn = false;
vi.mock('@/lib/useModule', () => ({ useModul: () => modulAn }));

const authWert = {
  user: { uid: 'buch', companyId: 'perl', name: 'Berta Büro', role: 'Buchhaltung' as Role },
  company: { id: 'perl', name: 'Perl', vacationApprovers: undefined as string[] | undefined },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

let antrag: (Vacation & { id: string }) | null = null;
const getVacation = vi.fn(async () => antrag);
const entscheiden = vi.fn(async () => ({ status: 'Storniert', angelegt: 0, uebersprungen: 0, entfernt: 3 }));
vi.mock('@/lib/db/vacations', () => ({
  getVacation: (...a: unknown[]) => getVacation(...(a as [])),
  entscheiden: (...a: unknown[]) => entscheiden(...(a as [])),
}));

function zeige(status: 'Urlaub' | 'Zeitausgleich' = 'Urlaub') {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AntragKnopf eintrag={{ status, vacationId: 'v1' }} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  modulAn = false;
  authWert.user.role = 'Buchhaltung';
  authWert.company.vacationApprovers = undefined;
  antrag = {
    id: 'v1', companyId: 'perl', userId: 'm1', userName: 'Max Monteur',
    von: '2026-10-05', bis: '2026-10-07', tage: 3, status: 'Genehmigt',
  } as Vacation & { id: string };
  getVacation.mockClear();
  entscheiden.mockClear();
});

describe('Modul Urlaub eingeschaltet', () => {
  it('führt wie bisher zur Urlaubsseite', () => {
    modulAn = true;
    zeige();
    expect(screen.getByRole('button', { name: 'Urlaubsantrag' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zurücknehmen' })).toBeNull();
  });
});

describe('Modul Urlaub ausgeschaltet', () => {
  it('wer nicht entscheiden darf, sieht nur, woher der Tag kommt', () => {
    authWert.user.role = 'Mitarbeiter';
    zeige();
    expect(screen.getByText('aus Urlaubsantrag')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('wer entscheiden darf, nimmt den ganzen Antrag mit Grund zurück', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(screen.getByRole('button', { name: 'Zurücknehmen' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Urlaub von Max Monteur zurücknehmen?')).toBeInTheDocument();
    // Der ganze Zeitraum geht mit, nicht nur der eine Tag.
    expect(within(dialog).getByText(/05\.10\.2026 – 07\.10\.2026 — alle Tage dieses Antrags/)).toBeInTheDocument();

    // Ohne Grund nicht.
    await nutzer.click(within(dialog).getByRole('button', { name: 'Zurücknehmen' }));
    expect(await within(dialog).findByText(/mindestens drei Zeichen/)).toBeInTheDocument();
    expect(entscheiden).not.toHaveBeenCalled();

    await nutzer.type(within(dialog).getByLabelText(/Grund/), 'Doch gearbeitet');
    await nutzer.click(within(dialog).getByRole('button', { name: 'Zurücknehmen' }));
    expect(entscheiden).toHaveBeenCalledWith({
      vacationId: 'v1', entscheidung: 'Storniert', grund: 'Doch gearbeitet', entscheiderName: 'Berta Büro',
    });
    expect(await screen.findByText('Urlaub zurückgenommen')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('nennt den Zeitausgleich beim Namen', async () => {
    const nutzer = userEvent.setup();
    antrag = { ...antrag!, art: 'Zeitausgleich', von: '2026-10-05', bis: '2026-10-05' };
    zeige('Zeitausgleich');
    await nutzer.click(screen.getByRole('button', { name: 'Zurücknehmen' }));
    expect(await screen.findByText('Zeitausgleich von Max Monteur zurücknehmen?')).toBeInTheDocument();
  });

  it('eine eingetragene Genehmigende aus einer anderen Rolle darf es auch', () => {
    authWert.user.role = 'Verwaltung';
    authWert.company.vacationApprovers = ['buch'];
    zeige();
    expect(screen.getByRole('button', { name: 'Zurücknehmen' })).toBeInTheDocument();
  });

  it('ein Tag aus dem Betriebsurlaub wird nicht für eine Person zurückgenommen', async () => {
    const nutzer = userEvent.setup();
    antrag = { ...antrag!, betriebsurlaubId: 'bu1' };
    zeige();
    await nutzer.click(screen.getByRole('button', { name: 'Zurücknehmen' }));
    expect(await screen.findByText(/gehört zum Betriebsurlaub/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(entscheiden).not.toHaveBeenCalled();
  });

  it('meldet, wenn es den Antrag nicht mehr gibt', async () => {
    const nutzer = userEvent.setup();
    antrag = null;
    zeige();
    await nutzer.click(screen.getByRole('button', { name: 'Zurücknehmen' }));
    expect(await screen.findByText('Den Antrag zu diesem Tag gibt es nicht mehr.')).toBeInTheDocument();
  });
});
