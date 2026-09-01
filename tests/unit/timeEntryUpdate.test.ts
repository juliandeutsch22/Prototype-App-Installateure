import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Doppelbuchung beim BEARBEITEN.
 *
 * Beim Anlegen war sie längst geblockt, beim Ändern nicht: ein Eintrag liess
 * sich auf einen Tag schieben, an dem für denselben Mitarbeiter bereits
 * gebucht war. Danach stehen zwei Einträge auf demselben Tag, der
 * Überstunden-Saldo zählt beide, und niemand sieht es — die Zahl ist einfach
 * falsch. Erreichbar für jeden Benutzer an jedem Tag.
 *
 * Getestet wird gegen einen Ersatz für die Firestore-Schicht: geprüft ist
 * hier die Entscheidung, nicht das Schreiben.
 */

const updateInTenant = vi.fn();
const queryTenant = vi.fn();

vi.mock('@/lib/db/core', () => ({
  queryTenant: (...a: unknown[]) => queryTenant(...a),
  updateInTenant: (...a: unknown[]) => updateInTenant(...a),
  subscribeTenant: vi.fn(),
  createInTenant: vi.fn(),
  deleteInTenant: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({ where: (...a: unknown[]) => ({ where: a }) }));

const { updateTimeEntry, DuplicateEntryError } = await import('@/lib/db/timeEntries');

const OWNER = { companyId: 'perl', userId: 'monteur-1' };

beforeEach(() => {
  updateInTenant.mockReset().mockResolvedValue(undefined);
  queryTenant.mockReset().mockResolvedValue([]);
});

describe('Zeiteintrag bearbeiten', () => {
  it('weist ein Datum ab, an dem schon ein anderer Eintrag liegt', async () => {
    queryTenant.mockResolvedValue([{ id: 'fremder-eintrag', date: '2026-09-01' }]);
    await expect(
      updateTimeEntry('mein-eintrag', { date: '2026-09-01' }, OWNER),
    ).rejects.toBeInstanceOf(DuplicateEntryError);
    expect(updateInTenant).not.toHaveBeenCalled();
  });

  it('nennt in der Meldung den betroffenen Tag', async () => {
    queryTenant.mockResolvedValue([{ id: 'fremder-eintrag', date: '2026-09-01' }]);
    await expect(
      updateTimeEntry('mein-eintrag', { date: '2026-09-01' }, OWNER),
    ).rejects.toThrow('2026-09-01');
  });

  it('laesst den eigenen, unveraenderten Tag durch', async () => {
    // Die Abfrage findet den bearbeiteten Eintrag selbst — das ist kein
    // Konflikt, sonst schlaege jede Aenderung an Uhrzeit oder Kommentar fehl.
    queryTenant.mockResolvedValue([{ id: 'mein-eintrag', date: '2026-09-01' }]);
    await updateTimeEntry('mein-eintrag', { date: '2026-09-01', comment: 'neu' }, OWNER);
    expect(updateInTenant).toHaveBeenCalledOnce();
  });

  it('fragt gar nicht erst nach, wenn das Datum unangetastet bleibt', async () => {
    await updateTimeEntry('mein-eintrag', { comment: 'nur ein Kommentar' }, OWNER);
    expect(queryTenant).not.toHaveBeenCalled();
    expect(updateInTenant).toHaveBeenCalledOnce();
  });

  it('prueft gegen den Eigentuemer, nicht gegen den Bearbeiter', async () => {
    // Korrigiert die Buchhaltung den Eintrag eines Monteurs, muessen dessen
    // Tage geprueft werden. Gegen die eigenen zu pruefen, liesse die
    // Doppelbuchung durch und meldete dafuer falsche Konflikte.
    await updateTimeEntry('mein-eintrag', { date: '2026-09-02' }, OWNER);
    const [collection, companyId] = queryTenant.mock.calls[0] as [string, string];
    expect(collection).toBe('timeEntries');
    expect(companyId).toBe('perl');
    expect(JSON.stringify(queryTenant.mock.calls[0])).toContain('monteur-1');
  });
});
