import { test, expect } from '@playwright/test';
import { admin, BETRIEB, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * DER ARBEITSTAG VON ANFANG BIS ENDE (Timer, 08.11.2026) — in Chromium, am
 * Telefon und auf dem Tablet (`MONTEUR_WEGE`):
 *
 *   Start auf der Startseite → die Leiste auf einer anderen Seite (am
 *   Telefon über der Reiterleiste, nicht darüber gelegt) → Pause aus der
 *   Leiste → zurück auf der Startseite in Pause → Feierabend → der Verweis
 *   führt zu „Abschnitte prüfen“ in der Zeiterfassung. Gebucht wird nichts.
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

test('Arbeitstag: Start auf der Startseite, Leiste unterwegs, Pause, Feierabend, Abschnitte prüfen', async ({ page }) => {
  test.setTimeout(120_000);
  const vorher = (await admin.from('time_entries').select('id').eq('company_id', BETRIEB)).data?.length ?? 0;
  await anmelden(page, MONTEUR.email);

  const karte = page.getByRole('region', { name: 'Arbeitstag' });
  await karte.getByRole('button', { name: 'Arbeitstag starten', exact: true }).click();
  await expect(karte.getByText(/^Läuft seit \d\d:\d\d$/)).toBeVisible({ timeout: 15_000 });
  await expect(karte.getByRole('button', { name: 'Pause beginnen' })).toBeVisible();

  // Unterwegs: die Leiste auf einer anderen Seite.
  await page.goto('/material');
  const leiste = page.getByRole('region', { name: 'Laufender Arbeitstag' }).locator('visible=true');
  await expect(leiste).toBeVisible({ timeout: 15_000 });
  const reiter = page.locator('nav.unten');
  if (await reiter.isVisible()) {
    // Am Telefon steht sie über der Reiterleiste — nicht darüber gelegt.
    const l = (await leiste.boundingBox())!;
    const r = (await reiter.boundingBox())!;
    expect(l.y + l.height).toBeLessThanOrEqual(r.y + 1);
  }
  await leiste.getByRole('button', { name: 'Pause beginnen' }).click();
  await expect(leiste.getByText('Pause', { exact: true })).toBeVisible({ timeout: 15_000 });

  // Zurück auf der Startseite: die Karte zeigt die Pause; die Leiste steht dort nicht.
  await page.goto('/');
  await expect(karte.getByText(/^Pause seit \d\d:\d\d$/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('region', { name: 'Laufender Arbeitstag' })).toHaveCount(0);
  await karte.getByRole('button', { name: 'Stoppen und prüfen' }).click();

  // Feierabend: der Verweis führt zu den Abschnitten; gebucht ist nichts.
  const verweis = karte.getByRole('link', { name: /wartet auf die Prüfung/ });
  await expect(verweis).toBeVisible({ timeout: 15_000 });
  expect((await admin.from('time_entries').select('id').eq('company_id', BETRIEB)).data?.length ?? 0).toBe(vorher);
  await verweis.click();
  await expect(page).toHaveURL(/\/time$/);
  await expect(page.getByRole('heading', { name: 'Abschnitte prüfen' })).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await keineFehlermeldung(page);
});
