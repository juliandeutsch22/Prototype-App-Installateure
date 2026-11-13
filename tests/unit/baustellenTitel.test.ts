import { describe, it, expect } from 'vitest';
import { baustellenTitel, baustelleInAuswahl } from '@/lib/baustellenTitel';

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

// C3 (E91): in Auswahllisten unterscheidet die Kurzbezeichnung zwei Baustellen eines Kunden.
describe('baustelleInAuswahl', () => {
  it('Kunde, Kurzbezeichnung, Nummer — der Kunde vorn, weil die Auswahl nach ihm sortiert ist', () => {
    expect(baustelleInAuswahl({ projectNumber: 'B-0147', customerName: 'Familie Huber', bezeichnung: 'Bad' })).toBe('Familie Huber · Bad (B-0147)');
  });

  it('mit der Nummer vorn (Zeiterfassung): Nummer, Kunde, Kurzbezeichnung', () => {
    expect(baustelleInAuswahl({ projectNumber: 'B-0147', customerName: 'Familie Huber', bezeichnung: 'Bad' }, true)).toBe('B-0147 · Familie Huber · Bad');
  });

  it('Gegenprobe: ohne Kurzbezeichnung wie bisher', () => {
    expect(baustelleInAuswahl({ projectNumber: 'B-0147', customerName: 'Familie Huber' })).toBe('Familie Huber (B-0147)');
    expect(baustelleInAuswahl({ projectNumber: 'B-0147', customerName: 'Familie Huber', bezeichnung: '  ' }, true)).toBe('B-0147 · Familie Huber');
  });

  it('ohne Kunden steht keine leere Klammer, nur was da ist', () => {
    expect(baustelleInAuswahl({ projectNumber: 'B-0001', customerName: '', bezeichnung: 'Lager' })).toBe('Lager (B-0001)');
    expect(baustelleInAuswahl({ projectNumber: 'B-0001', customerName: '' })).toBe('B-0001');
  });
});
