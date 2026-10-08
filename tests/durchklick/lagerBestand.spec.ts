import { test, expect } from '@playwright/test';
import { admin, PASSWORT } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

test('Lager liest alle geführten Artikel und die Reservierung hinter der alten API-Grenze', async ({ page }) => {
  const betrieb = 'durchklick-lagerbestand';
  const email = 'lagerbestand@durchklick.test';
  const selten = 'ffffffff-0900-4000-8000-000000001001';
  for (const t of ['material_orders', 'materials']) {
    expect((await admin.from(t).delete().eq('company_id', betrieb)).error).toBeNull();
  }
  const alt = (await admin.auth.admin.listUsers({ perPage: 1000 })).data.users.find((u) => u.email === email);
  if (alt) expect((await admin.auth.admin.deleteUser(alt.id)).error).toBeNull();
  expect((await admin.from('companies').delete().eq('id', betrieb)).error).toBeNull();
  expect((await admin.from('companies').insert({ id: betrieb, name: 'Lagerbetrieb' })).error).toBeNull();
  const u = await admin.auth.admin.createUser({ email, password: PASSWORT, email_confirm: true,
    app_metadata: { company_id: betrieb, role: 'Geschäftsführung', active: true } });
  expect(u.error).toBeNull();
  const uid = u.data.user!.id;
  try {
    expect((await admin.from('users').insert({ id: uid, company_id: betrieb, email,
      name: 'Lagerchefin', role: 'Geschäftsführung', active: true })).error).toBeNull();
    const lager = Array.from({ length: 1001 }, (_, i) => ({
      id: i === 1000 ? selten : crypto.randomUUID(), company_id: betrieb,
      name: i === 1000 ? 'Z-Seltenes Endventil' : `Lagerartikel ${i}`, unit: 'Stk',
      stock: 10, lagerartikel: true, mindestmenge: i === 1000 ? 7 : 1,
    }));
    const katalog = Array.from({ length: 2001 }, (_, i) => ({
      id: crypto.randomUUID(), company_id: betrieb, name: `Katalogartikel ${i}`, unit: 'Stk', stock: 0, lagerartikel: false,
    }));
    const artikel = [...katalog, ...lager];
    for (let ab = 0; ab < artikel.length; ab += 500) {
      expect((await admin.from('materials').insert(artikel.slice(ab, ab + 500))).error).toBeNull();
    }
    expect((await admin.from('material_orders').insert({
      id: crypto.randomUUID(), company_id: betrieb, material_id: selten,
      material_name: 'Z-Seltenes Endventil', quantity: 4, status: 'Abholbereit',
      transaction_type: 'order', beschaffung: 'lager', processed: false,
      user_id: uid, user_name: 'Lagerchefin',
    })).error).toBeNull();
    await anmelden(page, email);
    await expect(page.getByRole('link', { name: '1 Artikel unter Mindestmenge Z-Seltenes Endventil nachbestellen', exact: true })).toBeVisible();
    const antworten: Array<import('@playwright/test').Response> = [];
    page.on('response', (r) => {
      if (r.url().endsWith('/rest/v1/rpc/lager_frei') && r.request().postData()?.includes(selten)) antworten.push(r);
    });
    await page.goto('/lager');
    const zahl = page.locator('.kennzahl').filter({ has: page.getByText('Im Lager', { exact: true }) });
    await expect(zahl).toContainText('1000');
    await page.getByRole('button', { name: 'Weitere Artikel laden', exact: true }).click();
    await expect(zahl).toContainText('1001');
    await expect.poll(() => antworten.length).toBeGreaterThan(0);
    expect(antworten[0].status()).toBe(200);
    const serverstand = (await antworten[0].json() as Array<{ material_id: string; frei: number }>).find((z) => z.material_id === selten);
    expect(Number(serverstand?.frei)).toBe(6);
    await page.getByLabel('Suche', { exact: true }).fill('Z-Seltenes Endventil');
    await page.getByRole('button', { name: 'knapp', exact: true }).click();
    const zeile = page.getByRole('button', { name: /Z-Seltenes Endventil/ });
    await expect(zeile).toBeVisible();
    await zeile.click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Z-Seltenes Endventil' });
    await expect(dialog.locator('.fenster-zahl').filter({ has: page.locator('dt', { hasText: /^frei$/ }) }).locator('dd')).toHaveText('6');
    await expect(dialog.locator('.fenster-zahl').filter({ has: page.locator('dt', { hasText: /^reserviert$/ }) }).locator('dd')).toHaveText('4');
    expect((await admin.from('materials').select('stock').eq('id', selten).single()).data?.stock).toBe(10);
    await keineFehlermeldung(page);
  } finally {
    for (const t of ['material_orders', 'materials']) {
      expect((await admin.from(t).delete().eq('company_id', betrieb)).error).toBeNull();
    }
    expect((await admin.auth.admin.deleteUser(uid)).error).toBeNull();
    expect((await admin.from('companies').delete().eq('id', betrieb)).error).toBeNull();
  }
});
