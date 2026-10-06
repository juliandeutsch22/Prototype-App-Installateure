import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, Role, TimeEntry } from '@/types';
import type { Einstufung } from '@/lib/einstufung';

/**
 * Jugendschutz in der Zeitmaske (Testbericht Runde 3, M2 und M1).
 *
 * „Die Zeitmaske nimmt für sie 10:45 Std. mit Arbeit ab 5 Uhr ohne Warnung
 * an; der Verstoß erscheint erst nachträglich in der Mitarbeiterübersicht.“
 * Jetzt fragt die Maske vorher nach — beim Lehrling selbst und beim Büro,
 * das für ihn bucht. Gegenproben: Erwachsene, ohne Geburtsdatum, innerhalb
 * der Grenzen, und die bearbeitete Buchung zählt nicht doppelt.
 */

type Zeile = TimeEntry & { id: string };
const anlegen = vi.fn<(...a: unknown[]) => Promise<string>>(async () => 'confirmed');
const aendern = vi.fn<(...a: unknown[]) => Promise<string>>(async () => 'confirmed');
let umfeld: Zeile[] = [];
const umfeldLaden = vi.fn(async () => umfeld);
vi.mock('@/lib/db/timeEntries', () => ({
  createTimeEntryOhneEmpfang: (...a: unknown[]) => anlegen(...a),
  updateTimeEntryOhneEmpfang: (...a: unknown[]) => aendern(...a),
  eintraegeAmTag: vi.fn(async () => []),
  listOwnEntriesInRange: () => umfeldLaden(),
  DuplicateEntryError: class extends Error {},
}));
let geburtsdatum: string | null = '2010-03-15';
const geburtsdatumLaden = vi.fn(async () => geburtsdatum);
vi.mock('@/lib/db/arbeitszeitGrenzen', () => ({
  getGeburtsdatum: () => geburtsdatumLaden(),
}));
const eintragen = vi.fn(async () => ({ tage: 1, angelegt: 1, uebersprungen: 0 }));
vi.mock('@/lib/db/abwesenheiten', () => ({
  berufsschuleEintragen: (...a: unknown[]) => (eintragen as (...x: unknown[]) => unknown)(...a),
  krankmeldungSpeichern: vi.fn(),
  urlaubEintragen: vi.fn(),
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

// Montag, 05.10.2026.
const TAG = '2026-10-05';

function zeichne(p: { staff?: AppUser[]; entry?: Zeile; von?: string; bis?: string; pause?: number } = {}) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <TimeForm
          onSaved={vi.fn()}
          staff={p.staff}
          entry={p.entry}
          besitzerProfil={p.staff ? null : LENA}
          vorbelegung={p.entry ? null : {
            date: TAG, projectNumber: 'PR-1', startTime: p.von ?? '05:00', endTime: p.bis ?? '16:15', breakDuration: p.pause ?? 30,
          }}
        />
      </ToastProvider>
    </MemoryRouter>,
  );
}

/** Warten, bis Geburtsdatum (und für Jugendliche das Umfeld) geladen sind. */
async function geladen(jugendlich = true) {
  await waitFor(() => expect(geburtsdatumLaden).toHaveBeenCalled());
  if (jugendlich) await waitFor(() => expect(umfeldLaden).toHaveBeenCalled());
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  anlegen.mockClear();
  aendern.mockClear();
  eintragen.mockClear();
  umfeldLaden.mockClear();
  geburtsdatumLaden.mockClear();
  umfeld = [];
  geburtsdatum = '2010-03-15';
  authWert.user = { uid: 'lena', name: 'Lena Lehrling', role: 'Mitarbeiter', companyId: 'perl', einstufung: 'lehrling' };
});

