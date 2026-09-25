import { test, expect, type Page } from '@playwright/test';
import { admin, CHEFIN } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';
import { kunstadresse } from '../../shared/benutzername';

/**
 * Anmelden mit Benutzername — der ganze Weg, so wie ihn ein Betrieb geht.
 *
 * WARUM ALS DURCHKLICK. Jedes Stück ist einzeln geprüft: die Regeln, die
 * Anmeldeschicht, die beiden Edge Functions, die Masken. Was dabei keiner
 * sieht, ist die Naht: dass der Name, den die Chefin eintippt, genau der ist,
 * mit dem der Monteur hineinkommt; dass die App ihn danach nach einem
 * eigenen Passwort fragt — und beim zweiten Mal NICHT mehr; und dass ein
 * vergessenes Passwort wieder zu einem Startpasswort führt.
 */

/** Das Startpasswort aus dem Kasten lesen — es steht nur dieses eine Mal da. */
async function startpasswortLesen(page: Page): Promise<string> {
  const kasten = page.getByRole('alert').filter({ hasText: 'Startpasswort' });
  await expect(kasten).toBeVisible({ timeout: 20_000 });
  /*
    Über einen eigenen Anker, nicht über eine Stilklasse: hier stand
    `p.tnum` — und mit dem Design-Durchgang vom 25.09.2026 fiel `.tnum` weg
    (Ziffern mit fester Breite gelten jetzt überall). Ein Weg, der am
    Aussehen hängt, bricht bei jeder Gestaltungsänderung.
  */
  const pw = (await kasten.getByTestId('startpasswort').textContent())?.trim() ?? '';
  expect(pw.length).toBeGreaterThanOrEqual(8);
  return pw;
}

async function mitNameAnmelden(page: Page, name: string, passwort: string) {
  await page.goto('/');
  await page.getByLabel('E-Mail oder Benutzername').fill(name);
  await page.getByLabel('Passwort').fill(passwort);
  await page.getByRole('button', { name: 'Anmelden' }).click();
}

async function eigenesVergeben(page: Page, neu: string) {
  await expect(page.getByRole('heading', { name: 'Willkommen' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/mit einem Startpasswort angemeldet/)).toBeVisible();
  // Kein Versprechen eines Links per Mail — es gibt kein Postfach.
  await expect(page.getByText(/neuen Link per E-Mail/)).toHaveCount(0);
  await page.getByLabel('Neues Passwort').fill(neu);
  await page.getByLabel('Noch einmal').fill(neu);
  await page.getByRole('button', { name: 'Passwort vergeben', exact: true }).click();
  await expect(page.locator('nav').first()).toBeVisible({ timeout: 20_000 });
}

test('Benutzername: anlegen, erstes Anmelden, eigenes Passwort, vergessen, neues Startpasswort', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const name = `nora.${crypto.randomUUID().slice(0, 6)}`;

  // 1. Die Chefin legt Nora mit Benutzernamen an.
  const buero = await (await browser.newContext()).newPage();
  await anmelden(buero, CHEFIN.email);
  await buero.goto('/user-mgmt');
  await buero.getByRole('button', { name: 'Neuer Benutzer' }).click();
  await buero.getByRole('textbox', { name: /^Name/ }).fill('Nora Neuling');
  await buero.getByLabel('Anmeldung mit').selectOption('benutzername');
  // Grossgeschrieben getippt — gespeichert wird klein.
  await buero.getByRole('textbox', { name: /Benutzername/ }).fill(name.toUpperCase());
  await buero.getByRole('button', { name: 'Benutzer anlegen' }).click();
  const start1 = await startpasswortLesen(buero);
  await expect(buero.getByText(name, { exact: true }).first()).toBeVisible();

  // 2. Nora meldet sich an und wird nach einem eigenen Passwort gefragt.
  const nora = await (await browser.newContext()).newPage();
  await mitNameAnmelden(nora, name, start1);
  await eigenesVergeben(nora, 'Noras-eigenes-1');
  await keineFehlermeldung(nora);

  // 3. Am nächsten Tag: das eigene Passwort, und KEINE Frage mehr.
  const morgen = await (await browser.newContext()).newPage();
  await mitNameAnmelden(morgen, name, 'Noras-eigenes-1');
  await expect(morgen.locator('nav').first()).toBeVisible({ timeout: 20_000 });
  await expect(morgen.getByRole('heading', { name: 'Willkommen' })).toHaveCount(0);

  // 4. „Passwort vergessen?" verspricht ihr keinen Link.
  const vergessen = await (await browser.newContext()).newPage();
  await vergessen.goto('/');
  await vergessen.getByRole('button', { name: 'Passwort vergessen?' }).click();
  await vergessen.getByLabel('E-Mail').fill(name);
  await vergessen.getByRole('button', { name: 'Link anfordern' }).click();
  await expect(vergessen.getByText(/keinen Link per E-Mail/)).toBeVisible();

  // 5. Die Chefin vergibt in der Akte ein neues Startpasswort.
  const { data } = await admin.from('users').select('id').eq('email', kunstadresse(name)).single();
  await buero.goto(`/user-mgmt/${data!.id}`);
  await expect(buero.getByRole('button', { name: /Passwort-Mail/ })).toHaveCount(0);
  await buero.getByRole('button', { name: 'Neues Startpasswort vergeben' }).click();
  await buero.getByRole('button', { name: 'Vergeben', exact: true }).click();
  const start2 = await startpasswortLesen(buero);
  await keineFehlermeldung(buero);

  // 6. Das eigene gilt nicht mehr; mit dem neuen fragt die App wieder.
  const danach = await (await browser.newContext()).newPage();
  await mitNameAnmelden(danach, name, 'Noras-eigenes-1');
  await expect(danach.getByText(/Anmeldung fehlgeschlagen/)).toBeVisible({ timeout: 20_000 });
  await mitNameAnmelden(danach, name, start2);

  // 7. Der Ausgang aus „Willkommen“ (Prüflauf L3): wer mit dem falschen Konto
  //    drin ist, kommt ohne Passwort wieder hinaus — und danach normal herein.
  await expect(danach.getByRole('heading', { name: 'Willkommen' })).toBeVisible({ timeout: 20_000 });
  await danach.getByRole('button', { name: 'Abmelden' }).click();
  await expect(danach.getByRole('button', { name: 'Anmelden' })).toBeVisible({ timeout: 20_000 });
  await mitNameAnmelden(danach, name, start2);
  await eigenesVergeben(danach, 'Noras-zweites-2');
});
