import { describe, it, expect } from 'vitest';
import { istUeberfaellig } from '@/features/invoices/zahlstand';
import type { Invoice } from '@/types';

/**
 * Überfällig ist, was einen Rest hat und dessen Zahlungsziel vorbei ist —
 * egal, wie der Stand heisst. Nach der ersten Teilzahlung heisst er
 * „Teilbezahlt" und nie wieder „Überfällig"; genau daran ging die fällige
 * Restforderung aus dem Blick.
 */
const r = (p: Partial<Invoice>) =>
  ({ totalBrutto: 1200, bezahltBetrag: 0, paymentStatus: 'Offen', dueDate: '2026-09-01', ...p }) as Invoice;
const HEUTE = '2026-09-23';

describe('istUeberfaellig', () => {
  it('erkennt eine angezahlte Rechnung mit abgelaufenem Ziel', () => {
    expect(istUeberfaellig(r({ paymentStatus: 'Teilbezahlt', bezahltBetrag: 400 }), HEUTE)).toBe(true);
  });

  it('nicht, solange das Ziel läuft — auch nicht am Fälligkeitstag selbst', () => {
    expect(istUeberfaellig(r({ paymentStatus: 'Teilbezahlt', bezahltBetrag: 400, dueDate: HEUTE }), HEUTE)).toBe(false);
  });

  it('erkennt eine offene Rechnung mit abgelaufenem Ziel, bevor die Liste den Stand umstellt', () => {
    expect(istUeberfaellig(r({}), HEUTE)).toBe(true);
  });

  it('nimmt den Stand „Überfällig" beim Wort, solange etwas offen ist', () => {
    expect(istUeberfaellig(r({ paymentStatus: 'Überfällig', dueDate: '2099-01-01' }), HEUTE)).toBe(true);
  });

  it('nie bei bezahlt, überzahlt oder storniert', () => {
    for (const paymentStatus of ['Bezahlt', 'Überzahlt', 'Storniert'] as const) {
      expect(istUeberfaellig(r({ paymentStatus, bezahltBetrag: 1200 }), HEUTE), paymentStatus).toBe(false);
    }
  });

  it('ohne Fälligkeitsdatum nicht', () => {
    expect(istUeberfaellig(r({ dueDate: undefined }), HEUTE)).toBe(false);
  });
});
