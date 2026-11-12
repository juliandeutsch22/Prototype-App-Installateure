import { test, expect } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, CHEFIN, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * MEHRERE TAGE, KOPIEREN, MELDUNG (E85) — die Wege im echten Browser:
 *
 *   1. Die Chefin plant Max ab heute über eine Woche, nur Werktage: der
 *      erste Tag wie bisher, die Folgetage aus einem Aufruf. In der
 *      Datenbank stehen genau die gemeldeten Tage, kein Wochenende.
 *   2. „Auf den nächsten Werktag kopieren“ legt dieselbe Mannschaft dort an.
 *   3. Der Monteur findet in „Mein Konto“ den Schalter für den geänderten
 *      Einsatzplan, ab Werk an.
 */
const heute = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
const plusTage = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function maxId(): Promise<string> {
  const { data } = await admin.from('users').select('id').eq('company_id', BETRIEB).eq('email', MONTEUR.email).single();
  return (data as { id: string }).id;
}

async function aufraeumen() {
  await admin.from('assignments').delete().eq('company_id', BETRIEB).eq('user_id', await maxId())
    .gte('date', heute()).lte('date', plusTage(heute(), 14));
}
test.beforeEach(aufraeumen);
test.afterEach(aufraeumen);

async function geplanteTage(): Promise<string[]> {
  const { data } = await admin.from('assignments').select('date').eq('company_id', BETRIEB).eq('user_id', await maxId())
    .eq('project_number', BAUSTELLE.nummer).gte('date', heute()).order('date');
  return (data ?? []).map((a) => (a as { date: string }).date);
}

test('Über mehrere Tage: der erste Tag und die Werktage danach', async ({ page }) => {
  await anmelden(page, CHEFIN.email);
  await page.goto('/assignments/tag');
  const baustelle = page.getByLabel('Baustelle', { exact: true }).first();
  await expect(baustelle).toBeVisible({ timeout: 15_000 });
  await baustelle.selectOption(BAUSTELLE.nummer);
  await page.getByRole('checkbox', { name: new RegExp(`^${MONTEUR.name}`) }).check();
  await page.getByRole('checkbox', { name: 'Auch an den folgenden Tagen' }).check();
  await expect(page.getByRole('checkbox', { name: 'nur Werktage' })).toBeChecked();
  const bis = plusTage(heute(), 6);
  await page.getByLabel('bis einschließlich').fill(bis);
  await page.getByRole('button', { name: /speichern$/ }).first().click();

  const meldung = page.getByText(/dazu (ein weiterer Tag|\d+ weitere Tage)/);
  await expect(meldung).toBeVisible({ timeout: 15_000 });
  const tage = await geplanteTage();
  expect(tage[0]).toBe(heute());
  const weitere = tage.slice(1);
  const gemeldet = (await meldung.textContent())!.match(/(\d+) weitere/)?.[1] ?? '1';
  expect(weitere).toHaveLength(Number(gemeldet));
  for (const t of weitere) {
    expect(t > heute() && t <= bis).toBe(true);
    // Nur Werktage: kein Samstag, kein Sonntag.
    expect([0, 6]).not.toContain(new Date(`${t}T12:00:00Z`).getUTCDay());
  }
  await keineFehlermeldung(page);
});

test('Auf den nächsten Werktag kopieren', async ({ page }) => {
  expect((await admin.from('assignments').insert({
    company_id: BETRIEB, date: heute(), project_number: BAUSTELLE.nummer, user_id: await maxId(), user_name: MONTEUR.name,
    comment: 'Kopierprobe', zeit_von: '07:00',
  })).error).toBeNull();
  await anmelden(page, CHEFIN.email);
  await page.goto('/assignments/tag');
  const knopf = page.getByRole('button', { name: new RegExp(`\\(${BAUSTELLE.nummer}\\) auf .* kopieren`) });
  await expect(knopf).toBeVisible({ timeout: 15_000 });
  await knopf.click();
  await expect(page.getByText(/kopiert|war schon alles so geplant/).first()).toBeVisible({ timeout: 15_000 });
  const { data } = await admin.from('assignments').select('date, comment, zeit_von').eq('company_id', BETRIEB)
    .eq('user_id', await maxId()).gt('date', heute()).order('date');
  expect(data).toHaveLength(1);
  expect(data![0]).toMatchObject({ comment: 'Kopierprobe', zeit_von: '07:00:00' });
  expect([0, 6]).not.toContain(new Date(`${(data![0] as { date: string }).date}T12:00:00Z`).getUTCDay());
  await keineFehlermeldung(page);
});

test('Der Monteur schaltet die Meldung zum Einsatzplan in „Mein Konto“', async ({ page }) => {
  await anmelden(page, MONTEUR.email);
  await page.goto('/settings/meldungen');
  const schalter = page.getByRole('checkbox', { name: 'Geänderter Einsatzplan für heute und morgen' });
  await expect(schalter).toBeChecked({ timeout: 15_000 });
  await schalter.uncheck();
  await expect.poll(async () => {
    const { data } = await admin.from('user_prefs').select('notify_einsaetze').eq('user_id', await maxId()).maybeSingle();
    return (data as { notify_einsaetze: boolean } | null)?.notify_einsaetze;
  }, { timeout: 10_000 }).toBe(false);
  await schalter.check();
  await expect.poll(async () => {
    const { data } = await admin.from('user_prefs').select('notify_einsaetze').eq('user_id', await maxId()).maybeSingle();
    return (data as { notify_einsaetze: boolean } | null)?.notify_einsaetze;
  }, { timeout: 10_000 }).toBe(true);
});
