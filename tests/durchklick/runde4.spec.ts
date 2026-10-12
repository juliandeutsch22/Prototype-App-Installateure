import { test, expect } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, CHEFIN, MONTEUR, PASSWORT } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * RUNDE 4 VON ANFANG BIS ENDE (Auftrag Abschnitt 8, Browser-Wege):
 *  1. Mitarbeiterübersicht: ein Tag ohne Buchung im Streifen → Seitenfenster
 *     der Person → „Zeit erfassen“ an diesem Tag → speichern → der Tag ist
 *     gebucht.
 *  2. Lehrling bucht über 8 Std. → Rückfrage → „Trotzdem buchen“ → der Fall
 *     steht in „Arbeitszeitgrenzen“ (seit 12.10.2026, Stand 18, K5).
 *  3. Einsatzplanung, Woche: Termin-Eintrag in der Zelle des Teilnehmers →
 *     „Termin ändern“ → Zeit ändern → speichern → der Eintrag zeigt sie.
 *  4. Woche: Tageskopf mit „Lieferung ohne Annahme“ → Seitenfenster „Tag“ →
 *     jemanden auf dieser Baustelle einplanen → speichern → der Hinweis ist
 *     weg, der Eintrag trägt die Lieferung als Zusatzzeile (K5).
 *  5. Monat: Balken → Vorschau → „Bearbeiten“ → Person dazu → speichern →
 *     der Balken steht auch bei ihr (K5).
 *  6. Monat: Tag → Vorschau → „Zur Woche“ → richtige Woche, Tag markiert,
 *     „Zurück“ führt in den Monat.
 *  7. Handy: Monat → Tag → Blatt → „Bearbeiten“ → speichern → das Blatt
 *     zeigt die neue Zeit (K5).
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

/*
  WEG 2 — EIN LEHRLING ÜBER DER TAGESGRENZE. Gebucht wird trotzdem (die App
  hält niemanden davon ab, die Wahrheit einzutragen), aber erst nach einer
  Rückfrage, und das Büro sieht den Fall. Die Tagesgrenze zählt auch am
  heutigen Tag — anders als die Pause, die erst ein abgeschlossener Tag hat.
*/
const LIA = { email: 'lia@durchklick.test', name: 'Lia Lehrling' };

async function liaEntfernen(): Promise<void> {
  const { data } = await admin.from('users').select('id').eq('email', LIA.email).maybeSingle();
  if (!data) return;
  await admin.from('time_entries').delete().eq('company_id', BETRIEB).eq('user_id', data.id);
  await admin.from('geburtsdaten').delete().eq('user_id', data.id);
  await admin.from('users').delete().eq('id', data.id);
  await admin.auth.admin.deleteUser(data.id);
}

test.describe('Jugendschutz', () => {
  test.beforeAll(async () => {
    await liaEntfernen();
    const { data, error } = await admin.auth.admin.createUser({
      email: LIA.email, password: PASSWORT, email_confirm: true,
      app_metadata: { company_id: BETRIEB, role: 'Mitarbeiter', active: true },
    });
    if (error) throw error;
    const id = data.user!.id;
    const { error: fehler } = await admin.from('users').upsert({
      id, company_id: BETRIEB, name: LIA.name, email: LIA.email, role: 'Mitarbeiter', active: true,
      einstufung: 'lehrling', lehrbeginn: '2025-09-01', lehrzeit_monate: 36,
    });
    if (fehler) throw new Error(fehler.message);
    // Fünfzehn Jahre: unter 18, solange es diese Prüfung gibt.
    const jahr = Number(heute().slice(0, 4)) - 15;
    const geb = await admin.from('geburtsdaten').insert({ user_id: id, company_id: BETRIEB, geburtsdatum: `${jahr}-01-01` });
    if (geb.error) throw new Error(geb.error.message);
  });
  test.afterAll(liaEntfernen);

  test('Lehrling bucht über 8 Std. → Rückfrage → Trotzdem buchen → Fall in „Arbeitszeitgrenzen“', async ({ page, browser }) => {
    test.setTimeout(120_000);
    await anmelden(page, LIA.email);
    await page.goto('/time');
    await page.getByLabel('Baustelle').selectOption(BAUSTELLE.nummer);
    await page.getByLabel(/^Von/).fill('06:00');
    await page.getByLabel(/^Bis/).fill('15:30');
    await page.getByLabel(/Pause/).fill('30');
    await page.getByRole('button', { name: /^(Zeit buchen|Speichern|Buchen)$/ }).click();

    const frage = page.getByRole('dialog', { name: 'Grenze für Jugendliche' });
    await expect(frage).toBeVisible();
    // Vor der Antwort ist nichts gebucht.
    const { data: vorher } = await admin.from('time_entries').select('id').eq('company_id', BETRIEB).eq('user_name', LIA.name);
    expect(vorher).toEqual([]);
    await frage.getByRole('button', { name: 'Trotzdem buchen' }).click();
    await expect(async () => {
      const { data } = await admin.from('time_entries').select('start_time, end_time').eq('company_id', BETRIEB).eq('user_name', LIA.name);
      expect(data).toEqual([{ start_time: '06:00:00', end_time: '15:30:00' }]);
    }).toPass({ timeout: 15_000 });
    await keineFehlermeldung(page);

    // Das Büro sieht den Fall — in einem eigenen Browser, angemeldet als Chefin.
    const buero = await (await browser.newContext()).newPage();
    await anmelden(buero, CHEFIN.email);
    await buero.goto('/accounting');
    const [j, m, t] = heute().split('-');
    await expect(
      buero.locator('.grenz-fall', { hasText: LIA.name }).filter({ hasText: `9:00 Std. am ${t}.${m}. — höchstens 8 Std.` }),
    ).toBeVisible({ timeout: 30_000 });
    void j;
    await buero.context().close();
  });
});

