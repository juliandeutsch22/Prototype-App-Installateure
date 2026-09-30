import { describe, it, expect } from 'vitest';
import { besetzung, fehlenText, ganztagsWeg } from '@/features/assignments/besetzung';
import type { Abwesenheit } from '@/lib/db/vacations';

// Testbericht 30.09.2026, M33 — eine Krankmeldung verdrängt den Einsatz nicht mehr still.
const KRANK: Abwesenheit = { userId: 'u1', von: '2026-10-05', bis: '2026-10-07', grund: 'Krank', zeiten: null };
const ZA: Abwesenheit = { userId: 'u2', von: '2026-10-06', bis: '2026-10-06', grund: 'ZA', zeiten: '13:00–17:00' };

describe('besetzung', () => {
  it('wer ganztags krank ist, fehlt — und ist er der einzige, ist die Baustelle unbesetzt', () => {
    const b = besetzung([{ userId: 'u1', userName: 'Erna' }], [KRANK], '2026-10-06');
    expect(b).toEqual({ da: [], fehlen: [{ name: 'Erna', grund: 'Krank' }], unbesetzt: true });
    expect(fehlenText(b.fehlen)).toBe('Erna (Krank)');
  });

  it('mit einem Zweiten ist sie besetzt, aber einer fehlt', () => {
    const b = besetzung([{ userId: 'u1', userName: 'Erna' }, { userId: 'u3', userName: 'Max' }], [KRANK], '2026-10-06');
    expect(b.da).toEqual(['Max']);
    expect(b.unbesetzt).toBe(false);
  });

  it('Gegenprobe: stundenweise weg heisst nicht fehlend', () => {
    expect(ganztagsWeg([ZA], 'u2', '2026-10-06')).toBeNull();
    expect(besetzung([{ userId: 'u2', userName: 'Max' }], [ZA], '2026-10-06').unbesetzt).toBe(false);
  });

  it('Gegenprobe: ausserhalb des Zeitraums fehlt niemand', () => {
    expect(besetzung([{ userId: 'u1', userName: 'Erna' }], [KRANK], '2026-10-08').fehlen).toEqual([]);
  });

  it('ohne Grund (für wen er nicht sichtbar ist) nur der Name', () => {
    expect(fehlenText([{ name: 'Erna', grund: null }])).toBe('Erna');
  });
});

import { einsatzZeit } from '@/features/assignments/einsatzZeit';

// Testbericht 30.09.2026, M34 — die Uhrzeit eines Einsatzes.
describe('einsatzZeit', () => {
  it('von–bis, ab, bis', () => {
    expect(einsatzZeit({ zeitVon: '07:30', zeitBis: '12:00' })).toBe('07:30–12:00');
    expect(einsatzZeit({ zeitVon: '07:30:00' })).toBe('ab 07:30');
    expect(einsatzZeit({ zeitBis: '12:00' })).toBe('bis 12:00');
  });
  it('Gegenprobe: ohne Uhrzeit nichts — der ganze Tag', () => {
    expect(einsatzZeit({})).toBeNull();
    expect(einsatzZeit({ zeitVon: null, zeitBis: '' })).toBeNull();
  });
});
