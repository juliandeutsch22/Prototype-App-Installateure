import { describe, expect, it } from 'vitest';
import { seitenRichtung } from '@/lib/seitenrichtung';

/* B12: Liste → Akte ist „tiefer“, zurück „zurück“, alles andere „quer“ (nur Einblenden, wie bisher). */
describe('seitenRichtung', () => {
  it('Liste und Akte', () => {
    expect(seitenRichtung('/customers', '/customers/k1')).toBe('tiefer');
    expect(seitenRichtung('/customers/k1', '/customers')).toBe('zurueck');
    expect(seitenRichtung('/admin-projects', '/admin-projects/p1')).toBe('tiefer');
    expect(seitenRichtung('/worksheets', '/worksheet/s1')).toBe('tiefer');
    expect(seitenRichtung('/worksheet/s1', '/worksheets')).toBe('zurueck');
  });
  it('gleich geblieben: quer bleibt quer', () => {
    expect(seitenRichtung('/', '/customers/k1')).toBe('quer');
    expect(seitenRichtung('/settings/firma', '/settings/personal')).toBe('quer');
    expect(seitenRichtung('/customers', '/invoices')).toBe('quer');
    expect(seitenRichtung('/customers/k1', '/customers/k2')).toBe('quer');
    expect(seitenRichtung('/customers/k1', '/admin-projects')).toBe('quer');
  });
});
