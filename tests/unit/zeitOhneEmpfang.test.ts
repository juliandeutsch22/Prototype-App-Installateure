import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Ohne Empfang wird die Doppelbuchungsprüfung nicht erst versucht
 * (offene Punkte C9): die Buchung geht sofort ins Ausgangsfach, statt drei
 * Sekunden auf eine Antwort zu warten, die nicht kommen kann.
 */

const eintraegeAmTag = vi.fn();
const anlegenOhneEmpfang = vi.fn(async () => ({ stand: 'vorgemerkt' as const }));
vi.mock('@/lib/db/pg/timeEntries', () => ({
  eintraegeAmTag: (...a: unknown[]) => eintraegeAmTag(...a),
  anlegenOhneEmpfang: (...a: unknown[]) => anlegenOhneEmpfang(...(a as [])),
}));

const { createTimeEntryOhneEmpfang } = await import('@/lib/db/timeEntries');

const BUCHUNG = {
  companyId: 'perl', userId: 'u1', userName: 'Max', date: '2026-09-28', status: 'Anwesend',
  startTime: '07:00', endTime: '16:00', breakDuration: 30, projectNumber: 'B-1',
} as never;

function online(an: boolean) {
  vi.stubGlobal('navigator', { onLine: an });
}

beforeEach(() => {
  eintraegeAmTag.mockReset();
  anlegenOhneEmpfang.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Zeit buchen ohne Empfang (C9)', () => {
  it('fragt offline nicht nach den Buchungen des Tages und merkt sofort vor', async () => {
    online(false);
    // Käme die Abfrage doch, hinge sie — der Test liefe in die Frist.
    eintraegeAmTag.mockImplementation(() => new Promise(() => {}));
    const beginn = Date.now();
    await expect(createTimeEntryOhneEmpfang('perl', BUCHUNG)).resolves.toBe('vorgemerkt');
    expect(eintraegeAmTag).not.toHaveBeenCalled();
    expect(anlegenOhneEmpfang).toHaveBeenCalledTimes(1);
    expect(Date.now() - beginn).toBeLessThan(1000);
  });

  // Gegenprobe: mit Empfang wird geprüft — und eine Doppelbuchung abgelehnt.
  it('prüft mit Empfang weiter auf Doppelbuchung', async () => {
    online(true);
    eintraegeAmTag.mockResolvedValue([
      { id: 'x', companyId: 'perl', userId: 'u1', date: '2026-09-28', status: 'Krank' },
    ]);
    await expect(createTimeEntryOhneEmpfang('perl', BUCHUNG)).rejects.toThrow();
    expect(eintraegeAmTag).toHaveBeenCalledTimes(1);
    expect(anlegenOhneEmpfang).not.toHaveBeenCalled();
  });
});