/* Eine zweite Person für Weg 5 — angelegt und wieder entfernt wie Rita. */
const PAULA = { email: 'paula@durchklick.test', name: 'Paula Partner' };

async function paulaEntfernen(): Promise<void> {
  const { data } = await admin.from('users').select('id').eq('email', PAULA.email).maybeSingle();
  if (!data) return;
  await admin.from('assignments').delete().eq('company_id', BETRIEB).eq('user_id', data.id);
  await admin.from('users').delete().eq('id', data.id);
  await admin.auth.admin.deleteUser(data.id);
}

async function paulaAnlegen(): Promise<void> {
  await paulaEntfernen();
  const { data, error } = await admin.auth.admin.createUser({
    email: PAULA.email, password: PASSWORT, email_confirm: true,
    app_metadata: { company_id: BETRIEB, role: 'Mitarbeiter', active: true },
  });
  if (error) throw error;
  const { error: fehler } = await admin.from('users').upsert({
    id: data.user!.id, company_id: BETRIEB, name: PAULA.name, email: PAULA.email, role: 'Mitarbeiter', active: true,
  });
  if (fehler) throw new Error(fehler.message);
}

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

  test('Tageskopf „Lieferung ohne Annahme“ → Tag → einplanen → Hinweis weg, Lieferung im Eintrag', async ({ page }) => {
    test.setTimeout(120_000);
    const { error } = await admin.from('termine').insert({
      company_id: BETRIEB, art: 'Lieferung', datum: heute(), zeit_von: '08:00', zeit_bis: '10:00',
      project_number: BAUSTELLE.nummer, teilnehmer: [],
    });
    expect(error).toBeNull();

    await anmelden(page, CHEFIN.email);
    await page.goto('/assignments/woche');
    const kopf = page.getByRole('button', { name: /Lieferung ohne Annahme.* – ganzen Tag ansehen$/ });
    await kopf.click({ timeout: 20_000 });

    const tag = page.getByRole('dialog', { name: /^\S+, \d{2}\.\d{2}\.$/ });
    await expect(tag.getByText('niemand dort')).toBeVisible();
    await tag.getByRole('button', { name: new RegExp(`^${MONTEUR.name} am .* einteilen$`) }).click();

    const fenster = page.getByRole('dialog', { name: 'Einsatz planen' });
    await fenster.getByLabel('Baustelle').selectOption(BAUSTELLE.nummer);
    await expect(fenster.getByText(/Am selben Tag auf dieser Baustelle/)).toBeVisible();
    await fenster.getByRole('button', { name: /^Einsatz( und Rüstliste)? speichern$/ }).click();
    await expect(fenster).toBeHidden({ timeout: 20_000 });

    // Kein Tag der Woche meldet die Lieferung noch als „ohne Annahme“ ...
    await expect(page.getByRole('button', { name: /Lieferung ohne Annahme/ })).toHaveCount(0, { timeout: 20_000 });
    // ... und der Eintrag des Monteurs trägt sie als Zusatzzeile.
    const eintrag = page.getByRole('button', { name: new RegExp(`^${BAUSTELLE.kunde} \\(${BAUSTELLE.nummer}\\) am .* bearbeiten – ${MONTEUR.name}$`) });
    await expect(eintrag).toContainText('Lieferung 08:00–10:00');
    await keineFehlermeldung(page);
  });

  test('Monat: Balken → Vorschau → Bearbeiten → Person dazu → der Balken steht auch bei ihr', async ({ page }) => {
    test.setTimeout(120_000);
    await paulaAnlegen();
    try {
      const m = await monteurId();
      const { error } = await admin.from('assignments').insert({
        company_id: BETRIEB, date: heute(), project_number: BAUSTELLE.nummer, user_id: m, user_name: MONTEUR.name,
      });
      expect(error).toBeNull();

      await anmelden(page, CHEFIN.email);
      await page.goto('/assignments/woche?ansicht=monat');
      const monat = page.getByRole('region', { name: 'Monatsplan nach Personen' });
      const balken = (name: string) =>
        monat.getByRole('group', { name }).getByRole('button', { name: new RegExp(`eingeplant, ${BAUSTELLE.kunde} \\(${BAUSTELLE.nummer}\\) – Vorschau$`) });
      await expect(balken(PAULA.name)).toHaveCount(0, { timeout: 20_000 });
      await balken(MONTEUR.name).first().click();

      const vorschau = page.getByRole('dialog', { name: MONTEUR.name });
      await expect(vorschau.getByText('allein')).toBeVisible();
      await vorschau.getByRole('button', { name: 'Bearbeiten' }).click();

      const fenster = page.getByRole('dialog', { name: 'Einsatz bearbeiten' });
      await fenster.getByRole('checkbox', { name: new RegExp(`^${PAULA.name}`) }).check();
      await fenster.getByRole('button', { name: /^Einsatz( und Rüstliste)? speichern$/ }).click();
      await expect(fenster).toBeHidden({ timeout: 20_000 });

      await expect(balken(PAULA.name).first()).toBeVisible({ timeout: 20_000 });
      await expect(async () => {
        const { data } = await admin.from('assignments').select('user_name').eq('company_id', BETRIEB).eq('date', heute()).order('user_name');
        expect((data ?? []).map((a) => a.user_name)).toEqual([MONTEUR.name, PAULA.name]);
      }).toPass({ timeout: 15_000 });
      await keineFehlermeldung(page);
    } finally {
      await paulaEntfernen();
    }
  });

  test.describe('Handy', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test('Monat → Tag → Blatt → Bearbeiten → speichern → das Blatt zeigt die neue Zeit', async ({ page }) => {
      test.setTimeout(120_000);
      const m = await monteurId();
      const { error } = await admin.from('assignments').insert({
        company_id: BETRIEB, date: heute(), project_number: BAUSTELLE.nummer, user_id: m, user_name: MONTEUR.name,
      });
      expect(error).toBeNull();

      await anmelden(page, CHEFIN.email);
      await page.goto('/assignments/woche?ansicht=monat');
      const tagKnopf = page.getByRole('button', { name: /, 1 Baustelle(, [^–]+)? – Vorschau$/ });
      await tagKnopf.click({ timeout: 20_000 });

      const blatt = page.getByRole('dialog', { name: 'Alle Einsätze' });
      const einsatz = blatt.getByRole('region', { name: `Einsatz ${BAUSTELLE.kunde} (${BAUSTELLE.nummer})` });
      await expect(einsatz.getByText('ganzer Tag, ohne Uhrzeit')).toBeVisible();
      await einsatz.getByRole('button', { name: `${BAUSTELLE.kunde} (${BAUSTELLE.nummer}) bearbeiten` }).click();

      const fenster = page.getByRole('dialog', { name: 'Einsatz bearbeiten' });
      await fenster.getByLabel('Beginn (optional)').fill('07:00');
      await fenster.getByLabel('Ende (optional)').fill('15:00');
      await fenster.getByRole('button', { name: /^Einsatz( und Rüstliste)? speichern$/ }).click();
      await expect(fenster).toBeHidden({ timeout: 20_000 });

      await tagKnopf.click();
      await expect(
        page.getByRole('dialog', { name: 'Alle Einsätze' }).getByRole('region', { name: `Einsatz ${BAUSTELLE.kunde} (${BAUSTELLE.nummer})` }),
      ).toContainText('07:00–15:00', { timeout: 20_000 });
      await keineFehlermeldung(page);
    });
  });
});
