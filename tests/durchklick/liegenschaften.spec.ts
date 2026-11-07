import { test, expect } from '@playwright/test';
import { admin, BETRIEB, CHEFIN, PASSWORT } from './aufbau';
import { anmelden, keineFehlermeldung, menue } from './helfer';

/**
 * LIEGENSCHAFTEN, TOPS, BETEILIGTE (M02c, A09) — im echten Browser gegen die
 * echte Datenbank, der ganze Weg:
 *
 * 1. Der Administrator schaltet „Liegenschaften und Tops“ ein (ab Werk aus).
 * 2. Die Führung legt eine Liegenschaft mit zwei Tops an und trägt die
 *    Hausverwaltung als Kunden ein.
 * 3. Sie legt eine Baustelle für Top 2 an; der Kunde wird aus der
 *    Hausverwaltung vorgeschlagen und übernommen.
 * 4. In der Akte der Liegenschaft steht die Baustelle unter Top 2.
 *
 * Der Administrator bekommt ein eigenes Konto: der Aufbau der Durchklicks
 * kennt nur Monteur, Buchhaltung und Geschäftsführung, und die Module
 * schaltet allein der Administrator.
 */

const HV = 'Hausverwaltung Liegenschaftprobe';
const HAUS = 'WHA Probegasse 12';
const ADMIN = { email: 'administrator@durchklick.test', name: 'Adam Administrator' };

async function aufraeumen() {
  const { data: haeuser } = await admin.from('liegenschaften').select('id').eq('company_id', BETRIEB).eq('bezeichnung', HAUS);
  const ids = (haeuser ?? []).map((h) => h.id as string);
  if (ids.length) {
    // Erst was auf die Liegenschaft zeigt, dann sie selbst (samt Tops und Beteiligten).
    await admin.from('projects').delete().in('liegenschaft_id', ids);
    await admin.from('liegenschaften').delete().in('id', ids);
  }
  await admin.from('customers').delete().eq('company_id', BETRIEB).eq('name', HV);
  await admin.from('companies').update({ modules: {} }).eq('id', BETRIEB);
}

async function adminKonto(): Promise<void> {
  const vorhanden = await admin.auth.admin.listUsers({ perPage: 1000 });
  const alt = vorhanden.data.users.find((u) => u.email === ADMIN.email);
  if (alt) await admin.auth.admin.deleteUser(alt.id);
  const { data, error } = await admin.auth.admin.createUser({
    email: ADMIN.email, password: PASSWORT, email_confirm: true,
    app_metadata: { company_id: BETRIEB, role: 'Administrator', active: true },
  });
  if (error) throw error;
  const { error: f } = await admin.from('users').upsert({
    id: data.user!.id, company_id: BETRIEB, name: ADMIN.name, email: ADMIN.email, role: 'Administrator', active: true,
  });
  if (f) throw new Error(f.message);
}

test.beforeAll(async () => {
  await adminKonto();
  await aufraeumen();
  const { error } = await admin.from('customers').insert({
    company_id: BETRIEB, name: HV, kundenart: 'unternehmen', strasse: 'Verwaltungsring 1', plz: '1010', ort: 'Wien',
    contact_name: 'Frau Ring', contact_phone: '01 4711',
  });
  expect(error).toBeNull();
});
test.afterAll(async () => {
  await aufraeumen();
  const vorhanden = await admin.auth.admin.listUsers({ perPage: 1000 });
  const konto = vorhanden.data.users.find((u) => u.email === ADMIN.email);
  if (konto) {
    await admin.from('users').delete().eq('id', konto.id);
    await admin.auth.admin.deleteUser(konto.id);
  }
});

