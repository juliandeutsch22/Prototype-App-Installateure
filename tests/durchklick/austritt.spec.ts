import { test, expect } from '@playwright/test';
import { admin, BETRIEB, CHEFIN } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * DAS AUSTRITTSDATUM VON ANFANG BIS ENDE (E87) — im echten Browser:
 *
 *   Die Chefin deaktiviert ein Konto in der Benutzerakte und nimmt den
 *   vorgeschlagenen letzten Arbeitstag (heute). In der Datenbank stehen
 *   danach beide Angaben; die Mitarbeiterübersicht nennt die Person
 *   „ausgetreten am …“ und zeigt im Fenster den Saldo des Monats — ohne
 *   Austrittsdatum stand dort nur „Gebucht im Monat“.
 */
const heute = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
const datumAT = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

async function person(): Promise<{ id: string; name: string }> {
  const name = `Anton Austritt ${crypto.randomUUID().slice(0, 4)}`;
  const { data, error } = await admin.auth.admin.createUser({
    email: `austritt-${crypto.randomUUID().slice(0, 8)}@durchklick.test`,
    password: `${crypto.randomUUID()}-Aa1!`,
    email_confirm: true,
    app_metadata: { company_id: BETRIEB, role: 'Mitarbeiter', active: true },
  });
  if (error) throw error;
  const { error: fehler } = await admin.from('users').upsert({
    id: data.user!.id, company_id: BETRIEB, name, email: data.user!.email, role: 'Mitarbeiter', active: true,
    eintritt: '2026-01-01', app_start_date: '2026-01-01', weekly_target_hours: 40, work_days: [1, 2, 3, 4, 5],
  });
  if (fehler) throw new Error(fehler.message);
  return { id: data.user!.id, name };
}

test('Deaktivieren mit dem letzten Arbeitstag: Soll und Saldo bis dahin in der Mitarbeiterübersicht', async ({ page }) => {
  test.setTimeout(90_000);
  const p = await person();
  await page.setViewportSize({ width: 1440, height: 900 });
  await anmelden(page, CHEFIN.email);

  await page.goto(`/user-mgmt/${p.id}`);
  await page.getByRole('tab', { name: 'Zugang und Rechte' }).click();
  await page.getByRole('button', { name: 'Konto deaktivieren' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Letzter Arbeitstag')).toHaveValue(heute());
  await dialog.getByRole('button', { name: 'Deaktivieren' }).click();
  await expect(page.getByText('Benutzer deaktiviert')).toBeVisible({ timeout: 15_000 });

  const { data } = await admin.from('users').select('active, austritt').eq('id', p.id).single();
  expect(data).toEqual({ active: false, austritt: heute() });

  await page.goto('/accounting');
  const zeile = page.getByRole('button', { name: new RegExp(p.name) }).first();
  await expect(zeile).toBeVisible({ timeout: 15_000 });
  // Die Tage vor dem Austritt zählen: ohne Buchung sind sie Lücken, und das Soll steht da statt „—“.
  const reihe = zeile.locator('xpath=..');
  await expect(reihe).toContainText(/Tage? ohne Buchung/);
  await expect(reihe).not.toContainText('—');
  await zeile.click();
  const fenster = page.getByRole('dialog', { name: new RegExp(p.name) });
  await expect(fenster.getByText('Saldo im Monat')).toBeVisible();
  await expect(fenster.getByText(new RegExp(`Ausgetreten am ${datumAT(heute()).replace(/\./g, '\\.')}`))).toBeVisible();
  await keineFehlermeldung(page);
});
