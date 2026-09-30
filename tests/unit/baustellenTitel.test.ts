import { describe, it, expect } from 'vitest';
import { baustellenTitel } from '@/lib/baustellenTitel';

// Testbericht 30.09.2026, G4 — die Bezeichnung steht vor dem Kunden.
describe('baustellenTitel', () => {
  it('Bezeichnung vor dem Kunden', () => {
    expect(baustellenTitel({ customerName: 'Hausverwaltung Nord', bezeichnung: 'Bad 2. OG' })).toBe('Bad 2. OG · Hausverwaltung Nord');
  });

  it('Gegenprobe: ohne Bezeichnung der Kunde allein, wie bisher', () => {
    expect(baustellenTitel({ customerName: 'Hausverwaltung Nord' })).toBe('Hausverwaltung Nord');
    expect(baustellenTitel({ customerName: 'Hausverwaltung Nord', bezeichnung: '   ' })).toBe('Hausverwaltung Nord');
  });

  it('ohne Kunden die Bezeichnung allein', () => {
    expect(baustellenTitel({ customerName: '', bezeichnung: 'Lager' })).toBe('Lager');
  });
});
