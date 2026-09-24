/**
 * Wer ein Zeitkonto führt und wer Kunden pflegt — die Entscheidungen des
 * Betriebs vom 24.09.2026 als Wahrheitstafel.
 */
import { describe, it, expect } from 'vitest';
import { darfKundenPflegen, fuehrtZeitkonto } from '@/lib/permissions';
import type { Role } from '@/types';

describe('fuehrtZeitkonto', () => {
  it.each<[Role, boolean | undefined, boolean]>([
    ['Mitarbeiter', undefined, true],
    ['Verwaltung', undefined, true],
    ['Buchhaltung', undefined, true],
    ['Projektleiter', undefined, true],
    ['Geschäftsführung', undefined, false],
    ['Geschäftsführung', false, false],
    ['Geschäftsführung', true, true],
    ['Administrator', undefined, false],
    // Die Administration nie — auch nicht, wenn der Haken aus einer früheren
    // Rolle stehen geblieben wäre.
    ['Administrator', true, false],
  ])('%s (Haken %s) → %s', (role, haken, erwartet) => {
    expect(fuehrtZeitkonto({ role, fuehrtZeitkonto: haken })).toBe(erwartet);
  });
});

describe('darfKundenPflegen', () => {
  it.each<[Role, boolean | undefined, boolean]>([
    ['Projektleiter', undefined, true],
    ['Geschäftsführung', undefined, true],
    ['Administrator', undefined, true],
    ['Verwaltung', undefined, false],
    ['Verwaltung', true, true],
    ['Buchhaltung', false, false],
    ['Buchhaltung', true, true],
    // Monteure nie — dieselbe Regel wie `app.darf_kunden_pflegen()`.
    ['Mitarbeiter', true, false],
  ])('%s (Freigabe %s) → %s', (role, freigabe, erwartet) => {
    expect(darfKundenPflegen({ role, kundenPflegen: freigabe })).toBe(erwartet);
  });
});
