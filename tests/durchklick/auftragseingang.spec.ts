import { test, expect, type Page } from '@playwright/test';
import { admin, BETRIEB, CHEFIN, PASSWORT } from './aufbau';
import { anmelden, keineFehlermeldung, menue } from './helfer';

/**
 * AUFTRAGSEINGANG (M02b, A03/A11) — im echten Browser gegen die echte
 * Datenbank, der ganze Weg:
 *
 * Die Verwaltung nimmt einen Anruf an und erfasst ihn (Quelle, Kunde,
 * Anliegen) → die Führung macht daraus eine Baustelle (Abrechnung gewählt)
 * und die Baustellenakte zeigt „Aus Eingang …“ → ein zweiter Eingang wird
 * zum Angebotsentwurf, das Angebot zeigt, woher es kam → ein dritter wird
 * mit Grund abgelehnt und steht unter „Abgelehnt“.
 *
 * Die Verwaltung bekommt hier ein eigenes Konto: der Aufbau der Durchklicks
 * kennt nur Monteur, Buchhaltung und Geschäftsführung.
 */

const KUNDE = 'Familie Eingangprobe';
const VERWALTUNG = { email: 'verwaltung@durchklick.test', name: 'Vera Verwaltung' };

async function aufraeumen() {
  const { data: kunden } = await admin.from('customers').select('id').eq('company_id', BETRIEB).eq('name', KUNDE);
  const ids = (kunden ?? []).map((k) => k.id as string);
  await admin.from('auftragseingaenge').delete().eq('company_id', BETRIEB).eq('kunde_name', KUNDE);
  if (ids.length) {
    await admin.from('quotes').delete().in('customer_id', ids);
    await admin.from('projects').delete().in('customer_id', ids);
  }
}

async function verwaltungskonto(): Promise<void> {
  const vorhanden = await admin.auth.admin.listUsers({ perPage: 1000 });
  const alt = vorhanden.data.users.find((u) => u.email === VERWALTUNG.email);
  if (alt) await admin.auth.admin.deleteUser(alt.id);
  const { data, error } = await admin.auth.admin.createUser({
    email: VERWALTUNG.email, password: PASSWORT, email_confirm: true,
    app_metadata: { company_id: BETRIEB, role: 'Verwaltung', active: true },
  });
  if (error) throw error;
  const { error: f } = await admin.from('users').upsert({
    id: data.user!.id, company_id: BETRIEB, name: VERWALTUNG.name, email: VERWALTUNG.email, role: 'Verwaltung', active: true,
  });
  if (f) throw new Error(f.message);
}

test.beforeAll(async () => {
  await verwaltungskonto();
  await aufraeumen();
  const { error } = await admin.from('customers').insert({
    company_id: BETRIEB, name: KUNDE, kundenart: 'privat', strasse: 'Eingangsgasse 4', plz: '1010', ort: 'Wien',
    contact_name: 'Erika Eingang', contact_phone: '0664 4711',
  });
  expect(error).toBeNull();
});
test.afterAll(async () => {
  await aufraeumen();
  // Das Konto der Verwaltung geht wieder — die übrigen Wege kennen nur die drei des Aufbaus.
  const vorhanden = await admin.auth.admin.listUsers({ perPage: 1000 });
  const konto = vorhanden.data.users.find((u) => u.email === VERWALTUNG.email);
  if (konto) {
    await admin.from('users').delete().eq('id', konto.id);
    await admin.auth.admin.deleteUser(konto.id);
  }
});

/** Ein Eingang, wie ihn das Büro schon erfasst hat — für die Wege zwei und drei. */
async function erfasst(anliegen: string): Promise<string> {
  const { data: k } = await admin.from('customers').select('id').eq('company_id', BETRIEB).eq('name', KUNDE).single();
  const { data, error } = await admin.from('auftragseingaenge').insert({
    company_id: BETRIEB, quelle: 'email', customer_id: k!.id, anliegen,
  }).select('id').single();
  expect(error).toBeNull();
  return data!.id as string;
}

async function eingangOeffnen(page: Page, anliegen: string) {
  await page.goto('/eingaenge');
  const zeile = page.getByRole('listitem').filter({ hasText: anliegen });
  await zeile.getByRole('link').first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Eingang' })).toBeVisible({ timeout: 20_000 });
}

