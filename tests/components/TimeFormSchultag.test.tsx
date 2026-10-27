import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, Role, TimeEntry } from '@/types';
import type { Einstufung } from '@/lib/einstufung';

/**
 * Testbericht Runde 6 in der Zeitmaske.
 *
 * M1: Am Berufsschultag ließ sich keine Arbeit buchen — „Berufsschule gilt
 * für den ganzen Tag“. Jetzt geht sie, und die Maske fragt vorher mit
 * Unterricht, Weg und Arbeit nach (§ 11 Abs 7 KJBG), wie das Handbuch es
 * am 24.10. beschreibt.
 *
 * M3 und G12: „Krank bis“, „Urlaub bis“ und „Berufsschule bis“ blieben auf
 * heute stehen, wenn das Datum zurückgestellt wurde — aus einem Tag wurde
 * still ein Zeitraum. Jetzt ziehen sie mit, solange sie niemand von Hand
 * gesetzt hat.
 */

type Zeile = TimeEntry & { id: string };
const anlegen = vi.fn<(...a: unknown[]) => Promise<string>>(async () => 'confirmed');
let amTag: Zeile[] = [];
let umfeld: Zeile[] = [];
vi.mock('@/lib/db/timeEntries', () => ({
  createTimeEntryOhneEmpfang: (...a: unknown[]) => anlegen(...a),
  updateTimeEntryOhneEmpfang: vi.fn(async () => 'confirmed'),
  eintraegeAmTag: vi.fn(async () => amTag),
  eintraegeUmDenTag: vi.fn(async () => amTag),
  listOwnEntriesInRange: vi.fn(async () => umfeld),
  zeitEinfuegen: vi.fn(),
  DuplicateEntryError: class extends Error {},
}));
let geburtsdatum: string | null = '2010-03-15';
vi.mock('@/lib/db/arbeitszeitGrenzen', () => ({ getGeburtsdatum: async () => geburtsdatum }));
const krankMelden = vi.fn(async () => ({ id: 'k1', angelegt: 1, entfernt: 0, uebersprungen: 0 }));
const schuleEintragen = vi.fn(async () => ({ tage: 1, angelegt: 1, uebersprungen: 0 }));
const urlaubEintragen = vi.fn(async () => ({ tage: 1, angelegt: 1, uebersprungen: 0 }));
vi.mock('@/lib/db/abwesenheiten', () => ({
  berufsschuleEintragen: (...a: unknown[]) => (schuleEintragen as (...x: unknown[]) => unknown)(...a),
  krankmeldungSpeichern: (...a: unknown[]) => (krankMelden as (...x: unknown[]) => unknown)(...a),
  urlaubEintragen: (...a: unknown[]) => (urlaubEintragen as (...x: unknown[]) => unknown)(...a),
}));
vi.mock('@/components/BaustellenSelect', () => ({ default: () => null }));

const authWert: {
  user: { uid: string; name: string; role: Role; companyId: string; einstufung?: Einstufung | null };
  company: { id: string; name: string };
} = {
  user: { uid: 'lena', name: 'Lena Lehrling', role: 'Mitarbeiter', companyId: 'perl', einstufung: 'lehrling' },
  company: { id: 'perl', name: 'Perl Installationen' },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: TimeForm } = await import('@/features/time/TimeForm');

const LENA = {
  uid: 'lena', id: 'lena', name: 'Lena Lehrling', role: 'Mitarbeiter', companyId: 'perl',
  einstufung: 'lehrling', weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5],
} as AppUser;

// Dienstag, 20.10.2026 — der Tag aus dem Testbericht.
const TAG = '2026-10-20';
const SCHULE: Zeile = {
  id: 's1', companyId: 'perl', userId: 'lena', userName: 'Lena Lehrling', date: TAG, status: 'Berufsschule',
  breakDuration: 0, unterrichtMin: 360, wegzeitMin: 60, comment: 'Berufsschule',
};

