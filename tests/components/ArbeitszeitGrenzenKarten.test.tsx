import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, TimeEntry } from '@/types';

/**
 * Die Karte „Arbeitszeitgrenzen“ in der Mitarbeiterübersicht und das
 * Geburtsdatum in der Benutzerakte (Stand-Datei 11.1, Punkt 4).
 */

let buchungen: Array<Partial<TimeEntry> & { id: string }> = [];
let geburtsdaten = new Map<string, string>();
let begruendungen: Array<{ id: string; userId: string; art: string; bezug: string; text: string; vonName: string | null; am: string }> = [];
const setBegruendung = vi.fn(async (_c: string, b: { userId: string; art: string; bezug: string; text: string }) => {
  begruendungen = [{ id: 'b1', ...b, vonName: 'Berta Büro', am: '2026-10-08T10:00:00Z' }];
});
const setGeburtsdatum = vi.fn(async () => undefined);
let gespeichertesDatum: string | null = null;

const listEntriesInRange = vi.fn(async () => buchungen);
vi.mock('@/lib/db/timeEntries', () => ({ listEntriesInRange: () => listEntriesInRange() }));
vi.mock('@/lib/db/arbeitszeitGrenzen', () => ({
  listGeburtsdaten: vi.fn(async () => geburtsdaten),
  listBegruendungen: vi.fn(async () => begruendungen),
  setBegruendung: (c: string, b: { userId: string; art: string; bezug: string; text: string }) => setBegruendung(c, b),
  removeBegruendung: vi.fn(async () => undefined),
  getGeburtsdatum: vi.fn(async () => gespeichertesDatum),
  setGeburtsdatum: (...a: unknown[]) => setGeburtsdatum(...(a as [])),
}));

const { default: ArbeitszeitGrenzenKarte } = await import('@/features/accounting/ArbeitszeitGrenzenKarte');
const { default: GeburtsdatumKarte } = await import('@/features/users/GeburtsdatumKarte');

const ANNA = { uid: 'u1', name: 'Anna Monteurin', role: 'Mitarbeiter', weeklyTargetHours: 40 } as AppUser;

const zeige = () => render(
  <ToastProvider>
    <ArbeitszeitGrenzenKarte companyId="perl" personen={[ANNA]} jahr={2026} monat={9} />
  </ToastProvider>,
);

/*
  HEUTE IST DER 31.10.2026. Seit Runde 3 (M1) meldet die Karte keine Tage in
  der Zukunft; die Fälle hier liegen im Oktober und müssen deshalb hinter
  „heute“ liegen — sonst hinge das Ergebnis am Tag, an dem der Test läuft.
*/
afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 31, 12, 0, 0));
  listEntriesInRange.mockClear();
  buchungen = [];
  geburtsdaten = new Map();
  begruendungen = [];
  setBegruendung.mockClear();
  setGeburtsdatum.mockClear();
  gespeichertesDatum = null;
});

describe('Arbeitszeitgrenzen in der Mitarbeiterübersicht', () => {
  it('ohne Fall ein Satz statt einer Liste', async () => {
    buchungen = [{ id: 'z1', userId: 'u1', date: '2026-10-06', status: 'Anwesend', startTime: '07:00', endTime: '15:30', breakDuration: 30 }];
    zeige();
    expect(await screen.findByText('Im Oktober 2026 wurde keine Grenze überschritten.')).toBeInTheDocument();
  });

  it('nennt den Fall und nimmt eine Begründung auf', async () => {
    const nutzer = userEvent.setup();
    buchungen = [
      { id: 'z1', userId: 'u1', date: '2026-10-06', status: 'Anwesend', startTime: '14:00', endTime: '23:00', breakDuration: 0 },
      { id: 'z2', userId: 'u1', date: '2026-10-07', status: 'Anwesend', startTime: '07:00', endTime: '15:00', breakDuration: 0 },
    ];
    zeige();
    expect(await screen.findByText(/Ruhezeit vor dem 07\.10\.: 8:00 Std\. — mindestens 11 Std\./)).toBeInTheDocument();
    expect(screen.getByText(/Arbeitszeitgrenzen · 1 ohne Begründung/)).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Begründen' }));
    await nutzer.type(screen.getByLabelText('Begründung'), 'Notdienst, Rohrbruch');
    await nutzer.click(screen.getByRole('button', { name: 'Begründung speichern' }));

    await waitFor(() => expect(setBegruendung).toHaveBeenCalledWith('perl', {
      userId: 'u1', art: 'ruhezeit', bezug: '2026-10-07', text: 'Notdienst, Rohrbruch',
    }));
    expect(await screen.findByText('Notdienst, Rohrbruch')).toBeInTheDocument();
    expect(screen.getByText(/Arbeitszeitgrenzen · alle begründet/)).toBeInTheDocument();
  });

  it('mit Geburtsdatum unter 18 gelten die Grenzen des KJBG', async () => {
    buchungen = [{ id: 'z1', userId: 'u1', date: '2026-10-06', status: 'Anwesend', startTime: '07:00', endTime: '16:30', breakDuration: 30 }];
    geburtsdaten = new Map([['u1', '2010-01-01']]);
    zeige();
    expect(await screen.findByText(/9:00 Std\. am 06\.10\. — höchstens 8 Std\./)).toBeInTheDocument();
    expect(screen.getByText(/Anna Monteurin · unter 18/)).toBeInTheDocument();
  });

  it('Gegenprobe: dieselbe Buchung ohne Geburtsdatum ist kein Fall', async () => {
    buchungen = [{ id: 'z1', userId: 'u1', date: '2026-10-06', status: 'Anwesend', startTime: '07:00', endTime: '16:30', breakDuration: 30 }];
    zeige();
    expect(await screen.findByText(/keine Grenze überschritten/)).toBeInTheDocument();
  });
});

describe('Geburtsdatum in der Benutzerakte', () => {
  it('speichert erst, wenn es geändert wurde, und sagt, wenn die Person unter 18 ist', async () => {
    const nutzer = userEvent.setup();
    gespeichertesDatum = '2010-01-01';
    render(<ToastProvider><GeburtsdatumKarte companyId="perl" uid="u1" /></ToastProvider>);
    expect(await screen.findByText(/Unter 18 — es gelten die Grenzen des KJBG/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Speichern' })).not.toBeInTheDocument();

    const feld = screen.getByLabelText('Geburtsdatum');
    await nutzer.clear(feld);
    await nutzer.type(feld, '2000-02-03');
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(setGeburtsdatum).toHaveBeenCalledWith('perl', 'u1', '2000-02-03'));
  });
});
