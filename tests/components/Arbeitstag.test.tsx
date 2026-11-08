import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Zeitsitzung } from '@/lib/zeitsitzung';

/*
 * DIE KARTE „ARBEITSTAG“ UND DIE TIMER-LEISTE (08.11.2026).
 *
 * - vor Beginn: runder Start-Knopf; die Baustelle laut heutigem Einsatz ist
 *   vorgewählt und geht mit dem Start hinaus — ohne Vorschlag keine;
 * - läuft: seit wann, die Arbeitszeit als Uhr, Pause und Feierabend;
 * - Pause: seit wann, Weiter und Feierabend;
 * - ohne Modul und ohne Sitzung: nichts; auf der Startseite der Verweis auf
 *   offene Abschnitte;
 * - die Leiste steht auf anderen Seiten, nicht auf Start und Zeiterfassung,
 *   am Telefon nicht im Gespräch der Nachrichten.
 *
 * Gegenprobe: ohne `vorschlag` im Start-Befehl, ohne die Seitenregel der
 * Leiste oder mit vertauschten Knöpfen ist je eine Prüfung rot.
 */

let sitzungen: Zeitsitzung[] = [];
let module: Record<string, boolean> = { 'zeiterfassung.timer': true };
const gesendet = vi.fn(async (b: { p_art: string; p_baustelle: string }) => { void b; return 'confirmed' as const; });

vi.mock('@/lib/db/zeitsitzungen', () => ({
  zeitsitzungenLaden: vi.fn(async () => sitzungen),
  timerSenden: (b: { p_art: string; p_baustelle: string }) => gesendet(b),
  timerMerken: vi.fn(),
  timerBuchen: vi.fn(),
  timerAbschnittVerwerfen: vi.fn(),
  letzterTimerEntwurf: vi.fn(),
  timerEntwurfVerwerfen: vi.fn(),
}));
vi.mock('@/lib/db/projects', () => ({
  listProjectsForEmployee: vi.fn(async () => [{ id: 'p1', projectNumber: 'B-1', customerName: 'Familie Huber', name: 'Bad', status: 'active' }]),
  listActiveProjects: vi.fn(async () => [{ id: 'p1', projectNumber: 'B-1', customerName: 'Familie Huber', name: 'Bad', status: 'active' }]),
  searchProjects: vi.fn(async () => []),
  listProjects: vi.fn(async () => [{ id: 'p1', projectNumber: 'B-1', customerName: 'Familie Huber', name: 'Bad', status: 'active' }]),
}));
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'ich', companyId: 'perl', role: 'Mitarbeiter', name: 'Max Monteur' }, company: { id: 'perl', name: 'Perl', modules: module } }),
}));

const { default: ArbeitstagKarte } = await import('@/features/time/ArbeitstagKarte');
const { default: TimerLeiste } = await import('@/features/time/TimerLeiste');

const sitzung = (stand: Zeitsitzung['stand'], segmente: Zeitsitzung['segmente']): Zeitsitzung => ({
  id: 's1', company_id: 'perl', user_id: 'ich', stand, revision: segmente.length, segmente,
  aktualisiert_am: segmente[segmente.length - 1].von, erinnert_am: null, abgeschlossen: false,
});

function zeigeKarte(props: { vorschlag?: string; aufStart?: boolean } = {}) {
  return render(<MemoryRouter><ArbeitstagKarte {...props} /></MemoryRouter>);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-09T11:17:32+01:00'));
  sitzungen = [];
  module = { 'zeiterfassung.timer': true };
  gesendet.mockClear();
});
afterEach(() => { vi.useRealTimers(); });

