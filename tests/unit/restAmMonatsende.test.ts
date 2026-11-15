import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { calcMonthStats, type UrlaubsPosten } from '@/lib/time';
import { buildMonthCsv, buildUserCsv } from '@/features/accounting/export';
import type { AppUser } from '@/types';

/**
 * „RESTURLAUB“ IST KEIN STAND ZUM MONATSENDE (Durchsicht 15.11.2026, Z5).
 *
 * Nachgestellt nach der Analyse (B5): März-Auswertung, im August sind zehn
 * Tage genehmigt → der „Resturlaub“ im März stand auf 15 statt 25, und
 * derselbe Monat trug im April exportiert eine andere Zahl als im Dezember.
 * Jetzt zwei Zahlen: „Rest am Monatsende“ und „davon schon verplant“.
 */
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 3, 10, 10, 0, 0));
});
afterAll(() => vi.useRealTimers());

const pia = {
  id: 'p', uid: 'p', companyId: 'perl', name: 'Pia', email: 'p@perl.at', role: 'Mitarbeiter', active: true,
  weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5], yearlyVacationDays: 25, appStartDate: '2025-01-01',
} as AppUser;

// 2026: zwei Tage im Februar genommen, zehn im August genehmigt.
const verlauf: UrlaubsPosten[] = [
  { von: '2025-07-01', tage: 25 },
  { von: '2026-02-12', tage: 1 }, { von: '2026-02-13', tage: 1 },
  ...['03', '04', '05', '06', '07', '10', '11', '12', '13', '14'].map((t) => ({ von: `2026-08-${t}`, tage: 1 })),
];

describe('Rest am Monatsende und davon verplant', () => {
  it('März: Rest am Monatsende 23 — der August zählt nicht hinein, sondern als verplant', () => {
    const maerz = calcMonthStats(pia, [], [], 2026, 2, true, { verlauf });
    expect(maerz.urlaubRest).toBe(23);
    expect(maerz.urlaubVerplant).toBe(10);
  });

  it('derselbe Monat trägt dieselbe Zahl, egal wann er ausgewertet wird', () => {
    const imApril = calcMonthStats(pia, [], [], 2026, 2, true, { verlauf: verlauf.filter((p) => p.von < '2026-04-10') });
    const imDezember = calcMonthStats(pia, [], [], 2026, 2, true, { verlauf });
    expect(imDezember.urlaubRest).toBe(imApril.urlaubRest);
  });

  it('August: am Monatsende sind die zehn Tage genommen, nichts mehr verplant', () => {
    const august = calcMonthStats(pia, [], [], 2026, 7, true, { verlauf });
    expect(august.urlaubRest).toBe(13);
    expect(august.urlaubVerplant).toBe(0);
  });

  it('Monats-CSV und Personen-CSV nennen beide Zahlen', () => {
    const stats = calcMonthStats(pia, [], [], 2026, 2, true, { verlauf });
    const monat = buildMonthCsv([{ user: pia, monthEntries: [], stats }], 2026, 2, true);
    expect(monat).toContain('Rest am Monatsende');
    expect(monat).toContain('davon verplant');
    const person = buildUserCsv(pia, [], stats, 2026, 2, true);
    expect(person).toMatch(/Rest am Monatsende.*23 Tage/);
    expect(person).toMatch(/davon verplant.*10 Tage/);
  });
});
