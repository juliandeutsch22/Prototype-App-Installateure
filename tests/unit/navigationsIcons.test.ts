import { describe, it, expect } from 'vitest';
import { ROLES } from '@/types';
import { navForRole } from '@/app/navigation';

/**
 * JEDER EINTRAG EIN EIGENES ZEICHEN — aus der Sicht jeder Rolle.
 *
 * Bis zum 25.09.2026 trugen Wartungen, Anforderungen und Handwerksscheine
 * dasselbe Klemmbrett, Urlaub und Einsatzplanung denselben Kalender, Material
 * und Lager dieselbe Kiste. Wer in der Leiste nach dem Zeichen greift statt
 * nach dem Wort — und das tut man nach der dritten Woche —, landet so am
 * falschen Ort.
 *
 * Geprüft wird je Rolle und mit allen Modulen an: „Meine Baustellen" und
 * „Baustellen" teilen sich das Gebäude mit Absicht. Sie sind dieselbe Sache
 * aus zwei Rollen, und keine Rolle sieht beide.
 */
describe('Navigations-Icons', () => {
  it.each(ROLES)('sind für %s alle verschieden', (rolle) => {
    const icons = navForRole(rolle).map((n) => n.icon);
    const doppelt = icons.filter((i, k) => icons.indexOf(i) !== k);
    expect(doppelt).toEqual([]);
  });
});
