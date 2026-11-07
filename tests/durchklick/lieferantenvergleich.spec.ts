import { test, expect, type Page } from '@playwright/test';
import { admin, BETRIEB, CHEFIN } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * ZWEI GROSSHÄNDLER, DIESELBE NUMMER (M03a, E01–E03) — der ganze Weg im
 * Browser: zwei Kataloge einspielen, den offenen Lieferantenartikel
 * zuordnen, im Artikelblatt den Vergleich mit „günstigster“ sehen.
 *
 * Vorlage ist `katalogEinspielen.spec.ts`. Vor M03a überschrieb der zweite
 * Katalog den Artikel des ersten (Name „Kugelhahn Beta“, Preis 9,00) und es
 * gab weder „Offen zuzuordnen“ noch den Abschnitt „Lieferanten“ — dieser
 * Weg war dort rot.
 */

const ALPHA = ['V;01112026;Alpha Großhandel;EUR', 'A;N;LV-1;0;Kugelhahn;Alpha;2;0;Stk;1000;10;0'].join('\n');
const BETA = ['V;01112026;Beta Großhandel;EUR', 'A;N;LV-1;0;Kugelhahn;Beta;2;0;Stk;900;10;0'].join('\n');

async function einspielen(page: Page, lieferant: string, inhalt: string) {
  // Gibt es schon Lieferanten, steht die Auswahl da; „Neuen Lieferanten anlegen …“ ist der leere Wert.
  const auswahl = page.getByLabel('Lieferant', { exact: true });
  if (await auswahl.count()) await auswahl.selectOption('');
  await page.getByLabel('Name des Lieferanten').fill(lieferant);
  await page.getByLabel('DATANORM-Datei').setInputFiles({
    name: `${lieferant}.001`, mimeType: 'text/plain', buffer: Buffer.from(inhalt, 'utf-8'),
  });
  await expect(page.getByRole('heading', { name: 'Probelauf' })).toBeVisible();
  await page.getByRole('button', { name: /1 Artikel übernehmen/ }).click();
  await expect(page.getByRole('heading', { name: 'Übernommen', exact: true })).toBeVisible({ timeout: 30_000 });
}

test('Zwei Kataloge mit derselben Nummer: offen, zuordnen, günstigster im Artikelblatt', async ({ page }) => {
  await anmelden(page, CHEFIN.email);
  await page.goto('/lager');
  await page.getByRole('button', { name: 'Weitere Aktionen für Lager' }).first().click();
  await page.getByRole('menuitem', { name: 'Katalog einspielen' }).click();

  await einspielen(page, 'Alpha Großhandel', ALPHA);
  await page.getByRole('button', { name: 'Weiteren Katalog einspielen' }).click();
  await einspielen(page, 'Beta Großhandel', BETA);

  // Der zweite hat den Artikel des ersten nicht angefasst — er steht offen.
  await expect(page.getByText('Offen zuzuordnen')).toBeVisible();
  const { data: stamm } = await admin.from('materials').select('id, name').eq('company_id', BETRIEB).eq('article_number', 'LV-1');
  expect(stamm).toEqual([expect.objectContaining({ name: 'Kugelhahn Alpha' })]);

  // Offenen Lieferantenartikel zuordnen — zum Vorschlag „gleiche Nummer“.
  await page.getByRole('button', { name: 'Offene zuordnen' }).click();
  await expect(page).toHaveURL(/reiter=zuordnen/);
  await page.getByRole('button', { name: 'Kugelhahn Beta' }).click();
  const fenster = page.getByRole('dialog');
  // Weitere Vorschläge („ähnliche Bezeichnung“) dürfen dastehen — gewählt wird der mit gleicher Nummer.
  const gleicheNummer = fenster.getByRole('region', { name: 'Vorschläge' }).locator('li', { hasText: 'gleiche Nummer' });
  await expect(gleicheNummer).toHaveCount(1);
  await expect(gleicheNummer).toContainText('Kugelhahn Alpha');
  await gleicheNummer.getByRole('button', { name: 'Zuordnen' }).click();
  await expect(page.getByText(/Beta Großhandel LV-1 → Kugelhahn Alpha/)).toBeVisible();
  await keineFehlermeldung(page);

  const { data: la } = await admin.from('lieferantenartikel').select('material_id, zuordnung')
    .eq('company_id', BETRIEB).eq('lieferanten_nr', 'LV-1').order('zuordnung');
  expect(la).toEqual([
    { material_id: stamm![0].id, zuordnung: 'automatisch' },
    { material_id: stamm![0].id, zuordnung: 'bestaetigt' },
  ]);
  // Der Einkaufspreis ist der günstigste vergleichbare.
  const { data: ek } = await admin.from('material_einkaufspreise').select('einkaufspreis').eq('material_id', stamm![0].id).single();
  expect(ek).toEqual({ einkaufspreis: 9 });

  // Im Artikelblatt: der Vergleich mit „günstigster“.
  await page.getByRole('button', { name: 'Katalog', exact: true }).click();
  await page.locator('#msearch').fill('LV-1');
  await page.getByRole('button', { name: 'Kugelhahn Alpha' }).click();
  const lieferanten = page.getByRole('region', { name: 'Lieferanten' });
  await expect(lieferanten.getByText('Lieferanten (2)')).toBeVisible();
  const beta = lieferanten.locator('details', { hasText: 'Beta Großhandel' });
  await expect(beta.getByText('günstigster')).toBeVisible();
  await expect(lieferanten.locator('details', { hasText: 'Alpha Großhandel' }).getByText('günstigster')).toHaveCount(0);
  await keineFehlermeldung(page);
});
