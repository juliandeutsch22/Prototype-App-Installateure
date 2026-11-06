import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Modul } from '@/lib/module';

/**
 * Die Seite „Module“ mit Unterfähigkeiten (N02, E52).
 *
 * Das echte Register trägt noch keine Unterfähigkeit; die ersten kommen mit
 * den Paketen des SHK-Ausbaus. Damit die Seite dann richtig damit umgeht —
 * und nicht erst, wenn ein Betrieb davorsitzt —, prüft diese Datei sie an
 * einem Prüfregister.
 */

const PRUEF: Modul[] = [
  {
    id: 'material',
    name: 'Material und Lager',
    zweck: 'Material.',
    standard: true,
    betrifft: ['Lager'],
    unter: [
      {
        id: 'material.lagerorte',
        name: 'Lagerorte',
        zweck: 'Mehrere Orte und Fahrzeuglager.',
        standard: true,
        betrifft: ['Lagerorte'],
        folgen: ['Offene Umlagerungen enden.'],
      },
      { id: 'material.scan', name: 'Scannen', zweck: 'Mit Kamera oder Scanner.', standard: false, betrifft: ['Scan'] },
    ],
  },
];

vi.mock('@/lib/module', async (original) => ({
  ...(await original<typeof import('@/lib/module')>()),
  MODULE: PRUEF,
}));

const updateCompany = vi.fn<(a0: string, a1: Record<string, unknown>) => Promise<void>>(async () => undefined);
vi.mock('@/lib/db/company', () => ({
  updateCompany: (id: string, daten: Record<string, unknown>) => updateCompany(id, daten),
}));

const NUTZER = { uid: 'admin', email: 'a@b.at', name: 'Admin', role: 'Administrator' as const, companyId: 'perl', docId: 'admin' };
// Ein fester Gegenstand wie in der App: ein neuer je Zeichnen stieße den Entwurf jedes Mal neu an.
const FIRMA = { id: 'perl', name: 'Perl' };
const reloadCompany = vi.fn();
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ user: NUTZER, company: FIRMA, reloadCompany }),
}));

const { default: ModulesView } = await import('@/features/modules/ModulesView');

function zeige() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ModulesView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

const schalter = (name: string) =>
  screen.getByRole('checkbox', { name: new RegExp(`^${name} (ein|aus)schalten$`) });

beforeEach(() => updateCompany.mockClear());

describe('Unterfähigkeiten auf der Seite „Module“', () => {
  it('stehen unter ihrem Modul und sagen, wozu sie gehören', () => {
    zeige();
    expect(schalter('Lagerorte')).toBeChecked();
    expect(schalter('Scannen')).not.toBeChecked();
    expect(screen.getAllByText('Teil von Material und Lager')).toHaveLength(2);
  });

  it('gehen mit dem Modul aus und lassen sich ohne es nicht einschalten', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(schalter('Material und Lager'));
    // Die Lagerorte haben eine Folge — also erst die Rückfrage.
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Offene Umlagerungen enden/)).toBeInTheDocument();
    await nutzer.click(within(dialog).getByRole('button', { name: 'Ausschalten' }));

    expect(schalter('Lagerorte')).not.toBeChecked();
    expect(schalter('Scannen')).toBeDisabled();
  });

  it('lassen sich einzeln schalten und werden unter ihrer Kennung gespeichert', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(schalter('Scannen'));
    await nutzer.click(screen.getByRole('button', { name: 'Module speichern' }));
    expect(updateCompany).toHaveBeenCalledWith('perl', { modules: { 'material.scan': true } });
  });
});
