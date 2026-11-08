import { test, expect, type Page } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, BUERO, CHEFIN, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung, menue } from './helfer';

/**
 * NACHRICHTEN, VON ANFANG BIS ENDE (M10/B09, E63) — in Chromium, auf dem
 * Telefon (WebKit) und auf dem Tablet (`MONTEUR_WEGE`).
 *
 *   1. Der Monteur schreibt dem Büro privat, das Büro antwortet, der Monteur
 *      liest die Antwort. Die Geschäftsführung sieht das Gespräch weder in
 *      ihren Nachrichten noch an der Akte des Monteurs.
 *   2. Das Büro schreibt mit einem Bild in den Thread der Baustelle; der
 *      Monteur, der im Team steht, liest Text und Bild.
 */
const BILD = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function uid(email: string): Promise<string> {
  const { data } = await admin.from('users').select('id').eq('company_id', BETRIEB).eq('email', email).single();
  return (data as { id: string }).id;
}

async function abraeumen() {
  const { data: anhaenge } = await admin.from('nachricht_anhaenge').select('eimer, pfad').eq('company_id', BETRIEB);
  for (const a of (anhaenge ?? []) as { eimer: string; pfad: string }[]) await admin.storage.from(a.eimer).remove([a.pfad]);
  await admin.from('nachricht_meldungen').delete().eq('company_id', BETRIEB);
  await admin.from('nachrichten_kanaele').delete().eq('company_id', BETRIEB);
  await admin.from('companies').update({ modules: {} }).eq('id', BETRIEB);
  await admin.from('projects').update({ assigned_employees: [] }).eq('company_id', BETRIEB).eq('project_number', BAUSTELLE.nummer);
}

test.beforeEach(async () => {
  await abraeumen();
  await admin.from('companies').update({ modules: { 'nachrichten.direktnachrichten': true } }).eq('id', BETRIEB);
});
test.afterEach(abraeumen);

async function senden(seite: Page, text: string) {
  const feld = seite.getByRole('textbox', { name: 'Nachricht' });
  await feld.fill(text);
  await seite.getByRole('button', { name: 'Senden' }).click();
  await expect(seite.getByRole('list', { name: 'Verlauf' }).getByText(text)).toBeVisible({ timeout: 15_000 });
  await expect(seite.getByText('wird gesendet')).toHaveCount(0, { timeout: 15_000 });
}

test('privat: Monteur schreibt dem Büro, das Büro antwortet — die Geschäftsführung sieht nichts', async ({ browser }) => {
  test.setTimeout(180_000);
  const geheim = `Zählerstand ${Date.now()}`;

  const monteur = await (await browser.newContext()).newPage();
  await anmelden(monteur, MONTEUR.email);
  await menue(monteur, 'Nachrichten');
  await expect(monteur.getByRole('heading', { name: 'Nachrichten', level: 1 })).toBeVisible();
  await monteur.getByRole('button', { name: 'Neue Nachricht' }).click();
  await monteur.getByRole('button', { name: 'An eine oder mehrere Personen …' }).click();
  await monteur.getByRole('button', { name: BUERO.name }).click();
  await monteur.getByRole('button', { name: /^Weiter/ }).click();
  await expect(monteur).toHaveURL(/\/nachrichten\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await senden(monteur, geheim);
  await keineFehlermeldung(monteur);

  const buero = await (await browser.newContext()).newPage();
  await anmelden(buero, BUERO.email);
  await menue(buero, 'Nachrichten');
  const zeile = buero.getByRole('link', { name: MONTEUR.name });
  await expect(zeile).toBeVisible({ timeout: 15_000 });
  await expect(zeile.locator('xpath=ancestor::li[1]')).toContainText('1 neu');
  await zeile.click();
  await expect(buero.getByRole('list', { name: 'Verlauf' }).getByText(geheim)).toBeVisible();
  await senden(buero, 'Danke, ist notiert.');

  await monteur.reload();
  await expect(monteur.getByRole('list', { name: 'Verlauf' }).getByText('Danke, ist notiert.')).toBeVisible({ timeout: 15_000 });

  // Die Geschäftsführung: kein Gespräch, an der Akte des Monteurs kein Inhalt.
  const chefin = await (await browser.newContext()).newPage();
  await anmelden(chefin, CHEFIN.email);
  await chefin.goto('/nachrichten');
  await expect(chefin.getByText('Noch kein Gespräch')).toBeVisible({ timeout: 15_000 });
  await chefin.goto(`/user-mgmt/${await uid(MONTEUR.email)}`);
  await expect(chefin.getByRole('heading', { name: MONTEUR.name })).toBeVisible({ timeout: 15_000 });
  await expect(chefin.getByText(geheim)).toHaveCount(0);
  await expect(chefin.getByRole('button', { name: 'Nachricht schreiben' })).toBeVisible();
});

test('Baustelle: das Büro schreibt mit Bild in den Thread, der Monteur im Team liest es', async ({ browser }) => {
  test.setTimeout(180_000);
  await admin.from('projects').update({ assigned_employees: [await uid(MONTEUR.email)] })
    .eq('company_id', BETRIEB).eq('project_number', BAUSTELLE.nummer);

  const buero = await (await browser.newContext()).newPage();
  await anmelden(buero, BUERO.email);
  await menue(buero, 'Nachrichten');
  await buero.getByRole('button', { name: 'Neue Nachricht' }).click();
  await buero.getByRole('button', { name: 'In den Thread einer Baustelle …' }).click();
  await buero.getByRole('button', { name: new RegExp(BAUSTELLE.nummer) }).click();
  await expect(buero).toHaveURL(/\/nachrichten\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await buero.locator('#nachricht-dateien').setInputFiles({ name: 'zaehler.png', mimeType: 'image/png', buffer: BILD });
  await expect(buero.getByText('zaehler.png')).toBeVisible();
  await senden(buero, 'Zähler fotografiert');
  await expect(buero.getByRole('img', { name: 'zaehler.png' })).toBeVisible({ timeout: 15_000 });
  await keineFehlermeldung(buero);

  const monteur = await (await browser.newContext()).newPage();
  await anmelden(monteur, MONTEUR.email);
  await menue(monteur, 'Nachrichten');
  await monteur.getByRole('link', { name: new RegExp(BAUSTELLE.nummer) }).click();
  await expect(monteur.getByRole('list', { name: 'Verlauf' }).getByText('Zähler fotografiert')).toBeVisible({ timeout: 15_000 });
  await expect(monteur.getByRole('img', { name: 'zaehler.png' })).toBeVisible({ timeout: 15_000 });
  await keineFehlermeldung(monteur);
});
