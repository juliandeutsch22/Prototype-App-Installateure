import { test, expect } from '@playwright/test';
import { admin, BETRIEB, CHEFIN, MONTEUR, VORSCHLAG_ARTIKEL } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * MATERIALBEREITSCHAFT UND BESTELLVORSCHLÄGE (M04b; E13, E14, G03) — im
 * echten Browser gegen die echte Datenbank, der ganze Weg:
 *
 *  1. Die Chefin öffnet die Einkaufsliste: der Artikel unter der
 *     Mindestmenge steht als Vorschlag da, mit Menge bis zum Sollbestand in
 *     Schritten der Verpackungseinheit (2 da, Soll 12, Fünfer → 10).
 *  2. Sie übernimmt ihn: ein Posten auf der Einkaufsliste, nichts bestellt;
 *     der Vorschlag ist danach weg.
 *  3. Ein Einsatz heute braucht 20 davon: Woche, Tag und Formular sagen
 *     dasselbe — 2 aus dem Regal, 10 auf der Einkaufsliste, es fehlen 8.
 */

const NUMMER = 'B-2026-M04B';
const heute = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());

async function artikelId(): Promise<string> {
  const { data } = await admin.from('materials').select('id').eq('company_id', BETRIEB).eq('name', VORSCHLAG_ARTIKEL.name).single();
  return (data as { id: string }).id;
}

async function aufraeumen() {
  const id = await artikelId();
  await admin.from('einkauf_posten').delete().eq('company_id', BETRIEB).eq('material_id', id);
  await admin.from('einsatz_material').delete().eq('company_id', BETRIEB).eq('project_number', NUMMER);
  await admin.from('material_orders').delete().eq('company_id', BETRIEB).eq('project_number', NUMMER);
  await admin.from('assignments').delete().eq('company_id', BETRIEB).eq('project_number', NUMMER);
  await admin.from('projects').delete().eq('company_id', BETRIEB).eq('project_number', NUMMER);
}
test.beforeEach(aufraeumen);
test.afterEach(aufraeumen);

test('Vorschlag übernehmen, dann zeigen Woche, Tag und Formular dieselbe Fehlmenge', async ({ page }) => {
  test.setTimeout(180_000);
  const id = await artikelId();
  await anmelden(page, CHEFIN.email);

  // ---- 1. Der Vorschlag
  await page.goto('/anforderungen?reiter=einkauf');
  const unser = page.getByRole('checkbox', { name: `${VORSCHLAG_ARTIKEL.name} übernehmen` });
  // Erst wenn die Vorschläge da sind — vorher stünde dort die Ladeanzeige.
  await expect(unser).toBeChecked();
  const zeile = page.locator('li.zeile', { has: unser });
  await expect(zeile).toContainText('Frei 2 Stk, Mindestmenge 5 Stk · bis Sollbestand 12 Stk · in Schritten zu 5 Stk');
  await expect(zeile.getByLabel(/^Menge/)).toHaveValue('10');
  // Nur diesen übernehmen: was andere Durchläufe im Betrieb vorschlagen lassen, bleibt.
  for (const kasten of await page.getByRole('checkbox', { name: / übernehmen$/ }).all()) {
    if ((await kasten.getAttribute('aria-label')) !== `${VORSCHLAG_ARTIKEL.name} übernehmen`) await kasten.uncheck();
  }

  // ---- 2. Übernehmen — auf die Einkaufsliste, nicht bestellt
  await page.getByRole('button', { name: '1 Vorschlag übernehmen' }).click();
  await expect(page.getByText('1 Vorschlag auf die Einkaufsliste übernommen')).toBeVisible();
  await expect(unser).toHaveCount(0);
  await expect(page.locator('li.zeile', { hasText: `10 Stk × ${VORSCHLAG_ARTIKEL.name}` })).toBeVisible();
  const { data: posten } = await admin.from('einkauf_posten').select('menge, bestellt_am').eq('material_id', id);
  expect((posten as { menge: number; bestellt_am: string | null }[]).map((p) => [Number(p.menge), p.bestellt_am])).toEqual([[10, null]]);

  // ---- 3. Ein Einsatz heute mit 20 davon
  const { data: monteur } = await admin.from('users').select('id').eq('company_id', BETRIEB).eq('email', MONTEUR.email).single();
  const monteurId = (monteur as { id: string }).id;
  expect((await admin.from('projects').insert({
    company_id: BETRIEB, project_number: NUMMER, description: 'Heizraum', customer_name: 'Familie Berger', status: 'Aktiv',
  })).error).toBeNull();
  expect((await admin.from('assignments').insert({
    company_id: BETRIEB, date: heute(), project_number: NUMMER, user_id: monteurId, user_name: MONTEUR.name,
  })).error).toBeNull();
  const { data: kopf, error: kopfFehler } = await admin.from('einsatz_material').insert({
    company_id: BETRIEB, date: heute(), project_number: NUMMER, uids: [monteurId], geladen: {},
  }).select('id').single();
  expect(kopfFehler).toBeNull();
  expect((await admin.from('einsatz_material_positionen').insert({
    id: 'm04b-p1', company_id: BETRIEB, einsatz_material_id: (kopf as { id: string }).id, position: 0,
    material_id: id, name: VORSCHLAG_ARTIKEL.name, menge: 20, einheit: VORSCHLAG_ARTIKEL.einheit,
  })).error).toBeNull();

  // Woche: der Einsatz trägt den Zustand als Text.
  await page.goto('/assignments');
  const einsatz = page.getByRole('button', { name: new RegExp(`\\(${NUMMER}\\) am .* bearbeiten – ${MONTEUR.name}.*Material fehlt: 1 Position`) }).first();
  await expect(einsatz).toBeVisible();
  await expect(einsatz).toContainText('Material fehlt: 1 Position');

  // Tag: der Kopf des Tages öffnet das Seitenfenster mit derselben Aussage.
  await page.locator('th[aria-current="date"]').getByRole('button').click();
  const tagFenster = page.getByRole('dialog');
  await expect(tagFenster.getByText('Material fehlt bei 1 Einsatz')).toBeVisible();
  await expect(tagFenster.getByText('Material fehlt: 1 Position')).toBeVisible();
  await tagFenster.getByRole('button', { name: new RegExp(`\\(${NUMMER}\\) bearbeiten$`) }).click();

  // Formular: dieselbe Rechnung je Position — 2 aus dem Regal, 10 auf der Liste, es fehlen 8.
  const formular = page.getByRole('dialog', { name: 'Einsatz bearbeiten' });
  await expect(formular.getByText('fehlt 8')).toBeVisible();
  await expect(formular.getByText(/für diese Liste frei: 2/)).toBeVisible();
  await expect(formular.getByText(/Im Lager fehlen/)).toContainText('Im Lager fehlen 18');
  await expect(formular.getByRole('button', { name: 'Anforderung über 8 anlegen' })).toBeVisible();

  await keineFehlermeldung(page);
});
