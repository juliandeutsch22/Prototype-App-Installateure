import { test, expect } from './grund';
import { admin, BETRIEB, BUERO, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * Z1 (Durchsicht 15.11.2026): GENEHMIGTEN URLAUB EINER ANDEREN PERSON KÜRZEN.
 *
 * Bisher gab es „Zurücknehmen“ nur am eigenen Antrag; mit Buchhaltung und
 * Geschäftsführung als Entscheidenden (wie hier) ließ sich ein genehmigter
 * Urlaub gar nicht mehr ändern. Der Weg: das Büro genehmigt, kürzt über
 * „Genehmigt, noch nicht vorbei“, die Tage verlassen das Zeitkonto; der
 * Monteur öffnet über den Sprung (`?antrag=`) genau diesen Antrag und liest
 * die Kürzung im Verlauf.
 *
 * Gegenprobe: ohne Z1 gibt es die Liste nicht — der Weg bricht bei Schritt 2.
 */
async function abraeumen() {
  await admin.from('time_entries').delete().eq('company_id', BETRIEB).not('vacation_id', 'is', null);
  await admin.from('vacations').delete().eq('company_id', BETRIEB).is('betriebsurlaub_id', null);
}
test.beforeEach(abraeumen);
test.afterEach(abraeumen);

test('Urlaub: genehmigen, kürzen, im Zeitkonto und im Verlauf', async ({ browser }) => {
  test.setTimeout(150_000);
  const { data: person } = await admin.from('users').select('id').eq('company_id', BETRIEB).eq('email', MONTEUR.email).single();
  // Mo 1. – Fr 5. März 2027: fünf Arbeitstage, kein Feiertag.
  const { data: antrag, error } = await admin.from('vacations').insert({
    company_id: BETRIEB, user_id: person!.id, user_name: MONTEUR.name,
    von: '2027-03-01', bis: '2027-03-05', tage: 5, status: 'Beantragt', art: 'Urlaub',
  }).select('id').single();
  expect(error).toBeNull();

  // 1. Das Büro genehmigt.
  const buero = await (await browser.newContext()).newPage();
  await anmelden(buero, BUERO.email);
  await buero.goto('/vacations');
  const offene = buero.locator('#offene-antraege');
  await expect(offene.getByText(MONTEUR.name)).toBeVisible({ timeout: 15_000 });
  await offene.getByRole('button', { name: 'Genehmigen' }).click();
  await expect(buero.getByText(/Genehmigt — 5 Tage/)).toBeVisible({ timeout: 15_000 });

  // 2. „Genehmigt, noch nicht vorbei“: Antrag öffnen, kürzen — früher zurück.
  const liste = buero.locator('#genehmigt-offen');
  await liste.getByRole('button', { name: new RegExp(`${MONTEUR.name} – Antrag öffnen`) }).click();
  const fenster = buero.getByRole('dialog', { name: 'Urlaubsantrag' });
  await fenster.getByRole('button', { name: 'Kürzen' }).click();
  const dialog = buero.getByRole('dialog', { name: new RegExp(`Urlaub von ${MONTEUR.name} kürzen`) });
  await dialog.getByLabel('Ende (einschließlich)').fill('2027-03-03');
  await expect(dialog.getByText('Bleibt: 01.03.2027 – 03.03.2027.')).toBeVisible();
  await dialog.getByLabel(/Grund/).fill('Wird ab Donnerstag gebraucht');
  await dialog.getByRole('button', { name: 'Kürzen' }).click();
  await expect(buero.getByText(/Gekürzt — 2 Tage aus dem Zeitkonto entfernt/)).toBeVisible({ timeout: 15_000 });
  await keineFehlermeldung(buero);

  await expect(async () => {
    const { data: tage } = await admin.from('time_entries').select('date').eq('vacation_id', antrag!.id).order('date');
    expect((tage ?? []).map((t) => t.date)).toEqual(['2027-03-01', '2027-03-02', '2027-03-03']);
    const { data: a } = await admin.from('vacations').select('bis, tage, aenderungen').eq('id', antrag!.id).single();
    expect(a).toMatchObject({ bis: '2027-03-03', tage: 3 });
    expect(a!.aenderungen).toHaveLength(1);
  }).toPass({ timeout: 15_000 });

  // 3. Der Monteur: der Sprung öffnet genau diesen Antrag, die Kürzung steht im Verlauf.
  const monteur = await (await browser.newContext()).newPage();
  await anmelden(monteur, MONTEUR.email);
  await monteur.goto(`/vacations?antrag=${antrag!.id}`);
  const seinFenster = monteur.getByRole('dialog', { name: 'Urlaubsantrag' });
  await expect(seinFenster.getByText('Gekürzt')).toBeVisible({ timeout: 15_000 });
  await expect(seinFenster.getByText(/„Wird ab Donnerstag gebraucht“ · vorher 01\.03\.2027 – 05\.03\.2027/)).toBeVisible();
  // Er selbst entscheidet nicht — keine Handgriffe am genehmigten Antrag.
  await expect(seinFenster.getByRole('button', { name: 'Kürzen' })).toHaveCount(0);
  await keineFehlermeldung(monteur);
});
