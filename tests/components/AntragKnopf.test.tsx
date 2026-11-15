import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import AntragKnopf, { FreistellungKnopf } from '@/features/time/AntragKnopf';
import { Routes, Route } from 'react-router-dom';
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
const kuerzen = vi.fn(async (d: unknown) => { void d; return { entfernt: 1, teile: 2, antraege: ['v1', 'v2'] }; });
vi.mock('@/lib/db/vacations', () => ({
  getVacation: (...a: unknown[]) => getVacation(...(a as [])),
  entscheiden: (...a: unknown[]) => entscheiden(...(a as [])),
  kuerzen: (d: unknown) => kuerzen(d),
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

/*
  DER TAG AUS EINEM SONDERURLAUB (A15, 24.10.2026): ohne das Modul Urlaub
  führt „Antrag“ auf die Seite Sonderurlaub, statt nur „aus Antrag“ zu sagen.
*/
describe('Tag aus einem Sonderurlaub', () => {
  function zeigeFrei() {
    return render(
      <MemoryRouter initialEntries={['/time']}>
        <Routes>
          <Route path="/time" element={<FreistellungKnopf />} />
          <Route path="/sonderurlaub" element={<p>Seite Sonderurlaub</p>} />
          <Route path="/vacations" element={<p>Seite Urlaub</p>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('ohne das Modul Urlaub führt „Antrag“ auf die Seite Sonderurlaub', async () => {
    zeigeFrei();
    await userEvent.click(screen.getByRole('button', { name: 'Antrag' }));
    expect(screen.getByText('Seite Sonderurlaub')).toBeInTheDocument();
  });

  it('bleibt gleich: mit dem Modul Urlaub auf die Urlaubsseite', async () => {
    modulAn = true;
    zeigeFrei();
    await userEvent.click(screen.getByRole('button', { name: 'Antrag' }));
    expect(screen.getByText('Seite Urlaub')).toBeInTheDocument();
  });
});

/*
  Z1 (Durchsicht 15.11.2026): der Knopf am Urlaubstag sprang mit Modul Urlaub
  auf die Urlaubsseite ohne Bezug — der Antrag einer anderen Person stand dort
  nicht. Jetzt öffnet er genau diesen Antrag. Ohne Modul lässt sich am Tag
  auch kürzen, mit diesem Tag als Vorschlag zum Streichen.
*/
describe('Der Sprung vom Tag und das Kürzen (Z1)', () => {
  function zeigeMitSeite(eintrag: { status: 'Urlaub'; vacationId?: string; date?: string }) {
    return render(
      <MemoryRouter initialEntries={['/time']}>
        <ToastProvider>
          <Routes>
            <Route path="/time" element={<AntragKnopf eintrag={eintrag} />} />
            <Route path="/vacations" element={<Adresse />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    );
  }
  function Adresse() {
    return <p>Seite Urlaub {useLocation().search}</p>;
  }

  it('mit Modul Urlaub öffnet der Knopf genau diesen Antrag', async () => {
    modulAn = true;
    zeigeMitSeite({ status: 'Urlaub', vacationId: 'v1' });
    await userEvent.click(screen.getByRole('button', { name: 'Urlaubsantrag' }));
    expect(screen.getByText('Seite Urlaub ?antrag=v1')).toBeInTheDocument();
  });

  it('ohne Modul: „Kürzen“ am Tag streicht vorbelegt genau diesen Tag', async () => {
    const nutzer = userEvent.setup();
    render(
      <MemoryRouter>
        <ToastProvider>
          <AntragKnopf eintrag={{ status: 'Urlaub', vacationId: 'v1', date: '2026-10-06' }} />
        </ToastProvider>
      </MemoryRouter>,
    );
    await nutzer.click(screen.getByRole('button', { name: 'Kürzen' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Urlaub von Max Monteur kürzen?')).toBeInTheDocument();
    expect(within(dialog).getByText(/Bleibt: 05\.10\.2026 und 07\.10\.2026/)).toBeInTheDocument();
    await nutzer.type(within(dialog).getByLabelText(/Grund/), 'Am 6. auf der Baustelle');
    await nutzer.click(within(dialog).getByRole('button', { name: 'Kürzen' }));
    expect(kuerzen).toHaveBeenCalledWith({
      vacationId: 'v1', von: '2026-10-05', bis: '2026-10-07', streichen: ['2026-10-06'], grund: 'Am 6. auf der Baustelle', name: 'Berta Büro',
    });
    expect(entscheiden).not.toHaveBeenCalled();
    expect(await screen.findByText(/Gekürzt — 1 Tag aus dem Zeitkonto entfernt, in 2 Anträge geteilt/)).toBeInTheDocument();
  });

  it('ein Tag allein wird nicht gekürzt, sondern ganz zurückgenommen', async () => {
    antrag = { ...antrag!, von: '2026-10-05', bis: '2026-10-05' };
    render(<MemoryRouter><ToastProvider><AntragKnopf eintrag={{ status: 'Urlaub', vacationId: 'v1' }} /></ToastProvider></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Kürzen' }));
    expect(await screen.findByText(/nur einen Tag — er wird nicht gekürzt/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

