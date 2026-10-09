import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, CHEFIN, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * DIE HANDWERKSSCHEINE IN DER BAUSTELLENAKTE (Rückmeldung des Betreibers,
 * 09.10.2026): Akte → Abschnitt „Handwerksscheine“ → Schein antippen → der
 * Schein steht im Seitenfenster der Scheinliste; „Zurück“ führt in die Akte.
 */
const heute = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });
const ID = randomUUID();

test.afterEach(async () => {
  await admin.from('work_sheets').delete().eq('id', ID);
});

test('Akte → Handwerksscheine → Schein öffnen → Zurück in die Akte', async ({ page }) => {
  test.setTimeout(120_000);
  const { data: m } = await admin.from('users').select('id').eq('email', MONTEUR.email).single();
  const { data: p } = await admin.from('projects').select('id').eq('company_id', BETRIEB).eq('project_number', BAUSTELLE.nummer).single();
  const { error } = await admin.from('work_sheets').insert({
    id: ID, company_id: BETRIEB, project_number: BAUSTELLE.nummer, project_id: p!.id, customer_name: BAUSTELLE.kunde,
    datum: heute(), status: 'Entwurf', abrechnung: 'Regie', erstellt_von_uid: m!.id, erstellt_von_name: MONTEUR.name,
  });
  expect(error).toBeNull();

  await anmelden(page, CHEFIN.email);
  await page.goto(`/admin-projects/${p!.id}`);
  const karte = page.locator('#b-scheine');
  await expect(karte.getByRole('heading', { name: 'Handwerksscheine' })).toBeVisible({ timeout: 20_000 });
  await expect(karte.getByRole('link', { name: 'Handwerksschein schreiben' })).toBeVisible();
  // Die Zeile: Datum und Abrechnung als Verweis, darunter wer geschrieben hat, daneben der Stand.
  const zeile = karte.getByRole('listitem').filter({ hasText: `geschrieben von ${MONTEUR.name}` });
  await expect(zeile).toContainText('Entwurf');
  await zeile.getByRole('link', { name: /· Regie$/ }).click();

  await expect(page).toHaveURL(new RegExp(`/worksheets\\?markiert=${ID}`));
  await expect(page.getByRole('dialog', { name: 'Handwerksschein' })).toBeVisible({ timeout: 15_000 });
  await keineFehlermeldung(page);

  await page.goBack();
  await expect(page.locator('#b-scheine').getByRole('heading', { name: 'Handwerksscheine' })).toBeVisible({ timeout: 15_000 });
});
