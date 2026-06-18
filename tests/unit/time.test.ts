import { describe, it, expect } from 'vitest';
import {
  calcWorkMin,
  fmtMin,
  isAustrianHoliday,
  isWeekend,
  getEasterDate,
  calcOverallSaldo,
  localDateStr,
} from '@/lib/time';
import type { AppUser, TimeEntry } from '@/types';

const entry = (e: Partial<TimeEntry>): TimeEntry =>
  ({ id: 'x', companyId: 'c', date: '2026-06-15', status: 'Anwesend', userId: 'u', ...e }) as TimeEntry;

describe('calcWorkMin', () => {
  it('rechnet (Ende − Start − Pause) für Anwesend', () => {
    expect(calcWorkMin(entry({ startTime: '07:00', endTime: '16:30', breakDuration: 30 }))).toBe(540);
  });
  it('nutzt explizite hours (Sprach-Einträge) vorrangig', () => {
    expect(calcWorkMin(entry({ hours: 4 }))).toBe(240);
  });
  it('ist 0 für Krank/Urlaub und für unvollständige Zeiten', () => {
    expect(calcWorkMin(entry({ status: 'Krank' }))).toBe(0);
    expect(calcWorkMin(entry({ status: 'Anwesend', startTime: '', endTime: '' }))).toBe(0);
  });
  it('floort negative Werte auf 0', () => {
    expect(calcWorkMin(entry({ startTime: '10:00', endTime: '09:00', breakDuration: 0 }))).toBe(0);
  });
});

describe('fmtMin', () => {
  it('formatiert Minuten als HH:MM, auch negativ', () => {
    expect(fmtMin(540)).toBe('09:00');
    expect(fmtMin(-90)).toBe('-01:30');
  });
});

describe('Österreichische Feiertage', () => {
  it('Ostersonntag 2026 ist der 5. April (Gauß-Algorithmus)', () => {
    expect(localDateStr(getEasterDate(2026))).toBe('2026-04-05');
  });
  it('erkennt fixe und osterabhängige Feiertage', () => {
    expect(isAustrianHoliday(new Date(2026, 0, 1))).toBe(true); // Neujahr
    expect(isAustrianHoliday(new Date(2026, 9, 26))).toBe(true); // Nationalfeiertag
    expect(isAustrianHoliday(new Date(2026, 3, 6))).toBe(true); // Ostermontag
    expect(isAustrianHoliday(new Date(2026, 5, 17))).toBe(false); // normaler Mittwoch
  });
  it('erkennt das Wochenende', () => {
    expect(isWeekend(new Date(2026, 5, 14))).toBe(true); // Sonntag
    expect(isWeekend(new Date(2026, 5, 15))).toBe(false); // Montag
  });
});

describe('calcOverallSaldo', () => {
  const base: AppUser = {
    id: 'u', companyId: 'c', uid: 'u', name: 'Max', email: 'm@x.at', role: 'Mitarbeiter',
  };
  it('ohne Startdatum: nur Initialsaldo, hasConfig=false', () => {
    const r = calcOverallSaldo({ ...base, initialOvertime: 5 }, []);
    expect(r).toEqual({ saldoH: 5, hasConfig: false });
  });
  it('für GF/Admin (kein Soll/Ist): saldoH 0, hasConfig=false', () => {
    const r = calcOverallSaldo({ ...base, role: 'Geschäftsführung', appStartDate: '2026-01-01' }, []);
    expect(r).toEqual({ saldoH: 0, hasConfig: false });
  });
});
