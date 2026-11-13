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
// Das gewohnte Formular hat eigene Prüfungen (TimeForm*.test.tsx) — hier zählt, womit es vorbelegt wird.
const formular = vi.fn((p: unknown) => { void p; return null; });
vi.mock('@/features/time/TimeForm', () => ({ default: (p: unknown) => formular(p) }));
vi.mock('@/lib/db/assignments', () => ({ listAssignmentsForUserInRange: vi.fn(async () => []) }));
vi.mock('@/lib/db/projects', () => ({
  listProjectsByNumbers: vi.fn(async () => [{ id: 'p1', projectNumber: 'B-1', customerName: 'Familie Huber', name: 'Bad', status: 'Aktiv' }]),
  listProjectsForEmployee: vi.fn(async () => [{ id: 'p1', projectNumber: 'B-1', customerName: 'Familie Huber', name: 'Bad', status: 'active' }]),
  listActiveProjects: vi.fn(async () => [{ id: 'p1', projectNumber: 'B-1', customerName: 'Familie Huber', name: 'Bad', status: 'active' }]),
  searchProjects: vi.fn(async () => []),
  listProjects: vi.fn(async () => [{ id: 'p1', projectNumber: 'B-1', customerName: 'Familie Huber', name: 'Bad', status: 'active' }]),
}));
// E68: die eigene Einrichtung der Startseite — ist dort der Arbeitstag ausgeblendet, steht die Leiste.
let startWahl: { aus?: string[] } | null = null;
vi.mock('@/lib/db/startseiteWahl', () => ({ ladeStartseiteWahl: vi.fn(async () => startWahl), startseiteWahlSpeichern: vi.fn() }));
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'ich', companyId: 'perl', role: 'Mitarbeiter', name: 'Max Monteur' }, company: { id: 'perl', name: 'Perl', modules: module } }),
}));

