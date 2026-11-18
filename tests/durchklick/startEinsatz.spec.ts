import { test, expect } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, CHEFIN, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/*
  EIN EINSATZ DER MANNSCHAFT ÖFFNET SEINE VORSCHAU (E98, Auftrag 18.11.2026):
  „wenn man im Dashboard auf die Einsätze klickt, sollte sich ein Modal mit
  den Einsatzdetails öffnen. Derzeit führt es einfach auf die Einsatzplanung
  (Tag), ohne dass dort ersichtlich ist, um welchen Einsatz es geht.“

  Gemessen gegen den örtlichen Stapel: ein Einsatz heute mit Uhrzeit und
  Aufgabe. Die Zeile öffnet ein Fenster mit genau diesen Angaben und bleibt
  auf der Startseite; Esc schließt und gibt den Fokus an die Zeile zurück; am
  Handy steht es als Blatt im Schleier; „Bearbeiten“ führt in die
  Tagesplanung mit dieser Baustelle gewählt.

  Gegenprobe: mit dem Stand vor E98 ist die Zeile ein Verweis auf
  `/assignments/tag`, es öffnet sich kein Fenster — jeder Test ist rot.
*/
const heute = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });
const AUFGABE = 'Heizkörper im Bad tauschen';

test.describe('Startseite: ein Einsatz öffnet seine Vorschau', () => {
  let einsatzId = '';
  test.beforeAll(async () => {
    const { data: monteur } = await admin.from('users').select('id').eq('email', MONTEUR.email).single();
    const neu = await admin.from('assignments').insert({
      company_id: BETRIEB, date: heute(), project_number: BAUSTELLE.nummer, user_id: monteur!.id, user_name: MONTEUR.name,
      zeit_von: '07:00', zeit_bis: '15:30', comment: AUFGABE,
    }).select('id').single();
    expect(neu.error).toBeNull();
    einsatzId = neu.data!.id;
  });
  test.afterAll(async () => {
    if (einsatzId) await admin.from('assignments').delete().eq('id', einsatzId);
  });

  const zeile = (page: import('@playwright/test').Page) =>
    page.getByRole('region', { name: 'Im Einsatz' }).getByRole('button', { name: new RegExp(BAUSTELLE.kunde) });

  test('am Schreibtisch: Fenster mit Zeit, Aufgabe und Eingeteilten, Esc schließt', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await anmelden(page, CHEFIN.email);
    await expect(page.getByRole('heading', { name: /Die Mannschaft heute/ })).toBeVisible({ timeout: 15_000 });
    await zeile(page).click();
    const fenster = page.getByRole('dialog');
    await expect(fenster).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    const abschnitt = fenster.getByRole('region', { name: new RegExp(`Einsatz .*\\(${BAUSTELLE.nummer}\\)`) });
    await expect(abschnitt).toContainText('07:00–15:30');
    await expect(abschnitt).toContainText(AUFGABE);
    await expect(abschnitt).toContainText(MONTEUR.name);
    // Die Adresse ist geladen (nicht „…“), und blättern gibt es hier nicht — die Startseite kennt nur heute.
    await expect(abschnitt.locator('.v-wert').nth(1)).not.toHaveText('…');
    await expect(fenster.getByRole('button', { name: 'Nächster Tag' })).toHaveCount(0);
    await expect(fenster.getByRole('link', { name: 'Baustelle öffnen' })).toBeVisible();
    // Ohne Schleier, an der Zeile: das Fenster liegt unter oder über ihr, nicht mitten im Bild.
    const z = (await zeile(page).boundingBox())!;
    const f = (await fenster.boundingBox())!;
    expect(f.y >= z.y + z.height || f.y + f.height <= z.y).toBe(true);
    await page.keyboard.press('Escape');
    await expect(fenster).toHaveCount(0);
    await expect(zeile(page)).toBeFocused();
    await keineFehlermeldung(page);
  });

  test('am Handy: ein Blatt im Schleier', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await anmelden(page, CHEFIN.email);
    await expect(page.getByRole('heading', { name: /Die Mannschaft heute/ })).toBeVisible({ timeout: 15_000 });
    await zeile(page).click();
    const fenster = page.getByRole('dialog');
    await expect(fenster).toHaveAttribute('aria-modal', 'true');
    await expect(fenster).toHaveClass(/vorschau-blatt/);
    await expect(fenster).toContainText(AUFGABE);
    await fenster.getByRole('button', { name: 'Vorschau schließen' }).click();
    await expect(fenster).toHaveCount(0);
  });

  test('„Bearbeiten“ führt in die Tagesplanung, die Baustelle gewählt', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await anmelden(page, CHEFIN.email);
    await expect(page.getByRole('heading', { name: /Die Mannschaft heute/ })).toBeVisible({ timeout: 15_000 });
    await zeile(page).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Bearbeiten' }).click();
    await expect(page).toHaveURL(/\/assignments\/tag/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByLabel('Baustelle', { exact: true })).toHaveValue(BAUSTELLE.nummer, { timeout: 15_000 });
  });
});
