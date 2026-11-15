import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { admin, BETRIEB, CHEFIN, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * DIE AUFTRAGSKETTE (Durchsicht 15.11.2026, Paket 5) — im echten Browser
 * gegen die echte Datenbank, Ende zu Ende:
 *
 * 1. Ein Angebot wird als NACHTRAG an eine laufende Baustelle desselben
 *    Kunden angenommen (A3/F6): keine zweite Baustelle, ihr Stundenbudget
 *    wächst um die kalkulierten Stunden.
 * 2. Die Annahme wird zurückgenommen (A1/F7): Grund ist Pflicht, die
 *    Rückfrage sagt „Nachtrag wird gelöst“, die Baustelle bleibt, ihr Budget
 *    sinkt wieder; das Angebot ist wieder versendet.
 * 3. Ein zweites Angebot wird als NEUE Baustelle angenommen.
 * 4. Diese Baustelle wird GEFÜHRT ABGESCHLOSSEN (A11/F1/V2): der Dialog
 *    nennt, was offen ist (ein Schein-Entwurf), und schließt erst mit
 *    „Trotzdem abschließen“ ab.
 *
 * Gegenprobe: auf dem Stand vor Paket 5 fehlt im Annahmedialog die Wahl
 * „An eine bestehende Baustelle (Nachtrag)“ (Schritt 1 rot); ohne die
 * Nachbesserung 85a6271a sagt die Rückfrage in Schritt 2 „Die Baustelle …
 * wird gelöscht“ (rot); ohne A11 fehlt im „⋯“ der Akte „Abschließen“
 * (Schritt 4 rot).
 */

const KUNDE = 'Familie Kettenprobe';
const BESTEHEND = 'KT-2026-0001';
const NACHTRAG = 'AN-2026-KT01';
const NEU = 'AN-2026-KT02';
const heute = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });

async function aufraeumen() {
  // Der Dienstschlüssel darf, was die App nie darf: angenommene Angebote samt Baustellen wegräumen.
  const { data: baustellen } = await admin.from('projects').select('id').eq('company_id', BETRIEB).eq('customer_name', KUNDE);
  const pids = (baustellen ?? []).map((p) => p.id as string);
  if (pids.length) await admin.from('work_sheets').delete().in('project_id', pids);
  const { data: alte } = await admin.from('quotes').select('id').eq('company_id', BETRIEB).eq('customer_name', KUNDE);
  const ids = (alte ?? []).map((q) => q.id as string);
  if (ids.length) {
    await admin.from('angebot_links').delete().in('quote_id', ids);
    await admin.from('quotes').delete().in('id', ids);
  }
  if (pids.length) await admin.from('projects').delete().in('id', pids);
  await admin.from('customers').delete().eq('company_id', BETRIEB).eq('name', KUNDE);
}
test.beforeEach(aufraeumen);
test.afterEach(aufraeumen);

async function angebot(kunde: string, nummer: string, stunden: number): Promise<string> {
  const { data, error } = await admin.from('quotes').insert({
    company_id: BETRIEB, quote_number: nummer, customer_id: kunde, customer_name: KUNDE, address: 'Kettengasse 3, 1030 Wien',
    quote_date: heute(), valid_until: '2099-12-31', status: 'Versendet', versendet_am: new Date().toISOString(), vat_rate: 0.2,
    subtotal_netto: stunden * 75, total_netto: stunden * 75, total_vat: stunden * 15, total_brutto: stunden * 90,
    kalkulierte_stunden: stunden,
  }).select('id').single();
  expect(error).toBeNull();
  const id = data!.id as string;
  expect((await admin.from('quote_lines').insert({
    company_id: BETRIEB, quote_id: id, position: 0, label: 'Montage', qty: stunden, unit: 'h', unit_price: 75,
    netto: stunden * 75, ist_arbeitszeit: true,
  })).error).toBeNull();
  return id;
}

const zeile = async (tabelle: 'quotes' | 'projects', id: string, spalten: string) =>
  (await admin.from(tabelle).select(spalten).eq('id', id).single()).data as unknown as Record<string, unknown>;

async function annehmenDialog(page: Page, id: string) {
  await page.goto(`/quotes/${id}`);
  await page.getByRole('button', { name: 'Annehmen → Baustelle' }).click();
  return page.getByRole('dialog', { name: 'Angebot annehmen?' });
}