describe('Der Lehrling bucht selbst', () => {
  it('10:45 Std. ab 5 Uhr: Rückfrage mit Tagesgrenze und Nachtruhe, gebucht erst nach „Trotzdem buchen“', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await geladen();
    await nutzer.click(screen.getByRole('button', { name: 'Zeit buchen' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Du bist unter 18');
    expect(dialog).toHaveTextContent('10:45 Std. am 05.10. — höchstens 8 Std.');
    expect(dialog).toHaveTextContent('Arbeit zwischen 20 und 6 Uhr am 05.10.: 1:00 Std.');
    expect(anlegen).not.toHaveBeenCalled();

    await nutzer.click(screen.getByRole('button', { name: 'Trotzdem buchen' }));
    await waitFor(() => expect(anlegen).toHaveBeenCalledTimes(1));
    expect(anlegen.mock.calls[0][1]).toMatchObject({ userId: 'lena', startTime: '05:00', endTime: '16:15' });
    // Einmal gebucht, und die Rückfrage kommt nicht wieder (der Dialog steht ausserhalb des Formulars).
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(anlegen).toHaveBeenCalledTimes(1);
  });

  it('„Abbrechen“ bucht nichts', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await geladen();
    await nutzer.click(screen.getByRole('button', { name: 'Zeit buchen' }));
    await nutzer.click(await screen.findByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(anlegen).not.toHaveBeenCalled();
  });

  it('zu kurze Ruhezeit nach dem Vortag — aus den geladenen Buchungen ringsum', async () => {
    const nutzer = userEvent.setup();
    umfeld = [{ id: 'v1', companyId: 'perl', userId: 'lena', date: '2026-10-04', status: 'Anwesend', startTime: '12:00', endTime: '19:30', breakDuration: 0 }];
    zeichne({ von: '06:30', bis: '14:00', pause: 30 });
    await geladen();
    await nutzer.click(screen.getByRole('button', { name: 'Zeit buchen' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Ruhezeit vor dem 05.10.: 11:00 Std. — mindestens 12 Std.');
  });

  it('auch wer bucht, bevor das Geburtsdatum da ist, bekommt die Rückfrage', async () => {
    const nutzer = userEvent.setup();
    geburtsdatumLaden.mockImplementation(() => new Promise((r) => setTimeout(() => r(geburtsdatum), 50)));
    try {
      zeichne();
      await nutzer.click(screen.getByRole('button', { name: 'Zeit buchen' }));
      expect(await screen.findByRole('dialog')).toHaveTextContent('10:45 Std. am 05.10.');
      expect(anlegen).not.toHaveBeenCalled();
    } finally {
      geburtsdatumLaden.mockImplementation(async () => geburtsdatum);
    }
  });

  it('Gegenprobe: innerhalb der Grenzen keine Rückfrage', async () => {
    const nutzer = userEvent.setup();
    zeichne({ von: '07:00', bis: '15:30', pause: 30 });
    await geladen();
    await nutzer.click(screen.getByRole('button', { name: 'Zeit buchen' }));
    await waitFor(() => expect(anlegen).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Gegenprobe: erwachsen — keine Rückfrage und keine Abfrage der Buchungen ringsum', async () => {
    const nutzer = userEvent.setup();
    geburtsdatum = '1990-01-01';
    zeichne();
    await geladen(false);
    await nutzer.click(screen.getByRole('button', { name: 'Zeit buchen' }));
    await waitFor(() => expect(anlegen).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(umfeldLaden).not.toHaveBeenCalled();
  });

  it('Gegenprobe: ohne Geburtsdatum keine Rückfrage', async () => {
    const nutzer = userEvent.setup();
    geburtsdatum = null;
    zeichne();
    await geladen(false);
    await nutzer.click(screen.getByRole('button', { name: 'Zeit buchen' }));
    await waitFor(() => expect(anlegen).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('beim Bearbeiten zählt die alte Fassung der Buchung nicht mit', async () => {
    const nutzer = userEvent.setup();
    const alt: Zeile = {
      id: 'e1', companyId: 'perl', userId: 'lena', date: TAG, status: 'Anwesend',
      startTime: '07:00', endTime: '12:00', breakDuration: 0, projectNumber: 'PR-1',
    };
    umfeld = [alt];
    zeichne({ entry: alt });
    await geladen();
    fireEvent.change(screen.getByLabelText(/^Bis/), { target: { value: '14:00' } });
    await nutzer.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    // 7 Std. — doppelt gezählt wären es 12.
    await waitFor(() => expect(aendern).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Das Büro bucht für den Lehrling', () => {
  it('fragt mit dem Namen nach und bucht nach Bestätigung für ihn', async () => {
    const nutzer = userEvent.setup();
    authWert.user = { uid: 'chefin', name: 'Petra Perl', role: 'Geschäftsführung', companyId: 'perl' };
    zeichne({ staff: [LENA], von: '07:00', bis: '17:00', pause: 30 });
    await nutzer.selectOptions(screen.getByLabelText(/Mitarbeiter/), 'lena');
    await geladen();
    await nutzer.click(screen.getByRole('button', { name: 'Zeit buchen' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Lena Lehrling ist unter 18');
    expect(dialog).toHaveTextContent('9:30 Std. am 05.10. — höchstens 8 Std.');
    await nutzer.click(screen.getByRole('button', { name: 'Trotzdem buchen' }));
    await waitFor(() => expect(anlegen).toHaveBeenCalledTimes(1));
    expect(anlegen.mock.calls[0][1]).toMatchObject({ userId: 'lena' });
  });
});

describe('Berufsschule mit Unterrichtszeit (M1)', () => {
  it('gibt die Unterrichtszeit je Schultag mit', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.selectOptions(screen.getByLabelText('Status'), 'Berufsschule');
    await nutzer.type(screen.getByLabelText('Unterricht je Schultag (Std., optional)'), '7,5');
    await nutzer.click(screen.getByRole('button', { name: 'Berufsschule eintragen' }));
    await waitFor(() => expect(eintragen).toHaveBeenCalledWith(expect.objectContaining({ unterrichtMin: 450 })));
  });

  it('Gegenprobe: eine unlesbare Angabe wird nicht eingetragen', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.selectOptions(screen.getByLabelText('Status'), 'Berufsschule');
    await nutzer.type(screen.getByLabelText('Unterricht je Schultag (Std., optional)'), 'acht');
    await nutzer.click(screen.getByRole('button', { name: 'Berufsschule eintragen' }));
    expect(await screen.findByText(/keine Stundenzahl/)).toBeInTheDocument();
    expect(eintragen).not.toHaveBeenCalled();
  });
});
