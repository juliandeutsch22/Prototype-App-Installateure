/**
 * WAS DIE STARTSEITE LÄDT — Prüfbericht 09.11.2026.
 *
 * 1. Wer außer der Person über Urlaub und Sonderurlaub entscheidet, lädt der
 *    Block „Die Mannschaft“ mit (Vier Augen beim eigenen Antrag).
 * 3. Die offenen Korrekturanträge fragt er nur, wenn er soll.
 * 4. Ist die Zeiterfassung aus, fragt die Buchhaltung keine unverrechneten
 *    Stunden mehr — die Rechnung bietet sie dann nicht an (M06d/V2). Die
 *    Scheine bleiben.
 * 7. Die Wartungen bis zum Stichtag der Wartungsliste (`VORLAUF_TAGE`),
 *    nicht einen Kalendermonat voraus.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppUser } from '@/types';

let belegschaft: Pick<AppUser, 'uid' | 'role' | 'active' | 'name'>[] = [];
let belegschaftFehlt = false;
vi.mock('@/lib/db/users', () => ({
  getUserByUid: vi.fn(async () => null),
  listUsers: vi.fn(async () => {
    if (belegschaftFehlt) throw new Error('kein Netz');
    return belegschaft;
  }),
}));
const unverrechneteStunden = vi.fn(async () => []);
vi.mock('@/lib/db/timeEntries', () => ({
  listOwnEntriesSince: vi.fn(async () => []),
  listOwnEntriesInRange: vi.fn(async () => []),
  buchungstage: vi.fn(async () => []),
  stundenDerBaustellen: vi.fn(async () => []),
  unverrechneteStunden: () => unverrechneteStunden(),
}));
vi.mock('@/lib/db/vacations', () => ({
  listOpenVacations: vi.fn(async () => []),
  listAbwesendInRange: vi.fn(async () => []),
}));
vi.mock('@/lib/db/freistellungen', () => ({ listOffeneFreistellungen: vi.fn(async () => []) }));
// Die Signatur am Doppelgänger: der Test liest, womit gefragt wurde.
const zeitkorrekturenLaden = vi.fn<(c: string, offen: boolean) => Promise<{ id: string; stand: string }[]>>(async () => [{ id: 'k1', stand: 'offen' }]);
vi.mock('@/lib/db/zeitkorrekturen', () => ({
  zeitkorrekturenLaden: (c: string, offen: boolean) => zeitkorrekturenLaden(c, offen),
}));
vi.mock('@/lib/db/invoices', () => ({
  listUnpaidInvoiceKoepfe: vi.fn(async () => []),
  listInvoicesByIds: vi.fn(async () => []),
  listGarantienEndenIn: vi.fn(async () => []),
  scheineAufRechnung: vi.fn(async () => []),
}));
vi.mock('@/lib/db/zahlungen', () => ({ listZahlungenImZeitraum: vi.fn(async () => []) }));
const listRecentWorkSheetKoepfe = vi.fn(async () => []);
vi.mock('@/lib/db/workSheets', () => ({
  listOwnWorkSheetsSince: vi.fn(async () => []),
  listRecentWorkSheetKoepfe: () => listRecentWorkSheetKoepfe(),
}));
vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: vi.fn(async () => []),
  listProjectsByNumbers: vi.fn(async () => []),
}));
const listFaelligeWartungen = vi.fn<(c: string, bis: string) => Promise<never[]>>(async () => []);
vi.mock('@/lib/db/wartungen', () => ({
  listFaelligeWartungen: (c: string, bis: string) => listFaelligeWartungen(c, bis),
}));

const { team, buchhaltung, leitung } = await import('@/features/dashboard/start/laden');

const kontext = (teil: { modules?: Record<string, boolean>; vacationApprovers?: string[]; heute?: string } = {}) => ({
  user: { uid: 'ich', companyId: 'perl', role: 'Buchhaltung' as const, name: 'Berta' },
  company: { id: 'perl', name: 'Perl', modules: teil.modules, vacationApprovers: teil.vacationApprovers } as never,
  heute: teil.heute ?? '2026-11-09',
});

beforeEach(() => {
  belegschaft = [];
  belegschaftFehlt = false;
  unverrechneteStunden.mockClear();
  listRecentWorkSheetKoepfe.mockClear();
  zeitkorrekturenLaden.mockClear();
  listFaelligeWartungen.mockClear();
});

describe('1 — wer sonst entscheidet', () => {
  it('kommt mit Urlaub und Sonderurlaub aus der Belegschaft', async () => {
    belegschaft = [
      { uid: 'ich', name: 'Berta', role: 'Buchhaltung', active: true },
      { uid: 'gf', name: 'Chefin', role: 'Geschäftsführung', active: true },
    ];
    const d = await team(kontext(), { luecken: false, urlaub: true, freistellungen: true });
    expect(d.entscheidenAndere).toEqual({ urlaub: true, unbezahlt: true, sonderurlaub: true });
  });

  it('die eingetragenen Genehmiger zählen — die Buchhaltung dann nicht mehr', async () => {
    belegschaft = [
      { uid: 'ich', name: 'Paul', role: 'Projektleiter', active: true },
      { uid: 'b', name: 'Berta', role: 'Buchhaltung', active: true },
    ];
    const d = await team(kontext({ vacationApprovers: ['ich'] }), { luecken: false, urlaub: true });
    expect(d.entscheidenAndere?.urlaub).toBe(false);
  });

  it('fehlt die Belegschaft, bleibt es unbekannt — der Block kommt trotzdem', async () => {
    belegschaftFehlt = true;
    const d = await team(kontext(), { luecken: false, urlaub: true, freistellungen: true });
    expect(d.entscheidenAndere).toBeUndefined();
    expect(d.antraege).toEqual([]);
  });

  it('Gleichbleiben: ohne Urlaub und Sonderurlaub fragt der Block nicht nach der Belegschaft', async () => {
    const users = await import('@/lib/db/users');
    vi.mocked(users.listUsers).mockClear();
    const d = await team(kontext(), { luecken: false, urlaub: false, freistellungen: false });
    expect(d).toEqual({});
    expect(users.listUsers).not.toHaveBeenCalled();
  });
});

describe('3 — Korrekturanträge', () => {
  it('nur, wenn der Block sie holen soll — die offenen des Betriebs', async () => {
    const mit = await team(kontext(), { luecken: false, urlaub: false, korrekturen: true });
    expect(zeitkorrekturenLaden).toHaveBeenCalledWith('perl', true);
    expect(mit.korrekturen).toEqual([{ id: 'k1', stand: 'offen' }]);

    zeitkorrekturenLaden.mockClear();
    const ohne = await team(kontext(), { luecken: false, urlaub: true });
    expect(zeitkorrekturenLaden).not.toHaveBeenCalled();
    expect(ohne.korrekturen).toBeUndefined();
  });

  it('scheitert die Frage, sagt die Seite, dass der Block fehlt — wie bei Urlaub und Sonderurlaub', async () => {
    zeitkorrekturenLaden.mockRejectedValueOnce(new Error('kein Netz'));
    await expect(team(kontext(), { luecken: false, urlaub: false, korrekturen: true })).rejects.toThrow('kein Netz');
  });
});

describe('4 — unverrechnete Stunden nur mit der Zeiterfassung', () => {
  it('Zeiterfassung aus: keine Stunden — die Scheine bleiben', async () => {
    const d = await buchhaltung(kontext({ modules: { zeiterfassung: false } }), { rechnungen: true, scheine: true });
    expect(unverrechneteStunden).not.toHaveBeenCalled();
    expect(d.offeneStunden).toBeUndefined();
    expect(listRecentWorkSheetKoepfe).toHaveBeenCalledTimes(1);
    expect(d.unverrechnet).toEqual([]);
  });

  it('Gleichbleiben: mit der Zeiterfassung (ab Werk an) wie bisher', async () => {
    const d = await buchhaltung(kontext(), { rechnungen: true, scheine: true });
    expect(unverrechneteStunden).toHaveBeenCalledTimes(1);
    expect(d.offeneStunden).toEqual([]);
  });
});

describe('7 — Wartungen bis zum Stichtag der Liste', () => {
  it('30 Tage voraus, auch wo ein Monat kürzer ist', async () => {
    await leitung(kontext({ heute: '2027-01-31' }), { einsatzplanung: false, wartung: true, budget: false });
    // Ein Kalendermonat wäre der 28.02. — die Liste nennt bis zum 02.03. „fällig“.
    expect(listFaelligeWartungen).toHaveBeenCalledWith('perl', '2027-03-02');
  });

  it('Gleichbleiben: wo der Monat 30 Tage hat, derselbe Tag wie vorher', async () => {
    await leitung(kontext({ heute: '2026-06-01' }), { einsatzplanung: false, wartung: true, budget: false });
    expect(listFaelligeWartungen).toHaveBeenCalledWith('perl', '2026-07-01');
  });
});