test('Nachtrag annehmen → zurücknehmen → neue Baustelle annehmen → geführt abschließen', async ({ page }) => {
  test.setTimeout(240_000);
  const { data: k, error: kf } = await admin.from('customers').insert({
    company_id: BETRIEB, name: KUNDE, address: 'Kettengasse 3, 1030 Wien', kundenart: 'privat',
  }).select('id').single();
  expect(kf).toBeNull();
  const kunde = k!.id as string;
  const { data: b, error: bf } = await admin.from('projects').insert({
    company_id: BETRIEB, project_number: BESTEHEND, description: 'Heizung Kettenprobe', customer_id: kunde,
    customer_name: KUNDE, address: 'Kettengasse 3, 1030 Wien', status: 'Aktiv', estimated_hours: 10, billing_mode: 'Regie',
  }).select('id').single();
  expect(bf).toBeNull();
  const bestehend = b!.id as string;
  const nachtrag = await angebot(kunde, NACHTRAG, 4);
  const neu = await angebot(kunde, NEU, 6);

  await anmelden(page, CHEFIN.email);

  // 1. Als Nachtrag an die laufende Baustelle desselben Kunden.
  let dialog = await annehmenDialog(page, nachtrag);
  await expect(dialog.getByRole('radio', { name: 'Neue Baustelle' })).toBeChecked();
  await dialog.getByRole('radio', { name: 'An eine bestehende Baustelle (Nachtrag)' }).check();
  await expect(dialog.getByRole('button', { name: 'Annehmen' })).toBeDisabled();
  await dialog.getByText(`${KUNDE} (${BESTEHEND})`).click({ timeout: 20_000 });
  await expect(dialog.getByText(/Stundenbudget der Baustelle wächst um 4 h/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Annehmen' }).click();
  await expect(page.getByText(`${NACHTRAG} als Nachtrag an Baustelle ${BESTEHEND} angehängt`)).toBeVisible({ timeout: 20_000 });
  await keineFehlermeldung(page);
  await expect.poll(async () => zeile('quotes', nachtrag, 'status, nachtrag, project_number'))
    .toMatchObject({ status: 'Angenommen', nachtrag: true, project_number: BESTEHEND });
  expect(Number((await zeile('projects', bestehend, 'estimated_hours')).estimated_hours)).toBe(14);
  // Keine zweite Baustelle.
  expect((await admin.from('projects').select('id').eq('company_id', BETRIEB).eq('customer_name', KUNDE)).data).toHaveLength(1);

  // 2. Die Annahme zurücknehmen: Grund Pflicht, die Folge steht davor.
  await page.reload();
  await page.getByRole('button', { name: `Weitere Aktionen für Angebot ${NACHTRAG}` }).click();
  await page.getByRole('menuitem', { name: 'Annahme zurücknehmen' }).click();
  dialog = page.getByRole('dialog', { name: 'Annahme zurücknehmen?' });
  await expect(dialog.getByText(`Der Nachtrag wird von Baustelle ${BESTEHEND} gelöst, ihr Stundenbudget sinkt um 4 h. Die Baustelle selbst bleibt, wie sie ist.`))
    .toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByText(/wird gelöscht/)).toHaveCount(0);
  const zurueck = dialog.getByRole('button', { name: 'Annahme zurücknehmen' });
  await expect(zurueck).toBeDisabled();
  await dialog.getByLabel(/Grund/).fill('Nachtrag doppelt erfasst');
  await zurueck.click();
  await expect(page.getByText(new RegExp(`Annahme zurückgenommen — ${NACHTRAG} ist wieder versendet\\. Nachtrag von Baustelle ${BESTEHEND} gelöst\\.`)))
    .toBeVisible({ timeout: 20_000 });
  await keineFehlermeldung(page);
  await expect.poll(async () => zeile('quotes', nachtrag, 'status, nachtrag, project_number, annahme_zurueckgenommen_grund'))
    .toMatchObject({ status: 'Versendet', nachtrag: false, project_number: null, annahme_zurueckgenommen_grund: 'Nachtrag doppelt erfasst' });
  const nachher = await zeile('projects', bestehend, 'status, estimated_hours');
  expect(nachher.status).toBe('Aktiv');
  expect(Number(nachher.estimated_hours)).toBe(10);

  // 3. Das zweite Angebot als neue Baustelle.
  dialog = await annehmenDialog(page, neu);
  await expect(dialog.getByRole('radio', { name: 'Neue Baustelle' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Annehmen' }).click();
  await expect(page.getByText(/^Baustelle .+ angelegt/).first()).toBeVisible({ timeout: 20_000 });
  await keineFehlermeldung(page);
  await expect.poll(async () => (await zeile('quotes', neu, 'status')).status).toBe('Angenommen');
  const { project_number: nummer, project_id: pid } = await zeile('quotes', neu, 'project_number, project_id') as { project_number: string; project_id: string };
  expect(nummer).not.toBe(BESTEHEND);
  const angelegt = await zeile('projects', pid, 'status, estimated_hours, customer_id');
  expect(angelegt).toMatchObject({ status: 'Aktiv', customer_id: kunde });
  expect(Number(angelegt.estimated_hours)).toBe(6);

  // 4. Geführt abschließen: ein Schein-Entwurf ist offen — er hält nicht auf, bleibt aber nicht unbemerkt.
  const { data: m } = await admin.from('users').select('id').eq('email', MONTEUR.email).single();
  expect((await admin.from('work_sheets').insert({
    id: randomUUID(), company_id: BETRIEB, project_number: nummer, project_id: pid, customer_name: KUNDE,
    datum: heute(), status: 'Entwurf', abrechnung: 'Regie', erstellt_von_uid: m!.id, erstellt_von_name: MONTEUR.name,
  })).error).toBeNull();
  await page.goto(`/admin-projects/${pid}`);
  await page.getByRole('button', { name: `Weitere Aktionen für Baustelle ${nummer}` }).click({ timeout: 20_000 });
  await page.getByRole('menuitem', { name: 'Abschließen' }).click();
  dialog = page.getByRole('dialog', { name: `Baustelle ${nummer} abschließen?` });
  await expect(dialog.getByText('Ein Handwerksschein ist noch Entwurf')).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByText(/Noch offen — das bleibt auch nach dem Abschließen bestehen/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Trotzdem abschließen' }).click();
  await expect(page.getByText(`Baustelle ${nummer} abgeschlossen`)).toBeVisible({ timeout: 20_000 });
  await keineFehlermeldung(page);
  await expect.poll(async () => (await zeile('projects', pid, 'status')).status).toBe('Abgeschlossen');
  // Der Schein bleibt, wie der Dialog sagt.
  expect((await admin.from('work_sheets').select('status').eq('project_id', pid)).data).toEqual([{ status: 'Entwurf' }]);
});
