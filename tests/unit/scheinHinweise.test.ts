import { describe, it, expect } from 'vitest';
import { nachgetrageneScheine, offeneEntwuerfe } from '@/features/invoices/scheinHinweise';

/**
 * Zwei Hinweise zur Rechnungsvorschau (24.10.2026): ein Schein im schon
 * abgerechneten Zeitraum, dessen Material jene Rechnung schon trägt, und
 * Entwürfe, deren Material vom Ausgegebenen abgezogen ist.
 */
const schein = (id: string, datum: string, material: Array<[string, number]>, status = 'Unterschrieben') => ({
  id, datum, status: status as 'Unterschrieben' | 'Entwurf', material: material.map(([name, menge]) => ({ name, menge })),
});
const rechnung = (nr: string, teil: Record<string, unknown>) => ({
  invoiceNumber: nr, invoiceDate: '2026-09-30', leistungBis: '2026-09-15', paymentStatus: 'Offen', art: 'einzel',
  positions: [{ label: 'Kupferrohr 15', qty: 3, unit: 'm', unitPrice: 5, netto: 15 }], ...teil,
}) as never;

describe('nachgetrageneScheine', () => {
  it('meldet einen Schein im abgerechneten Zeitraum, dessen Material die Rechnung schon trägt', () => {
    expect(nachgetrageneScheine(
      [schein('s1', '2026-09-10', [['kupferrohr  15', 2], ['Pressfitting', 1]])],
      [rechnung('RE-1', {})],
    )).toEqual([{ scheinId: 's1', datum: '2026-09-10', rechnung: 'RE-1', artikel: ['kupferrohr  15'] }]);
  });

  it('ohne Leistungsende zählt das Rechnungsdatum', () => {
    expect(nachgetrageneScheine([schein('s1', '2026-09-20', [['Kupferrohr 15', 1]])], [rechnung('RE-1', { leistungBis: null })]))
      .toHaveLength(1);
  });

  it('schweigt bei späterem Tag, anderem Material, Storno und Anzahlung', () => {
    expect(nachgetrageneScheine(
      [
        schein('spaeter', '2026-09-16', [['Kupferrohr 15', 1]]),
        schein('anders', '2026-09-10', [['Pressfitting', 1]]),
        schein('leer', '2026-09-10', []),
      ],
      [rechnung('RE-1', {})],
    )).toEqual([]);
    const s = [schein('s1', '2026-09-10', [['Kupferrohr 15', 1]])];
    expect(nachgetrageneScheine(s, [rechnung('RE-1', { paymentStatus: 'Storniert' })])).toEqual([]);
    expect(nachgetrageneScheine(s, [rechnung('RE-1', { art: 'anzahlung' })])).toEqual([]);
  });
});

describe('offeneEntwuerfe', () => {
  const ausgaben = [{ name: 'Kupferrohr 15', menge: 10 }, { name: 'Pressfitting', menge: -2 }];

  it('meldet Entwürfe, deren Material vom Ausgegebenen abgezogen ist', () => {
    expect(offeneEntwuerfe(
      [
        schein('e2', '2026-09-12', [['Kupferrohr 15', 2]], 'Entwurf'),
        schein('e1', '2026-09-05', [['kupferrohr 15', 1], ['Dichtung', 3]], 'Entwurf'),
      ],
      ausgaben,
    )).toEqual([
      { scheinId: 'e1', datum: '2026-09-05', artikel: ['kupferrohr 15'] },
      { scheinId: 'e2', datum: '2026-09-12', artikel: ['Kupferrohr 15'] },
    ]);
  });

  it('schweigt bei Unterschriebenem, Material ohne Ausgabe, nur Zurückgegebenem und nach dem Stichtag', () => {
    expect(offeneEntwuerfe(
      [
        schein('u', '2026-09-05', [['Kupferrohr 15', 1]]),
        schein('d', '2026-09-05', [['Dichtung', 1]], 'Entwurf'),
        schein('p', '2026-09-05', [['Pressfitting', 1]], 'Entwurf'),
        schein('spaet', '2026-09-20', [['Kupferrohr 15', 1]], 'Entwurf'),
      ],
      ausgaben,
      '2026-09-15',
    )).toEqual([]);
  });
});
