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
vi.mock('@/lib/db/forderungen', () => ({ startseiteForderungen: vi.fn(spaeter('forderungen')) }));
vi.mock('@/lib/db/invoices', () => ({
  listUnpaidInvoiceKoepfe: vi.fn(spaeter('unbezahlt')),
  listUnpaidInvoices: vi.fn(spaeter('ganzeRechnungen')),
  listInvoicesByIds: vi.fn(spaeter('rechnungenDerZahlungen')),
  listGarantienEndenIn: vi.fn(async () => []),
  // „Nicht verrechnet“ über alle Scheine (P3): seit L22 nur Zahl und Alte, gezählt in der Datenbank.
  scheineUnverrechnetStand: vi.fn(spaeter('scheine')),
}));
vi.mock('@/lib/db/zahlungen', () => ({
  listZahlungenImZeitraum: vi.fn(async () => [{ id: 'z1', invoiceId: 'r1', betrag: 100, art: 'Überweisung', datum: '2026-10-10' }]),
}));
vi.mock('@/lib/db/workSheets', () => ({
  listOwnWorkSheetsSince: vi.fn(async () => []),
  listRecentWorkSheets: vi.fn(spaeter('ganzeScheine')),
}));
vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: vi.fn(spaeter('projekte')),
  listProjectsByNumbers: vi.fn(async () => []),
}));
// Seit 15.11.2026 die Zahl und die ersten aus der Datenbank (`wartungen_faellig_stand`) — gleich mit den Vorschlägen.
vi.mock('@/lib/db/wartungen', () => ({ wartungenFaelligStand: vi.fn(spaeter('wartungen')), wartungErledigtVorschlaege: vi.fn(async () => []) }));

const { team, buchhaltung, leitung } = await import('@/features/dashboard/start/laden');
const k = { user: { uid: 'gf', companyId: 'c1', role: 'Geschäftsführung' as const, name: 'Chefin' }, company: null, heute: '2026-10-10' };