test('Modul ein, Liegenschaft mit Tops und Hausverwaltung, Baustelle für Top 2 mit vorgeschlagenem Kunden, Akte zeigt sie unter Top 2', async ({ page, browser }) => {
  test.setTimeout(240_000);

  // 1. Der Administrator schaltet die Liegenschaften ein — ab Werk sind sie aus.
  await anmelden(page, ADMIN.email);
  await page.goto('/settings/module');
  const schalter = page.getByRole('checkbox', { name: 'Liegenschaften und Tops einschalten' });
  await expect(schalter).not.toBeChecked({ timeout: 20_000 });
  await schalter.check();
  await page.getByRole('button', { name: 'Module speichern' }).click();
  await expect.poll(async () => {
    const { data } = await admin.from('companies').select('modules').eq('id', BETRIEB).single();
    return (data?.modules as Record<string, boolean> | null)?.['kunden.liegenschaften'];
  }, { timeout: 20_000 }).toBe(true);
  await keineFehlermeldung(page);

  // 2. Die Führung legt die Liegenschaft an — angemeldet erst jetzt, mit eingeschaltetem Modul.
  const chefin = await (await browser.newContext()).newPage();
  await anmelden(chefin, CHEFIN.email);
  await menue(chefin, 'Liegenschaften', 'Häuser');
  await expect(chefin.getByRole('heading', { level: 1, name: 'Liegenschaften' })).toBeVisible({ timeout: 20_000 });
  await chefin.getByRole('button', { name: 'Neue Liegenschaft' }).click();
  const neu = chefin.getByRole('dialog', { name: 'Neue Liegenschaft' });
  await neu.getByLabel(/^Bezeichnung/).fill(HAUS);
  await neu.getByLabel('Straße und Hausnummer').fill('Probegasse 12');
  await neu.getByLabel('PLZ').fill('1050');
  await neu.getByLabel('Ort').fill('Wien');
  await neu.getByRole('button', { name: 'Liegenschaft anlegen' }).click();
  await expect(chefin).toHaveURL(/\/liegenschaften\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  const { data: haus } = await admin.from('liegenschaften').select('id, anschrift').eq('company_id', BETRIEB).eq('bezeichnung', HAUS).single();
  expect(haus!.anschrift).toBe('Probegasse 12, 1050 Wien');
  await expect(chefin.getByRole('heading', { level: 1, name: HAUS })).toBeVisible();

  // Zwei Tops.
  for (const [bezeichnung, lage] of [['Top 1', 'EG'], ['Top 2', '1. OG']] as const) {
    await chefin.getByRole('button', { name: 'Top anlegen' }).first().click();
    const fenster = chefin.getByRole('dialog', { name: 'Top anlegen' });
    await fenster.getByLabel(/^Bezeichnung/).fill(bezeichnung);
    await fenster.getByLabel('Stockwerk bzw. Lage').fill(lage);
    await fenster.getByRole('button', { name: 'Top anlegen' }).click();
    await expect(fenster).toHaveCount(0, { timeout: 20_000 });
    await expect(chefin.getByRole('button', { name: new RegExp(`^${bezeichnung}`) })).toBeVisible({ timeout: 20_000 });
  }
  await expect.poll(async () => (await admin.from('liegenschaft_tops').select('id').eq('liegenschaft_id', haus!.id)).data?.length ?? 0).toBe(2);

  // Die Hausverwaltung als Kunde.
  await chefin.getByRole('button', { name: 'Beteiligten eintragen' }).click();
  const beteiligt = chefin.getByRole('dialog', { name: 'Beteiligten eintragen' });
  await beteiligt.getByLabel(/^Rolle/).selectOption('hausverwaltung');
  await beteiligt.getByRole('searchbox', { name: /^Kunde/ }).fill('Liegenschaftprobe');
  await beteiligt.getByRole('button', { name: HV, exact: true }).click();
  await beteiligt.getByRole('button', { name: 'Beteiligten eintragen' }).click();
  await expect(beteiligt).toHaveCount(0, { timeout: 20_000 });
  await expect.poll(async () => (await admin.from('liegenschaft_beteiligte').select('rolle, customer_id').eq('liegenschaft_id', haus!.id)).data)
    .toEqual([{ rolle: 'hausverwaltung', customer_id: expect.any(String) }]);
  await expect(chefin.getByText('Hausverwaltung · ganze Liegenschaft · Kunde')).toBeVisible({ timeout: 20_000 });
  await keineFehlermeldung(chefin);

  // 3. Eine Baustelle für Top 2 — der Kunde kommt als Vorschlag aus der Hausverwaltung.
  await menue(chefin, 'Baustellen');
  await chefin.getByRole('button', { name: 'Neue Baustelle' }).first().click();
  const form = chefin.getByRole('dialog', { name: 'Neue Baustelle' });
  await form.getByRole('searchbox', { name: 'Liegenschaft (freiwillig)' }).fill('Probegasse');
  await form.getByRole('button', { name: HAUS, exact: true }).click();
  // Die Tops sind da, sobald die Wahl offen ist — erst dann wählen.
  const topWahl = form.getByLabel('Top');
  await expect(topWahl).toBeEnabled({ timeout: 20_000 });
  await topWahl.selectOption({ label: 'Top 2 (1. OG)' });
  const vorschlaege = form.getByRole('region', { name: 'Vorschläge aus der Liegenschaft' });
  await expect(vorschlaege).toContainText(`Kunde: ${HV}`, { timeout: 20_000 });
  await expect(vorschlaege).toContainText('Baustellenadresse: Probegasse 12, 1050 Wien');
  await vorschlaege.getByRole('button', { name: `${HV} als Kunde übernehmen` }).click();
  await expect(form.getByRole('button', { name: 'Anderen Kunden wählen' })).toBeVisible();
  await vorschlaege.getByRole('button', { name: 'Anschrift der Liegenschaft als Baustellenadresse übernehmen' }).click();
  await expect(form.getByLabel('Baustellenadresse')).toHaveValue('Probegasse 12, 1050 Wien');
  await form.getByRole('button', { name: 'Anlegen', exact: true }).click();

  const { data: top2 } = await admin.from('liegenschaft_tops').select('id').eq('liegenschaft_id', haus!.id).eq('bezeichnung', 'Top 2').single();
  await expect.poll(async () => (await admin.from('projects').select('id').eq('liegenschaft_id', haus!.id)).data?.length ?? 0, { timeout: 20_000 }).toBe(1);
  const { data: bau } = await admin.from('projects')
    .select('project_number, customer_name, top_id, top_bezeichnung, liegenschaft_bezeichnung')
    .eq('liegenschaft_id', haus!.id).single();
  expect(bau).toMatchObject({ customer_name: HV, top_id: top2!.id, top_bezeichnung: 'Top 2', liegenschaft_bezeichnung: HAUS });
  await keineFehlermeldung(chefin);

  // 4. Die Akte der Liegenschaft zeigt die Baustelle unter Top 2 — und unter Top 1 nicht.
  await chefin.goto(`/liegenschaften/${haus!.id}?bereich=arbeiten`);
  const baustellen = chefin.locator('#l-baustellen');
  await expect(baustellen.getByText(String(bau!.project_number))).toBeVisible({ timeout: 20_000 });
  await baustellen.getByLabel('Top').selectOption({ label: 'Top 2 (1. OG)' });
  await expect(chefin).toHaveURL(new RegExp(`top=${top2!.id}`));
  await expect(baustellen.getByText(String(bau!.project_number))).toBeVisible({ timeout: 20_000 });
  await expect(baustellen.getByText(/Top 2 · /)).toBeVisible();
  await baustellen.getByLabel('Top').selectOption({ label: 'Top 1 (EG)' });
  await expect(baustellen.getByText('Für dieses Top noch keine Baustelle.')).toBeVisible({ timeout: 20_000 });
  await expect(baustellen.getByText(String(bau!.project_number))).toHaveCount(0);
  await keineFehlermeldung(chefin);
});
