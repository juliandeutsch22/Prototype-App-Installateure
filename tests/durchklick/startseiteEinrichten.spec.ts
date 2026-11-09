import { test, expect } from '@playwright/test';
import { admin, BETRIEB, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * DIE STARTSEITE SELBST EINRICHTEN (E68) — in Chromium, am Telefon und auf
 * dem Tablet (`MONTEUR_WEGE`):
 *
 *   ⋯ → „Startseite anpassen …“ → eine Zahl abwählen, ein Thema und den
 *   Tagesüberblick ausblenden → gespeichert, und nach dem Neuladen noch so
 *   (die Wahl liegt in der Datenbank, nicht im Gerät) → „Vorgabe
 *   wiederherstellen“ bringt alles zurück.
 */
async function aufraeumen() {
  await admin.from('startseite_wahl').delete().eq('company_id', BETRIEB);
}
test.beforeEach(aufraeumen);
test.afterEach(aufraeumen);

test('Startseite anpassen: Zahl abwählen, Bereich ausblenden, bleibt nach dem Neuladen, Vorgabe zurück', async ({ page }) => {
  test.setTimeout(120_000);
  await anmelden(page, MONTEUR.email);
  const urlaub = page.getByRole('link', { name: /^Resturlaub/ });
  await expect(urlaub).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Weitere Aktionen für Startseite' }).click();
  await page.getByRole('menuitem', { name: 'Startseite anpassen …' }).click();
  const bogen = page.getByRole('dialog', { name: 'Startseite anpassen' });
  await bogen.getByRole('checkbox', { name: 'Resturlaub', exact: true }).uncheck();
  await bogen.getByRole('checkbox', { name: 'Tagesüberblick: Einsatz, Termine, heute' }).uncheck();
  await bogen.getByRole('checkbox', { name: 'Tage ohne Buchung', exact: true }).uncheck();
  await bogen.getByRole('button', { name: 'Speichern' }).click();
  await expect(bogen).toBeHidden({ timeout: 15_000 });
  await expect(urlaub).toHaveCount(0);

  // In der Datenbank, nicht im Gerät: nach dem Neuladen gleich.
  await page.reload();
  await expect(page.locator('[data-geladen="ja"]')).toBeVisible({ timeout: 20_000 });
  await expect(urlaub).toHaveCount(0);
  const { data } = await admin.from('startseite_wahl').select('wahl').eq('company_id', BETRIEB);
  // Saldo bleibt gewählt (die Vorgabe des Monteurs ist Saldo und Resturlaub).
  expect(data?.[0]?.wahl).toEqual({ kennzahlen: ['saldo'], aus: ['bereich-tag', 'tage'] });

  await page.getByRole('button', { name: 'Weitere Aktionen für Startseite' }).click();
  await page.getByRole('menuitem', { name: 'Startseite anpassen …' }).click();
  await page.getByRole('dialog', { name: 'Startseite anpassen' }).getByRole('button', { name: 'Vorgabe wiederherstellen' }).click();
  await expect(urlaub).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await keineFehlermeldung(page);
});
