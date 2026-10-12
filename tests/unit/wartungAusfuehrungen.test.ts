import { describe, it, expect } from 'vitest';
import { ausfuehrungenFuerVerlauf } from '@/features/maintenance/ausfuehrungen';

/**
 * Die Ausführungen einer Anlage für den Verlauf (17 G): die festgehaltenen,
 * dazu „zuletzt gewartet“, wo eine ältere Anlage es nur dort trägt.
 */
describe('ausfuehrungenFuerVerlauf', () => {
  it('ordnet die älteste zuerst', () => {
    expect(ausfuehrungenFuerVerlauf({ zuletztAm: '2025-04-10' }, [
      { am: '2025-04-10', baustelle: 'B-2' },
      { am: '2024-04-02', baustelle: 'B-1' },
    ])).toEqual([{ am: '2024-04-02', baustelle: 'B-1' }, { am: '2025-04-10', baustelle: 'B-2' }]);
  });

  it('nimmt „zuletzt gewartet“ dazu, wenn es nicht festgehalten ist — mit der Baustelle der Wartung', () => {
    expect(ausfuehrungenFuerVerlauf({ zuletztAm: '2025-04-10', letzteBaustelle: 'B-2025-0031' }, []))
      .toEqual([{ am: '2025-04-10', baustelle: 'B-2025-0031' }]);
  });

  it('nennt denselben Tag nicht zweimal', () => {
    expect(ausfuehrungenFuerVerlauf({ zuletztAm: '2025-04-10', letzteBaustelle: 'B-X' }, [{ am: '2025-04-10' }]))
      .toEqual([{ am: '2025-04-10', baustelle: undefined }]);
  });

  it('ohne Ausführung und ohne Datum bleibt die Liste leer', () => {
    expect(ausfuehrungenFuerVerlauf({ zuletztAm: undefined }, [])).toEqual([]);
  });
});
