/**
 * DIE BLÖCKE DER STARTSEITE FRAGEN GLEICHZEITIG (Ladezeit, 19.10.2026).
 *
 * Mannschaft, Buchhaltung und Leitung fragten in sich nacheinander: die
 * Urlaubsanträge erst nach den Buchungstagen, die Sonderurlaube erst nach den
 * Urlaubsanträgen, die Scheine erst nach den Rechnungen, die Wartungen erst
 * nach dem Budget. Keiner wartet auf den anderen; jeder Weg durchs Netz kam
 * so obendrauf.
 *
 * Gegenprobe: gegen den Stand davor ist jede zweite Frage erst gestellt, wenn
 * die erste geantwortet hat — `vi.waitFor` läuft dann ab (rot). Gleich
 * bleibt: was herauskommt.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const offen: Record<string, (w: unknown) => void> = {};
const gefragt: string[] = [];
const spaeter = <T>(name: string) => () => {
  gefragt.push(name);
  return new Promise<T>((r) => { offen[name] = r as (w: unknown) => void; });
};

vi.mock('@/lib/db/users', () => ({
  getUserByUid: vi.fn(async () => null),
  listUsers: vi.fn(async () => []),
}));
vi.mock('@/lib/db/timeEntries', () => ({
  listOwnEntriesSince: vi.fn(async () => []),
  listOwnEntriesInRange: vi.fn(async () => []),
  buchungstage: vi.fn(spaeter('buchungstage')),
  stundenDerBaustellen: vi.fn(spaeter('stunden')),
}));
vi.mock('@/lib/db/vacations', () => ({
  listOpenVacations: vi.fn(spaeter('urlaub')),
  listAbwesendInRange: vi.fn(async () => []),
}));
vi.mock('@/lib/db/freistellungen', () => ({ listOffeneFreistellungen: vi.fn(spaeter('freistellungen')) }));
vi.mock('@/lib/db/invoices', () => ({
  listUnpaidInvoices: vi.fn(spaeter('unbezahlt')),
  listInvoicesByIds: vi.fn(spaeter('rechnungenDerZahlungen')),
  listGarantienEndenIn: vi.fn(async () => []),
  scheineAufRechnung: vi.fn(async () => []),
}));
vi.mock('@/lib/db/zahlungen', () => ({
  listZahlungenImZeitraum: vi.fn(async () => [{ id: 'z1', invoiceId: 'r1', betrag: 100, art: 'Überweisung', datum: '2026-10-10' }]),
}));
vi.mock('@/lib/db/workSheets', () => ({
  listOwnWorkSheetsSince: vi.fn(async () => []),
  listRecentWorkSheets: vi.fn(spaeter('ganzeScheine')),
  listRecentWorkSheetKoepfe: vi.fn(spaeter('scheine')),
}));
vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: vi.fn(spaeter('projekte')),
  listProjectsByNumbers: vi.fn(async () => []),
}));
vi.mock('@/lib/db/wartungen', () => ({ listFaelligeWartungen: vi.fn(spaeter('wartungen')) }));

const { team, buchhaltung, leitung } = await import('@/features/dashboard/start/laden');
const k = { user: { uid: 'gf', companyId: 'c1', role: 'Geschäftsführung' as const, name: 'Chefin' }, company: null, heute: '2026-10-10' };

beforeEach(() => {
  gefragt.length = 0;
  for (const n of Object.keys(offen)) delete offen[n];
});

describe('Startseite: Blöcke fragen gleichzeitig', () => {
  it('Mannschaft: Buchungstage, Urlaubsanträge und Sonderurlaube zugleich', async () => {
    const lauf = team(k, { luecken: true, urlaub: true, freistellungen: true });
    await vi.waitFor(() => expect(gefragt).toEqual(expect.arrayContaining(['buchungstage', 'urlaub', 'freistellungen'])));
    offen.buchungstage([]);
    offen.urlaub([{ id: 'u1' }]);
    offen.freistellungen([{ id: 'f1' }]);
    const d = await lauf;
    expect(d).toEqual({ team: [], antraege: [{ id: 'u1' }], freistellungen: [{ id: 'f1' }] });
  });

  it('Mannschaft: fertig erst, wenn jede Frage geantwortet hat', async () => {
    const lauf = team(k, { luecken: false, urlaub: true, freistellungen: true });
    await vi.waitFor(() => expect(gefragt).toEqual(expect.arrayContaining(['urlaub', 'freistellungen'])));
    offen.freistellungen([]);
    // Ohne Antwort auf die Urlaubsanträge ist der Block nicht fertig.
    let fertig = false;
    void lauf.then(() => { fertig = true; });
    await new Promise((r) => setTimeout(r, 20));
    expect(fertig).toBe(false);
    offen.urlaub([]);
    await expect(lauf).resolves.toEqual({ antraege: [], freistellungen: [] });
  });

  it('Buchhaltung: Scheine neben den Rechnungen, die Rechnungen hinter den Zahlungen ohne auf die offenen zu warten', async () => {
    const lauf = buchhaltung(k, { rechnungen: true, scheine: true });
    await vi.waitFor(() => expect(gefragt).toEqual(expect.arrayContaining(['unbezahlt', 'scheine', 'rechnungenDerZahlungen'])));
    offen.unbezahlt([]);
    offen.rechnungenDerZahlungen([{ id: 'r1', invoiceNumber: 'RE-1', paymentStatus: 'Bezahlt' }]);
    offen.scheine([{ id: 's1', status: 'Unterschrieben', datum: '2026-09-01', customerName: 'Huber', projectNumber: 'B-1' }]);
    const d = await lauf;
    expect(d.bezahltImMonat).toEqual({ summe: 100, anzahl: 1 });
    expect(d.zahlungenHeute?.[0].rechnung).toEqual(expect.objectContaining({ invoiceNumber: 'RE-1' }));
    expect(d.unverrechnet).toEqual([{ schein: expect.objectContaining({ id: 's1' }), tage: 39 }]);
  });

  it('Buchhaltung: für „nicht verrechnet“ nur die Köpfe der Scheine — ohne Stunden, Material und Fotos', async () => {
    const lauf = buchhaltung(k, { rechnungen: false, scheine: true });
    await vi.waitFor(() => expect(gefragt).toContain('scheine'));
    offen.scheine([]);
    await lauf;
    expect(gefragt).not.toContain('ganzeScheine');
  });

  it('Leitung: die Wartungen gehen mit den Baustellen los, nicht nach dem Budget', async () => {
    const lauf = leitung(k, { einsatzplanung: false, wartung: true, budget: true });
    await vi.waitFor(() => expect(gefragt).toEqual(expect.arrayContaining(['projekte', 'wartungen'])));
    offen.wartungen([{ id: 'w1' }]);
    offen.projekte([{ id: 'p1', projectNumber: 'B-1', estimatedHours: 10 }]);
    await vi.waitFor(() => expect(gefragt).toContain('stunden'));
    offen.stunden([]);
    const d = await lauf;
    expect(d.wartungen).toEqual([{ id: 'w1' }]);
    expect(d.budget).toHaveLength(1);
  });
});