test('die Verwaltung erfasst, die Führung macht daraus eine Baustelle — die Akte zeigt, woher sie kam', async ({ page, browser }) => {
  test.setTimeout(180_000);

  // 1. Die Verwaltung nimmt den Anruf an.
  await anmelden(page, VERWALTUNG.email);
  await menue(page, 'Auftragseingang', 'Eingang');
  await expect(page.getByRole('heading', { level: 1, name: 'Auftragseingang' })).toBeVisible();
  await page.getByRole('button', { name: 'Neuer Eingang' }).click();
  const fenster = page.getByRole('dialog', { name: 'Neuer Eingang' });
  // Ohne Pflichtangaben geht nichts hinaus.
  await fenster.getByRole('button', { name: 'Eingang erfassen' }).click();
  await expect(fenster.getByText(/woher der Eingang kam/)).toBeVisible();
  await fenster.getByLabel(/Quelle/).selectOption('telefon');
  await fenster.getByLabel('Dringlichkeit').selectOption('dringend');
  await fenster.getByLabel(/Schadensnummer/).fill('HV-4711');
  await fenster.getByRole('searchbox', { name: /^Kunde/ }).fill('Eingangprobe');
  await fenster.getByRole('button', { name: new RegExp(KUNDE) }).click();
  await expect(fenster.getByLabel('Ort des Einsatzes')).toHaveValue('Eingangsgasse 4, 1010 Wien');
  await fenster.getByLabel('Ansprechpartner vor Ort').fill('Hr. Hausmeister');
  await fenster.getByLabel('Anliegen').fill('Heizung im Stiegenhaus kalt');
  await fenster.getByRole('button', { name: 'Eingang erfassen' }).click();

  // Angekommen auf dem Eingang, mit Nummer.
  await expect(page).toHaveURL(/\/eingaenge\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  const { data: e } = await admin.from('auftragseingaenge').select('id, nummer, erfasst_von_name')
    .eq('company_id', BETRIEB).eq('anliegen', 'Heizung im Stiegenhaus kalt').single();
  expect(String(e!.nummer)).toMatch(/^EG-\d{4}-\d{4}$/);
  expect(e!.erfasst_von_name).toBe(VERWALTUNG.name);
  await expect(page.getByText(String(e!.nummer)).first()).toBeVisible();
  // Umwandeln darf die Verwaltung nicht — der Knopf steht nicht da.
  await expect(page.getByRole('button', { name: 'Baustelle anlegen' })).toHaveCount(0);
  await keineFehlermeldung(page);

  // 2. Die Führung macht daraus eine Baustelle.
  const chefin = await (await browser.newContext()).newPage();
  await anmelden(chefin, CHEFIN.email);
  await eingangOeffnen(chefin, 'Heizung im Stiegenhaus kalt');
  await chefin.getByRole('button', { name: 'Baustelle anlegen' }).click();
  const frage = chefin.getByRole('dialog', { name: 'Baustelle anlegen?' });
  await expect(frage.getByLabel(/Abrechnung der Baustelle/)).toHaveValue('Regie');
  await frage.getByRole('button', { name: 'Baustelle anlegen' }).click();
  await expect(chefin).toHaveURL(/\/admin-projects\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  const verweis = chefin.getByRole('link', { name: `Aus Eingang ${e!.nummer}` });
  await expect(verweis).toBeVisible({ timeout: 20_000 });
  const { data: p } = await admin.from('projects').select('customer_name, address, billing_mode, contact_name, description')
    .eq('company_id', BETRIEB).like('description', `%Aus Eingang ${e!.nummer}`).single();
  expect(p).toMatchObject({ customer_name: KUNDE, address: 'Eingangsgasse 4, 1010 Wien', billing_mode: 'Regie', contact_name: 'Hr. Hausmeister' });
  expect(String(p!.description)).toContain('Nummer des Auftraggebers: HV-4711');
  await keineFehlermeldung(chefin);
  // Der Verweis führt zurück zum Eingang — er steht jetzt als übernommen da.
  await verweis.click();
  await expect(chefin.getByText('Übernommen').first()).toBeVisible({ timeout: 20_000 });
  await expect(chefin.getByRole('link', { name: 'Zur Baustelle' })).toBeVisible();
  await chefin.context().close();
});

test('ein zweiter Eingang wird zum Angebot, ein dritter abgelehnt', async ({ page }) => {
  test.setTimeout(180_000);
  await erfasst('Angebot für ein neues Bad');
  await erfasst('Doppelt gemeldeter Wasserschaden');
  await anmelden(page, CHEFIN.email);

  // Zum Angebot: über das ⋯ des Seitenkopfs.
  await eingangOeffnen(page, 'Angebot für ein neues Bad');
  await page.getByRole('button', { name: /^Weitere Aktionen für Eingang/ }).click();
  await page.getByRole('menuitem', { name: 'Angebot anlegen' }).click();
  await page.getByRole('dialog', { name: 'Angebot anlegen?' }).getByRole('button', { name: 'Angebot anlegen' }).click();
  await expect(page).toHaveURL(/\/quotes\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  await expect(page.getByRole('link', { name: /^Aus Eingang EG-/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Angebot für ein neues Bad').first()).toBeVisible();
  await keineFehlermeldung(page);

  // Abgelehnt: mit Grund — danach unter „Abgelehnt“.
  await eingangOeffnen(page, 'Doppelt gemeldeter Wasserschaden');
  await page.getByRole('button', { name: /^Weitere Aktionen für Eingang/ }).click();
  await page.getByRole('menuitem', { name: 'Ablehnen' }).click();
  const frage = page.getByRole('dialog', { name: 'Eingang ablehnen?' });
  await expect(frage.getByRole('button', { name: 'Ablehnen' })).toBeDisabled();
  await frage.getByLabel('Grund').fill('Schon unter anderem Eingang erfasst');
  await frage.getByRole('button', { name: 'Ablehnen' }).click();
  await expect(page.getByText(/Schon unter anderem Eingang erfasst/)).toBeVisible({ timeout: 20_000 });
  await page.goto('/eingaenge?stand=abgelehnt');
  await expect(page.getByRole('listitem').filter({ hasText: 'Doppelt gemeldeter Wasserschaden' })).toBeVisible({ timeout: 20_000 });
  await keineFehlermeldung(page);
});
