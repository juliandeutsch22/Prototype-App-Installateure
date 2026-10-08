import { test, expect } from '@playwright/test';
import { admin, PASSWORT } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

test('Serversuche findet alte Belege und der Einkauf zählt alle 251 Anforderungen', async ({ page }) => {
  const betrieb = 'durchklick-seiten';
  const email = 'seitenchef@durchklick.test';
  for (const tabelle of ['material_orders', 'quotes']) {
    expect((await admin.from(tabelle).delete().eq('company_id', betrieb)).error).toBeNull();
  }
  const alt = (await admin.auth.admin.listUsers({ perPage: 1000 })).data.users.find((u) => u.email === email);
  if (alt) expect((await admin.auth.admin.deleteUser(alt.id)).error).toBeNull();
  expect((await admin.from('companies').delete().eq('id', betrieb)).error).toBeNull();
  expect((await admin.from('companies').insert({ id: betrieb, name: 'Seitenbetrieb' })).error).toBeNull();
  const user = await admin.auth.admin.createUser({ email, password: PASSWORT, email_confirm: true,
    app_metadata: { company_id: betrieb, role: 'Geschäftsführung', active: true } });
  expect(user.error).toBeNull();
  const uid = user.data.user!.id;
  try {
    expect((await admin.from('users').insert({ id: uid, company_id: betrieb, email,
      name: 'Seitenchef', role: 'Geschäftsführung', active: true })).error).toBeNull();
    expect((await admin.from('quotes').insert(Array.from({ length: 151 }, (_, i) => ({
      company_id: betrieb, quote_number: `AN-2026-${i}`, customer_name: i === 150 ? 'Seltenes Altkonto' : `Kunde ${i}`,
      quote_date: '2026-01-01', valid_until: '2099-01-01', vat_rate: 0.2,
      status: 'Versendet', created_at: i === 150 ? '2020-01-01T08:00:00Z' : `2026-01-${String(1 + i % 28).padStart(2, '0')}T08:00:00Z`,
    })))).error).toBeNull();
    expect((await admin.from('material_orders').insert(Array.from({ length: 251 }, (_, i) => ({
      id: crypto.randomUUID(), company_id: betrieb, user_id: uid, user_name: 'Seitenchef',
      material_name: 'Archivventil', quantity: 1, status: 'Offen', transaction_type: 'order',
      beschaffung: 'einkauf', note: i === 250 ? 'Seltene alte Kommission' : null,
    })))).error).toBeNull();
    await anmelden(page, email);
    await page.goto('/quotes');
    await expect(page.getByRole('button', { name: 'Weitere Angebote laden' })).toBeVisible();
    await page.getByRole('button', { name: 'Weitere Angebote laden' }).click();
    await expect(page.getByText('100 von möglicherweise mehr geladen.')).toBeVisible();
    await page.getByLabel('Suche', { exact: true }).fill('Seltenes Altkonto');
    await expect(page.getByText('AN-2026-150', { exact: true })).toBeVisible();
    await page.goto('/anforderungen');
    await expect(page.getByRole('button', { name: 'Weitere Anforderungen laden' })).toBeVisible();
    await page.getByLabel('Suche', { exact: true }).fill('Seltene alte Kommission');
    await expect(page.getByText('Notiz: Seltene alte Kommission', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Suche', { exact: true })).toHaveValue('Seltene alte Kommission');
    await page.getByRole('button', { name: /^Einkauf/ }).click();
    await expect(page.getByText(/251 × Archivventil/)).toBeVisible();
    await keineFehlermeldung(page);
  } finally {
    for (const tabelle of ['material_orders', 'quotes']) {
      expect((await admin.from(tabelle).delete().eq('company_id', betrieb)).error).toBeNull();
    }
    expect((await admin.auth.admin.deleteUser(uid)).error).toBeNull();
    expect((await admin.from('companies').delete().eq('id', betrieb)).error).toBeNull();
  }
});
