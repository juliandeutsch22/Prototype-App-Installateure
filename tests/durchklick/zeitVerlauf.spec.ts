import { test, expect } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, BUERO, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * DAS ÄNDERUNGSPROTOKOLL DER ZEITBUCHUNGEN (E50) — durch die ganze Kette.
 *
 * Das Büro ändert eine Buchung des Monteurs und löscht eine zweite. Danach
 * steht im Fenster der Person, auf Klick, wer was geändert und was gelöscht
 * hat; und der Monteur sieht in seiner Zeiterfassung, auf Klick, was das
 * Büro an seinen Buchungen geändert hat. Zu Beginn ist alles zugeklappt.
 *
 * Gegenprobe: ohne die Migration und die Bausteine gibt es weder Protokoll
 * noch etwas aufzuklappen — rot.
 */
test('Änderungsprotokoll: das Büro ändert und löscht, beide sehen es auf Klick', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });

  const { data: person } = await admin.from('users').select('id').eq('email', MONTEUR.email).single();
  const uid = person!.id as string;
  const heute = new Date();
  const tag = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, '0')}-01`;
  await admin.from('time_entries').delete().eq('company_id', BETRIEB).eq('user_id', uid).eq('date', tag);
  const grund = { company_id: BETRIEB, user_id: uid, user_name: MONTEUR.name, date: tag, status: 'Anwesend', break_duration: 0, source: 'manual' };
  const bleibt = crypto.randomUUID();
  const geht = crypto.randomUUID();
  expect((await admin.from('time_entries').insert([
    { ...grund, id: bleibt, start_time: '07:00', end_time: '11:00', project_number: BAUSTELLE.nummer, customer_name: BAUSTELLE.kunde },
    { ...grund, id: geht, start_time: '12:00', end_time: '13:00', comment: 'Verlauf-Probe' },
  ])).error).toBeNull();

  // Das Büro: Ende der ersten Buchung ändern, die zweite löschen.
  await anmelden(page, BUERO.email);
  await page.goto(`/accounting?monat=${tag.slice(0, 7)}`);
  await page.getByText(MONTEUR.name).first().click();
  const fenster = page.getByRole('dialog');
  await expect(fenster).toBeVisible({ timeout: 20_000 });

  const protokoll = fenster.locator('details', { hasText: 'Änderungsprotokoll des Monats' });
  await expect(protokoll).not.toHaveAttribute('open', '');

  const zeileBleibt = fenster.locator('li', { hasText: '07:00–11:00' });
  await zeileBleibt.getByRole('button', { name: 'Bearbeiten' }).click();
  await page.getByLabel(/^Bis/).fill('10:00');
  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByLabel(/^Bis/)).toBeHidden({ timeout: 20_000 });

  // Das Fenster der Person bleibt nach dem Speichern offen.
  await expect(page.getByRole('dialog').locator('li', { hasText: '07:00–10:00' })).toBeVisible({ timeout: 20_000 });
  const zeileGeht = page.getByRole('dialog').locator('li', { hasText: '12:00–13:00' });
  await zeileGeht.getByRole('button', { name: 'Löschen' }).click();
  await page.getByRole('button', { name: /^Löschen$|^Eintrag löschen$|^Endgültig löschen$/ }).last().click();
  await expect(page.getByText('Eintrag gelöscht')).toBeVisible({ timeout: 20_000 });

  // Auf Klick: das Protokoll des Monats.
  const offen = page.getByRole('dialog').locator('details', { hasText: 'Änderungsprotokoll des Monats' });
  await offen.locator('summary').click();
  await expect(offen.getByText(`Geändert von ${BUERO.name}`)).toBeVisible({ timeout: 20_000 });
  await expect(offen.getByText('Ende 11:00 → 10:00')).toBeVisible();
  await expect(offen.getByText(`Gelöscht von ${BUERO.name}`).first()).toBeVisible();
  await expect(offen.getByText('Notiz Verlauf-Probe').first()).toBeVisible();
  await keineFehlermeldung(page);

  // Der Monteur: in seiner Zeiterfassung, auf Klick.
  await page.context().clearCookies();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await anmelden(page, MONTEUR.email);
  await page.goto('/time');
  const eigenes = page.locator('details', { hasText: 'Änderungsprotokoll deiner Buchungen' });
  await expect(eigenes).toBeVisible({ timeout: 20_000 });
  await expect(eigenes.getByText('Ende 11:00 → 10:00')).toBeHidden();
  await eigenes.locator('summary').click();
  await expect(eigenes.getByText(`Geändert von ${BUERO.name}`)).toBeVisible({ timeout: 20_000 });
  await expect(eigenes.getByText('Ende 11:00 → 10:00')).toBeVisible();
  await keineFehlermeldung(page);
});