function zeichneBuchung() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <TimeForm
          onSaved={vi.fn()}
          besitzerProfil={LENA}
          vorbelegung={{ date: TAG, projectNumber: 'PR-2026-0193', startTime: '16:00', endTime: '17:30', breakDuration: 0 }}
        />
      </ToastProvider>
    </MemoryRouter>,
  );
}

function zeichneLeer() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <TimeForm onSaved={vi.fn()} besitzerProfil={LENA} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  anlegen.mockClear();
  krankMelden.mockClear();
  schuleEintragen.mockClear();
  urlaubEintragen.mockClear();
  amTag = [SCHULE];
  umfeld = [SCHULE];
  geburtsdatum = '2010-03-15';
  authWert.user = { uid: 'lena', name: 'Lena Lehrling', role: 'Mitarbeiter', companyId: 'perl', einstufung: 'lehrling' };
});

describe('M1 — Arbeit nach der Berufsschule', () => {
  it('lässt sich buchen; vorher fragt die Maske mit Unterricht, Weg und Arbeit nach', async () => {
    const nutzer = userEvent.setup();
    zeichneBuchung();
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Zeit buchen' })).toBeEnabled());
    expect(screen.queryByText(/gilt für den ganzen Tag/)).toBeNull();

    await nutzer.click(screen.getByRole('button', { name: 'Zeit buchen' }));
    const dialog = await screen.findByRole('dialog');
    // 6:00 Unterricht + 1:00 Weg + 1:30 Arbeit (§ 11 Abs 7 KJBG).
    expect(dialog).toHaveTextContent('8:30 Std. am 20.10. samt 1:00 Std. Weg Schule–Betrieb — höchstens 8 Std.');
    expect(anlegen).not.toHaveBeenCalled();
    await nutzer.click(within(dialog).getByRole('button', { name: 'Trotzdem buchen' }));
    await waitFor(() => expect(anlegen).toHaveBeenCalledTimes(1));
    expect(anlegen.mock.calls[0][1]).toMatchObject({ date: TAG, status: 'Anwesend', startTime: '16:00', endTime: '17:30' });
  });

  it('nach 8 Std. Unterricht ist jede Arbeit ein Verstoß', async () => {
    const acht = { ...SCHULE, unterrichtMin: 480, wegzeitMin: null };
    amTag = [acht];
    umfeld = [acht];
    const nutzer = userEvent.setup();
    zeichneBuchung();
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Zeit buchen' })).toBeEnabled());
    await nutzer.click(screen.getByRole('button', { name: 'Zeit buchen' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Arbeit nach 8:00 Std. Berufsschule am 20.10.: 1:30 Std.');
  });

  it('Gegenprobe: neben Urlaub bleibt die Arbeit gesperrt', async () => {
    amTag = [{ ...SCHULE, id: 'u1', status: 'Urlaub', unterrichtMin: null, wegzeitMin: null }];
    const nutzer = userEvent.setup();
    zeichneBuchung();
    await act(async () => { await Promise.resolve(); });
    await nutzer.click(screen.getByRole('button', { name: 'Zeit buchen' }));
    expect(await screen.findByText(/„Urlaub“ eingetragen/)).toBeInTheDocument();
    expect(anlegen).not.toHaveBeenCalled();
  });
});

describe('M3 und G12 — das Ende zieht mit dem Datum mit', () => {
  it.each([
    ['Krank', /^Krank bis/],
    ['Berufsschule', /^Berufsschule bis/],
  ] as const)('%s: Datum zurückgestellt — das Ende folgt, ein Tag bleibt ein Tag', async (status, feld) => {
    amTag = [];
    umfeld = [];
    const nutzer = userEvent.setup();
    zeichneLeer();
    await nutzer.selectOptions(screen.getByLabelText('Status'), status);
    const datum = screen.getByLabelText(/^Datum/);
    await nutzer.clear(datum);
    await nutzer.type(datum, '2026-10-21');
    expect(screen.getByLabelText(feld)).toHaveValue('2026-10-21');
  });

  it('Urlaub (Büro): ebenso', async () => {
    authWert.user = { uid: 'bea', name: 'Bea Büro', role: 'Buchhaltung', companyId: 'perl', einstufung: null };
    const max = { id: 'max', uid: 'max', name: 'Max', role: 'Mitarbeiter', companyId: 'perl', email: '', workDays: [1, 2, 3, 4, 5] } as AppUser;
    const nutzer = userEvent.setup();
    render(<MemoryRouter><ToastProvider><TimeForm onSaved={vi.fn()} staff={[max]} /></ToastProvider></MemoryRouter>);
    await nutzer.selectOptions(screen.getByLabelText(/^Mitarbeiter/), 'max');
    await nutzer.selectOptions(screen.getByLabelText('Status'), 'Urlaub');
    const datum = screen.getByLabelText(/^Datum/);
    await nutzer.clear(datum);
    await nutzer.type(datum, '2026-10-21');
    expect(screen.getByLabelText(/^Urlaub bis/)).toHaveValue('2026-10-21');
  });

  it('ein Tag wird ohne Rückfrage gemeldet', async () => {
    amTag = [];
    const nutzer = userEvent.setup();
    zeichneLeer();
    await nutzer.selectOptions(screen.getByLabelText('Status'), 'Krank');
    const datum = screen.getByLabelText(/^Datum/);
    await nutzer.clear(datum);
    await nutzer.type(datum, '2026-10-21');
    await nutzer.click(screen.getByRole('button', { name: 'Krank melden' }));
    await waitFor(() => expect(krankMelden).toHaveBeenCalledWith(expect.objectContaining({ von: '2026-10-21', bis: '2026-10-21' })));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('von Hand gesetztes Ende bleibt; vor dem Speichern stehen die Tage da, „Abbrechen“ meldet nichts', async () => {
    amTag = [];
    umfeld = [{ ...SCHULE, id: 'a1', date: '2026-10-22', status: 'Anwesend', startTime: '07:00', endTime: '15:30' }];
    const nutzer = userEvent.setup();
    zeichneLeer();
    await nutzer.selectOptions(screen.getByLabelText('Status'), 'Krank');
    const datum = screen.getByLabelText(/^Datum/);
    await nutzer.clear(datum);
    await nutzer.type(datum, '2026-10-21');
    const bis = screen.getByLabelText(/^Krank bis/);
    await nutzer.clear(bis);
    await nutzer.type(bis, '2026-10-27');
    // Ein späteres Datum davor lässt das gesetzte Ende stehen.
    await nutzer.clear(datum);
    await nutzer.type(datum, '2026-10-22');
    expect(bis).toHaveValue('2026-10-27');
    await nutzer.clear(datum);
    await nutzer.type(datum, '2026-10-21');

    await nutzer.click(screen.getByRole('button', { name: 'Krank melden' }));
    const frage = await screen.findByRole('dialog');
    expect(frage).toHaveTextContent('Krankmeldung über 7 Tage?');
    expect(frage).toHaveTextContent('21.10.–27.10.2026: 7 Tage, davon 3 Arbeitstage als „Krank“ im Zeitkonto (21.10., 23.10. und 27.10.). 22.10. ist schon gebucht und bleibt.');
    await nutzer.click(within(frage).getByRole('button', { name: 'Abbrechen' }));
    expect(krankMelden).not.toHaveBeenCalled();

    await nutzer.click(screen.getByRole('button', { name: 'Krank melden' }));
    await nutzer.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Eintragen' }));
    await waitFor(() => expect(krankMelden).toHaveBeenCalledWith(expect.objectContaining({ von: '2026-10-21', bis: '2026-10-27' })));
  });
});
