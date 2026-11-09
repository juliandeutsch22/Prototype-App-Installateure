import { describe, it, expect } from 'vitest';
import { gleicherTagImMonat } from '@/features/assignments/einsatzDaten';

/*
  Beim Blättern im Kalender wandert der gewählte Tag mit (Befund 09.11.2026):
  derselbe Tag im Nachbarmonat, gekappt auf dessen letzten.
*/
describe('gleicherTagImMonat', () => {
  it('nimmt denselben Tag im nächsten und im vorigen Monat', () => {
    expect(gleicherTagImMonat('2026-11-20', 1)).toBe('2026-12-20');
    expect(gleicherTagImMonat('2026-11-20', -1)).toBe('2026-10-20');
  });

  it('kappt auf den Monatsletzten, wo es den Tag nicht gibt', () => {
    expect(gleicherTagImMonat('2026-01-31', 1)).toBe('2026-02-28');
    expect(gleicherTagImMonat('2028-01-31', 1)).toBe('2028-02-29');
    expect(gleicherTagImMonat('2026-10-31', 1)).toBe('2026-11-30');
    expect(gleicherTagImMonat('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('geht über den Jahreswechsel', () => {
    expect(gleicherTagImMonat('2026-12-15', 1)).toBe('2027-01-15');
    expect(gleicherTagImMonat('2027-01-15', -1)).toBe('2026-12-15');
  });

  it('rechnet am Monatsersten nicht in den Vormonat (keine UTC-Rechnung)', () => {
    expect(gleicherTagImMonat('2026-04-01', 1)).toBe('2026-05-01');
    expect(gleicherTagImMonat('2026-11-01', -1)).toBe('2026-10-01');
  });
});
