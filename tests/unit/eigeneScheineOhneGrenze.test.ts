import { describe, it, expect, vi } from 'vitest';

/*
  P6 (Durchsicht 15.11.2026): die Erinnerung „Zeit nachtragen“ las höchstens
  20 eigene Scheine — die Weiche setzte `max = 20`, und Startseite und
  Zeiterfassung riefen ohne Grenze auf. Gegenprobe: mit der alten Vorgabe
  kommt hier 20 an. Die Datenbankseite prüft
  `tests/supabase/eigeneScheineOhneGrenze.test.ts`.
*/
const pgEigene = vi.fn<(...a: unknown[]) => Promise<never[]>>(async () => []);
vi.mock('@/lib/db/pg/workSheets', () => ({ listOwnWorkSheetsSince: (...a: unknown[]) => pgEigene(...a) }));

describe('listOwnWorkSheetsSince (Weiche)', () => {
  it('ohne Grenze: keine feste Zahl', async () => {
    const { listOwnWorkSheetsSince } = await import('@/lib/db/workSheets');
    await listOwnWorkSheetsSince('perl', 'u1', '2026-11-01');
    expect(pgEigene).toHaveBeenLastCalledWith('perl', 'u1', '2026-11-01', undefined);
  });

  it('bleibt gleich: eine genannte Grenze geht durch', async () => {
    const { listOwnWorkSheetsSince } = await import('@/lib/db/workSheets');
    await listOwnWorkSheetsSince('perl', 'u1', '2026-11-01', 5);
    expect(pgEigene).toHaveBeenLastCalledWith('perl', 'u1', '2026-11-01', 5);
  });
});
