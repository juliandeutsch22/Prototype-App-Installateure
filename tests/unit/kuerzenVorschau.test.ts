import { describe, it, expect } from 'vitest';
import { kuerzenFehler, kuerzenTeile, teileText } from '@/features/vacations/kuerzenVorschau';

/** Die Vorschau beim Kürzen (Z1) — dieselben Fälle, die `urlaub_kuerzen` abweist. */
describe('Kürzen: Vorschau und Prüfung (Z1)', () => {
  const antrag = { von: '2026-08-03', bis: '2026-08-14' };

  it('früher zurück: ein Teil', () => {
    expect(kuerzenTeile('2026-08-03', '2026-08-07', [])).toEqual([{ von: '2026-08-03', bis: '2026-08-07' }]);
  });

  it('ein Tag mitten im Urlaub teilt ihn — auch über den Monatswechsel', () => {
    expect(kuerzenTeile('2026-07-30', '2026-08-03', ['2026-08-01'])).toEqual([
      { von: '2026-07-30', bis: '2026-07-31' }, { von: '2026-08-02', bis: '2026-08-03' },
    ]);
    expect(teileText(kuerzenTeile('2026-08-03', '2026-08-05', ['2026-08-04']))).toBe('03.08.2026 und 05.08.2026');
  });

  it('weist ab, was keine Kürzung ist', () => {
    expect(kuerzenFehler(antrag, '2026-08-03', '2026-08-14', [])).toMatch(/unverändert/);
    expect(kuerzenFehler(antrag, '2026-08-01', '2026-08-07', [])).toMatch(/innerhalb des genehmigten Zeitraums/);
    expect(kuerzenFehler(antrag, '2026-08-07', '2026-08-05', [])).toMatch(/gültigen Zeitraum/);
    expect(kuerzenFehler(antrag, '2026-08-05', '2026-08-05', ['2026-08-05'])).toMatch(/ganz zurücknehmen/);
    expect(kuerzenFehler(antrag, '2026-08-03', '2026-08-07', ['2026-08-10'])).toMatch(/nicht im Zeitraum/);
    expect(kuerzenFehler(antrag, '2026-08-03', '2026-08-14', ['2026-08-05'])).toBeNull();
    expect(kuerzenFehler(antrag, '2026-08-04', '2026-08-14', [])).toBeNull();
  });
});
