import { test, expect } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, CHEFIN, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * TERMINE VON ANFANG BIS ENDE (Plan 10.4):
 *  - Die Leitung trägt in der Tagesplanung eine Lieferung mit Zeitfenster auf
 *    der Baustelle ein; der Monteur, der dort eingeteilt ist, sieht sie in
 *    „Mein Einsatzplan" — ohne Teilnehmer zu sein.
 *  - Die Leitung legt in der Kundenakte eine Besichtigung ohne Baustelle an,
 *    mit dem Monteur als Teilnehmer; er sieht sie auf der Startseite.
 */
const heute = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });

async function abraeumen() {
  await admin.from('termine').delete().eq('company_id', BETRIEB);
  await admin.from('assignments').delete().eq('company_id', BETRIEB).eq('date', heute());
}

test.beforeEach(abraeumen);
test.afterEach(abraeumen);

test('Lieferung in der Tagesplanung — der Eingeteilte sieht sie in seinem Plan', async ({ browser }) => {
  test.setTimeout(120_000);
  const { data: m } = await admin.from('users').select('id').eq('email', MONTEUR.email).single();
  const { error } = await admin.from('assignments').insert({
    company_id: BETRIEB, date: heute(), project_number: BAUSTELLE.nummer, user_id: m!.id, user_name: MONTEUR.name,
  });
  expect(error).toBeNull();

  // 1. Die Chefin trägt die Lieferung ein.
  const chefin = await (await browser.newContext()).newPage();
  await anmelden(chefin, CHEFIN.email);
  await chefin.goto('/assignments/tag');
  const karte = chefin.locator('section', { has: chefin.getByRole('heading', { name: /^Termine am/ }) });
  await expect(karte.getByText('Keine Termine an diesem Tag.')).toBeVisible({ timeout: 15_000 });
  await karte.getByRole('button', { name: 'Termin anlegen' }).click();
  // Seit der Linie „Lot“ steht das Formular im Seitenfenster (Regel 8).
  const fenster = chefin.getByRole('dialog', { name: 'Termin anlegen' });
  await fenster.getByLabel('Art').selectOption('Lieferung');
  await fenster.getByLabel('Zeitfenster von').fill('08:00');
  await fenster.getByLabel('Zeitfenster bis').fill('10:00');
  await fenster.getByRole('combobox', { name: /Baustelle/ }).selectOption(BAUSTELLE.nummer);
  await fenster.getByLabel('Notiz').fill('Wannen, zwei Paletten');
  await fenster.getByRole('button', { name: 'Termin anlegen' }).click();
  await expect(karte.getByText('Lieferung (Aviso) · 08:00–10:00')).toBeVisible({ timeout: 15_000 });
  await expect(karte.getByText(`${BAUSTELLE.kunde} · ${BAUSTELLE.nummer}`)).toBeVisible();
  await keineFehlermeldung(chefin);

  await expect(async () => {
    const { data } = await admin.from('termine').select('art, zeit_von, zeit_bis, project_number, teilnehmer').eq('company_id', BETRIEB);
    expect(data).toEqual([{ art: 'Lieferung', zeit_von: '08:00:00', zeit_bis: '10:00:00', project_number: BAUSTELLE.nummer, teilnehmer: [] }]);
  }).toPass({ timeout: 15_000 });

  // 2. Der Monteur sieht sie, weil er heute auf dieser Baustelle steht.
  const monteur = await (await browser.newContext()).newPage();
  await anmelden(monteur, MONTEUR.email);
  await monteur.goto('/my-schedule');
  const amTag = monteur.getByRole('region', { name: 'Termine an diesem Tag' });
  await expect(amTag.getByText('Lieferung (Aviso) · 08:00–10:00')).toBeVisible({ timeout: 15_000 });
  await expect(amTag.getByText('Wannen, zwei Paletten')).toBeVisible();
  await keineFehlermeldung(monteur);
});

