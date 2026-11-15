/**
 * „BAUSTELLEN OHNE EINSATZ“ UND DIE AUSLASTUNG — AUS DER EINSATZLAGE
 * (Ladezeit, 19.10.2026).
 *
 * Bis hierher holte die Startseite der Leitung jeden Einsatz von 90 Tagen
 * zurück bis 14 Tage voraus (mit einer Grenze von 3.000, die still abschnitt).
 * Jetzt: je Baustelle der letzte und der nächste Einsatz
 * (`baustellenEinsatzlage`) und die Einsatztage dieser Woche.
 *
 * Gegenprobe: gegen den Stand davor fragt der Block weder die Einsatzlage
 * noch die Woche allein (rot). Gleich bleibt: welche Baustellen ohne Einsatz
 * dastehen, mit ihrem letzten Einsatz, und die Auslastung.
 */
import { describe, it, expect, vi } from 'vitest';

const gefragt: { lage?: unknown[]; tage?: unknown[] } = {};
vi.mock('@/lib/db/assignments', () => ({
  listAssignmentsForDate: vi.fn(async () => []),
  listAssignmentsForUserInRange: vi.fn(async () => []),
  listEinsatztageInRange: vi.fn(async (...a: unknown[]) => {
    gefragt.tage = a;
    return [{ userId: 'm1', date: '2026-10-13', projectNumber: 'B-1' }];
  }),
  // Seit P8 entscheidet die Datenbank über alle aktiven Baustellen (`baustellen_ohne_einsatz`).
  baustellenOhneEinsatz: vi.fn(async (...a: unknown[]) => {
    gefragt.lage = a;
    return [{ projectNumber: 'B-2', zuletzt: '2026-09-20' }, { projectNumber: 'B-3' }];
  }),
}));
vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: vi.fn(async () => [
    { id: 'p1', projectNumber: 'B-1', status: 'Aktiv' },
    { id: 'p2', projectNumber: 'B-2', status: 'Aktiv' },
    { id: 'p3', projectNumber: 'B-3', status: 'Aktiv' },
  ]),
  listProjectsByNumbers: vi.fn(async () => []),
}));
vi.mock('@/lib/db/users', () => ({
  getUserByUid: vi.fn(async () => null),
  listUsers: vi.fn(async () => [{ uid: 'm1', name: 'Max', role: 'Mitarbeiter', active: true, workDays: [1, 2, 3, 4, 5] }]),
}));
// Der Betriebsurlaub der Woche (P9) — hier keiner.
vi.mock('@/lib/db/abwesenheiten', () => ({ listBetriebsurlaubeImZeitraum: vi.fn(async () => []) }));
vi.mock('@/lib/db/vacations', () => ({ listAbwesendInRange: vi.fn(async () => []), listOpenVacations: vi.fn(async () => []) }));

const { leitung } = await import('@/features/dashboard/start/laden');
const k = { user: { uid: 'gf', companyId: 'c1', role: 'Geschäftsführung' as const }, company: null, heute: '2026-10-13' };

describe('Leitung: Einsatzlage statt jedes Einsatzes', () => {
  it('fragt „ohne Einsatz“ die Datenbank für heute — und die Woche allein (P8: dieselbe Quelle wie die Baustellenliste)', async () => {
    await leitung(k, { einsatzplanung: true, wartung: false, budget: false });
    expect(gefragt.lage).toEqual(['2026-10-13']);
    expect(gefragt.tage).toEqual(['c1', '2026-10-12', '2026-10-18']);
  });

  it('Gleichbleiben: die Baustellen der Antwort, mit dem letzten Einsatz davor, ganz ohne Einsatz ohne Datum', async () => {
    const d = await leitung(k, { einsatzplanung: true, wartung: false, budget: false });
    expect(d.ohneEinsatz).toEqual([
      { projectNumber: 'B-2', zuletzt: '2026-09-20' },
      { projectNumber: 'B-3', zuletzt: undefined },
    ]);
  });

  it('Gleichbleiben: die Auslastung aus den Einsatztagen der Woche', async () => {
    const d = await leitung(k, { einsatzplanung: true, wartung: false, budget: false });
    // Ein Monteur, fünf Arbeitstage, an einem davon eingeteilt.
    expect(d.auslastung).toBe(20);
  });
});

describe('P8: kommt die Antwort nicht, fehlt die Zeile', () => {
  it('statt jede aktive Baustelle als „ohne Einsatz“ zu melden', async () => {
    const { baustellenOhneEinsatz } = await import('@/lib/db/assignments');
    vi.mocked(baustellenOhneEinsatz).mockRejectedValueOnce(new Error('kein Netz'));
    const d = await leitung(k, { einsatzplanung: true, wartung: false, budget: false });
    expect(d.ohneEinsatz).toBeUndefined();
  });
});

describe('P9: ohne geladenen Betriebsurlaub keine Auslastung', () => {
  it('statt die Woche womöglich als verfügbar zu zählen', async () => {
    const { listBetriebsurlaubeImZeitraum } = await import('@/lib/db/abwesenheiten');
    vi.mocked(listBetriebsurlaubeImZeitraum).mockRejectedValueOnce(new Error('kein Netz'));
    const d = await leitung(k, { einsatzplanung: true, wartung: false, budget: false });
    expect(d.auslastung).toBeNull();
  });
});

/*
  V1 (Durchsicht 15.11.2026): „Eingeteilte fehlen“ auch morgen und bei
  Teilausfall. Gegenprobe: vorher kam nur „unbesetzt“, nur heute, nur wenn
  alle fehlten.
*/
describe('V1: Eingeteilte fehlen — heute teilweise, morgen überhaupt', () => {
  it('nennt den Teilausfall heute und den Ausfall morgen; ganz unbesetzt heute bleibt bei „Unbesetzt“', async () => {
    const { listAssignmentsForDate } = await import('@/lib/db/assignments');
    const { listAbwesendInRange } = await import('@/lib/db/vacations');
    vi.mocked(listAssignmentsForDate).mockImplementation(async (_c: string, tag: string) => (tag === '2026-10-13'
      ? [
        { id: 'a1', userId: 'm1', userName: 'Max', date: tag, projectNumber: 'B-1' },
        { id: 'a2', userId: 'm2', userName: 'Lisa', date: tag, projectNumber: 'B-1' },
        { id: 'a3', userId: 'm3', userName: 'Otto', date: tag, projectNumber: 'B-2' },
      ]
      : [{ id: 'a4', userId: 'm1', userName: 'Max', date: tag, projectNumber: 'B-3' }]) as never);
    vi.mocked(listAbwesendInRange).mockResolvedValue([
      { userId: 'm2', von: '2026-10-13', bis: '2026-10-13', grund: null, zeiten: null },
      { userId: 'm3', von: '2026-10-13', bis: '2026-10-13', grund: null, zeiten: null },
      { userId: 'm1', von: '2026-10-14', bis: '2026-10-14', grund: 'Urlaub', zeiten: null },
    ] as never);
    const d = await leitung(k, { einsatzplanung: true, wartung: false, budget: false });
    expect(d.eingeteiltFehlen?.map((f) => [f.datum, f.projectNumber, f.fehlen.map((x) => x.name), f.unbesetzt])).toEqual([
      ['2026-10-13', 'B-1', ['Lisa'], false],
      ['2026-10-14', 'B-3', ['Max'], true],
    ]);
    // Bleibt gleich: B-2 (heute ganz unbesetzt) steht weiter unter „Unbesetzt“.
    expect(d.heuteBetrieb?.find((b) => b.projectNumber === 'B-2')?.unbesetzt).toBe(true);
  });
});
