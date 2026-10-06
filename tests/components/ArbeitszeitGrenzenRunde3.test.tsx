import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, TimeEntry } from '@/types';

/**
 * Die Karte „Arbeitszeitgrenzen“ nach Runde 3:
 *   G12  nach einer Buchung neu geprüft, ohne die Seite neu zu laden;
 *   M3   bei Jugendlichen „Verstoß — Buchung korrigieren“ statt „Begründen“;
 *   M1   keine Verstöße an Tagen in der Zukunft, der Berufsschultag mit
 *        seiner Unterrichtszeit, bis 9 Std. bei anderer Verteilung.
 * Jede Prüfung mit Gegenprobe.
 */

type Buchung = Partial<TimeEntry> & { id: string };
let buchungen: Buchung[] = [];
let geburtsdaten = new Map<string, string>();
let begruendungen: Array<{ id: string; userId: string; art: string; bezug: string; text: string; vonName: string | null; am: string }> = [];
const setBegruendung = vi.fn(async (_c: string, b: { userId: string; art: string; bezug: string; text: string }) => {
  begruendungen = [{ id: 'b1', ...b, vonName: 'Berta Büro', am: '2026-10-08T10:00:00Z' }];
});
const listEntriesInRange = vi.fn(async () => buchungen);

vi.mock('@/lib/db/timeEntries', () => ({ listEntriesInRange: () => listEntriesInRange() }));
vi.mock('@/lib/db/arbeitszeitGrenzen', () => ({
  listGeburtsdaten: vi.fn(async () => geburtsdaten),
  listBegruendungen: vi.fn(async () => begruendungen),
  setBegruendung: (c: string, b: { userId: string; art: string; bezug: string; text: string }) => setBegruendung(c, b),
  removeBegruendung: vi.fn(async () => undefined),
}));

const { default: ArbeitszeitGrenzenKarte } = await import('@/features/accounting/ArbeitszeitGrenzenKarte');

const LENA = { uid: 'u1', name: 'Lena Lehrling', role: 'Mitarbeiter', weeklyTargetHours: 40 } as AppUser;
const MAX = { uid: 'u2', name: 'Max Monteur', role: 'Mitarbeiter', weeklyTargetHours: 40 } as AppUser;
// Dieselbe Liste über alle Zeichnungen — wie `relevant` in der Mitarbeiterübersicht.
const NUR_LENA = [LENA];

function zeichne(p: { aktualisiert?: string; onKorrigieren?: (e: Buchung) => void; personen?: AppUser[] } = {}) {
  const baum = (q: typeof p) => (
    <ToastProvider>
      <ArbeitszeitGrenzenKarte
        companyId="perl"
        personen={q.personen ?? NUR_LENA}
        jahr={2026}
        monat={9}
        aktualisiert={q.aktualisiert}
        onKorrigieren={q.onKorrigieren as never}
      />
    </ToastProvider>
  );
  const r = render(baum(p));
  return { ...r, neu: (q: typeof p) => r.rerender(baum({ ...p, ...q })) };
}

const tag = (id: string, date: string, startTime: string, endTime: string, rest: Partial<TimeEntry> = {}): Buchung =>
  ({ id, userId: 'u1', date, status: 'Anwesend', startTime, endTime, breakDuration: 0, ...rest });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Heute: Dienstag, 20.10.2026.
  vi.setSystemTime(new Date(2026, 9, 20, 12, 0, 0));
  buchungen = [];
  geburtsdaten = new Map([['u1', '2010-03-15']]);
  begruendungen = [];
  setBegruendung.mockClear();
  listEntriesInRange.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('G12 — nach einer Buchung neu geprüft', () => {
  it('ein neuer Stand der Buchungen prüft still neu und zeigt den neuen Fall', async () => {
    buchungen = [tag('z1', '2026-10-06', '07:00', '15:00')];
    const { neu } = zeichne({ aktualisiert: 'a' });
    expect(await screen.findByText(/keine Grenze überschritten/)).toBeInTheDocument();
    expect(listEntriesInRange).toHaveBeenCalledTimes(1);

    // Das Büro bucht auf derselben Seite dazu: der Tag hat jetzt 10 Std.
    buchungen = [...buchungen, tag('z2', '2026-10-06', '15:30', '17:30')];
    neu({ aktualisiert: 'b' });
    expect(await screen.findByText(/10:00 Std\. am 06\.10\. — höchstens 8 Std\./)).toBeInTheDocument();
    expect(listEntriesInRange).toHaveBeenCalledTimes(2);
  });

  it('Gegenprobe: derselbe Stand prüft nicht noch einmal', async () => {
    const { neu } = zeichne({ aktualisiert: 'a' });
    expect(await screen.findByText(/keine Grenze überschritten/)).toBeInTheDocument();
    neu({ aktualisiert: 'a' });
    await new Promise((r) => setTimeout(r, 20));
    expect(listEntriesInRange).toHaveBeenCalledTimes(1);
  });

  it('Gegenprobe: der erste Stand nach dem Laden der Seite ist keine Änderung', async () => {
    const { neu } = zeichne({ aktualisiert: undefined });
    expect(await screen.findByText(/keine Grenze überschritten/)).toBeInTheDocument();
    neu({ aktualisiert: 'erster' });
    await new Promise((r) => setTimeout(r, 20));
    expect(listEntriesInRange).toHaveBeenCalledTimes(1);
  });
});

