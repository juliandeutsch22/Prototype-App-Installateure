import { test, expect } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

test('Eine im Browser geänderte und gelöschte Buchung bleibt im Protokoll nachvollziehbar', async ({ page }) => {
  const monteur = await admin.from('users').select('id').eq('email', MONTEUR.email).single();
  expect(monteur.error).toBeNull();
  const id = crypto.randomUUID();
  expect((await admin.from('time_entries').insert({ id, company_id: BETRIEB, user_id: monteur.data!.id,
    user_name: MONTEUR.name, date: '2026-10-07', status: 'Anwesend', start_time: '07:00', end_time: '16:00',
    break_duration: 30, project_number: BAUSTELLE.nummer, comment: 'Journal-Prüfbuchung' })).error).toBeNull();
  try {
    await anmelden(page, MONTEUR.email);
    await page.goto('/time');
    await page.getByRole('button', { name: /07\.10\.2026.*bearbeiten/ }).click();
    await page.getByLabel(/^Bis/).fill('17:00');
    await page.getByRole('button', { name: 'Änderungen speichern' }).click();
    await expect(async () => {
      expect((await admin.from('time_entries').select('end_time').eq('id', id).single()).data?.end_time).toBe('17:00:00');
    }).toPass();
    const zeile = page.getByRole('button', { name: /07\.10\.2026.*bearbeiten/ }).locator('xpath=ancestor::li[1]');
    await zeile.getByRole('button', { name: 'Löschen', exact: true }).click();
    await page.getByRole('dialog', { name: 'Eintrag löschen?' }).getByRole('button', { name: /löschen|bestätigen/i }).click();
    await expect(page.getByText('Eintrag gelöscht', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Weitere Aktionen für Zeiterfassung' }).click();
    await page.getByRole('menuitem', { name: 'Änderungsprotokoll' }).click();
    const journal = page.getByRole('dialog', { name: 'Änderungsprotokoll' });
    await expect(journal.getByText('16:00 → 17:00')).toBeVisible();
    await expect(journal.getByText(/07.10.2026 · Gelöscht/)).toBeVisible();
    await expect(journal.getByText(/Max Monteur/).first()).toBeVisible();
    expect((await admin.from('zeitbuchungs_aenderungen').select('art,durch').eq('entry_id', id)).data)
      .toEqual(expect.arrayContaining([
        { art: 'geaendert', durch: monteur.data!.id }, { art: 'geloescht', durch: monteur.data!.id },
      ]));
    await keineFehlermeldung(page);
  } finally {
    expect((await admin.from('time_entries').delete().eq('id', id)).error).toBeNull();
    expect((await admin.from('zeitbuchungs_aenderungen').delete().eq('entry_id', id)).error).toBeNull();
  }
});
