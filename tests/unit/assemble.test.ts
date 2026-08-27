import { describe, it, expect } from 'vitest';
import { assembleInvoice, norm, INVOICE_DEFAULTS } from '@/features/invoices/assemble';
import type { TimeEntry, MaterialOrder, Material } from '@/types';

const entry = (over: Partial<TimeEntry> = {}): TimeEntry & { id: string } =>
  ({
    id: 'e1', companyId: 'c', date: '2025-06-02', status: 'Anwesend', userId: 'u1',
    startTime: '07:00', endTime: '16:30', breakDuration: 30, projectNumber: '2025-001',
    ...over,
  }) as TimeEntry & { id: string };

const order = (over: Partial<MaterialOrder> = {}): MaterialOrder & { id: string } =>
  ({
    id: 'o1', companyId: 'c', materialId: 'm1', materialName: 'Dichtung', quantity: 2,
    status: 'Erledigt', transactionType: 'order', projectNumber: '2025-001', userId: 'u1',
    ...over,
  }) as MaterialOrder & { id: string };

const materials: Material[] = [
  { id: 'm1', companyId: 'c', name: 'Dichtung', stock: 10, purchasePrice: 10 },
];

describe('Projektnummer-Abgleich', () => {
  it('gleicht das PR-Präfix an', () => {
    expect(norm('PR-2025-001')).toBe(norm('2025-001'));
    expect(norm(' pr-2025-001 ')).toBe('2025-001');
  });

  it('rechnet Stunden auch bei abweichendem Präfix ab', () => {
    // Der eigentliche Schaden: ohne Angleichung fielen diese Stunden
    // stillschweigend aus der Rechnung — der Umsatz wäre verloren.
    const res = assembleInvoice(
      'PR-2025-001',
      [entry({ projectNumber: '2025-001' })],
      [],
      materials,
    );
    expect(res.positions).toHaveLength(1);
    expect(res.positions[0].qty).toBe(9);
    expect(res.linkedEntries).toEqual(['e1']);
  });

  it('nimmt fremde Projekte NICHT mit auf', () => {
    const res = assembleInvoice('2025-001', [entry({ projectNumber: '2025-999' })], [], materials);
    expect(res.positions).toHaveLength(0);
  });
});

describe('Positionen', () => {
  it('trennt Fach- und Helferstunden mit eigenen Sätzen', () => {
    const res = assembleInvoice(
      '2025-001',
      [entry(), entry({ id: 'e2', date: '2025-06-03', isHelper: true })],
      [],
      materials,
    );
    const fach = res.positions.find((p) => p.label === 'Facharbeiterstunden');
    const helfer = res.positions.find((p) => p.label === 'Helferstunden');
    expect(fach?.unitPrice).toBe(INVOICE_DEFAULTS.fach);
    expect(helfer?.unitPrice).toBe(INVOICE_DEFAULTS.helper);
    expect(fach?.netto).toBe(9 * 65);
    expect(helfer?.netto).toBe(9 * 45);
  });

  it('schlägt auf das Material den Aufschlag auf und benennt ihn', () => {
    const res = assembleInvoice('2025-001', [], [order()], materials);
    const mat = res.positions[0];
    expect(mat.netto).toBeCloseTo(10 * 1.15 * 2, 2);
    expect(mat.label).toContain('1 Pos.');
    expect(mat.label).toContain('15 %');
  });

  it('wertet eine fehlende Menge als 1 statt als 0', () => {
    // Mit 0 wäre die Position kommentarlos aus der Rechnung gefallen.
    const res = assembleInvoice('2025-001', [], [order({ quantity: 0 })], materials);
    expect(res.positions[0].netto).toBeCloseTo(10 * 1.15, 2);
  });

  it('lässt bereits verrechnete Belege und Retouren aus', () => {
    const res = assembleInvoice(
      '2025-001',
      [entry({ isBilled: true })],
      [order({ transactionType: 'return' }), order({ id: 'o2', isBilled: true })],
      materials,
    );
    expect(res.positions).toHaveLength(0);
  });

  it('rechnet USt und Brutto korrekt', () => {
    const res = assembleInvoice('2025-001', [entry()], [], materials);
    expect(res.totalNetto).toBe(585); // 9 h * 65
    expect(res.totalVat).toBe(117); // 20 %
    expect(res.totalBrutto).toBe(702);
  });

  it('übernimmt abweichende Sätze', () => {
    const res = assembleInvoice('2025-001', [entry()], [], materials, {
      ...INVOICE_DEFAULTS,
      fach: 80,
      vatRate: 0,
    });
    expect(res.totalNetto).toBe(9 * 80);
    expect(res.totalVat).toBe(0);
    expect(res.totalBrutto).toBe(9 * 80);
  });
});
