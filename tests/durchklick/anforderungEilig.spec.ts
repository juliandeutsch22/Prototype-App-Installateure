import { test, expect } from '@playwright/test';
import { admin, BETRIEB, CHEFIN, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

test('Büro markiert eine laufende Anforderung eilig und nimmt die Markierung zurück', async ({ page }) => {
  const monteur = await admin.from('users').select('id').eq('email', MONTEUR.email).single();
  expect(monteur.error).toBeNull();
  const id = crypto.randomUUID();
  expect((await admin.from('material_orders').insert({ id, company_id: BETRIEB,
    user_id: monteur.data!.id, user_name: MONTEUR.name, material_name: 'Eil-Prüfventil',
    quantity: 2, status: 'Offen', transaction_type: 'order', is_urgent: false })).error).toBeNull();
  try {
    await anmelden(page, CHEFIN.email);
    await page.goto('/anforderungen');
    await page.getByRole('button', { name: /^Eil-Prüfventil/ }).click();
    const fenster = page.getByRole('dialog', { name: 'Anforderung' });
    await fenster.getByRole('button', { name: 'Als eilig markieren' }).click();
    await expect(fenster.getByRole('button', { name: 'Eilmarkierung entfernen' })).toBeVisible();
    expect((await admin.from('material_orders').select('is_urgent,status,processed').eq('id', id).single()).data)
      .toEqual({ is_urgent: true, status: 'Offen', processed: false });
    await fenster.getByRole('button', { name: 'Eilmarkierung entfernen' }).click();
    await expect(fenster.getByRole('button', { name: 'Als eilig markieren' })).toBeVisible();
    expect((await admin.from('material_orders').select('is_urgent,status,processed').eq('id', id).single()).data)
      .toEqual({ is_urgent: false, status: 'Offen', processed: false });
    await keineFehlermeldung(page);
  } finally {
    expect((await admin.from('material_orders').delete().eq('id', id)).error).toBeNull();
  }
});
