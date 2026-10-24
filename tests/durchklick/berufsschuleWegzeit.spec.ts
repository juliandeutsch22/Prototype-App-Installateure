import { test, expect } from '@playwright/test';
import { admin, BETRIEB, PASSWORT } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * Die Wegzeit Schule–Betrieb (A9, 24.10.2026; § 11 Abs 7 KJBG): ein
 * Lehrling trägt seine Berufsschule mit Unterricht und Weg ein, und beides
 * steht danach am Schultag in der Datenbank — der Weg, den die Prüfung der
 * Tagesgrenze liest. Die Rechnung selbst ist in `kjbgLageWegzeit.test.ts`
 * geprüft, die Anzeige in `TimeView.test.tsx`.
 *
 * Die Prüfung bringt den Lehrling selbst mit und räumt ihn danach ab.
 */

const LEHRLING = { email: 'lehrling-weg@durchklick.test', name: 'Luis Lehrling' };

/*
  EIN FESTER, GEWÖHNLICHER DIENSTAG. „Der nächste Werktag“ traf am
  24.10.2026 den 26.10. — Nationalfeiertag, also kein Arbeitstag, und die
  Datenbank trug zu Recht nichts ein. Vorausdatieren darf der Lehrling.
*/
const TAG = '2027-03-09';

async function abraeumen(): Promise<void> {
  const vorhanden = await admin.auth.admin.listUsers({ perPage: 1000 });
  const alt = vorhanden.data.users.find((u) => u.email === LEHRLING.email);
  if (!alt) return;
  await admin.from('time_entries').delete().eq('user_id', alt.id);
  await admin.from('users').delete().eq('id', alt.id);
  await admin.auth.admin.deleteUser(alt.id);
}

let uid = '';

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
    einstufung: 'lehrling', lehrbeginn: '2025-09-01', lehrzeit_monate: 36, work_days: [1, 2, 3, 4, 5],
  });
  if (person.error) throw new Error(person.error.message);
});

test.afterAll(abraeumen);

test('Lehrling trägt Berufsschule mit Unterricht und Weg ein — beides steht am Schultag', async ({ page }) => {
  const tag = TAG;
  await anmelden(page, LEHRLING.email);
  await page.goto('/time');
  await page.getByLabel('Status').selectOption('Berufsschule');
  await page.getByLabel('Datum').fill(tag);
  await page.getByLabel('Berufsschule bis').fill(tag);
  await page.getByLabel('Unterricht je Schultag (Std., optional)').fill('6');
  await page.getByLabel('Weg Schule–Betrieb je Schultag (Std., optional)').fill('0:45');
  await page.getByRole('button', { name: 'Berufsschule eintragen' }).click();

  await expect(async () => {
    const { data } = await admin.from('time_entries').select('date, status, unterricht_min, wegzeit_min').eq('user_id', uid);
    expect(data).toEqual([{ date: tag, status: 'Berufsschule', unterricht_min: 360, wegzeit_min: 45 }]);
  }).toPass({ timeout: 15_000 });
  await keineFehlermeldung(page);
});