const { default: ArbeitstagKarte } = await import('@/features/time/ArbeitstagKarte');
const { default: TimerLeiste } = await import('@/features/time/TimerLeiste');
const { default: ZeitsitzungPanel } = await import('@/features/time/ZeitsitzungPanel');
const { ToastProvider } = await import('@/components/Toast');
const zs = await import('@/lib/db/zeitsitzungen');

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

  // E83: ohne Einsatz die zuletzt benutzte Baustelle — sichtbar auf dem Knopf, mit einem Tipp geändert.
  it('ohne Einsatz die zuletzt benutzte Baustelle', async () => {
    localStorage.setItem('senklot:zuletzt-baustelle:perl:ich', 'B-1');
    zeigeKarte();
    const start = await screen.findByRole('button', { name: 'Arbeitstag starten' });
    expect(await screen.findByText(/Familie Huber/)).toBeInTheDocument();
    await waitFor(() => expect(start).toBeEnabled());
    await userEvent.click(start);
    await waitFor(() => expect(gesendet).toHaveBeenCalledWith(expect.objectContaining({ p_art: 'start', p_baustelle: 'B-1' })));
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

  // E74 (10.11.2026): „Verwerfen …“ ist der Papierkorb unten links — weit weg von Pause und Stopp; er öffnet weiter den Bogen.
  it('„Verwerfen …“ ist der Papierkorb und öffnet weiter den Bogen', async () => {
    sitzungen = [sitzung('laeuft', [{ id: 'a', art: 'arbeit', von: '2026-11-09T07:00:00+01:00', baustelle: 'B-1' }])];
    zeigeKarte();
    const knopf = await screen.findByRole('button', { name: 'Arbeitstag verwerfen …' });
    expect(knopf).toHaveClass('lot-knopf', 'hover:text-danger');
    expect(knopf).toHaveTextContent(/^$/);
    expect(knopf.closest('.arbeitstag-fuss')).not.toBeNull();
    expect(knopf.closest('.arbeitstag-knoepfe')).toBeNull();
    await userEvent.click(knopf);
    expect(await screen.findByRole('dialog', { name: 'Zeitsitzung verwerfen' })).toBeInTheDocument();
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

/*
  DER TIMER ANTWORTET SOFORT (C4, E90). Der Tipp ändert die Anzeige im selben
  Augenblick; der Server bestätigt im Hintergrund. Lehnt er ab, springt sie
  zurück und nennt den Grund. Ein zweiter Tipp, solange der erste unterwegs
  ist, geht nicht hinaus — nach „Pause“ liegt an derselben Stelle
  „Weiterarbeiten“.
*/
describe('Der Timer antwortet sofort (C4, E90)', () => {
  const laeuft = () => sitzung('laeuft', [{ id: 'a', art: 'arbeit', von: '2026-11-09T07:00:00+01:00', baustelle: 'B-1' }]);
  let antworten: (wert: 'confirmed') => void = () => undefined;
  let ablehnen: (e: Error) => void = () => undefined;
  const haengt = () => new Promise<'confirmed'>((ja, nein) => { antworten = ja; ablehnen = nein; });

  it('Pause gilt sofort — die Knöpfe bleiben bedienbar, gesendet wird einmal, danach der Stand des Servers', async () => {
    sitzungen = [laeuft()];
    gesendet.mockImplementationOnce(haengt);
    zeigeKarte();
    await userEvent.click(await screen.findByRole('button', { name: 'Pause beginnen' }));
    // Noch ohne Antwort des Servers: die Pause steht schon da.
    expect(screen.getByText('Pause seit 11:17')).toBeInTheDocument();
    const weiter = screen.getByRole('button', { name: 'Weiterarbeiten' });
    expect(weiter).toBeEnabled();
    // Der zweite Tipp des Doppeltipps geht nicht hinaus.
    await userEvent.click(weiter);
    expect(gesendet).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Pause seit 11:17')).toBeInTheDocument();
    const geladen = vi.mocked(zs.zeitsitzungenLaden).mock.calls.length;
    sitzungen = [sitzung('pause', [
      { id: 'a', art: 'arbeit', von: '2026-11-09T07:00:00+01:00', bis: '2026-11-09T11:17:32+01:00', baustelle: 'B-1' },
      { id: 'p', art: 'pause', von: '2026-11-09T11:17:32+01:00', baustelle: 'B-1' },
    ])];
    antworten('confirmed');
    await waitFor(() => expect(vi.mocked(zs.zeitsitzungenLaden).mock.calls.length).toBeGreaterThan(geladen));
    expect(await screen.findByText('Pause seit 11:17')).toBeInTheDocument();
  });

  it('lehnt der Server ab, springt die Anzeige zurück und nennt den Grund', async () => {
    sitzungen = [laeuft()];
    gesendet.mockImplementationOnce(haengt);
    zeigeKarte();
    await userEvent.click(await screen.findByRole('button', { name: 'Pause beginnen' }));
    expect(screen.getByText('Pause seit 11:17')).toBeInTheDocument();
    ablehnen(new Error('Die Zeitsitzung wurde auf einem anderen Gerät geändert.'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Die Zeitsitzung wurde auf einem anderen Gerät geändert.');
    expect(screen.getByText('Läuft seit 07:00')).toBeInTheDocument();
    expect(screen.queryByText(/Pause seit/)).toBeNull();
  });

  it('ohne Netz bleibt der Schritt stehen und ist vorgemerkt — wie bisher', async () => {
    sitzungen = [laeuft()];
    gesendet.mockImplementationOnce(async () => 'queued' as never);
    render(<ToastProvider><MemoryRouter><ArbeitstagKarte /></MemoryRouter></ToastProvider>);
    await userEvent.click(await screen.findByRole('button', { name: 'Pause beginnen' }));
    expect(await screen.findByText(/Timer-Schritt auf diesem Gerät vorgemerkt/)).toBeInTheDocument();
    expect(screen.getByText('Pause seit 11:17')).toBeInTheDocument();
    expect(vi.mocked(zs.timerMerken)).toHaveBeenCalled();
  });

  it('nach „Stoppen und prüfen“ wird erst gebucht, wenn der Server den Stopp kennt', async () => {
    sitzungen = [laeuft()];
    gesendet.mockImplementationOnce(haengt);
    formular.mockClear();
    // Wie im Layout: ein gemeinsamer Stand für Karte und „Arbeitstag prüfen“.
    const { default: ZeitsitzungAnbieter } = await import('@/features/time/ZeitsitzungAnbieter');
    module = { zeiterfassung: true, 'zeiterfassung.timer': true };
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/']}>
          <ZeitsitzungAnbieter>
            <Routes>
              <Route path="/" element={<ArbeitstagKarte />} />
              <Route path="/time" element={<><ArbeitstagKarte /><ZeitsitzungPanel /></>} />
            </Routes>
          </ZeitsitzungAnbieter>
        </MemoryRouter>
      </ToastProvider>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Stoppen und prüfen' }));
    // Gleich auf „Arbeitstag prüfen“, aber noch ohne Formular und ohne Papierkorb.
    expect(await screen.findByText('Arbeitstag prüfen')).toBeInTheDocument();
    expect(formular).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /nicht buchen/ })).toBeNull();
    sitzungen = [sitzung('beendet', [{ id: 'a', art: 'arbeit', von: '2026-11-09T07:00:00+01:00', bis: '2026-11-09T11:17:32+01:00', baustelle: 'B-1' }])];
    antworten('confirmed');
    await waitFor(() => expect(formular).toHaveBeenCalled());
  });
});

/* Die kompakte Karte (D7, E90): dieselben Teile, die Baustelle mit Nummer, „Zeit von Hand“ nur auf Start. */
describe('Karte „Arbeitstag“ kompakt (D7, E90)', () => {
  const laeuft = () => sitzung('laeuft', [{ id: 'a', art: 'arbeit', von: '2026-11-09T07:00:00+01:00', baustelle: 'B-1' }]);

  it('die Baustelle mit Namen und Nummer; Papierkorb, Uhr und Knöpfe in einem Raster', async () => {
    sitzungen = [laeuft()];
    const { container } = zeigeKarte();
    const wechsel = await screen.findByRole('button', { name: /Baustelle wechseln — jetzt Familie Huber/ });
    await waitFor(() => expect(wechsel.querySelector('.nr')).toHaveTextContent('B-1'));
    const raster = container.querySelector('.arbeitstag-lauf') as HTMLElement;
    for (const teil of ['.arbeitstag-stand', '.arbeitstag-fuss', '.arbeitstag-uhr', '.arbeitstag-knoepfe', '.arbeitstag-unten']) {
      expect(raster.querySelector(`:scope > ${teil}`), teil).not.toBeNull();
    }
    expect(within(raster).getByRole('button', { name: 'Arbeitstag verwerfen …' })).toBeInTheDocument();
  });

  it('„Zeit von Hand eintragen“ nur auf der Startseite — in der Zeiterfassung steht das Formular schon da', async () => {
    sitzungen = [laeuft()];
    const { unmount } = render(<MemoryRouter><ArbeitstagKarte aufStart handZeit={{ projectNumber: 'B-1' }} /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: /Zeit von Hand eintragen/ })).toHaveAttribute('href', '/time');
    unmount();
    zeigeKarte();
    await screen.findByText('Läuft seit 07:00');
    expect(screen.queryByRole('link', { name: /Zeit von Hand eintragen/ })).toBeNull();
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
    // Seit D7 (E90) der Name wie auf der Karte, nicht die Nummer.
    expect(await within(leiste).findByText(/Familie Huber/)).toBeInTheDocument();
    expect(within(leiste).getByRole('button', { name: 'Pause beginnen' })).toBeInTheDocument();
    expect(within(leiste).getByRole('button', { name: 'Stoppen und prüfen' })).toBeInTheDocument();
  });

  it('Gegenprobe: ist die Baustelle nicht zu holen (ohne Netz), steht die Nummer', async () => {
    sitzungen = laeuft();
    const projekte = await import('@/lib/db/projects');
    vi.mocked(projekte.listProjectsByNumbers).mockRejectedValueOnce(new Error('Failed to fetch'));
    zeigeLeiste('/material', 'telefon');
    const leiste = await screen.findByRole('region', { name: 'Laufender Arbeitstag' });
    expect(within(leiste).getByText('B-1')).toBeInTheDocument();
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

  it('auf der Startseite, wenn dort die Karte „Arbeitstag“ ausgeblendet ist (E68)', async () => {
    const { abfrageSpeicher } = await import('@/lib/zwischenspeicher');
    abfrageSpeicher.removeQueries({ queryKey: ['startseite-wahl'] });
    sitzungen = laeuft();
    startWahl = { aus: ['bereich-arbeitstag'] };
    try {
      zeigeLeiste('/', 'telefon');
      expect(await screen.findByRole('region', { name: 'Laufender Arbeitstag' })).toBeInTheDocument();
    } finally {
      startWahl = null;
      abfrageSpeicher.removeQueries({ queryKey: ['startseite-wahl'] });
    }
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

/*
 * ARBEITSTAG PRÜFEN (E73, 10.11.2026: „nicht buchen und Sitzung begründet
 * verwerfen machen dasselbe und nehmen zu viel Platz weg … ein Papierkorb
 * würde reichen“; „sperrig, nicht intuitiv“).
 *
 * - je Baustelle EINE Zeit von Beginn bis Ende, die Pause eingerechnet;
 * - ein Papierkorb je offener Zeit statt zweier Textlinks; bei mehreren
 *   offenen Zeiten fragt er, ob nur diese oder der ganze Tag;
 * - „Stoppen und prüfen“ öffnet gleich das Formular der ersten Zeit.
 *
 * Gegenprobe: mit dem Panel vor E73 (Zeile je Abschnitt, „Nicht buchen …“
 * und „Sitzung begründet verwerfen …“ als Links, Stopp ohne Formular) ist
 * jede Prüfung hier rot.
 */
describe('Arbeitstag prüfen', () => {
  const tag = (segmente: Zeitsitzung['segmente']) => [sitzung('beendet', segmente)];
  const mitPause: Zeitsitzung['segmente'] = [
    { id: 'a', art: 'arbeit', von: '2026-11-09T07:00:00+01:00', bis: '2026-11-09T12:00:00+01:00', baustelle: 'B-1' },
    { id: 'p', art: 'pause', von: '2026-11-09T12:00:00+01:00', bis: '2026-11-09T12:30:00+01:00', baustelle: 'B-1' },
    { id: 'b', art: 'arbeit', von: '2026-11-09T12:30:00+01:00', bis: '2026-11-09T16:00:00+01:00', baustelle: 'B-1' },
  ];
  const mitWechsel: Zeitsitzung['segmente'] = [
    { id: 'a', art: 'arbeit', von: '2026-11-09T07:00:00+01:00', bis: '2026-11-09T10:00:00+01:00', baustelle: 'B-1' },
    { id: 'b', art: 'arbeit', von: '2026-11-09T10:00:00+01:00', bis: '2026-11-09T15:00:00+01:00', baustelle: 'B-2' },
  ];
  function zeigePanel() {
    return render(<MemoryRouter><ToastProvider><ZeitsitzungPanel /></ToastProvider></MemoryRouter>);
  }

  beforeEach(() => {
    formular.mockClear();
    vi.mocked(zs.timerAbschnittVerwerfen).mockReset().mockResolvedValue('confirmed');
  });

  it('Arbeit, Pause, Arbeit an derselben Baustelle ist eine Zeit mit 30 Min. Pause — und ein Formular', async () => {
    sitzungen = tag(mitPause);
    zeigePanel();
    const zeile = await screen.findByText('07:00–16:00');
    // Die Baustelle mit Namen (wie auf der Karte), dann Pause und Stand.
    expect(await screen.findByText('Familie Huber · 30 Min. Pause · noch nicht gebucht')).toBeInTheDocument();
    // Keine Zeile für die Pause, keine je Abschnitt.
    expect(screen.queryByText(/12:00–12:30/)).not.toBeInTheDocument();
    expect(screen.queryByText(/12:30–16:00/)).not.toBeInTheDocument();
    await userEvent.click(zeile);
    const bogen = await screen.findByRole('dialog', { name: 'Arbeitszeit buchen' });
    expect(within(bogen).getByText(/07:00 bis 16:00, darin 30 Min\. Pause/)).toBeInTheDocument();
    expect(formular).toHaveBeenLastCalledWith(expect.objectContaining({
      vorbelegung: expect.objectContaining({ startTime: '07:00', endTime: '16:00', breakDuration: 30, projectNumber: 'B-1' }),
    }));
    // Gebucht wird der Zeitraum vom ersten bis zum letzten Arbeitsabschnitt.
    const { speichernMit } = formular.mock.calls[formular.mock.calls.length - 1][0] as { speichernMit: (w: object) => unknown };
    await speichernMit({ startTime: '07:00' });
    expect(zs.timerBuchen).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), 0, 2, { startTime: '07:00' });
  });

  it('ein Baustellenwechsel sind zwei Zeiten', async () => {
    sitzungen = tag(mitWechsel);
    zeigePanel();
    expect(await screen.findByText('07:00–10:00')).toBeInTheDocument();
    expect(screen.getByText('10:00–15:00')).toBeInTheDocument();
    expect(screen.getByText('B-2 · noch nicht gebucht')).toBeInTheDocument();
  });

  it('ein Papierkorb statt zweier Links; bei einer Zeit ohne Rückfrage nach dem Umfang', async () => {
    sitzungen = tag([mitPause[0]]);
    zeigePanel();
    await screen.findByText('07:00–12:00');
    expect(screen.queryByRole('button', { name: /Sitzung begründet verwerfen/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Nicht buchen …')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '07:00–12:00 nicht buchen' }));
    const bogen = await screen.findByRole('dialog', { name: 'Nicht buchen' });
    expect(within(bogen).queryByRole('radio')).not.toBeInTheDocument();
    const knopf = within(bogen).getByRole('button', { name: 'Nicht buchen' });
    expect(knopf).toBeDisabled();
    expect(knopf.closest('.fuss-aktionen')).toContainElement(within(bogen).getByRole('button', { name: 'Abbrechen' }));
    await userEvent.type(within(bogen).getByLabelText(/Grund/), 'Fehlstart');
    await userEvent.click(knopf);
    await waitFor(() => expect(zs.timerAbschnittVerwerfen).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), 0, 'Fehlstart'));
    expect(zs.timerAbschnittVerwerfen).toHaveBeenCalledTimes(1);
    expect(gesendet).not.toHaveBeenCalled();
  });

  it('eine Zeit mit Pause nimmt alle ihre Arbeitsabschnitte heraus', async () => {
    sitzungen = tag(mitPause);
    zeigePanel();
    await userEvent.click(await screen.findByRole('button', { name: '07:00–16:00 nicht buchen' }));
    const bogen = await screen.findByRole('dialog', { name: 'Nicht buchen' });
    await userEvent.type(within(bogen).getByLabelText(/Grund/), 'Schulung');
    await userEvent.click(within(bogen).getByRole('button', { name: 'Nicht buchen' }));
    await waitFor(() => expect(zs.timerAbschnittVerwerfen).toHaveBeenCalledTimes(2));
    expect(vi.mocked(zs.timerAbschnittVerwerfen).mock.calls.map((c) => c[1])).toEqual([0, 2]);
  });

  it('bei mehreren offenen Zeiten: nur diese oder der ganze Arbeitstag', async () => {
    sitzungen = tag(mitWechsel);
    zeigePanel();
    await userEvent.click(await screen.findByRole('button', { name: '10:00–15:00 nicht buchen' }));
    const bogen = await screen.findByRole('dialog', { name: 'Nicht buchen' });
    expect(within(bogen).getByRole('radio', { name: 'Nur 10:00–15:00' })).toBeChecked();
    await userEvent.click(within(bogen).getByRole('radio', { name: /Den ganzen Arbeitstag \(2 offene Zeiten\)/ }));
    await userEvent.type(within(bogen).getByLabelText(/Grund/), 'Timer vergessen');
    await userEvent.click(within(bogen).getByRole('button', { name: 'Nicht buchen' }));
    await waitFor(() => expect(zs.timerAbschnittVerwerfen).toHaveBeenCalledTimes(2));
    expect(vi.mocked(zs.timerAbschnittVerwerfen).mock.calls.map((c) => [c[1], c[2]])).toEqual([[0, 'Timer vergessen'], [1, 'Timer vergessen']]);
  });

  it('Abbrechen schließt den Bogen, ohne etwas zu senden', async () => {
    sitzungen = tag([mitPause[0]]);
    zeigePanel();
    await userEvent.click(await screen.findByRole('button', { name: '07:00–12:00 nicht buchen' }));
    const bogen = await screen.findByRole('dialog', { name: 'Nicht buchen' });
    await userEvent.click(within(bogen).getByRole('button', { name: 'Abbrechen' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nicht buchen' })).not.toBeInTheDocument());
    expect(zs.timerAbschnittVerwerfen).not.toHaveBeenCalled();
  });

  it('Gebuchtes und Verworfenes steht ohne Papierkorb da', async () => {
    sitzungen = tag([
      { ...mitWechsel[0], buchung: 'e1' },
      { ...mitWechsel[1], verworfen_grund: 'Fehlstart' },
      { id: 'c', art: 'arbeit', von: '2026-11-09T15:00:00+01:00', bis: '2026-11-09T16:00:00+01:00', baustelle: 'B-3' },
    ]);
    zeigePanel();
    expect(await screen.findByText(/ · gebucht$/)).toBeInTheDocument();
    expect(screen.getByText('B-2 · nicht gebucht: Fehlstart')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /nicht buchen$/ })).toHaveLength(1);
  });

  it('„Stoppen und prüfen“ öffnet gleich das Formular der ersten Zeit', async () => {
    sitzungen = [sitzung('laeuft', [{ id: 'a', art: 'arbeit', von: '2026-11-09T07:00:00+01:00', baustelle: 'B-1' }])];
    render(<MemoryRouter initialEntries={['/']}><ToastProvider><Routes>
      <Route path="/" element={<ArbeitstagKarte aufStart />} />
      <Route path="/time" element={<ZeitsitzungPanel />} />
    </Routes></ToastProvider></MemoryRouter>);
    const stopp = await screen.findByRole('button', { name: 'Stoppen und prüfen' });
    sitzungen = tag([{ id: 'a', art: 'arbeit', von: '2026-11-09T07:00:00+01:00', bis: '2026-11-09T11:17:00+01:00', baustelle: 'B-1' }]);
    await userEvent.click(stopp);
    await waitFor(() => expect(gesendet).toHaveBeenCalledWith(expect.objectContaining({ p_art: 'stop' })));
    expect(await screen.findByRole('dialog', { name: 'Arbeitszeit buchen' })).toBeInTheDocument();
    expect(formular).toHaveBeenLastCalledWith(expect.objectContaining({ vorbelegung: expect.objectContaining({ startTime: '07:00', endTime: '11:17' }) }));
  });
});

