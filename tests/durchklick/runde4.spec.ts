import { test, expect } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, CHEFIN, MONTEUR, PASSWORT } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * RUNDE 4 VON ANFANG BIS ENDE (Auftrag Abschnitt 8, Browser-Wege):
 *  1. Mitarbeiterübersicht: ein Tag ohne Buchung im Streifen → Seitenfenster
 *     der Person → „Zeit erfassen“ an diesem Tag → speichern → der Tag ist
 *     gebucht.
 *  3. Einsatzplanung, Woche: Termin-Eintrag in der Zelle des Teilnehmers →
 *     „Termin ändern“ → Zeit ändern → speichern → der Eintrag zeigt sie.
 *  6. Monat: Tag → Vorschau → „Zur Woche“ → richtige Woche, Tag markiert,
 *     „Zurück“ führt in den Monat.
 *
 * EINE EIGENE PERSON FÜR DIE ÜBERSICHT. Tage ohne Buchung gibt es nur mit
 * Eintrittsdatum; das am Monteur zu setzen, änderte, was die anderen Wege
 * von ihm sehen (Saldo, Startseite). Die Person wird hier angelegt und am
 * Ende wieder entfernt.
 */
const heute = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });

/** Der Vormonat als JJJJ-MM: er hat immer vergangene Arbeitstage, auch am Monatsersten. */
function vormonat(): string {
  const [j, m] = heute().split('-').map(Number);
  const d = new Date(j, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const RITA = { email: 'rita@durchklick.test', name: 'Rita Runde' };

async function ritaEntfernen(): Promise<void> {
  const { data } = await admin.from('users').select('id').eq('email', RITA.email).maybeSingle();
  if (!data) return;
  await admin.from('time_entries').delete().eq('company_id', BETRIEB).eq('user_id', data.id);
  await admin.from('users').delete().eq('id', data.id);
  await admin.auth.admin.deleteUser(data.id);
}

test.describe('Mitarbeiterübersicht', () => {
  test.beforeAll(async () => {
    await ritaEntfernen();
    const { data, error } = await admin.auth.admin.createUser({
      email: RITA.email,
      password: PASSWORT,
      email_confirm: true,
      app_metadata: { company_id: BETRIEB, role: 'Mitarbeiter', active: true },
    });
    if (error) throw error;
    const { error: fehler } = await admin.from('users').upsert({
      id: data.user!.id, company_id: BETRIEB, name: RITA.name, email: RITA.email, role: 'Mitarbeiter', active: true,
      app_start_date: '2026-01-01', work_days: [1, 2, 3, 4, 5], weekly_target_hours: 38.5,
    });
    if (fehler) throw new Error(fehler.message);
  });
  test.afterAll(ritaEntfernen);

  test('Tag ohne Buchung → Seitenfenster → Zeit erfassen → der Tag ist gebucht', async ({ page }) => {
    test.setTimeout(120_000);
    await anmelden(page, CHEFIN.email);
    await page.goto(`/accounting?monat=${vormonat()}`);

    const streifen = page.getByRole('group', { name: `${RITA.name}, Tage des Monats` });
    const offen = streifen.getByRole('button', { name: /keine Buchung/ });
    await expect(offen.first()).toBeVisible({ timeout: 20_000 });
    const vorher = await offen.count();
    await offen.first().click();

    const fenster = page.getByRole('dialog', { name: new RegExp(`^${RITA.name}, `) });
    const tage = fenster.getByRole('region', { name: 'Arbeitstage ohne Buchung' });
    const knopf = tage.getByRole('button', { name: /^Zeit erfassen für / }).first();
    const tagText = ((await knopf.getAttribute('aria-label')) ?? '').replace('Zeit erfassen für ', '');
    await knopf.click();

    // Dasselbe Formular wie die Hauptaktion, mit Person und Tag vorbelegt.
    const form = page.getByRole('dialog', { name: 'Zeit erfassen' });
    await expect(form.getByRole('heading', { name: `Zeit für ${RITA.name} erfassen` })).toBeVisible();
    await form.getByLabel('Baustelle').selectOption(BAUSTELLE.nummer);
    await form.getByLabel(/^Von/).fill('07:00');
    await form.getByLabel(/^Bis/).fill('15:30');
    await form.getByLabel(/Pause/).fill('30');
    await form.getByRole('button', { name: /^(Zeit buchen|Speichern|Buchen)$/ }).click();

    // Der Tag ist gebucht, der Zähler sinkt um eins.
    await expect(streifen.getByRole('button', { name: /keine Buchung/ })).toHaveCount(vorher - 1, { timeout: 20_000 });
    await expect(streifen.getByRole('button', { name: new RegExp(`${tagText}.*8:00 Std\\.`) })).toBeVisible();
    await keineFehlermeldung(page);
  });
});

test.describe('Einsatzplanung', () => {
  async function abraeumen() {
    await admin.from('termine').delete().eq('company_id', BETRIEB);
    await admin.from('assignments').delete().eq('company_id', BETRIEB).eq('date', heute());
  }
  test.beforeEach(abraeumen);
  test.afterEach(abraeumen);

  async function monteurId(): Promise<string> {
    const { data } = await admin.from('users').select('id').eq('email', MONTEUR.email).single();
    return data!.id as string;
  }

  test('Termin-Eintrag in der Woche → Termin ändern → neue Zeit steht im Eintrag', async ({ page }) => {
    test.setTimeout(120_000);
    const m = await monteurId();
    const { error } = await admin.from('termine').insert({
      company_id: BETRIEB, art: 'Lieferung', datum: heute(), zeit_von: '08:00', zeit_bis: '10:00',
      project_number: BAUSTELLE.nummer, teilnehmer: [m],
    });
    expect(error).toBeNull();

    await anmelden(page, CHEFIN.email);
    await page.goto('/assignments/woche');
    const eintrag = page.getByRole('button', { name: new RegExp(`^Lieferung.*08:00–10:00.*${MONTEUR.name}.*Termin ändern$`) });
    await eintrag.first().click({ timeout: 20_000 });

    const fenster = page.getByRole('dialog', { name: 'Termin ändern' });
    await fenster.getByLabel('Zeitfenster bis').fill('11:00');
    await fenster.getByRole('button', { name: /^(Speichern|Termin speichern|Änderung speichern)$/ }).click();

    await expect(page.getByRole('button', { name: new RegExp(`^Lieferung.*08:00–11:00.*${MONTEUR.name}`) }).first()).toBeVisible({ timeout: 20_000 });
    await expect(async () => {
      const { data } = await admin.from('termine').select('zeit_bis').eq('company_id', BETRIEB);
      expect(data).toEqual([{ zeit_bis: '11:00:00' }]);
    }).toPass({ timeout: 15_000 });
    await keineFehlermeldung(page);
  });

  test('Monat → Vorschau → Zur Woche → Tag markiert → Zurück in den Monat', async ({ page }) => {
    test.setTimeout(120_000);
    const m = await monteurId();
    const { error } = await admin.from('assignments').insert({
      company_id: BETRIEB, date: heute(), project_number: BAUSTELLE.nummer, user_id: m, user_name: MONTEUR.name,
    });
    expect(error).toBeNull();

    await anmelden(page, CHEFIN.email);
    await page.goto('/assignments/woche?ansicht=monat');
    const monat = page.getByRole('region', { name: 'Monatsplan nach Personen' });
    const zeile = monat.getByRole('group', { name: MONTEUR.name });
    // Der Balken liegt über den Tagesfeldern; geklickt wird, was man sieht.
    await zeile.getByRole('button', { name: new RegExp(`eingeplant, ${BAUSTELLE.kunde} \\(${BAUSTELLE.nummer}\\) – Vorschau$`) }).first().click({ timeout: 20_000 });

    const vorschau = page.getByRole('dialog');
    await expect(vorschau.getByText(BAUSTELLE.nummer).first()).toBeVisible();
    await vorschau.getByRole('button', { name: 'Zur Woche' }).click();

    await expect(page).toHaveURL(new RegExp(`woche=\\d{4}-W\\d{2}&tag=${heute()}`));
    await expect(page.getByRole('table', { name: 'Wochenplan als Tabelle' })).toBeVisible();
    await expect(page.locator('th.wp-kopf-markiert')).toHaveCount(1);

    await page.goBack();
    await expect(page.getByRole('region', { name: 'Monatsplan nach Personen' })).toBeVisible({ timeout: 15_000 });
    await keineFehlermeldung(page);
  });
});
