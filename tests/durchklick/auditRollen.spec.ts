import { test, expect } from '@playwright/test';
import { BUERO, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * Audit: Ergänzung zum vorhandenen Rollen-/Routen-Check.
 * Durchläuft die ECHTE Anmeldung und die geschützte Rechnungsroute.
 * Nur lesende Vorgänge; keine Kundendaten werden verändert.
 */
test('Monteur erhält auch über eine direkte Rechnungs-URL keinen Zugriff', async ({ page }) => {
  await anmelden(page, MONTEUR.email);
  await page.goto('/invoices');
  await expect(page.getByRole('heading', { name: 'Kein Zugriff' })).toBeVisible();
  await expect(page.getByText(/hat keinen Zugriff/)).toBeVisible();
});

test('Buchhaltung kann dieselbe Rechnungsroute regulär öffnen', async ({ page }) => {
  await anmelden(page, BUERO.email);
  await page.goto('/invoices');
  await expect(page.getByRole('heading', { level: 1, name: /Rechnungen/ })).toBeVisible();
  await keineFehlermeldung(page);
});
