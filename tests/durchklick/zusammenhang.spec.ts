import { test, expect } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, CHEFIN, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * ZUSAMMENHANG MITNEHMEN (E83) — die zwei Wege, an denen es riss:
 *
 *   1. Der Monteur hat heute einen Einsatz. Von dort „Material anfordern“:
 *      die Anforderung steht auf dieser Baustelle, ohne Auswahl.
 *   2. Eine frisch angelegte Baustelle ohne Einsatz: die Akte heißt oben
 *      „Einsatz planen“ und führt mit dieser Baustelle in die Planung.
 */
const heute = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
const NEU = 'ZH-2026-0001';

async function aufraeumen() {
  const { data: monteur } = await admin.from('users').select('id').eq('company_id', BETRIEB).eq('email', MONTEUR.email).single();
  await admin.from('assignments').delete().eq('company_id', BETRIEB).eq('date', heute()).eq('user_id', (monteur as { id: string }).id);
  await admin.from('assignments').delete().eq('company_id', BETRIEB).eq('project_number', NEU);
  await admin.from('projects').delete().eq('company_id', BETRIEB).eq('project_number', NEU);
}
test.beforeEach(aufraeumen);
test.afterEach(aufraeumen);

test('Vom Einsatz aus Material anfordern: die Baustelle ist schon gewählt', async ({ page }) => {
  const { data: monteur } = await admin.from('users').select('id').eq('company_id', BETRIEB).eq('email', MONTEUR.email).single();
  expect((await admin.from('assignments').insert({
    company_id: BETRIEB, date: heute(), project_number: BAUSTELLE.nummer, user_id: (monteur as { id: string }).id, user_name: MONTEUR.name,
  })).error).toBeNull();

  await anmelden(page, MONTEUR.email);
  const einsatz = page.locator('.start-einsatz').first();
  await expect(einsatz).toBeVisible({ timeout: 15_000 });
  await einsatz.getByRole('link', { name: 'Material anfordern' }).click();
  await expect(page).toHaveURL(new RegExp(`/material\\?projekt=${BAUSTELLE.nummer}$`));
  await expect(page.getByLabel('Für welche Baustelle?')).toHaveValue(BAUSTELLE.nummer, { timeout: 15_000 });
  await keineFehlermeldung(page);
});

test('Frische Baustelle ohne Einsatz: die Akte führt zu „Einsatz planen“', async ({ page }) => {
  const { data: neu, error } = await admin.from('projects').insert({
    company_id: BETRIEB, project_number: NEU, customer_name: 'Familie Zusammenhang', status: 'Aktiv',
  }).select('id').single();
  expect(error).toBeNull();

  await anmelden(page, CHEFIN.email);
  await page.goto(`/admin-projects/${(neu as { id: string }).id}`);
  const planen = page.getByRole('link', { name: 'Einsatz planen' });
  await expect(planen).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'Schein schreiben' })).toHaveCount(0);
  await planen.click();
  await expect(page).toHaveURL(/\/assignments/);
  await expect(page.getByLabel('Baustelle', { exact: true }).first()).toHaveValue(NEU, { timeout: 15_000 });
  await keineFehlermeldung(page);
});
