import { test, expect } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, CHEFIN, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

async function aufraeumen() {
  await admin.from('zeitkorrekturen').delete().eq('company_id', BETRIEB);
  await admin.from('zeitsitzungen').delete().eq('company_id', BETRIEB);
  await admin.from('time_entries').delete().eq('company_id', BETRIEB);
  await admin.from('companies').update({ zeit_standardfelder: {}, modules: { 'zeiterfassung.freie_zeitfelder': false, 'zeiterfassung.timer': true } }).eq('id', BETRIEB);
}
let eintrittVorher: { id: string; eintritt: string | null } | null = null;
test.beforeEach(async ({ page }) => {
  eintrittVorher = null;
  await aufraeumen();
  const { data, error } = await admin.from('users').select('id,eintritt').eq('company_id', BETRIEB).eq('email', MONTEUR.email).single();
  if (error) throw error;
  eintrittVorher = data;
  // Historische Testzeiten bleiben nach dem echten Eintritt zulässig; die Schutzregel bleibt unverändert.
  const aktualisiert = await admin.from('users').update({ eintritt: '2026-01-01' }).eq('id', data.id);
  if (aktualisiert.error) throw aktualisiert.error;
  await page.clock.setFixedTime(new Date('2026-11-05T07:00:00+01:00'));
});
test.afterEach(async () => {
  await aufraeumen();
  await admin.from('companies').update({ zeit_standardfelder: {}, modules: {} }).eq('id', BETRIEB);
  if (eintrittVorher) await admin.from('users').update({ eintritt: eintrittVorher.eintritt }).eq('id', eintrittVorher.id);
});

test('Standardfelder: ausschalten, bestehende Werte ändern ohne Verlust, wieder einschalten', async ({ page, context }, info) => {
  await anmelden(page, CHEFIN.email);
  await page.goto('/settings/zeitfelder');
  await page.getByRole('checkbox', { name: 'Wegzeit', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Kommentar / Tätigkeiten', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Standardfelder speichern' }).click();
  await expect(page.getByText('Standard-Zeitfelder gespeichert')).toBeVisible();
  await page.screenshot({ path: info.outputPath('standardfelder.png'), fullPage: true });
  const { data: person } = await admin.from('users').select('id').eq('company_id', BETRIEB).eq('email', MONTEUR.email).single();
  const id = crypto.randomUUID();
  await admin.from('time_entries').insert({ id, company_id: BETRIEB, user_id: person!.id, user_name: MONTEUR.name,
    date: '2026-11-05', status: 'Anwesend', start_time: '07:00', end_time: '09:00', break_duration: 0,
    travel_time: 25, comment: 'Bestehende Tätigkeit', project_number: BAUSTELLE.nummer, customer_name: BAUSTELLE.kunde });
  await context.clearCookies(); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await anmelden(page, MONTEUR.email); await page.goto('/time');
  await page.getByRole('button', { name: /05.11.2026.*bearbeiten/ }).click();
  await expect(page.locator('#comment')).toHaveCount(0);
  await expect(page.locator('#travelTime')).toHaveCount(0);
  await page.locator('#endTime').fill('10:00');
  await page.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
  await expect(async () => {
    const { data } = await admin.from('time_entries').select('travel_time,comment,end_time').eq('id', id).single();
    expect(data).toEqual({ travel_time: 25, comment: 'Bestehende Tätigkeit', end_time: '10:00:00' });
  }).toPass();
  await context.clearCookies(); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await anmelden(page, CHEFIN.email); await page.goto('/settings/zeitfelder');
  await page.getByRole('checkbox', { name: 'Wegzeit', exact: true }).check();
  await page.getByRole('button', { name: 'Standardfelder speichern' }).click();
  await expect(page.getByText('Standard-Zeitfelder gespeichert')).toBeVisible();
  await keineFehlermeldung(page);
});

