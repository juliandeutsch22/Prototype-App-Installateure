import { describe, it, expect } from 'vitest';
import { rolleAnzeige } from '@/lib/rolleAnzeige';

// Testbericht 30.09.2026, G21 — im Supportmodus stand „Rolle: Administrator“.
describe('rolleAnzeige', () => {
  it('im Supportzugang: Support (lesend) bzw. (mitarbeiten)', () => {
    expect(rolleAnzeige('Administrator', { stufe: 'ansehen' })).toBe('Support (lesend)');
    expect(rolleAnzeige('Administrator', { stufe: null })).toBe('Support (lesend)');
    expect(rolleAnzeige('Administrator', { stufe: 'mitarbeiten' })).toBe('Support (mitarbeiten)');
  });
  it('Gegenprobe: ohne Einblick die eigene Rolle', () => {
    expect(rolleAnzeige('Geschäftsführung', null)).toBe('Geschäftsführung');
  });
});
