import { test, expect } from '@playwright/test';
import { admin, BETRIEB, CHEFIN, MONTEUR, PASSWORT } from './aufbau';
import { anmelden } from './helfer';

/**
 * Die Korrigieren-Knöpfe eines Verstoßes gegen den Jugendschutz stehen ganz
 * im Bild (Stand 18, K3, 12.10.2026).
 *
 * Bei Tablet quer fiel es auf, es galt aber bei jeder Breite: hatte ein
 * Verstoß mehrere Buchungen, standen die Knöpfe „Buchung 06:00–07:20
 * korrigieren“ … in einer Zeile, die nie umbrach — ab dem dritten schnitt die
 * Karte ab, und wer die letzte Buchung korrigieren wollte, kam nicht hin.
 *
 * Die Daten bringt die Prüfung selbst mit: ein Lehrling unter 18 mit vier
 * Buchungen ohne Pause an einem Tag (5 Std. 20 Min. — über 4,5 Std. braucht
 * er 30 Min. Pause, § 15 KJBG). Danach räumt sie ab.
 *
 * Gegenprobe: mit `.grenz-rechts { flex: none }` (der Stand davor) ragen
 * Knöpfe über die Karte hinaus (rot). Gleich bleibt: ein Fall mit nur einem
 * Knopf („Begründen“ bei 7 Std. ohne Pause eines Erwachsenen) steht am
 * Schreibtisch wie bisher rechts neben dem Text.
 */

const LEHRLING = { email: 'lehrling@durchklick.test', name: 'Lea Lehrling' };
let uid = '';

/*
  GESTERN IN WIEN: Pausen prüft die App nur an abgeschlossenen Tagen — heute
  ist noch nicht vorbei. Liegt gestern im Vormonat, blättert die Prüfung zurück.
*/
const wien = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(d);
const heute = wien(new Date());
const tag = wien(new Date(Date.now() - 24 * 3600 * 1000));

async function abraeumen(): Promise<void> {
  const vorhanden = await admin.auth.admin.listUsers({ perPage: 1000 });
  const alt = vorhanden.data.users.find((u) => u.email === LEHRLING.email);
  if (!alt) return;
  await admin.from('time_entries').delete().eq('user_id', alt.id);
  await admin.from('geburtsdaten').delete().eq('user_id', alt.id);
  await admin.from('users').delete().eq('id', alt.id);
  await admin.auth.admin.deleteUser(alt.id);
}

test.beforeAll(async () => {
  await abraeumen();
  const { data, error } = await admin.auth.admin.createUser({
    email: LEHRLING.email, password: PASSWORT, email_confirm: true,
    app_metadata: { company_id: BETRIEB, role: 'Mitarbeiter', active: true },
  });
  if (error) throw error;
  uid = data.user!.id;
  const person = await admin.from('users').upsert({
    id: uid, company_id: BETRIEB, name: LEHRLING.name, email: LEHRLING.email, role: 'Mitarbeiter', active: true,
    einstufung: 'lehrling', lehrbeginn: '2025-09-01', lehrzeit_monate: 36,
  });
  if (person.error) throw new Error(person.error.message);
  // Fünfzehn Jahre: unter 18, solange es diese Prüfung gibt.
  const jahr = Number(heute.slice(0, 4)) - 15;
  const geb = await admin.from('geburtsdaten').insert({ user_id: uid, company_id: BETRIEB, geburtsdatum: `${jahr}-01-01` });
  if (geb.error) throw new Error(geb.error.message);
  const zeiten = [['06:00', '07:20'], ['07:20', '08:40'], ['08:40', '10:00'], ['10:00', '11:20']];
  const buchung = await admin.from('time_entries').insert(zeiten.map(([von, bis]) => ({
    id: crypto.randomUUID(), company_id: BETRIEB, user_id: uid, user_name: LEHRLING.name, date: tag, status: 'Anwesend',
    start_time: von, end_time: bis, break_duration: 0, hours: 1.33, source: 'manual',
  })));
  if (buchung.error) throw new Error(buchung.error.message);
  // Der Monteur: 7 Std. ohne Pause (über 6 Std. 30 Min., § 11 AZG) — ein Fall mit einem Knopf.
  const monteur = await admin.from('users').select('id').eq('email', MONTEUR.email).single();
  if (monteur.error) throw new Error(monteur.error.message);
  const lang = await admin.from('time_entries').insert({
    id: crypto.randomUUID(), company_id: BETRIEB, user_id: (monteur.data as { id: string }).id, user_name: MONTEUR.name,
    date: tag, status: 'Anwesend', start_time: '06:00', end_time: '13:00', break_duration: 0, hours: 7, source: 'manual',
  });
  if (lang.error) throw new Error(lang.error.message);
});

test.afterAll(async () => {
  await abraeumen();
  const monteur = await admin.from('users').select('id').eq('email', MONTEUR.email).single();
  if (monteur.data) await admin.from('time_entries').delete().eq('user_id', (monteur.data as { id: string }).id).eq('date', tag);
});

/*
  DREI BREITEN: Tablet quer (dort fiel es auf), Schreibtisch und Handy —
  abgeschnitten war es bei jeder.
*/
for (const [name, viewport] of [
  ['Schreibtisch', { width: 1280, height: 720 }],
  ['Tablet quer', { width: 1194, height: 834 }],
  ['Handy', { width: 390, height: 844 }],
] as const) {
  test.describe(name, () => {
    test.use({ viewport });
    test('jeder Korrigieren-Knopf eines Verstoßes steht ganz in seiner Karte', async ({ page }) => {
      await anmelden(page, CHEFIN.email);
      await page.goto('/accounting');
      if (tag.slice(0, 7) !== heute.slice(0, 7)) await page.getByRole('button', { name: 'Voriger Monat' }).click();
      const fall = page.locator('.grenz-fall', { hasText: LEHRLING.name }).filter({ hasText: 'Buchung 10:00–11:20 korrigieren' });
      await expect(fall).toBeVisible({ timeout: 30_000 });
      const knoepfe = fall.locator('.grenz-schritt');
      await expect(knoepfe).toHaveCount(4);
      const rand = (await fall.boundingBox())!;
      for (const knopf of await knoepfe.all()) {
        const k = (await knopf.boundingBox())!;
        expect(k.x + k.width, `„${await knopf.textContent()}“ ragt über die Karte`).toBeLessThanOrEqual(rand.x + rand.width + 1);
      }
      // Und der letzte lässt sich drücken: er öffnet die Buchung.
      await knoepfe.last().click();
      await expect(page.getByRole('dialog')).toBeVisible();
    });
  });
}

test('gleich geblieben: mit einem Knopf steht er am Schreibtisch rechts neben dem Text', async ({ page }) => {
  await anmelden(page, CHEFIN.email);
  await page.goto('/accounting');
  if (tag.slice(0, 7) !== heute.slice(0, 7)) await page.getByRole('button', { name: 'Voriger Monat' }).click();
  const fall = page.locator('.grenz-fall', { hasText: MONTEUR.name }).filter({ has: page.getByRole('button', { name: 'Begründen' }) }).first();
  await expect(fall).toBeVisible({ timeout: 30_000 });
  const text = (await fall.locator('.grenz-inhalt').boundingBox())!;
  const knopf = (await fall.locator('.grenz-rechts').boundingBox())!;
  expect(knopf.x, 'rechts neben dem Text').toBeGreaterThanOrEqual(text.x + text.width);
  expect(knopf.y, 'in derselben Zeile').toBeLessThan(text.y + text.height);
});