describe('Karte „Arbeitstag“', () => {
  it('vor Beginn: der heutige Einsatz ist vorgewählt und geht mit dem Start hinaus', async () => {
    zeigeKarte({ vorschlag: 'B-1' });
    const start = await screen.findByRole('button', { name: 'Arbeitstag starten' });
    await waitFor(() => expect(start).toBeEnabled());
    expect(await screen.findByText(/Familie Huber/)).toBeInTheDocument();
    await userEvent.click(start);
    await waitFor(() => expect(gesendet).toHaveBeenCalledWith(expect.objectContaining({ p_art: 'start', p_baustelle: 'B-1' })));
  });

  it('ohne Einsatz wird keine Baustelle erraten', async () => {
    zeigeKarte();
    const start = await screen.findByRole('button', { name: 'Arbeitstag starten' });
    expect(screen.getByText('Baustelle wählen')).toBeInTheDocument();
    await waitFor(() => expect(start).toBeEnabled());
    await userEvent.click(start);
    await waitFor(() => expect(gesendet).toHaveBeenCalledWith(expect.objectContaining({ p_art: 'start', p_baustelle: '' })));
  });

  it('läuft: seit wann, die Arbeitszeit als Uhr, Pause und Feierabend', async () => {
    sitzungen = [sitzung('laeuft', [{ id: 'a', art: 'arbeit', von: '2026-11-09T07:00:00+01:00', baustelle: 'B-1' }])];
    zeigeKarte();
    expect(await screen.findByText('Läuft seit 07:00')).toBeInTheDocument();
    expect(screen.getByLabelText('Arbeitszeit 4:17 Stunden')).toHaveTextContent('4:17:32');
    expect(screen.queryByRole('button', { name: 'Arbeitstag starten' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pause beginnen' }));
    await waitFor(() => expect(gesendet).toHaveBeenCalledWith(expect.objectContaining({ p_art: 'pause', p_baustelle: 'B-1' })));
    expect(screen.getByRole('button', { name: 'Stoppen und prüfen' })).toBeInTheDocument();
  });

  it('Pause: seit wann und wie lange, Weiter und Feierabend', async () => {
    sitzungen = [sitzung('pause', [
      { id: 'a', art: 'arbeit', von: '2026-11-09T07:00:00+01:00', bis: '2026-11-09T11:00:00+01:00', baustelle: 'B-1' },
      { id: 'p', art: 'pause', von: '2026-11-09T11:00:00+01:00', baustelle: '' },
    ])];
    zeigeKarte();
    expect(await screen.findByText('Pause seit 11:00')).toBeInTheDocument();
    expect(screen.getByLabelText('Pause 0:17 Stunden')).toHaveTextContent('0:17:32');
    expect(screen.getByText(/Arbeit bisher/)).toHaveTextContent('Arbeit bisher 4:00 h');
    await userEvent.click(screen.getByRole('button', { name: 'Weiterarbeiten' }));
    await waitFor(() => expect(gesendet).toHaveBeenCalledWith(expect.objectContaining({ p_art: 'weiter', p_baustelle: 'B-1' })));
    expect(screen.queryByRole('button', { name: 'Pause beginnen' })).not.toBeInTheDocument();
  });

  it('ohne Modul und ohne Sitzung steht nichts da; auf der Startseite der Verweis auf offene Abschnitte', async () => {
    module = { 'zeiterfassung.timer': false };
    const { container, unmount } = zeigeKarte();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    unmount();
    sitzungen = [{ ...sitzung('beendet', [{ id: 'a', art: 'arbeit', von: '2026-11-09T07:00:00+01:00', bis: '2026-11-09T09:00:00+01:00', baustelle: 'B-1' }]) }];
    zeigeKarte({ aufStart: true });
    const verweis = await screen.findByRole('link', { name: /Ein Arbeitstag wartet auf die Prüfung/ });
    expect(verweis).toHaveAttribute('href', '/time');
  });
});

describe('Timer-Leiste', () => {
  function zeigeLeiste(pfad: string, ort: 'telefon' | 'breit') {
    return render(
      <MemoryRouter initialEntries={[pfad]}>
        <Routes><Route path="*" element={<TimerLeiste ort={ort} />} /></Routes>
      </MemoryRouter>,
    );
  }
  const laeuft = () => [sitzung('laeuft', [{ id: 'a', art: 'arbeit', von: '2026-11-09T07:00:00+01:00', baustelle: 'B-1' }])];

  it('steht auf anderen Seiten mit Uhr, Baustelle, Pause und Feierabend', async () => {
    sitzungen = laeuft();
    zeigeLeiste('/material', 'telefon');
    const leiste = await screen.findByRole('region', { name: 'Laufender Arbeitstag' });
    expect(within(leiste).getByText('4:17')).toBeInTheDocument();
    expect(within(leiste).getByText('B-1')).toBeInTheDocument();
    expect(within(leiste).getByRole('button', { name: 'Pause beginnen' })).toBeInTheDocument();
    expect(within(leiste).getByRole('button', { name: 'Stoppen und prüfen' })).toBeInTheDocument();
  });

  it('nicht auf Start und Zeiterfassung — dort steht die Karte; am Telefon nicht im Gespräch', async () => {
    sitzungen = laeuft();
    const { zeitsitzungenLaden } = await import('@/lib/db/zeitsitzungen');
    for (const pfad of ['/', '/time', '/nachrichten/abc']) {
      vi.mocked(zeitsitzungenLaden).mockClear();
      const { unmount } = zeigeLeiste(pfad, 'telefon');
      // Erst wenn die laufende Sitzung geladen ist, sagt das Fehlen der Leiste etwas.
      await waitFor(() => expect(zeitsitzungenLaden).toHaveBeenCalled());
      await vi.mocked(zeitsitzungenLaden).mock.results[0].value;
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.queryByRole('region', { name: 'Laufender Arbeitstag' }), pfad).not.toBeInTheDocument();
      unmount();
    }
    // Ab dem Tablet steht die Eingabe im Blatt — dort darf die Leiste bleiben.
    zeigeLeiste('/nachrichten/abc', 'breit');
    expect(await screen.findByRole('region', { name: 'Laufender Arbeitstag' })).toBeInTheDocument();
  });

  it('ohne laufende Sitzung keine Leiste', async () => {
    const { zeitsitzungenLaden } = await import('@/lib/db/zeitsitzungen');
    vi.mocked(zeitsitzungenLaden).mockClear();
    zeigeLeiste('/material', 'telefon');
    await waitFor(() => expect(zeitsitzungenLaden).toHaveBeenCalled());
    await vi.mocked(zeitsitzungenLaden).mock.results[0].value;
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('region', { name: 'Laufender Arbeitstag' })).not.toBeInTheDocument();
  });
});