/** Die Belegschaft der Attrappe ist leer: außer der Chefin entscheidet niemand. */
const KEINE_ANDEREN = { urlaub: false, unbezahlt: false, sonderurlaub: false };

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
    // Dazu, wer außer ihr entscheidet (Vier Augen) — in diesem Betrieb niemand.
    expect(d).toEqual({ team: [], antraege: [{ id: 'u1' }], freistellungen: [{ id: 'f1' }], entscheidenAndere: KEINE_ANDEREN });
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
    await expect(lauf).resolves.toEqual({ antraege: [], freistellungen: [], entscheidenAndere: KEINE_ANDEREN });
  });

  it('Buchhaltung: Scheine neben den Rechnungen, die Rechnungen hinter den Zahlungen ohne auf die offenen zu warten', async () => {
    const lauf = buchhaltung(k, { rechnungen: true, scheine: true });
    await vi.waitFor(() => expect(gefragt).toEqual(expect.arrayContaining(['forderungen', 'scheine', 'rechnungenDerZahlungen'])));
    offen.forderungen({ mahnungen: { anzahl: 0, zeilen: [] }, ueberfaelligNichtMahnbar: { anzahl: 0, zeilen: [] }, ruecklassBald: { anzahl: 0, summe: 0, zeilen: [] },
      kennzahlen: { offenSumme: 0, offenAnzahl: 0, faelligSumme: 0, ueberAnzahl: 0, aeltesteFaellig: null } });
    offen.rechnungenDerZahlungen([{ id: 'r1', invoiceNumber: 'RE-1', paymentStatus: 'Bezahlt' }]);
    offen.scheine({ anzahl: 1, alt: 1, aeltester: '2026-09-01' });
    const d = await lauf;
    expect(d.bezahltImMonat).toEqual({ summe: 100, anzahl: 1 });
    expect(d.zahlungenHeute?.[0].rechnung).toEqual(expect.objectContaining({ invoiceNumber: 'RE-1' }));
    expect(d.unverrechnet).toEqual({ anzahl: 1, alt: 1 });
  });

  it('Buchhaltung: für „nicht verrechnet“ nur die Köpfe der Scheine — ohne Stunden, Material und Fotos', async () => {
    const lauf = buchhaltung(k, { rechnungen: false, scheine: true });
    await vi.waitFor(() => expect(gefragt).toContain('scheine'));
    offen.scheine({ anzahl: 0, alt: 0, aeltester: null });
    await lauf;
    expect(gefragt).not.toContain('ganzeScheine');
  });

  /*
    Nachweis mit dreifachem Bestand (19.10.2026): die offenen Rechnungen
    kamen mit Positionen und Abdeckung — eine Anfrage später, auf dem Weg,
    an dem die Startseite steht. Gegenprobe: gegen den Stand davor fragt sie
    die ganzen Rechnungen (rot).
  */
  // Seit 15.11.2026 (B3) wertet die Edge Function `startseite-forderungen` aus; die Startseite fragt sie gleich mit.
  it('Buchhaltung: Summen und Mahnlauf vom Server — weder Köpfe noch ganze Rechnungen im Browser', async () => {
    const lauf = buchhaltung(k, { rechnungen: true, scheine: false });
    await vi.waitFor(() => expect(gefragt).toEqual(expect.arrayContaining(['forderungen', 'rechnungenDerZahlungen'])));
    const stand = { mahnungen: { anzahl: 1, zeilen: [] }, ueberfaelligNichtMahnbar: { anzahl: 0, zeilen: [] }, ruecklassBald: { anzahl: 0, summe: 0, zeilen: [] },
      kennzahlen: { offenSumme: 0, offenAnzahl: 0, faelligSumme: 100, ueberAnzahl: 1, aeltesteFaellig: '2026-09-01' } };
    offen.forderungen(stand);
    offen.rechnungenDerZahlungen([]);
    const d = await lauf;
    expect(d.forderungen).toEqual(stand);
    expect(gefragt).not.toContain('ganzeRechnungen');
    expect(gefragt).not.toContain('unbezahlt');
  });

  it('Leitung: die Wartungen gehen mit den Baustellen los, nicht nach dem Budget', async () => {
    const lauf = leitung(k, { einsatzplanung: false, wartung: true, budget: true });
    await vi.waitFor(() => expect(gefragt).toEqual(expect.arrayContaining(['projekte', 'wartungen'])));
    const stand = { ohne: { anzahl: 1, ueberfaellig: 0, zeilen: [{ id: 'w1' }] }, eingeplant: { anzahl: 0, ueberfaellig: 0, zeilen: [] } };
    offen.wartungen(stand);
    offen.projekte([{ id: 'p1', projectNumber: 'B-1', estimatedHours: 10 }]);
    await vi.waitFor(() => expect(gefragt).toContain('stunden'));
    offen.stunden([]);
    const d = await lauf;
    expect(d.wartungen).toEqual(stand);
    expect(d.budget).toHaveLength(1);
  });

  /*
    Nachweis mit dreifachem Bestand (19.10.2026): der Budgetstand wartete auf
    den ganzen Block — Belegschaft, Einsätze, Abwesenheiten —, obwohl er nur
    die Baustellen braucht. Gegenprobe: gegen den Stand davor fragt er die
    Stunden erst nach der Belegschaft (`vi.waitFor` läuft ab, rot).
  */
  it('Leitung: der Budgetstand fragt, sobald die Baustellen da sind — ohne auf die Belegschaft zu warten', async () => {
    const lauf = leitung({ ...k, belegschaft: spaeter('belegschaft') }, { einsatzplanung: false, wartung: false, budget: true });
    await vi.waitFor(() => expect(gefragt).toEqual(expect.arrayContaining(['projekte', 'belegschaft'])));
    offen.projekte([{ id: 'p1', projectNumber: 'B-1', estimatedHours: 10 }]);
    await vi.waitFor(() => expect(gefragt).toContain('stunden'));
    offen.stunden([]);
    offen.belegschaft([]);
    const d = await lauf;
    expect(d.budget).toHaveLength(1);
  });

  it('Leitung: scheitert der Budgetstand, fehlt nur er; scheitern die Baustellen, scheitert der Block wie bisher', async () => {
    const budgetFehlt = leitung(k, { einsatzplanung: false, wartung: false, budget: true });
    await vi.waitFor(() => expect(gefragt).toContain('projekte'));
    offen.projekte([{ id: 'p1', projectNumber: 'B-1', estimatedHours: 10 }]);
    await vi.waitFor(() => expect(gefragt).toContain('stunden'));
    offen.stunden(Promise.reject(new Error('kein Zugriff')));
    const d = await budgetFehlt;
    expect(d.budget).toBeUndefined();
    expect(d.projekte).toHaveLength(1);

    gefragt.length = 0;
    const projekte = await import('@/lib/db/projects');
    vi.mocked(projekte.listActiveProjects).mockRejectedValueOnce(new Error('kein Netz'));
    await expect(leitung(k, { einsatzplanung: false, wartung: false, budget: true })).rejects.toThrow('kein Netz');
    // Ohne Baustellen kein Budgetstand — und keine offene Frage dahinter.
    expect(gefragt).not.toContain('stunden');
  });

  it('Leitung: ohne Baustelle mit Budget ein leerer Budgetstand, ohne nach Stunden zu fragen', async () => {
    const lauf = leitung(k, { einsatzplanung: false, wartung: false, budget: true });
    await vi.waitFor(() => expect(gefragt).toContain('projekte'));
    offen.projekte([{ id: 'p1', projectNumber: 'B-1', estimatedHours: 0 }]);
    expect((await lauf).budget).toEqual([]);
    expect(gefragt).not.toContain('stunden');
  });
});
