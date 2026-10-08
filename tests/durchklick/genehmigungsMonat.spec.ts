import { test, expect } from '@playwright/test';
import { admin, BETRIEB, CHEFIN, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

test('Eine Genehmigung erscheint mit der richtigen Person in der Monatsübersicht', async ({ page }) => {
  const mitarbeiter = await admin.from('users').select('id').eq('email', MONTEUR.email).single();
  expect(mitarbeiter.error).toBeNull();
  const antrag = await admin.from('vacations').insert({ company_id: BETRIEB,
    user_id: mitarbeiter.data!.id, user_name: MONTEUR.name, von: '2026-10-09', bis: '2026-10-09',
    tage: 1, status: 'Beantragt', art: 'Urlaub',
  }).select('id').single();
  expect(antrag.error).toBeNull();
  try {
    await anmelden(page, CHEFIN.email);
    await page.goto('/vacations');
    await expect(page.getByRole('heading', { name: 'Monatsübersicht' })).toBeVisible();
    await page.getByRole('button', { name: 'Genehmigen', exact: true }).click();
    await expect(async () => {
      expect((await admin.from('vacations').select('status').eq('id', antrag.data!.id).single()).data?.status).toBe('Genehmigt');
    }).toPass();
    await page.getByRole('button', { name: /\b9\. Oktober.*1 Person abwesend/ }).click();
    const liste = page.getByRole('list', { name: 'Abwesend am 2026-10-09' });
    await expect(liste.getByText(MONTEUR.name, { exact: true })).toBeVisible();
    await expect(liste).toContainText('Urlaub');
    await keineFehlermeldung(page);
  } finally {
    expect((await admin.from('time_entries').delete().eq('vacation_id', antrag.data!.id)).error).toBeNull();
    expect((await admin.from('vacations').delete().eq('id', antrag.data!.id)).error).toBeNull();
  }
});
