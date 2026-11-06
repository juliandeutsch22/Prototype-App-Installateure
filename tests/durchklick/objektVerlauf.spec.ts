import { test, expect } from '@playwright/test';
import { admin, BETRIEB, BUERO, CHEFIN } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * DER ÄNDERUNGSVERLAUF EINER AKTE (M01b) — durch die ganze Kette.
 *
 * Die Chefin ändert in der Kundenakte die Telefonnummer. Danach öffnet das
 * Büro (Buchhaltung, die Kunden lesen, aber nicht pflegen darf) dieselbe
 * Akte: unter „Kundendaten“ steht der Verlauf zugeklappt, und erst auf Klick
 * steht da, was die Chefin geändert hat — mit altem und neuem Wert.
 *
 * Ein eigener Kunde je Lauf: die übrigen Wege ändern „Familie Huber“, und
 * das Journal bleibt über Läufe hinweg stehen.
 *
 * Gegenprobe: ohne die Migration und den Baustein gibt es weder Journal
 * noch etwas aufzuklappen — rot.
 */
test('Änderungsverlauf: die Chefin ändert die Telefonnummer, das Büro sieht es in der Kundenakte auf Klick', async ({ page }) => {
  test.setTimeout(120_000);
  const marke = crypto.randomUUID().slice(0, 6);
  const alt = '0664 100 1000';
  const neu = `0664 200 ${marke.replace(/\D/g, '').padEnd(4, '7').slice(0, 4)}`;
  const { data: kunde, error } = await admin.from('customers').insert({
    company_id: BETRIEB, name: `Familie Verlauf ${marke}`, contact_phone: alt,
    strasse: 'Prüfgasse 2', plz: '1010', ort: 'Wien', kundenart: 'privat',
  }).select('id').single();
  expect(error).toBeNull();

  try {
    await anmelden(page, CHEFIN.email);
    await page.goto(`/customers/${kunde!.id}`);
    await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click({ timeout: 30_000 });
    const fenster = page.getByRole('dialog', { name: 'Kunde bearbeiten' });
    await fenster.getByLabel('Telefon', { exact: true }).fill(neu);
    await fenster.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(fenster).toBeHidden({ timeout: 20_000 });
    expect((await admin.from('customers').select('contact_phone').eq('id', kunde!.id).single()).data?.contact_phone).toBe(neu);

    await page.context().clearCookies();
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await anmelden(page, BUERO.email);
    await page.goto(`/customers/${kunde!.id}`);
    await page.getByRole('tab', { name: 'Stammdaten' }).click({ timeout: 30_000 });

    const verlauf = page.locator('#k-daten details', { hasText: 'Änderungsverlauf' });
    await expect(verlauf).toBeVisible();
    // Zu Beginn zu und nicht geladen.
    await expect(verlauf).not.toHaveAttribute('open', '');
    await expect(verlauf.locator('ol.lot')).toHaveCount(0);

    await verlauf.locator('summary').click();
    const eintrag = verlauf.locator('ol.lot > li', { hasText: `Telefon ${alt} → ${neu}` });
    await expect(eintrag).toHaveCount(1, { timeout: 20_000 });
    await expect(eintrag).toContainText(`Geändert von ${CHEFIN.name}`);
    // Der Kunde entstand vor dem Journal (hier: mit dem Dienstschlüssel) — die Ansicht sagt es.
    await expect(verlauf.getByText(/was davor geändert wurde, ist nicht bekannt/)).toBeVisible();
    await keineFehlermeldung(page);
  } finally {
    await admin.from('customers').delete().eq('id', kunde!.id);
  }
});
