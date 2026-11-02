import { test, expect } from '@playwright/test';
import { admin, BETRIEB, BUERO, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * DER ARZTBESUCH VON ANFANG BIS ENDE (E35): der Monteur arbeitet vormittags,
 * meldet den Termin am Nachmittag mit der Arztbestätigung, das Büro sieht den
 * Vorschlag (höchstens der Rest zur Sollzeit), bestätigt mit „geprüft“ — im
 * Zeitkonto steht genau die angerechnete Zeit als „Arztbesuch“, die Datei ist
 * danach gelöscht.
 */
const EIMER = 'freistellungsnachweise';
const TAG = '2026-11-25'; // ein Mittwoch

async function monteurUid(): Promise<string> {
  const { data } = await admin.from('users').select('id').eq('company_id', BETRIEB).eq('email', MONTEUR.email).single();
  return (data as { id: string }).id;
}

async function dateienIm(ordner: string): Promise<string[]> {
  const { data } = await admin.storage.from(EIMER).list(ordner, { limit: 100 });
  return (data ?? []).map((d) => d.name);
}

async function abraeumen() {
  const { data: antraege } = await admin.from('freistellungen').select('id, user_id').eq('company_id', BETRIEB);
  for (const a of (antraege ?? []) as { id: string; user_id: string }[]) {
    const ordner = `${BETRIEB}/${a.user_id}/${a.id}`;
    const namen = await dateienIm(ordner);
    if (namen.length) await admin.storage.from(EIMER).remove(namen.map((n) => `${ordner}/${n}`));
  }
  // Zuerst die Tage, dann die Anträge: der Fremdschlüssel würde sie nur loslösen.
  await admin.from('time_entries').delete().eq('company_id', BETRIEB).not('freistellung_id', 'is', null);
  await admin.from('freistellungen').delete().eq('company_id', BETRIEB);
  await admin.from('time_entries').delete().eq('company_id', BETRIEB).eq('date', TAG);
}

test.beforeEach(abraeumen);
test.afterEach(abraeumen);

test('Arztbesuch: melden mit Bestätigung, Vorschlag, bestätigen, im Zeitkonto', async ({ browser }) => {
  test.setTimeout(150_000);
  const uid = await monteurUid();
  // Vormittags gearbeitet: 6 von 8 Stunden Sollzeit.
  const arbeit = await admin.from('time_entries').insert({
    id: crypto.randomUUID(), company_id: BETRIEB, user_id: uid, user_name: MONTEUR.name, date: TAG, status: 'Anwesend',
    start_time: '07:00', end_time: '13:00', break_duration: 0,
  });
  expect(arbeit.error).toBeNull();

  // 1. Der Monteur meldet den Termin von 13 bis 16 Uhr, mit Arztbestätigung.
  const monteur = await (await browser.newContext()).newPage();
  await anmelden(monteur, MONTEUR.email);
  await monteur.goto('/vacations');
  await monteur.getByLabel('Art').selectOption('arztbesuch');
  await monteur.getByLabel('Tag', { exact: true }).fill(TAG);
  await monteur.getByLabel('Weg vom Arbeitsort um').fill('13:00');
  await monteur.getByLabel('Zurück um').fill('16:00');
  await monteur.getByLabel('Nachweis auswählen').setInputFiles({
    name: 'arztbestaetigung.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n'),
  });
  await expect(monteur.getByText('arztbestaetigung.pdf')).toBeVisible();
  await monteur.getByRole('button', { name: 'Arztbesuch melden' }).click();
  await expect(monteur.getByText(/Nachweis liegt bei/)).toBeVisible({ timeout: 15_000 });
  await keineFehlermeldung(monteur);

  let antragId = '';
  await expect(async () => {
    const { data } = await admin.from('freistellungen')
      .select('id, art, anlass, von, bis, zeit_von, zeit_bis, status, nachweis_pfad').eq('company_id', BETRIEB);
    expect(data).toHaveLength(1);
    const a = (data as Array<Record<string, string>>)[0];
    expect(a).toMatchObject({
      art: 'dienstverhinderung', anlass: 'arztbesuch', von: TAG, bis: TAG, zeit_von: '13:00:00', zeit_bis: '16:00:00', status: 'Beantragt',
    });
    expect(a.nachweis_pfad).toBeTruthy();
    antragId = a.id;
  }).toPass({ timeout: 15_000 });

  // 2. Das Büro sieht den Vorschlag: 2 Stunden fehlen noch zur Sollzeit, der Termin dauert 3.
  const buero = await (await browser.newContext()).newPage();
  await anmelden(buero, BUERO.email);
  await buero.goto('/vacations');
  const karte = buero.locator('section', { has: buero.getByRole('heading', { name: /Sonderurlaub und Arztbesuche bestätigen/ }) });
  await expect(karte.getByText(/Sollzeit 08:00 Std, gearbeitet 06:00 Std — anzurechnen 02:00 Std von 03:00 Std/)).toBeVisible({ timeout: 15_000 });
  await expect(karte.getByLabel('Angerechnet (Std:Min)')).toHaveValue('02:00');

  // Ohne „geprüft“ geht es nicht — der Betrieb verlangt die Bestätigung (ab Werk).
  await karte.getByRole('button', { name: 'Bestätigen', exact: true }).click();
  await expect(buero.getByText(/verlangt für Arztbesuche eine Bestätigung/)).toBeVisible();
  await karte.getByLabel('Arztbestätigung geprüft').check();
  await karte.getByRole('button', { name: 'Bestätigen', exact: true }).click();
  await expect(buero.getByText(/Bestätigt — 02:00 Std angerechnet/)).toBeVisible({ timeout: 15_000 });
  await keineFehlermeldung(buero);

  // 3. Im Zeitkonto: 13:00–15:00 als Arztbesuch, die Datei ist weg, der Vermerk bleibt.
  await expect(async () => {
    const { data } = await admin.from('time_entries').select('status, start_time, end_time, comment')
      .eq('company_id', BETRIEB).eq('freistellung_id', antragId);
    expect(data).toEqual([{ status: 'Dienstverhinderung', start_time: '13:00:00', end_time: '15:00:00', comment: 'Arztbesuch' }]);
    const { data: a } = await admin.from('freistellungen')
      .select('status, minuten, nachweis_pfad, nachweis_geprueft_von_name').eq('id', antragId).single();
    expect(a).toMatchObject({ status: 'Bestätigt', nachweis_pfad: null, nachweis_geprueft_von_name: BUERO.name });
    expect(Number(a?.minuten)).toBe(120);
    expect(await dateienIm(`${BETRIEB}/${uid}/${antragId}`)).toEqual([]);
  }).toPass({ timeout: 15_000 });

  // 4. Der Monteur sieht, was angerechnet wurde, und warum nicht alles.
  await monteur.reload();
  await expect(monteur.getByText('Angerechnet 02:00 Std von 03:00 Std (der Rest lag außerhalb der Sollzeit)')).toBeVisible({ timeout: 15_000 });
});
