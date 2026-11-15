/**
 * Rückfragen vor dem Standwechsel eines Angebots (A5) und das Angebotsdatum
 * beim Versand (A12) — Durchsicht 15.11.2026.
 */
import { describe, it, expect } from 'vitest';
import { datumAufHeute, hatPosition, statusFrage } from '@/features/quotes/statusFrage';

describe('Das Angebotsdatum beim Versand (A12)', () => {
  it('liegt es zurück: heute, und die Bindefrist rückt um dieselben Tage', () => {
    expect(datumAufHeute({ quoteDate: '2026-10-01', validUntil: '2026-10-31' }, '2026-10-20'))
      .toEqual({ quoteDate: '2026-10-20', validUntil: '2026-11-19' });
  });
  it('bleibt gleich: von heute oder später — nichts zu tun', () => {
    expect(datumAufHeute({ quoteDate: '2026-10-20', validUntil: '2026-11-19' }, '2026-10-20')).toBeNull();
  });
});

describe('Rückfragen (A5)', () => {
  it('ein Angebot nur aus Titeln hat keine Position und wird nicht versendet', () => {
    const q = { quoteNumber: 'AN-1', positions: [{ art: 'titel' as const, label: 'Bad', qty: 0, unit: '', unitPrice: 0, netto: 0 }] };
    expect(hatPosition(q)).toBe(false);
    expect(statusFrage(q, 'versenden')).toMatchObject({ gesperrt: true });
  });
  it('die Ablehnung zurück: auf „Versendet“, wenn es versendet war, sonst Entwurf', () => {
    expect(statusFrage({ quoteNumber: 'AN-1', positions: [], versendetAm: 1 }, 'ablehnungZurueck').neu).toBe('Versendet');
    expect(statusFrage({ quoteNumber: 'AN-1', positions: [] }, 'ablehnungZurueck').neu).toBe('Entwurf');
  });
});