test('Timer: Arbeit, Pause, offline weiter, Stopp und bestätigte normale Buchungen', async ({ page, context }, info) => {
  await page.clock.setFixedTime(new Date('2026-11-05T07:00:00+01:00'));
  await anmelden(page, MONTEUR.email); await page.goto('/time');
  // Seit 08.11.2026 die Karte „Arbeitstag“: die Baustelle im Bogen, Start als runder Knopf.
  await expect(page.getByRole('heading', { name: 'Arbeitstag', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Baustelle wählen' }).click();
  await page.locator('#timer-baustelle').selectOption(BAUSTELLE.nummer);
  await page.getByRole('button', { name: 'Übernehmen', exact: true }).click();
  await page.getByRole('button', { name: 'Arbeitstag starten', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause beginnen' })).toBeVisible();
  await page.clock.setFixedTime(new Date('2026-11-05T09:00:00+01:00'));
  await page.getByRole('button', { name: 'Pause beginnen' }).click();
  await expect(page.getByRole('button', { name: 'Weiterarbeiten' })).toBeVisible();
  await context.setOffline(true);
  await page.clock.setFixedTime(new Date('2026-11-05T09:30:00+01:00'));
  await page.getByRole('button', { name: 'Weiterarbeiten' }).click();
  await expect(page.getByText(/Timer-Schritt auf diesem Gerät vorgemerkt/)).toBeVisible();
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+01:00'));
  await page.getByRole('button', { name: 'Stoppen und prüfen' }).click();
  // E73: Feierabend öffnet gleich das Formular — eine Zeit von 07:00 bis 12:00, die Pause eingerechnet.
  const fenster = page.getByRole('dialog', { name: 'Arbeitszeit buchen' });
  await expect(fenster).toBeVisible();
  await expect(fenster.getByText(/07:00 bis 12:00, darin 30 Min\. Pause/)).toBeVisible();
  await expect(fenster.getByLabel('Baustelle', { exact: true })).toHaveValue(BAUSTELLE.nummer);
  await expect(fenster.locator('#break')).toHaveValue('30');
  await fenster.getByRole('button', { name: 'Zeit buchen', exact: true }).click();
  await expect(fenster).not.toBeVisible();
  expect((await admin.from('time_entries').select('id').eq('company_id', BETRIEB)).data).toEqual([]);
  // Die Zeile nennt den Stand hinter der Baustelle (E73), nicht mehr als eigenes Wort.
  await expect(page.getByText(`${BAUSTELLE.nummer} · auf diesem Gerät vorgemerkt`, { exact: true })).toHaveCount(1);
  await context.setOffline(false);
  await expect(async () => {
    const { data } = await admin.from('time_entries').select('start_time,end_time,break_duration,customer_name').eq('company_id', BETRIEB).order('start_time');
    expect(data).toEqual([{ start_time: '07:00:00', end_time: '12:00:00', break_duration: 30, customer_name: BAUSTELLE.kunde }]);
  }).toPass();
  await expect(page.getByRole('heading', { name: /Arbeitstag prüfen/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('zeit-bestaetigt.png'), fullPage: true });
  await keineFehlermeldung(page);
});

test('Timer ohne Baustelle bleibt Anwesenheit und lässt sich ohne erfundene Zuordnung bestätigen', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-05T07:00:00+01:00'));
  await anmelden(page, MONTEUR.email); await page.goto('/time');
  await page.getByRole('button', { name: 'Arbeitstag starten', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause beginnen' })).toBeVisible();
  await page.clock.setFixedTime(new Date('2026-11-05T09:00:00+01:00'));
  await page.getByRole('button', { name: 'Stoppen und prüfen' }).click();
  // E73: Feierabend öffnet die erste offene Zeit gleich im Formular.
  const fenster = page.getByRole('dialog', { name: 'Arbeitszeit buchen' });
  await expect(fenster.getByText(/Ohne Baustelle zählt/)).toBeVisible();
  await fenster.getByRole('button', { name: 'Zeit buchen', exact: true }).click();
  await expect(fenster).not.toBeVisible();
  await expect(async () => {
    const { data } = await admin.from('time_entries').select('project_number,hours').eq('company_id', BETRIEB);
    expect(data).toEqual([{ project_number: '', hours: 2 }]);
  }).toPass();
});

test('Korrekturantrag: Sperre bleibt, Büro führt die tatsächliche Korrektur nach dem Entsperren aus', async ({ page, context }) => {
  await admin.from('companies').update({ modules: { 'zeiterfassung.korrekturantraege': true, 'zeiterfassung.freie_zeitfelder': false } }).eq('id', BETRIEB);
  const { data: person } = await admin.from('users').select('id').eq('company_id', BETRIEB).eq('email', MONTEUR.email).single();
  const id = crypto.randomUUID();
  await admin.from('time_entries').insert({ id, company_id: BETRIEB, user_id: person!.id, user_name: MONTEUR.name,
    date: '2026-11-05', status: 'Anwesend', start_time: '07:00', end_time: '09:00', break_duration: 0, is_billed: true,
    project_number: BAUSTELLE.nummer, customer_name: BAUSTELLE.kunde });
  await anmelden(page, MONTEUR.email); await page.goto('/time');
  await page.getByRole('button', { name: 'Korrektur anfragen', exact: true }).click();
  const antrag = page.getByRole('dialog', { name: 'Korrektur anfragen' });
  await antrag.getByLabel(/Was soll berichtigt werden/).fill('Tatsächlicher Beginn war 8 Uhr');
  await antrag.getByRole('button', { name: 'Beim Büro anfragen' }).click();
  await expect(antrag).not.toBeVisible();
  const { data: a } = await admin.from('zeitkorrekturen').select('id').eq('company_id', BETRIEB).single();
  await context.clearCookies(); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await anmelden(page, CHEFIN.email);
  await page.goto(`/time?korrektur=${a!.id}`);
  const fenster = page.getByRole('dialog', { name: 'Korrekturantrag', exact: true });
  await expect(fenster.getByText(/Die Buchung ist gesperrt/)).toBeVisible();
  await fenster.getByLabel('Begründung der Entscheidung').fill('Mit Mitarbeiter abgeglichen');
  await fenster.getByRole('button', { name: 'Bereits durchgeführte Korrektur bestätigen' }).click();
  await expect(fenster.getByText(/gewünschte Korrektur muss zuerst/)).toBeVisible();
  await fenster.getByRole('button', { name: 'Schließen', exact: true }).click();
  // Der bestehende Belegablauf entsperrt; der Test bildet nur dessen Ergebnis ab.
  await admin.from('time_entries').update({ is_billed: false }).eq('id', id);
  await page.goto(`/time?korrektur=${a!.id}`);
  await expect(fenster.locator('#startTime')).toBeVisible();
  await fenster.getByLabel('Begründung der Entscheidung').fill('Beginn nach Rücksprache berichtigt');
  await fenster.locator('#startTime').fill('08:00');
  await fenster.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
  await expect(fenster).not.toBeVisible();
  await expect(async () => {
    expect((await admin.from('time_entries').select('start_time').eq('id', id).single()).data?.start_time).toBe('08:00:00');
    expect((await admin.from('zeitkorrekturen').select('stand').eq('id', a!.id).single()).data?.stand).toBe('umgesetzt');
  }).toPass();
});

test('Abgeschaltete Zeiterfassung behält Archiv und Mitarbeiterübersicht ohne neue Erfassungsaktionen', async ({ page }) => {
  await admin.from('companies').update({ modules: { zeiterfassung: false } }).eq('id', BETRIEB);
  await anmelden(page, CHEFIN.email);
  await page.goto('/time');
  await expect(page.getByText(/Die Zeiterfassung ist ausgeschaltet/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zeit buchen', exact: true })).toHaveCount(0);
  await page.goto('/accounting');
  await expect(page.getByRole('heading', { name: 'Mitarbeiterübersicht', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zeit erfassen', exact: true })).toHaveCount(0);
  await keineFehlermeldung(page);
});

test('Offline-Abschluss: abgelehnte Buchung behält Tätigkeiten und lässt sich berichtigen', async ({ page, context }) => {
  await page.clock.setFixedTime(new Date('2026-11-05T07:00:00+01:00'));
  await anmelden(page, MONTEUR.email); await page.goto('/time');
  // Seit 08.11.2026 die Karte „Arbeitstag“: die Baustelle im Bogen, Start als runder Knopf.
  await expect(page.getByRole('heading', { name: 'Arbeitstag', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Baustelle wählen' }).click();
  await page.locator('#timer-baustelle').selectOption(BAUSTELLE.nummer);
  await page.getByRole('button', { name: 'Übernehmen', exact: true }).click();
  await page.getByRole('button', { name: 'Arbeitstag starten', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause beginnen' })).toBeVisible();
  await page.clock.setFixedTime(new Date('2026-11-05T09:00:00+01:00'));
  await page.getByRole('button', { name: 'Stoppen und prüfen' }).click();
  // E73: Feierabend öffnet die erste offene Zeit gleich im Formular.
  const fenster = page.getByRole('dialog', { name: 'Arbeitszeit buchen' });
  await expect(fenster).toBeVisible();
  await context.setOffline(true);
  await fenster.locator('#comment').fill('Gesicherte Tätigkeit ohne Empfang');
  await fenster.getByRole('button', { name: 'Zeit buchen', exact: true }).click();
  await expect(fenster).not.toBeVisible();
  await expect(page.getByText(/ · auf diesem Gerät vorgemerkt$/)).toBeVisible();
  const { data: person } = await admin.from('users').select('id').eq('company_id', BETRIEB).eq('email', MONTEUR.email).single();
  const id = crypto.randomUUID();
  expect((await admin.from('time_entries').insert({ id, company_id: BETRIEB, user_id: person!.id, user_name: MONTEUR.name,
    date: '2026-11-05', status: 'Anwesend', start_time: '08:00', end_time: '09:00', break_duration: 0,
    project_number: BAUSTELLE.nummer, customer_name: BAUSTELLE.kunde })).error).toBeNull();
  await context.setOffline(false);
  const entwurf = page.locator('details').filter({ has: page.getByText(/Gesicherter Entwurf ·/) });
  await expect(entwurf).toBeVisible();
  await entwurf.locator('summary').click();
  await expect(entwurf.getByText('Gesicherte Tätigkeit ohne Empfang', { exact: true })).toBeVisible();
  expect((await admin.from('time_entries').select('id').eq('company_id', BETRIEB)).data).toHaveLength(1);
  await admin.from('time_entries').delete().eq('id', id);
  await entwurf.getByRole('button', { name: 'Entwurf prüfen' }).click();
  await expect(fenster.locator('#comment')).toHaveValue('Gesicherte Tätigkeit ohne Empfang');
  await fenster.getByRole('button', { name: 'Zeit buchen', exact: true }).click();
  await expect(fenster).not.toBeVisible();
  await expect(async () => {
    const { data } = await admin.from('time_entries').select('comment,hours').eq('company_id', BETRIEB);
    expect(data).toEqual([{ comment: 'Gesicherte Tätigkeit ohne Empfang', hours: 2 }]);
  }).toPass();
});

test('Offline gestarteter Timer behält offene Formulareingaben beim Serverabgleich', async ({ page, context }) => {
  await page.clock.setFixedTime(new Date('2026-11-05T07:00:00+01:00'));
  await anmelden(page, MONTEUR.email); await page.goto('/time');
  await page.getByRole('button', { name: 'Baustelle wählen' }).click();
  await page.locator('#timer-baustelle').selectOption(BAUSTELLE.nummer);
  await page.getByRole('button', { name: 'Übernehmen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Arbeitstag starten', exact: true })).toBeEnabled();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Arbeitstag starten', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause beginnen' })).toBeVisible();
  await page.clock.setFixedTime(new Date('2026-11-05T09:00:00+01:00'));
  await page.getByRole('button', { name: 'Stoppen und prüfen' }).click();
  // E73: Feierabend öffnet die erste offene Zeit gleich im Formular.
  const fenster = page.getByRole('dialog', { name: 'Arbeitszeit buchen' });
  await fenster.locator('#comment').fill('Während des Abgleichs erhalten');
  await context.setOffline(false);
  await expect(async () => {
    const { data } = await admin.from('zeitsitzungen').select('stand').eq('company_id', BETRIEB);
    expect(data).toEqual([{ stand: 'beendet' }]);
  }).toPass();
  await expect(fenster.locator('#comment')).toHaveValue('Während des Abgleichs erhalten');
  await fenster.getByRole('button', { name: 'Zeit buchen', exact: true }).click();
  await expect(fenster).not.toBeVisible();
  await expect(async () => {
    const { data } = await admin.from('time_entries').select('comment').eq('company_id', BETRIEB);
    expect(data).toEqual([{ comment: 'Während des Abgleichs erhalten' }]);
  }).toPass();
});
