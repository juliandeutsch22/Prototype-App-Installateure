import { test, expect } from './grund';
import { admin, BETRIEB, BUERO, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung, werktageVoraus } from './helfer';

// Eine kommende Woche statt fester Tage: der Monteur tritt bei jedem Lauf heute ein (`werktageVoraus`).
const W = werktageVoraus(2);

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
  await monteur.getByLabel('Tag des Ereignisses').fill(W.mi);
  await monteur.getByLabel('Von').fill(W.mo);
  await monteur.getByLabel('Bis (einschließlich)').fill(W.mi);
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
  const karte = buero.locator('section', { has: buero.getByRole('heading', { name: /Sonderurlaub und Arztbesuche bestätigen/ }) });
  await expect(karte.getByText(/Eigene Eheschließung/)).toBeVisible({ timeout: 15_000 });
  await karte.getByRole('button', { name: 'Bestätigen', exact: true }).click();
  /*
    DIE ERSTE MELDUNG NACH DEM KLICK, NICHT NUR DIE ERWARTETE (18.11.2026):
    im vollen Lauf scheiterte dieser Schritt mit „nicht gefunden“ — eine
    Meldung steht 3,5 s, gewartet wurden 15. Was stattdessen dastand, war
    danach nicht mehr zu sehen. Jetzt nennt der Fehlschlag den Text.
  */
  const meldung = buero.locator('.meldungen .meldung-text').first();
  await expect(meldung).toBeVisible({ timeout: 15_000 });
  await expect(meldung, 'die erste Meldung nach „Bestätigen“').toHaveText(/Bestätigt — 3 Tage eingetragen/);
  await keineFehlermeldung(buero);

  // 3. Im Zeitkonto: drei Tage Dienstverhinderung, kein Urlaub.
  await expect(async () => {
    const { data } = await admin.from('time_entries').select('date, status')
      .eq('company_id', BETRIEB).not('freistellung_id', 'is', null).order('date');
    expect(data).toEqual([
      { date: W.mo, status: 'Dienstverhinderung' },
      { date: W.di, status: 'Dienstverhinderung' },
      { date: W.mi, status: 'Dienstverhinderung' },
    ]);
  }).toPass({ timeout: 15_000 });
});
