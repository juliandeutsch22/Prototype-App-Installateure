import { describe, it, expect } from 'vitest';
import { firmaSperrtRechnung } from '@/features/invoices/firmaSperre';

/**
 * Was an den Firmendaten jede Rechnung sperrt (Testbericht Runde 5, M2) —
 * dieselbe Prüfung für den Knopf und die Startseite.
 */
describe('firmaSperrtRechnung', () => {
  const GUT = 'AT61 1904 3002 3457 3201';

  it('sperrt ohne Anschrift und mit einer IBAN, die es so nicht gibt', () => {
    expect(firmaSperrtRechnung({ addressLine: '', iban: 'AT12 3456 7890' })).toEqual(['Anschrift', 'gültige IBAN']);
    expect(firmaSperrtRechnung(null)).toEqual(['Anschrift']);
  });

  it('Gegenprobe: eine fehlende IBAN und eine teilweise Anschrift sperren nicht', () => {
    expect(firmaSperrtRechnung({ addressLine: 'Hauptstraße 1', iban: '' })).toEqual([]);
    expect(firmaSperrtRechnung({ addressLine: 'Hauptstraße 1 · 8200 Gleisdorf', iban: GUT })).toEqual([]);
  });
});
