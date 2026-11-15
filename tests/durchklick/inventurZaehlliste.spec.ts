import { test, expect } from '@playwright/test';
import { admin, BETRIEB, CHEFIN } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * INVENTUR ALS ZÄHLLISTE (Durchsicht 15.11.2026, F14) — im echten Browser
 * gegen die echte Datenbank, am Handy (390 px), Ende zu Ende:
 *
 * Lager → Reiter „Inventur“ → „Neue Zählliste“ für eine Warengruppe im
 * Hauptlager → zählen Zeile für Zeile („Weiter“ springt, jede Zahl sofort
 * gespeichert) → „Abweichungen buchen“ mit Soll, Gezählt und Bestand danach
 * → Buchen → Protokoll. Der Bestand und das Bewegungsprotokoll tragen die
 * Abweichung.
 *
 * Gegenprobe: vor F14 gibt es im Lager keinen Reiter „Inventur“
 * (Schritt 1 rot).
 */

const GRUPPE = 'Zählprobe F14';
const ROHR = 'Zählprobe Rohr';
const MUFFE = 'Zählprobe Muffe';

async function aufraeumen() {
  const { data: m } = await admin.from('materials').select('id').eq('company_id', BETRIEB).eq('warengruppe', GRUPPE);
  const ids = (m ?? []).map((x) => x.id as string);
  if (!ids.length) return;
  const { data: z } = await admin.from('inventur_zeilen').select('inventur_id').in('material_id', ids);
  const listen = [...new Set((z ?? []).map((x) => x.inventur_id as string))];
  if (listen.length) await admin.from('inventuren').delete().in('id', listen);
  await admin.from('lagerbewegungen').delete().in('material_id', ids);
  await admin.from('materials').delete().in('id', ids);
}
test.beforeEach(aufraeumen);
test.afterEach(aufraeumen);

test('Handy: Zählliste anlegen, zählen, Abweichungen buchen, Protokoll', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const { data: m, error } = await admin.from('materials').insert([
    { company_id: BETRIEB, name: ROHR, unit: 'Stk', lagerartikel: true, stock: 10, warengruppe: GRUPPE },
    { company_id: BETRIEB, name: MUFFE, unit: 'Stk', lagerartikel: true, stock: 4, warengruppe: GRUPPE },
  ]).select('id, name');
  expect(error).toBeNull();
  const rohr = m!.find((x) => x.name === ROHR)!.id as string;
  const muffe = m!.find((x) => x.name === MUFFE)!.id as string;

  await anmelden(page, CHEFIN.email);

  // 1. Lager → Inventur → neue Zählliste.
  await page.goto('/lager');
  await page.getByRole('group', { name: 'Bereich' }).getByRole('button', { name: /Inventur/ }).click();
  await expect(page).toHaveURL(/reiter=inventur/);
  await page.getByRole('button', { name: 'Neue Zählliste' }).click();
  const neu = page.getByRole('dialog', { name: 'Neue Zählliste' });
  await neu.getByLabel('Warengruppe (optional)').fill(GRUPPE);
  await neu.getByRole('button', { name: 'Zählliste anlegen' }).click();
  await expect(page.getByText('Zählliste mit 2 Artikeln angelegt.')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Zählliste' })).toBeVisible();

  // 2. Zählen am Handy: Zeile antippen, Zahl, „Weiter“.
  const feldMuffe = page.getByRole('textbox', { name: `${MUFFE}: gezählt in Stk` });
  const feldRohr = page.getByRole('textbox', { name: `${ROHR}: gezählt in Stk` });
  await page.getByText(MUFFE, { exact: true }).click();
  await expect(feldMuffe).toBeFocused();
  await feldMuffe.fill('4');
  await feldMuffe.press('Enter');
  await expect(feldRohr).toBeFocused();
  await feldRohr.fill('8');
  await feldRohr.press('Enter');
  await expect.poll(async () => (await admin.from('inventur_zeilen').select('gezaehlt').in('material_id', [rohr, muffe])).data?.filter((z) => z.gezaehlt != null).length, { timeout: 20_000 }).toBe(2);
  await keineFehlermeldung(page);

  // 3. Abweichungen prüfen und buchen.
  await page.getByRole('button', { name: 'Abweichungen buchen' }).click();
  const pruefen = page.getByRole('dialog', { name: 'Abweichungen buchen' });
  await expect(pruefen.getByText(/2 gezählt: 1 mit Abweichung, 1 stimmen/)).toBeVisible({ timeout: 20_000 });
  await expect(pruefen.getByText(new RegExp(`${ROHR} · Soll 10, gezählt 8 → −2 Stk · danach 8 Stk`))).toBeVisible();
  await pruefen.getByLabel(`Grund für ${ROHR} (optional)`).fill('Bruch');
  await pruefen.getByRole('button', { name: 'Buchen' }).click();
  await expect(page.getByText(/Inventur gebucht — 1 Abweichung im Bewegungsprotokoll/)).toBeVisible({ timeout: 20_000 });

  // 4. Das Protokoll; Bestand und Bewegungen.
  await expect(page.getByRole('heading', { level: 1, name: 'Inventurprotokoll' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('−2 Stk')).toBeVisible();
  expect(Number((await admin.from('materials').select('stock').eq('id', rohr).single()).data!.stock)).toBe(8);
  expect(Number((await admin.from('materials').select('stock').eq('id', muffe).single()).data!.stock)).toBe(4);
  const { data: bw } = await admin.from('lagerbewegungen').select('material_id, menge, grund').in('material_id', [rohr, muffe]).eq('art', 'inventur');
  expect(bw).toEqual(expect.arrayContaining([
    expect.objectContaining({ material_id: rohr, menge: -2, grund: 'Bruch' }),
    expect.objectContaining({ material_id: muffe, menge: 0 }),
  ]));
  await keineFehlermeldung(page);
});