test('Besichtigung beim Kunden — der Teilnehmer sieht sie auf der Startseite', async ({ browser }) => {
  test.setTimeout(120_000);
  const { data: k } = await admin.from('customers').select('id').eq('company_id', BETRIEB).eq('name', BAUSTELLE.kunde).single();

  const chefin = await (await browser.newContext()).newPage();
  await anmelden(chefin, CHEFIN.email);
  await chefin.goto(`/customers/${k!.id}`);
  await chefin.getByRole('tab', { name: 'Wartungen', exact: true }).click();
  const karte = chefin.locator('section', { has: chefin.getByRole('heading', { name: /^Termine/ }) });
  await karte.getByRole('button', { name: 'Termin anlegen' }).click({ timeout: 15_000 });
  const fenster = chefin.getByRole('dialog', { name: 'Termin anlegen' });
  await fenster.getByLabel('Art').selectOption('Besichtigung');
  await fenster.getByRole('radio', { name: 'Beim Kunden, ohne Baustelle' }).check();
  await fenster.getByRole('checkbox', { name: new RegExp(MONTEUR.name) }).check();
  await fenster.getByRole('button', { name: 'Termin anlegen' }).click();
  await expect(karte.getByText('Teilnehmer: Max Monteur')).toBeVisible({ timeout: 15_000 });
  await keineFehlermeldung(chefin);

  const monteur = await (await browser.newContext()).newPage();
  await anmelden(monteur, MONTEUR.email);
  const start = monteur.locator('section', { has: monteur.getByRole('heading', { name: /Deine Termine heute/ }) });
  await expect(start.getByText('Besichtigung', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(start.getByText(`${BAUSTELLE.kunde} (ohne Baustelle)`)).toBeVisible();
  // Kunden liest der Monteur nicht — die Adresse steht trotzdem da, antippbar.
  await expect(start.getByRole('link', { name: /Hauptstrasse 1, 1010 Wien/ })).toBeVisible();
  await keineFehlermeldung(monteur);
});

/*
  TERMIN ANLEGEN AUS WOCHE UND MONAT (20.10.2026): im ⋯ des Seitenkopfs,
  mit heute vorbelegt; im Monat zusätzlich in der Vorschau eines Tages.
  Vorher ging das am Schreibtisch nur über den Kopf eines Tages, im Monat
  gar nicht.
*/
test('Termin aus der Woche über das ⋯ des Seitenkopfs — und im Monat aus der Vorschau eines Tages', async ({ page }) => {
  test.setTimeout(120_000);
  await anmelden(page, CHEFIN.email);
  await page.goto('/assignments/woche');
  const raster = page.getByRole('table', { name: 'Wochenplan als Tabelle' });
  await expect(raster).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Weitere Aktionen für Einsatzplanung' }).click();
  await page.getByRole('menuitem', { name: 'Termin anlegen' }).click();
  const fenster = page.getByRole('dialog', { name: 'Termin anlegen' });
  await expect(fenster.getByLabel('Tag')).toHaveValue(heute());
  await fenster.getByLabel('Art').selectOption('Lieferung');
  await fenster.getByRole('combobox', { name: /Baustelle/ }).selectOption(BAUSTELLE.nummer);
  await fenster.getByRole('button', { name: 'Termin anlegen' }).click();
  await expect(fenster).toBeHidden({ timeout: 15_000 });
  // Der Kopf des Tages zählt ihn — die Woche hat neu geladen.
  await expect(raster.getByRole('button', { name: /1 Termin/ })).toBeVisible({ timeout: 15_000 });
  await expect(async () => {
    const { data } = await admin.from('termine').select('art, datum, project_number').eq('company_id', BETRIEB);
    expect(data).toEqual([{ art: 'Lieferung', datum: heute(), project_number: BAUSTELLE.nummer }]);
  }).toPass({ timeout: 15_000 });
  await keineFehlermeldung(page);

  // Im Monat: der Kopf von heute öffnet die Vorschau, dort „Termin anlegen“ für genau diesen Tag.
  await page.getByRole('group', { name: 'Zeitraum' }).getByRole('button', { name: 'Monat' }).click();
  await page.getByRole('button', { name: /heute, 1 Termin.*alle Einsätze des Tages/ }).click({ timeout: 15_000 });
  await page.getByRole('dialog').getByRole('button', { name: 'Termin anlegen' }).click();
  const imMonat = page.getByRole('dialog', { name: 'Termin anlegen' });
  await expect(imMonat.getByLabel('Tag')).toHaveValue(heute());
  await imMonat.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(imMonat).toBeHidden();
  await keineFehlermeldung(page);
});
