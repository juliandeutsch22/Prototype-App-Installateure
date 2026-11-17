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
  /*
    E95: „Planung“ leitet von `/assignments` auf `/assignments/woche` weiter
    (ersetzt). Das ist keine Akte — die Seite darf sich nicht noch einmal
    hereinschieben. Gegenprobe: ohne den Fall „weiter“ ist es „tiefer“ (rot).
  */
  it('die Weiterleitung auf den Reiter ist kein Schritt tiefer', () => {
    expect(seitenRichtung('/assignments', '/assignments/woche', true)).toBe('weiter');
    expect(seitenRichtung('/settings', '/settings/firma', true)).toBe('weiter');
    expect(seitenRichtung('/settings/', '/settings/firma', true)).toBe('weiter');
  });
  it('gleich geblieben: angehängt bleibt es Liste → Akte, ersetzt woanders hin bleibt es quer', () => {
    expect(seitenRichtung('/customers', '/customers/k1', false)).toBe('tiefer');
    expect(seitenRichtung('/quotes/neu', '/quotes/q1', true)).toBe('quer');
    expect(seitenRichtung('/assignmentsx', '/assignments/woche', true)).not.toBe('weiter');
  });
  it('gleich geblieben: quer bleibt quer', () => {
    expect(seitenRichtung('/', '/customers/k1')).toBe('quer');
    expect(seitenRichtung('/settings/firma', '/settings/personal')).toBe('quer');
    expect(seitenRichtung('/customers', '/invoices')).toBe('quer');
    expect(seitenRichtung('/customers/k1', '/customers/k2')).toBe('quer');
    expect(seitenRichtung('/customers/k1', '/admin-projects')).toBe('quer');
  });
});