describe('M3 — Jugendschutz: Verstoß statt Begründung', () => {
  it('„Verstoß — Buchung korrigieren“ öffnet die Buchung; eine Notiz nimmt den Fall nicht aus der Zählung', async () => {
    const nutzer = userEvent.setup();
    const korrigieren = vi.fn();
    buchungen = [tag('z1', '2026-10-06', '07:00', '17:00', { breakDuration: 30 })];
    zeichne({ onKorrigieren: korrigieren });

    expect(await screen.findByText(/9:30 Std\. am 06\.10\. — höchstens 8 Std\./)).toBeInTheDocument();
    expect(screen.getByText('Verstoß —')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Begründen' })).not.toBeInTheDocument();
    expect(screen.getByText(/Arbeitszeitgrenzen · 1 Verstoß Jugendschutz/)).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Buchung korrigieren' }));
    expect(korrigieren).toHaveBeenCalledWith(expect.objectContaining({ id: 'z1' }));

    await nutzer.click(screen.getByRole('button', { name: 'Notiz hinzufügen' }));
    await nutzer.type(screen.getByLabelText('Notiz (optional)'), 'Mit Lena besprochen');
    await nutzer.click(screen.getByRole('button', { name: 'Notiz speichern' }));
    await waitFor(() => expect(setBegruendung).toHaveBeenCalled());
    expect(await screen.findByText('Mit Lena besprochen')).toBeInTheDocument();
    // Weiter ein Verstoß — nicht „alle begründet“.
    expect(screen.getByText(/Arbeitszeitgrenzen · 1 Verstoß Jugendschutz/)).toBeInTheDocument();
    expect(screen.queryByText(/alle begründet/)).not.toBeInTheDocument();
  });

  it('mehrere Buchungen am Tag: je eine zum Korrigieren', async () => {
    buchungen = [tag('z1', '2026-10-06', '07:00', '12:00'), tag('z2', '2026-10-06', '12:30', '16:30')];
    zeichne({ onKorrigieren: vi.fn() });
    expect(await screen.findByRole('button', { name: 'Buchung 07:00–12:00 korrigieren' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buchung 12:30–16:30 korrigieren' })).toBeInTheDocument();
  });

  it('Gegenprobe: beim AZG (Erwachsene) bleibt es bei „Begründen“', async () => {
    geburtsdaten = new Map();
    buchungen = [
      tag('z1', '2026-10-06', '14:00', '23:00', { userId: 'u2' }),
      tag('z2', '2026-10-07', '07:00', '15:00', { userId: 'u2' }),
    ];
    zeichne({ personen: [MAX], onKorrigieren: vi.fn() });
    expect(await screen.findByRole('button', { name: 'Begründen' })).toBeInTheDocument();
    expect(screen.queryByText('Verstoß —')).not.toBeInTheDocument();
    expect(screen.getByText(/Arbeitszeitgrenzen · 1 ohne Begründung/)).toBeInTheDocument();
  });
});

describe('M1 — Tage in der Zukunft, Berufsschule, andere Verteilung', () => {
  it('ein Tag nach heute ist kein Verstoß', async () => {
    buchungen = [tag('z1', '2026-10-22', '07:00', '17:00')];
    zeichne();
    expect(await screen.findByText(/keine Grenze überschritten/)).toBeInTheDocument();
  });

  it('Gegenprobe: derselbe Tag in der Vergangenheit ist einer', async () => {
    buchungen = [tag('z1', '2026-10-15', '07:00', '17:00')];
    zeichne();
    expect(await screen.findByText(/10:00 Std\. am 15\.10\./)).toBeInTheDocument();
  });

  it('der Berufsschultag zählt mit der Unterrichtszeit statt mit dem Tagessoll von 8,5 Std.', async () => {
    const lena = { ...LENA, workDays: [1, 2, 3, 4, 5], tagessoll: { 1: 8, 2: 8, 3: 8, 4: 8.5, 5: 7.5 } } as AppUser;
    buchungen = [tag('s1', '2026-10-08', '', '', { status: 'Berufsschule', startTime: undefined, endTime: undefined, unterrichtMin: 420 })];
    zeichne({ personen: [lena] });
    expect(await screen.findByText(/keine Grenze überschritten/)).toBeInTheDocument();
  });

  it('Gegenprobe: ohne Unterrichtszeit und gleichmässig verteilt bleibt der Fall von 8:30 Std.', async () => {
    const lena = { ...LENA, workDays: [1, 2, 3, 4, 5], tagessoll: { 1: 8.5, 2: 8.5, 3: 8.5, 4: 8.5, 5: 8.5 } } as AppUser;
    buchungen = [tag('s1', '2026-10-08', '', '', { status: 'Berufsschule', startTime: undefined, endTime: undefined })];
    zeichne({ personen: [lena] });
    expect(await screen.findByText(/8:30 Std\. am 08\.10\. — höchstens 8 Std\./)).toBeInTheDocument();
  });

  it('anders verteilt (Do 8,5, Fr 6 Std.): bis 9 Std. am Tag ist kein Verstoß', async () => {
    const lena = { ...LENA, workDays: [1, 2, 3, 4, 5], tagessoll: { 1: 8, 2: 8, 3: 8, 4: 8.5, 5: 6 } } as AppUser;
    buchungen = [tag('s1', '2026-10-08', '', '', { status: 'Berufsschule', startTime: undefined, endTime: undefined })];
    zeichne({ personen: [lena] });
    expect(await screen.findByText(/keine Grenze überschritten/)).toBeInTheDocument();
  });
});
