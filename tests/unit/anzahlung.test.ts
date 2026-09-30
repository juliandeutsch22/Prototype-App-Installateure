import { describe, it, expect } from 'vitest';
import { anteilFehler, anzahlungVorschau } from '@/features/invoices/anzahlung';

// Testbericht 30.09.2026, M20 — die Anzahlung als Anteil vom Angebot.
const ANGEBOT = { quoteNumber: 'AN-2026-0012', quoteDate: '2026-09-01', totalNetto: 8183 };

describe('anzahlungVorschau', () => {
  it('30 % von 8.183,00 € netto sind 2.454,90 € — die Zahl aus dem Arbeitsauftrag', () => {
    const v = anzahlungVorschau({ angebot: ANGEBOT, prozent: 30, baustelle: null, vatRate: 0.2 });
    expect(v.positions).toEqual([{
      label: 'Anzahlung 30 % auf Angebot AN-2026-0012 vom 01.09.2026',
      qty: 1, unit: 'Pauschale', unitPrice: 2454.9, netto: 2454.9,
    }]);
    expect(v).toMatchObject({ totalNetto: 2454.9, totalVat: 490.98, totalBrutto: 2945.88 });
  });

  it('rundet auf den Cent und nennt einen krummen Anteil', () => {
    const v = anzahlungVorschau({ angebot: { ...ANGEBOT, totalNetto: 1000.01 }, prozent: 33.33, baustelle: null, vatRate: 0.2 });
    expect(v.totalNetto).toBe(333.3);
    expect(v.positions[0].label).toContain('33,33 %');
  });

  it('nimmt den Zeitraum der Baustelle, wenn Beginn und Ende stehen', () => {
    const v = anzahlungVorschau({
      angebot: ANGEBOT, prozent: 30, baustelle: { startDate: '2026-10-05', endDate: '2026-10-23' }, vatRate: 0.2,
    });
    expect(v.leistung).toEqual({ von: '2026-10-05', bis: '2026-10-23' });
  });

  it('Gegenprobe: ein halber Zeitraum wird nicht ergänzt', () => {
    const v = anzahlungVorschau({ angebot: ANGEBOT, prozent: 30, baustelle: { startDate: '2026-10-05' }, vatRate: 0.2 });
    expect(v.leistung).toBeNull();
  });

  it('Gegenprobe: ohne Angebot oder ohne lesbaren Anteil bleibt die Null', () => {
    for (const v of [
      anzahlungVorschau({ angebot: null, prozent: 30, baustelle: null, vatRate: 0.2 }),
      anzahlungVorschau({ angebot: ANGEBOT, prozent: null, baustelle: null, vatRate: 0.2 }),
      anzahlungVorschau({ angebot: ANGEBOT, prozent: 120, baustelle: null, vatRate: 0.2 }),
    ]) {
      expect(v.positions[0]).toMatchObject({ label: 'Anzahlung gemäß Vereinbarung', unitPrice: 0 });
      expect(v.linkedEntries).toEqual([]);
    }
  });
});

describe('anteilFehler', () => {
  it('zwischen 0 und 100', () => {
    expect(anteilFehler(30)).toBeNull();
    expect(anteilFehler(100)).toBeNull();
    expect(anteilFehler(0)).toMatch(/zwischen/);
    expect(anteilFehler(101)).toMatch(/zwischen/);
    expect(anteilFehler(null)).toMatch(/eintragen/);
  });
});
