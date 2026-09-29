import { describe, it, expect } from 'vitest';
import { skontoBedingung, skontoZumAusgleich, zugesagterSkonto } from '@/features/invoices/skonto';
import type { Invoice } from '@/types';

/** Skonto (offene Punkte B7, Teil 2) — dieselben Grenzen wie `app.skonto_passt`. */

describe('Die Bedingung einer neuen Rechnung', () => {
  const basis = { prozent: 2, tage: 7, rechnungsdatum: '2026-04-30', zahlungsziel: '2026-05-14' };

  it('Prozent und Frist ab Rechnungsdatum', () => {
    expect(skontoBedingung(basis)).toEqual({ skontoProzent: 2, skontoBis: '2026-05-07' });
  });

  it('die Frist endet spätestens mit dem Zahlungsziel', () => {
    expect(skontoBedingung({ ...basis, tage: 30 })?.skontoBis).toBe('2026-05-14');
  });

  it('ohne Einstellung keine — die Vorgabe ab Werk', () => {
    expect(skontoBedingung({ ...basis, prozent: undefined })).toBeNull();
    expect(skontoBedingung({ ...basis, tage: undefined })).toBeNull();
    expect(skontoBedingung({ ...basis, prozent: 0 })).toBeNull();
  });

  it('nicht auf Anzahlung und Teilrechnung, wohl auf der Schlussrechnung', () => {
    expect(skontoBedingung({ ...basis, art: 'anzahlung' })).toBeNull();
    expect(skontoBedingung({ ...basis, art: 'teil' })).toBeNull();
    expect(skontoBedingung({ ...basis, art: 'schluss' })).not.toBeNull();
  });
});

describe('Der Ausgleich beim Erfassen der Zahlung', () => {
  const inv = {
    totalBrutto: 1200, bezahltBetrag: 0, paymentStatus: 'Offen', skontoProzent: 2, skontoBis: '2026-05-07',
  } as Pick<Invoice, 'totalBrutto' | 'bezahltBetrag' | 'paymentStatus' | 'skontoProzent' | 'skontoBis'>;

  it('zugesagt sind 2 % vom Rechnungsbetrag', () => {
    expect(zugesagterSkonto(inv)).toBe(24);
  });

  it('bietet den Rest an, wenn die Zahlung in der Frist den Skonto abzieht', () => {
    expect(skontoZumAusgleich(inv, '2026-05-07', 1176)).toBe(24);
    // Etwas mehr bezahlt: der kleinere Rest ist ebenso gedeckt.
    expect(skontoZumAusgleich(inv, '2026-05-05', 1180)).toBe(20);
  });

  it('nicht nach der Frist, nicht bei zu wenig, nicht bei vollem Betrag', () => {
    expect(skontoZumAusgleich(inv, '2026-05-08', 1176)).toBeNull();
    expect(skontoZumAusgleich(inv, '2026-05-05', 1100)).toBeNull();
    expect(skontoZumAusgleich(inv, '2026-05-05', 1200)).toBeNull();
  });

  it('nicht auf einer Rechnung ohne Zusage und nicht zweimal', () => {
    expect(skontoZumAusgleich({ ...inv, skontoProzent: null, skontoBis: null }, '2026-05-05', 1176)).toBeNull();
    expect(skontoZumAusgleich({ ...inv, bezahltBetrag: 600, skontoBetrag: 24 }, '2026-05-05', 576)).toBeNull();
  });
});
