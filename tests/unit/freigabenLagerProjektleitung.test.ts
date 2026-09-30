/**
 * Testbericht 30.09.2026, Paket 3c — Freigaben statt neuer Rollen (M37, M38).
 * Die Grenze zieht die Datenbank (`tests/supabase/freigabenLagerProjektleitung.test.ts`);
 * hier: welche Wege erscheinen, und dass eine Freigabe mit der Rolle fällt.
 */
import { describe, it, expect } from 'vitest';
import { canAccess, navForRole, zusatzrechte } from '@/app/navigation';
import {
  darfEinkaufSehen, darfKatalogEinspielen, darfRechnungenLesen, einplanbar,
} from '@/lib/permissions';
import { alsEntwurf, alsProfil } from '@/features/users/benutzerEntwurf';
import type { AppUser } from '@/types';

const pfade = (r: Parameters<typeof navForRole>[0], z?: Parameters<typeof navForRole>[2]) =>
  navForRole(r, undefined, z).map((i) => i.path);

describe('M38 — Rechnungen lesen', () => {
  it('die Projektleitung sieht „Rechnungen“ nur mit Freigabe', () => {
    expect(pfade('Projektleiter')).not.toContain('/invoices');
    expect(pfade('Projektleiter', { rechnungenLesen: true })).toContain('/invoices');
    expect(canAccess('Projektleiter', '/invoices', undefined, { rechnungenLesen: true })).toBe(true);
    expect(canAccess('Projektleiter', '/invoices')).toBe(false);
  });

  it('die Freigabe öffnet keiner anderen Rolle etwas', () => {
    expect(pfade('Mitarbeiter', { rechnungenLesen: true })).not.toContain('/invoices');
    expect(darfRechnungenLesen({ role: 'Verwaltung', rechnungenLesen: true })).toBe(false);
    expect(darfRechnungenLesen({ role: 'Projektleiter', rechnungenLesen: true })).toBe(true);
  });

  it('die Zusatzrechte kommen aus der eigenen Zeile und dem Betrieb', () => {
    expect(zusatzrechte({ rechnungenLesen: true }, { projektleitungImEinsatzplan: true }))
      .toEqual({ rechnungenLesen: true, projektleitungImEinsatzplan: true });
    expect(zusatzrechte(null, null)).toEqual({ rechnungenLesen: false, projektleitungImEinsatzplan: false });
  });
});

describe('M38 — Projektleitung im Einsatzplan', () => {
  it('„Mein Einsatzplan“ nur, wenn der Betrieb es einschaltet', () => {
    expect(pfade('Projektleiter')).not.toContain('/my-schedule');
    expect(pfade('Projektleiter', { projektleitungImEinsatzplan: true })).toContain('/my-schedule');
  });

  it('einteilbar nur mit Schalter; Büro nie', () => {
    const pl = { role: 'Projektleiter' as const, active: true };
    expect(einplanbar(pl, null)).toBe(false);
    expect(einplanbar(pl, { projektleitungImEinsatzplan: true })).toBe(true);
    expect(einplanbar({ role: 'Mitarbeiter', active: true }, null)).toBe(true);
    expect(einplanbar({ role: 'Mitarbeiter', active: false }, null)).toBe(false);
    expect(einplanbar({ role: 'Verwaltung', active: true }, { projektleitungImEinsatzplan: true })).toBe(false);
  });
});

describe('M37 — Lager', () => {
  it('Katalog einspielen: Leitung immer, Verwaltung mit Freigabe', () => {
    expect(darfKatalogEinspielen({ role: 'Geschäftsführung' })).toBe(true);
    expect(darfKatalogEinspielen({ role: 'Verwaltung' })).toBe(false);
    expect(darfKatalogEinspielen({ role: 'Verwaltung', katalogEinspielen: true })).toBe(true);
    expect(darfKatalogEinspielen({ role: 'Buchhaltung', katalogEinspielen: true })).toBe(false);
  });

  it('Einkaufspreise sehen: mit eigener Freigabe oder mit „Katalog einspielen“', () => {
    expect(darfEinkaufSehen({ role: 'Verwaltung' })).toBe(false);
    expect(darfEinkaufSehen({ role: 'Verwaltung', einkaufSehen: true })).toBe(true);
    expect(darfEinkaufSehen({ role: 'Verwaltung', katalogEinspielen: true })).toBe(true);
    expect(darfEinkaufSehen({ role: 'Projektleiter', einkaufSehen: true })).toBe(false);
  });
});

describe('Eine Freigabe fällt mit der Rolle', () => {
  const lagerist = {
    id: 'l', uid: 'l', companyId: 'c', name: 'Leo Lager', email: 'l@x.at', role: 'Verwaltung',
    katalogEinspielen: true, einkaufSehen: true,
  } as AppUser;

  it('wird die Verwaltung zum Monteur, gehen beide Lager-Freigaben mit', () => {
    const p = alsProfil({ ...alsEntwurf(lagerist), role: 'Mitarbeiter' });
    expect(p.katalogEinspielen).toBe(false);
    expect(p.einkaufSehen).toBe(false);
  });

  it('bleibt sie Verwaltung, bleiben sie', () => {
    const p = alsProfil(alsEntwurf(lagerist));
    expect(p).toMatchObject({ katalogEinspielen: true, einkaufSehen: true, rechnungenLesen: false });
  });
});
