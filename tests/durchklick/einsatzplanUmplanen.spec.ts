import { test, expect, type Page } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, CHEFIN } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * UMPLANEN IM WOCHENPLAN (E88) — im echten Browser:
 *
 *   1. Schreibtisch: einen Einsatz mit der Maus auf einen anderen Tag einer
 *      anderen Person ziehen; die Datenbank hat ihn dort, „Rückgängig“ setzt
 *      ihn zurück. Mit Alt kopiert dasselbe Ziehen.
 *   2. Was nicht geht, springt nicht still: dieselbe Person zweimal auf der
 *      Baustelle — die Meldung nennt den Grund, nichts ändert sich.
 *   3. Tablet und Handy: langes Drücken hebt den Einsatz an und zeigt die
 *      Leiste; „Verschieben …“ öffnet das Fenster.
 *
 * Die Woche liegt im März 2027 (KW 10): ohne Feiertag und weit weg von
 * heute und morgen, wo sich sonst die Planänderung meldete (B6).
 */
const WOCHE = '2027-W10';
const MO = '2027-03-08';
const DI = '2027-03-09';
const MI = '2027-03-10';

async function person(name: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `umplanen-${crypto.randomUUID().slice(0, 8)}@durchklick.test`,
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
  return data.user!.id;
}

async function einsatz(uid: string, name: string, datum: string): Promise<string> {
  const { data, error } = await admin.from('assignments').insert({
    company_id: BETRIEB, date: datum, project_number: BAUSTELLE.nummer, user_id: uid, user_name: name, as_helper: false,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function zeilen(uids: string[]) {
  const { data } = await admin.from('assignments').select('id, date, user_id').in('user_id', uids).order('date');
  return data ?? [];
}

/** Die Zelle einer Person an einem Tag — dort, wo abgelegt wird. */
const zelle = (page: Page, uid: string, tag: string) => page.locator(`td[data-ziel-tag="${tag}"][data-ziel-person="${uid}"]`);
const block = (page: Page, uid: string, tag: string) => zelle(page, uid, tag).locator('.eintrag');

/** Mit der Maus ziehen, so wie ein Mensch: drücken, in Schritten bewegen, loslassen. */
async function ziehen(page: Page, von: { x: number; y: number }, nach: { x: number; y: number }, alt = false) {
  await page.mouse.move(von.x, von.y);
  await page.mouse.down();
  await page.mouse.move(von.x + 10, von.y + 4, { steps: 2 });
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.move(nach.x, nach.y, { steps: 8 });
  await page.mouse.up();
  if (alt) await page.keyboard.up('Alt');
}
const mitte = async (l: ReturnType<Page['locator']>) => {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

let anna: string;
let bert: string;

test.beforeAll(async () => {
  anna = await person(`Anna Umplan ${crypto.randomUUID().slice(0, 3)}`);
  bert = await person(`Bert Umplan ${crypto.randomUUID().slice(0, 3)}`);
});
test.afterEach(async () => {
  await admin.from('assignments').delete().in('user_id', [anna, bert]);
});
test.afterAll(async () => {
  await admin.from('users').update({ active: false }).in('id', [anna, bert]);
});

test('Schreibtisch: ziehen verschiebt, „Rückgängig“ setzt zurück, mit Alt wird kopiert', async ({ page }) => {
  test.setTimeout(90_000);
  const id = await einsatz(anna, 'Anna', MO);
  await page.setViewportSize({ width: 1440, height: 900 });
  await anmelden(page, CHEFIN.email);
  await page.goto(`/assignments/woche?woche=${WOCHE}`);
  await expect(block(page, anna, MO)).toBeVisible({ timeout: 15_000 });

  // Auf Dienstag bei Bert.
  await ziehen(page, await mitte(block(page, anna, MO)), await mitte(zelle(page, bert, DI)));
  await expect(page.getByText(/Familie Huber verschoben: Bert Umplan .*, Dienstag 09\.03\./)).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => zeilen([anna, bert])).toEqual([{ id, date: DI, user_id: bert }]);
  await expect(block(page, bert, DI)).toBeVisible();

  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect.poll(() => zeilen([anna, bert])).toEqual([{ id, date: MO, user_id: anna }]);
  await expect(block(page, anna, MO)).toBeVisible();

  // Mit Alt: kopiert auf Mittwoch, der Montag bleibt.
  await ziehen(page, await mitte(block(page, anna, MO)), await mitte(zelle(page, anna, MI)), true);
  await expect(page.getByText(/Familie Huber kopiert: Mittwoch 10\.03\./)).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => (await zeilen([anna])).map((z) => z.date)).toEqual([MO, MI]);
  await keineFehlermeldung(page);
});

test('was nicht geht, wird nicht still geschluckt: der Grund steht da, nichts ändert sich', async ({ page }) => {
  test.setTimeout(90_000);
  const id = await einsatz(anna, 'Anna', MO);
  await einsatz(anna, 'Anna', DI);
  await page.setViewportSize({ width: 1440, height: 900 });
  await anmelden(page, CHEFIN.email);
  await page.goto(`/assignments/woche?woche=${WOCHE}`);
  await expect(block(page, anna, MO)).toBeVisible({ timeout: 15_000 });
  await ziehen(page, await mitte(block(page, anna, MO)), await mitte(zelle(page, anna, DI)));
  await expect(page.getByText(/ist am 09\.03\.2027 schon auf dieser Baustelle/)).toBeVisible({ timeout: 10_000 });
  expect((await zeilen([anna])).find((z) => z.id === id)?.date).toBe(MO);
});

for (const [name, groesse] of [['Tablet', { width: 834, height: 1112 }], ['Handy', { width: 390, height: 844 }]] as const) {
  test(`${name}: langes Drücken zeigt die Leiste, „Verschieben …“ öffnet das Fenster`, async ({ page }) => {
    test.setTimeout(90_000);
    await einsatz(anna, 'Anna', MO);
    await page.setViewportSize(groesse);
    await anmelden(page, CHEFIN.email);
    await page.goto(`/assignments/woche?woche=${WOCHE}&tag=${MO}`);
    // Am Handy steht der Einsatz in der Tagesliste, am Tablet im Raster.
    const ziel = name === 'Handy'
      ? page.locator('.handy-woche .einsatz-halter').filter({ hasText: 'Familie Huber' }).first()
      : zelle(page, anna, MO).locator('.einsatz-halter');
    await expect(ziel).toBeVisible({ timeout: 15_000 });
    const knopf = ziel.locator('.eintrag');
    const { x, y } = await mitte(knopf);
    await knopf.dispatchEvent('pointerdown', { pointerType: 'touch', button: 0, isPrimary: true, clientX: x, clientY: y, pointerId: 7 });
    await page.waitForTimeout(700);
    await page.evaluate(([px, py]) => window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', clientX: px, clientY: py, pointerId: 7 })), [x, y]);
    await expect(ziel).toHaveAttribute('data-offen', '');
    // Nach dem Anheben öffnet ein Tipp nicht den Einsatz, sondern die Leiste bleibt.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await ziel.getByRole('button', { name: 'Verschieben …' }).click();
    await expect(page.getByRole('dialog', { name: 'Einsatz verschieben' })).toBeVisible();
    await keineFehlermeldung(page);
  });
}
