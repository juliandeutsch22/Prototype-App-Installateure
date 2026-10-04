import { test, expect } from '@playwright/test';
import { admin, BETRIEB, BUERO, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * SONDERURLAUB VON ANFANG BIS ENDE (Plan 10.3): der Monteur beantragt ihn
 * zur eigenen Hochzeit, das Büro bestätigt, und die Tage stehen als
 * „Dienstverhinderung" im Zeitkonto — nicht als Urlaub.
 */
async function abraeumen() {
  // Zuerst die Tage, dann die Anträge: der Fremdschlüssel würde sie nur loslösen.
  await admin.from('time_entries').delete().eq('company_id', BETRIEB).not('freistellung_id', 'is', null);
  await admin.from('freistellungen').delete().eq('company_id', BETRIEB);
}

test.beforeEach(abraeumen);
// Auch danach: ein stehengebliebener Antrag hielte das Konto des Monteurs fest.
test.afterEach(abraeumen);

test('Sonderurlaub: beantragen, bestätigen, im Zeitkonto', async ({ browser }) => {
  test.setTimeout(120_000);

  // 1. Der Monteur beantragt.
  const monteur = await (await browser.newContext()).newPage();
  await anmelden(monteur, MONTEUR.email);
  await monteur.goto('/vacations');
  await monteur.getByLabel('Art').selectOption('dienstverhinderung');
  await monteur.getByLabel(/^Anlass/).selectOption('hochzeit');
  await monteur.getByLabel('Tag des Ereignisses').fill('2026-11-18');
  await monteur.getByLabel('Von').fill('2026-11-16');
  await monteur.getByLabel('Bis (einschließlich)').fill('2026-11-18');
  await expect(monteur.getByText(/3 Arbeitstage in diesem Zeitraum/)).toBeVisible();
  await monteur.getByRole('button', { name: 'Antrag einreichen' }).click();
  await expect(monteur.getByText('Mein Sonderurlaub')).toBeVisible({ timeout: 15_000 });

  await expect(async () => {
    const { data } = await admin.from('freistellungen').select('status, anlass').eq('company_id', BETRIEB);
    expect(data).toEqual([{ status: 'Beantragt', anlass: 'hochzeit' }]);
  }).toPass({ timeout: 15_000 });
  await keineFehlermeldung(monteur);

  // 2. Das Büro bestätigt.
  const buero = await (await browser.newContext()).newPage();
  await anmelden(buero, BUERO.email);
  await buero.goto('/vacations');
  const karte = buero.locator('section', { has: buero.getByRole('heading', { name: /Sonderurlaub bestätigen/ }) });
  await expect(karte.getByText(/Eigene Eheschließung/)).toBeVisible({ timeout: 15_000 });
  await karte.getByRole('button', { name: 'Bestätigen', exact: true }).click();
  await expect(buero.getByText(/Bestätigt — 3 Tage eingetragen/)).toBeVisible({ timeout: 15_000 });
  await keineFehlermeldung(buero);

  // 3. Im Zeitkonto: drei Tage Dienstverhinderung, kein Urlaub.
  await expect(async () => {
    const { data } = await admin.from('time_entries').select('date, status')
      .eq('company_id', BETRIEB).not('freistellung_id', 'is', null).order('date');
    expect(data).toEqual([
      { date: '2026-11-16', status: 'Dienstverhinderung' },
      { date: '2026-11-17', status: 'Dienstverhinderung' },
      { date: '2026-11-18', status: 'Dienstverhinderung' },
    ]);
  }).toPass({ timeout: 15_000 });
});
