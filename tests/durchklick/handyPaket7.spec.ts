import { test, expect } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * Start, Zeit und Schein am Handy (Paket 7, E90) — im echten Browser bei
 * 390 px: die kompakte Karte, „Zeit von Hand eintragen“ statt des Knopfs
 * unten, das Formular der Zeiterfassung als Blatt, der Timer, der sofort
 * antwortet, und der Schein mit der Baustelle einmal und dem Entwurf in der
 * Leiste. Am Tablet (834 px) bleibt es, wie es war.
 */
async function aufraeumen() {
  await admin.from('zeitsitzungen').delete().eq('company_id', BETRIEB);
  await admin.from('companies').update({ modules: { 'zeiterfassung.timer': true } }).eq('id', BETRIEB);
}
test.beforeEach(aufraeumen);
test.afterEach(async () => {
  await admin.from('zeitsitzungen').delete().eq('company_id', BETRIEB);
  await admin.from('companies').update({ modules: {} }).eq('id', BETRIEB);
});

test('Handy: kompakte Karte, Zeit von Hand, Formular als Blatt, der Timer antwortet sofort', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Ein Handy-Weg — am Tablet prüft der nächste, dass es bleibt.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await anmelden(page, MONTEUR.email);

  const karte = page.getByRole('region', { name: 'Arbeitstag' });
  await karte.getByRole('button', { name: 'Arbeitstag starten', exact: true }).click();
  await expect(karte.getByText(/^Läuft seit \d\d:\d\d$/)).toBeVisible({ timeout: 15_000 });

  // D7: Uhr und Knöpfe in einer Zeile, der Papierkorb oben rechts in der Kopfzeile.
  const box = async (name: string) => (await karte.locator(name).boundingBox())!;
  const uhr = await box('.arbeitstag-uhr');
  const knoepfe = await box('.arbeitstag-knoepfe');
  const korb = await box('.arbeitstag-fuss');
  const stand = await box('.arbeitstag-stand');
  expect(Math.abs((knoepfe.y + knoepfe.height / 2) - (uhr.y + uhr.height / 2)), 'Knöpfe neben der Uhr').toBeLessThanOrEqual(12);
  expect(korb.y + korb.height / 2, 'Papierkorb in der Kopfzeile').toBeLessThan(uhr.y + 4);
  expect(korb.x, 'Papierkorb rechts').toBeGreaterThan(stand.x + 150);
  // Unten kein „Zeit erfassen“ — der Timer ist der Weg; von Hand geht es in der Karte.
  await expect(page.locator('.daumen').getByRole('link', { name: 'Zeit erfassen' })).toBeHidden();
  const hand = karte.getByRole('link', { name: /Zeit von Hand eintragen/ });
  await expect(hand).toBeVisible();
  await hand.click();

  // C6: die Zeiterfassung mit offenem Blatt; ohne es gleich die Einträge.
  await expect(page).toHaveURL(/\/time$/);
  const blatt = page.getByRole('dialog', { name: 'Neuer Eintrag' });
  await expect(blatt).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Escape');
  await expect(blatt).toBeHidden();
  await expect(page.locator('#zeit-formular')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Meine Einträge' })).toBeVisible();
  await page.getByRole('button', { name: 'Neuer Eintrag' }).click();
  await expect(blatt).toBeVisible();
  await page.keyboard.press('Escape');

  // C4: der Server antwortet drei Sekunden später — die Pause steht trotzdem sofort da.
  await page.route('**/rest/v1/rpc/zeit_timer_befehl', async (route) => {
    await new Promise((fertig) => setTimeout(fertig, 3_000));
    await route.continue();
  });
  const zeitKarte = page.getByRole('region', { name: 'Arbeitstag' });
  const getippt = Date.now();
  await zeitKarte.getByRole('button', { name: 'Pause beginnen' }).click();
  await expect(zeitKarte.getByText(/^Pause seit \d\d:\d\d$/)).toBeVisible({ timeout: 1_500 });
  expect(Date.now() - getippt, 'vor der Antwort des Servers').toBeLessThan(2_500);
  await expect(zeitKarte.getByRole('button', { name: 'Weiterarbeiten' })).toBeEnabled();
  // Danach gilt der Stand des Servers — und er ist derselbe.
  await expect(async () => {
    const { data } = await admin.from('zeitsitzungen').select('stand').eq('company_id', BETRIEB);
    expect((data ?? []).map((z) => z.stand)).toEqual(['pause']);
  }).toPass({ timeout: 15_000 });
  await expect(zeitKarte.getByText(/^Pause seit \d\d:\d\d$/)).toBeVisible();
  await keineFehlermeldung(page);
});

test('Handy: der Schein mit der Baustelle einmal und dem Entwurf in der Leiste', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Ein Handy-Weg.');
  await admin.from('companies').update({ modules: {} }).eq('id', BETRIEB);
  await page.setViewportSize({ width: 390, height: 844 });
  await anmelden(page, MONTEUR.email);
  await page.goto(`/worksheet?projekt=${encodeURIComponent(BAUSTELLE.nummer)}`);
  const aendern = page.getByRole('button', { name: 'Baustelle ändern' });
  await expect(aendern).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(BAUSTELLE.nummer, { exact: true })).toBeVisible();
  await expect(page.getByLabel('Baustelle', { exact: true })).toHaveCount(0);
  const entwurf = page.locator('.aktionsleiste').getByRole('button', { name: 'Als Entwurf speichern' });
  await expect(entwurf).toBeVisible();
  await expect(entwurf).toHaveText('Entwurf');
  // Kein Knopf der Leiste ist abgeschnitten (E82).
  expect(await page.locator('.aktionsleiste-knoepfe > *').evaluateAll((k) => k.filter((x) => x.scrollWidth > x.clientWidth + 1).length)).toBe(0);
  await aendern.click();
  await expect(page.getByLabel('Baustelle', { exact: true })).toBeVisible();
  await keineFehlermeldung(page);
});

test('Tablet: Karte, Zeiterfassung und Schein wie bisher', async ({ page }, info) => {
  test.skip(info.project.name !== 'tablet-834', 'Der Gegenweg am Tablet.');
  await anmelden(page, MONTEUR.email);
  const karte = page.getByRole('region', { name: 'Arbeitstag' });
  await karte.getByRole('button', { name: 'Arbeitstag starten', exact: true }).click();
  await expect(karte.getByText(/^Läuft seit \d\d:\d\d$/)).toBeVisible({ timeout: 15_000 });
  // V10 (13.11.2026): der Papierkorb steht wie am Handy oben rechts, über den Knöpfen; keine Zeile „Zeit von Hand“.
  const knoepfe = (await karte.locator('.arbeitstag-knoepfe').boundingBox())!;
  const korb = (await karte.locator('.arbeitstag-fuss').boundingBox())!;
  // Gemessen an der Mitte: die 44-px-Tastfläche des Papierkorbs ragt ein paar Pixel in die Höhe der Knöpfe.
  expect(korb.y + korb.height / 2).toBeLessThan(knoepfe.y);
  expect(korb.x + korb.width).toBeGreaterThanOrEqual(knoepfe.x + knoepfe.width - 1);
  await expect(karte.getByRole('link', { name: /Zeit von Hand eintragen/ })).toBeHidden();
  await page.goto('/time');
  await expect(page.locator('#zeit-formular')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Neuer Eintrag' })).toHaveCount(0);
  await page.goto(`/worksheet?projekt=${encodeURIComponent(BAUSTELLE.nummer)}`);
  await expect(page.getByLabel('Baustelle', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Baustelle ändern' })).toHaveCount(0);
  await keineFehlermeldung(page);
});
