import { test, expect, type Page } from '@playwright/test';
import { admin, PASSWORT } from './aufbau';
import { totp } from '../totp';

/**
 * ZWEI-FAKTOR-ANMELDUNG IM ECHTEN BROWSER (Testbericht Runde 3, H1).
 *
 * Die Abnahme aus dem Arbeitsauftrag:
 *   1. Anmeldung ohne zweiten Faktor wird für das Plattformkonto abgewiesen —
 *      es kommt nicht auf seine Seite, sondern muss ihn einrichten;
 *   2. ein Wiederherstellungscode funktioniert genau einmal.
 */

const EMAIL = 'plattform-zf@durchklick.test';

async function anmeldenMitPasswort(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(EMAIL);
  await page.getByLabel('Passwort').fill(PASSWORT);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Zwei-Faktor-Anmeldung' })).toBeVisible({ timeout: 20_000 });
}

/** Einrichten über die Seite: Geheimnis ablesen, Code rechnen, Codes merken. */
async function einrichten(page: Page): Promise<{ geheimnis: string; codes: string[] }> {
  await page.getByRole('button', { name: 'Einrichtung beginnen' }).click();
  const geheimnis = ((await page.locator('span.font-mono').first().textContent()) ?? '').trim();
  expect(geheimnis).toMatch(/^[A-Z2-7]{16,}$/);
  await page.getByLabel('Code aus der App').fill(totp(geheimnis));
  await page.getByRole('button', { name: 'Bestätigen' }).click();
  const liste = page.getByRole('list', { name: 'Wiederherstellungscodes' });
  await expect(liste).toBeVisible({ timeout: 20_000 });
  const codes = (await liste.getByRole('listitem').allTextContents()).map((c) => c.trim());
  expect(codes).toHaveLength(10);
  await page.getByRole('button', { name: 'Codes notiert — weiter' }).click();
  return { geheimnis, codes };
}

async function abmelden(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Abmelden' }).last().click();
  await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible({ timeout: 20_000 });
}

test.beforeAll(async () => {
  const vorhanden = await admin.auth.admin.listUsers({ perPage: 1000 });
  const alt = vorhanden.data.users.find((u) => u.email === EMAIL);
  if (alt) await admin.auth.admin.deleteUser(alt.id);
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORT, email_confirm: true });
  if (error) throw error;
  const { error: f } = await admin.from('platform_admins').upsert({ id: data.user!.id, name: 'Durchklick Plattform' });
  if (f) throw new Error(f.message);
});

test('Plattformkonto: ohne zweiten Faktor kein Zugang, ein Wiederherstellungscode gilt genau einmal', async ({ page }) => {
  test.setTimeout(120_000);

  // 1. Nur mit Passwort: die Plattformseite bleibt zu, die Einrichtung ist Pflicht.
  await anmeldenMitPasswort(page);
  await expect(page.getByText('Für dieses Konto ist ein zweiter Faktor Pflicht')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Betriebe anlegen' })).toHaveCount(0);

  const erste = await einrichten(page);
  await expect(page.getByRole('button', { name: 'Betrieb anlegen' })).toBeVisible({ timeout: 20_000 });
  await abmelden(page);

  // 2. Wieder anmelden: ohne Code geht es nicht weiter; ein falscher Code wird abgewiesen.
  await anmeldenMitPasswort(page);
  await page.getByLabel('Code aus der App').fill('000000');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByText(/Der Code stimmt nicht/)).toBeVisible();

  // 3. Wiederherstellungscode: er entfernt den Faktor — die Pflicht verlangt sofort die neue Einrichtung.
  await page.getByRole('button', { name: /Wiederherstellungscode verwenden/ }).click();
  await page.getByLabel('Wiederherstellungscode').fill(erste.codes[0]);
  await page.getByRole('button', { name: 'Code einlösen' }).click();
  await expect(page.getByText('Für dieses Konto ist ein zweiter Faktor Pflicht')).toBeVisible({ timeout: 20_000 });
  await einrichten(page);
  await expect(page.getByRole('button', { name: 'Betrieb anlegen' })).toBeVisible({ timeout: 20_000 });
  await abmelden(page);

  // 4. Derselbe Code ein zweites Mal: abgewiesen.
  await anmeldenMitPasswort(page);
  await page.getByRole('button', { name: /Wiederherstellungscode verwenden/ }).click();
  await page.getByLabel('Wiederherstellungscode').fill(erste.codes[0]);
  await page.getByRole('button', { name: 'Code einlösen' }).click();
  await expect(page.getByText('Dieser Wiederherstellungscode gilt nicht (mehr).')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Betrieb anlegen' })).toHaveCount(0);
});
