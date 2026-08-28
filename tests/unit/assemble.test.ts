import { describe, it, expect } from 'vitest';
import { assembleInvoice, norm, INVOICE_DEFAULTS } from '@/features/invoices/assemble';
import type { TimeEntry } from '@/types';

const entry = (over: Partial<TimeEntry> = {}): TimeEntry & { id: string } =>
  ({
    id: 'e1', companyId: 'c', date: '2025-06-02', status: 'Anwesend', userId: 'u1',
    startTime: '07:00', endTime: '16:30', breakDuration: 30, projectNumber: '2025-001',
    ...over,
  }) as TimeEntry & { id: string };

describe('Projektnummer-Abgleich', () => {
  it('gleicht das PR-Präfix an', () => {
    expect(norm('PR-2025-001')).toBe(norm('2025-001'));
    expect(norm(' pr-2025-001 ')).toBe('2025-001');
  });

  it('rechnet Stunden auch bei abweichendem Präfix ab', () => {
    // Der eigentliche Schaden: ohne Angleichung fielen diese Stunden
    // stillschweigend aus der Rechnung — der Umsatz wäre verloren.
    const res = assembleInvoice('PR-2025-001', [entry({ projectNumber: '2025-001' })]);
    expect(res.positions).toHaveLength(1);
    expect(res.positions[0].qty).toBe(9);
    expect(res.linkedEntries).toEqual(['e1']);
  });

  it('nimmt fremde Projekte NICHT mit auf', () => {
    const res = assembleInvoice('2025-001', [entry({ projectNumber: '2025-999' })]);
    expect(res.positions).toHaveLength(0);
  });
});

describe('Positionen', () => {
  it('trennt Fach- und Helferstunden mit eigenen Sätzen', () => {
    const res = assembleInvoice('2025-001', [
      entry(),
      entry({ id: 'e2', date: '2025-06-03', isHelper: true }),
    ]);
    const fach = res.positions.find((p) => p.label === 'Facharbeiterstunden');
    const helfer = res.positions.find((p) => p.label === 'Helferstunden');
    expect(fach?.unitPrice).toBe(INVOICE_DEFAULTS.fach);
    expect(helfer?.unitPrice).toBe(INVOICE_DEFAULTS.helper);
    expect(fach?.netto).toBe(9 * 65);
    expect(helfer?.netto).toBe(9 * 45);
  });

  it('verrechnet KEIN Material', () => {
    // Materialbestellungen sind interne Anforderungen des Monteurs an die
    // Projektleitung. Sie tragen keinen Preis und dürfen nie auf einer
    // Kundenrechnung landen.
    const res = assembleInvoice('2025-001', [entry()]);
    expect(res.positions).toHaveLength(1);
    expect(res.positions[0].unit).toBe('h');
    expect(res.linkedOrders).toEqual([]);
  });

  it('lässt bereits verrechnete Einträge aus', () => {
    const res = assembleInvoice('2025-001', [entry({ isBilled: true })]);
    expect(res.positions).toHaveLength(0);
  });

  it('rechnet USt und Brutto korrekt', () => {
    const res = assembleInvoice('2025-001', [entry()]);
    expect(res.totalNetto).toBe(585); // 9 h * 65
    expect(res.totalVat).toBe(117); // 20 %
    expect(res.totalBrutto).toBe(702);
  });

  it('übernimmt abweichende Sätze', () => {
    const res = assembleInvoice('2025-001', [entry()], {
      ...INVOICE_DEFAULTS,
      fach: 80,
      vatRate: 0,
    });
    expect(res.totalNetto).toBe(9 * 80);
    expect(res.totalVat).toBe(0);
    expect(res.totalBrutto).toBe(9 * 80);
  });
});

describe('Zuschläge', () => {
  it('schlägt Nachtarbeit auf den Stundensatz auf', () => {
    const res = assembleInvoice('2025-001', [entry({ isNightWork: true })]);
    expect(res.positions).toHaveLength(1);
    expect(res.positions[0].unitPrice).toBe(65 * 1.5);
    expect(res.positions[0].label).toContain('Nachtarbeit +50 %');
  });

  it('addiert Nacht- und Notdienstzuschlag', () => {
    const res = assembleInvoice('2025-001', [entry({ isNightWork: true, isEmergency: true })]);
    // 65 * (1 + 0.5 + 1) = 162.50 — die Zuschläge addieren sich auf den
    // Grundsatz, sie multiplizieren sich NICHT (das ergäbe 195,00).
    expect(res.positions[0].unitPrice).toBe(162.5);
    expect(res.positions[0].label).toContain('Notdienst +100 %');
    expect(res.positions[0].label).toContain('Nachtarbeit +50 %');
  });

  it('weist jede Kombination als eigene Position aus', () => {
    const res = assembleInvoice('2025-001', [
      entry({ id: 'e1' }),
      entry({ id: 'e2', date: '2025-06-03', isNightWork: true }),
      entry({ id: 'e3', date: '2025-06-04', isEmergency: true }),
      entry({ id: 'e4', date: '2025-06-05', isHelper: true, isNightWork: true }),
    ]);
    expect(res.positions).toHaveLength(4);
    // Feste Reihenfolge: Facharbeiter vor Helfer, Grundleistung vor Zuschlag.
    expect(res.positions.map((p) => p.label)).toEqual([
      'Facharbeiterstunden',
      'Facharbeiterstunden (Nachtarbeit +50 %)',
      'Facharbeiterstunden (Notdienst +100 %)',
      'Helferstunden (Nachtarbeit +50 %)',
    ]);
  });

  it('fasst gleich gekennzeichnete Einträge zu einer Position zusammen', () => {
    const res = assembleInvoice('2025-001', [
      entry({ id: 'e1', isEmergency: true }),
      entry({ id: 'e2', date: '2025-06-03', isEmergency: true }),
    ]);
    expect(res.positions).toHaveLength(1);
    expect(res.positions[0].qty).toBe(18);
  });

  it('rechnet einen Nachteinsatz über Mitternacht korrekt ab', () => {
    // 22:00–06:00 ohne Pause: acht Stunden, nicht null.
    const res = assembleInvoice('2025-001', [
      entry({ startTime: '22:00', endTime: '06:00', breakDuration: 0, isNightWork: true }),
    ]);
    expect(res.positions[0].qty).toBe(8);
    expect(res.totalNetto).toBe(8 * 65 * 1.5);
  });

  it('folgt den Zuschlägen des Betriebs', () => {
    const res = assembleInvoice('2025-001', [entry({ isEmergency: true })], {
      ...INVOICE_DEFAULTS,
      emergencySurcharge: 0.25,
      vatRate: 0,
    });
    expect(res.positions[0].unitPrice).toBe(65 * 1.25);
    expect(res.positions[0].label).toContain('Notdienst +25 %');
  });
});
