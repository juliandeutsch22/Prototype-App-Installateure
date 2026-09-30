import { describe, it, expect } from 'vitest';
import { abrechnungText, stundenSindGrundlage, ABRECHNUNGSARTEN } from '@/lib/abrechnung';

// Testbericht 30.09.2026, M16 — drei Abrechnungsarten.
describe('Abrechnungsarten', () => {
  it('Pauschal zuerst, weil es die Vorgabe beim Annehmen ist', () => {
    expect(ABRECHNUNGSARTEN.map((a) => a.wert)).toEqual(['Pauschal', 'Regie', 'Einheitspreis']);
  });

  it('das Wort, das Menschen lesen — ohne Angabe gilt Regie', () => {
    expect(abrechnungText('Einheitspreis')).toBe('Einheitspreis nach Aufmaß');
    expect(abrechnungText('Pauschal')).toBe('Pauschal');
    expect(abrechnungText(undefined)).toBe('Regie');
  });

  it('nur bei Regie sind die Stunden die Rechnungsgrundlage', () => {
    expect(stundenSindGrundlage('Regie')).toBe(true);
    expect(stundenSindGrundlage(undefined)).toBe(true);
    expect(stundenSindGrundlage('Pauschal')).toBe(false);
    expect(stundenSindGrundlage('Einheitspreis')).toBe(false);
  });
});
