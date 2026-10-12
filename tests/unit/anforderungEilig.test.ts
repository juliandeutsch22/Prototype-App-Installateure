/**
 * Nachträglich eilig (17 F): wann der Knopf erscheint, und wann eine
 * Meldung hinausgeht. Die Datenbank prüft dieselben Grenzen noch einmal
 * (`tests/supabase/anforderungEilig.test.ts`), die Meldung im ganzen Weg
 * `tests/supabase/push.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { eiligMoeglich } from '@/features/orders/eilig';
import { istUebergangAufEil, type OrderDoc } from '@shared/notifyLogic';

describe('eiligMoeglich', () => {
  const basis = { status: 'Offen' as const, transactionType: 'order' as const, projectNumber: 'B-1', processed: false };

  it('offen oder in Arbeit, mit Baustelle', () => {
    expect(eiligMoeglich(basis)).toBe(true);
    expect(eiligMoeglich({ ...basis, status: 'In Bearbeitung' })).toBe(true);
  });

  it('nicht abholbereit, erledigt, abgeschlossen, ohne Baustelle oder als Retoure', () => {
    expect(eiligMoeglich({ ...basis, status: 'Abholbereit' })).toBe(false);
    expect(eiligMoeglich({ ...basis, status: 'Erledigt' })).toBe(false);
    expect(eiligMoeglich({ ...basis, processed: true })).toBe(false);
    expect(eiligMoeglich({ ...basis, projectNumber: '  ' })).toBe(false);
    expect(eiligMoeglich({ ...basis, projectNumber: undefined })).toBe(false);
    expect(eiligMoeglich({ ...basis, transactionType: 'return' })).toBe(false);
  });
});

describe('istUebergangAufEil', () => {
  const vorher: OrderDoc = { companyId: 'perl', projectNumber: 'B-1', isUrgent: false, transactionType: 'order' };

  it('nur der Übergang auf eilig, mit Baustelle', () => {
    expect(istUebergangAufEil(vorher, { ...vorher, isUrgent: true })).toBe(true);
    expect(istUebergangAufEil({ ...vorher, isUrgent: true }, { ...vorher, isUrgent: true })).toBe(false);
    expect(istUebergangAufEil(vorher, { ...vorher, isUrgent: true, projectNumber: undefined })).toBe(false);
    expect(istUebergangAufEil(vorher, { ...vorher, isUrgent: true, transactionType: 'return' })).toBe(false);
    expect(istUebergangAufEil(vorher, vorher)).toBe(false);
  });
});
