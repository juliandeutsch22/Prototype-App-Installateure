import { describe, it, expect } from 'vitest';
import { standardZeitfeldAktiv, standardZeitwerteErhalten } from '@/lib/standardZeitfelder';
describe('Standard-Zeitfelder', () => {
  it('ohne Einstellung bleiben alle bisherigen Felder aktiv', () => {
    expect(standardZeitfeldAktiv(undefined, 'projectNumber')).toBe(true);
  });
  it('deaktiviert nur ausdrücklich ausgeschaltete Angaben', () => {
    expect(standardZeitfeldAktiv({ travelTime: false }, 'travelTime')).toBe(false);
    expect(standardZeitfeldAktiv({ travelTime: false }, 'comment')).toBe(true);
  });
  it('Ausblenden bewahrt alte abrechnungsrelevante Werte und leere neue Felder', () => {
    const alt = { projectNumber: 'PR-1', customerName: 'Huber', travelTime: 20, isEmergency: true };
    expect(standardZeitwerteErhalten({ projectNumber: '', customerName: '', travelTime: 0, isEmergency: false, comment: 'Neu' }, alt,
      { projectNumber: false, travelTime: false, isEmergency: false })).toEqual({ ...alt, comment: 'Neu' });
    expect(standardZeitwerteErhalten({ travelTime: 50, isEmergency: true }, undefined, { travelTime: false, isEmergency: false })).toEqual({ travelTime: 0, isEmergency: false });
  });
});
