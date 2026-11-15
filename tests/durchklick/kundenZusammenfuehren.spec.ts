import { test, expect } from '@playwright/test';
import { admin, BETRIEB, CHEFIN } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * KUNDEN ZUSAMMENFÜHREN (Durchsicht 15.11.2026, F9) — im echten Browser
 * gegen die echte Datenbank, Ende zu Ende:
 *
 * Eine Dublette mit Baustelle und ausgestellter Rechnung wird aus der Akte
 * des richtigen Kunden heraus zusammengeführt: doppelten Kunden suchen,
 * Vorschau lesen (was wandert, Hinweis zur Kundennummer), die E-Mail der
 * Dublette übernehmen, zusammenführen. Danach trägt die Akte Baustelle und
 * Rechnung, die Rechnung ihren alten Namen (eingefroren), und die Dublette
 * gibt es nicht mehr; der Verlauf nennt den Vorgang.
 *
 * Gegenprobe: vor F9 fehlt im ⋯ der Akte „Mit anderem Kunden
 * zusammenführen …“ (Schritt 1 rot).
 */

const RICHTIG = 'Zusammenführ Maier GmbH';
const DOPPELT = 'Zusammenführ Meier GmbH';
const NUMMER = 'ZF-2026-0001';

async function aufraeumen() {
  const { data: kunden } = await admin.from('customers').select('id').eq('company_id', BETRIEB).in('name', [RICHTIG, DOPPELT]);
  const ids = (kunden ?? []).map((k) => k.id as string);
  if (!ids.length) return;
  await admin.from('invoices').delete().eq('company_id', BETRIEB).in('customer_id', ids);
  await admin.from('projects').delete().eq('company_id', BETRIEB).in('customer_id', ids);
  await admin.from('customers').delete().in('id', ids);
}
test.beforeEach(aufraeumen);
test.afterEach(aufraeumen);

test('Dublette mit Baustelle und Rechnung aus der Akte zusammenführen', async ({ page }) => {
  test.setTimeout(180_000);
  const { data: r } = await admin.from('customers').insert({
    company_id: BETRIEB, name: RICHTIG, strasse: 'Hauptstraße 1', plz: '1010', ort: 'Wien', kundennummer: 'ZF-1', kundenart: 'unternehmen',
  }).select('id').single();
  const { data: d } = await admin.from('customers').insert({
    company_id: BETRIEB, name: DOPPELT, strasse: 'Hauptstraße 1', plz: '1010', ort: 'Wien', kundennummer: 'ZF-2', email: 'office@zf.test',
  }).select('id').single();
  const richtig = r!.id as string;
  const doppelt = d!.id as string;
  await admin.from('projects').insert({ company_id: BETRIEB, project_number: NUMMER, customer_id: doppelt, customer_name: DOPPELT, status: 'Aktiv' });
  const { data: re, error } = await admin.from('invoices').insert({
    company_id: BETRIEB, invoice_number: 'RE-ZF-0001', project_number: NUMMER, customer_id: doppelt, customer_name: DOPPELT,
    address: 'Hauptstraße 1, 1010 Wien', invoice_date: '2026-11-02', due_date: '2026-11-16',
    total_netto: 100, total_vat: 20, total_brutto: 120, payment_status: 'Offen',
  }).select('id').single();
  expect(error).toBeNull();

  await anmelden(page, CHEFIN.email);
  await page.goto(`/customers/${richtig}`);

  // 1. Aus dem ⋯ der Akte.
  await page.getByRole('button', { name: `Weitere Aktionen für Kunde ${RICHTIG}` }).click();
  await page.getByRole('menuitem', { name: 'Mit anderem Kunden zusammenführen …' }).click();
  const dialog = page.getByRole('dialog', { name: 'Kunden zusammenführen' });
  await expect(dialog.getByRole('button', { name: 'Zusammenführen' })).toBeDisabled();

  // 2. Den doppelten Kunden suchen und wählen.
  await dialog.getByRole('searchbox', { name: 'Doppelter Kunde' }).fill('Zusammenführ Meier');
  await dialog.getByRole('button', { name: DOPPELT }).click({ timeout: 20_000 });

  // 3. Die Vorschau.
  await expect(dialog.getByText(`Wandert von „${DOPPELT}“ zu „${RICHTIG}“`)).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByText('1 Baustelle')).toBeVisible();
  await expect(dialog.getByText('1 Rechnung')).toBeVisible();
  await expect(dialog.getByText(/behalten Name und Anschrift/)).toBeVisible();
  await expect(dialog.getByText(/künftig unter Kundennummer ZF-1, nicht mehr unter ZF-2/)).toBeVisible();
  // Die E-Mail hat nur die Dublette — vorbelegt kommt sie mit.
  await expect(dialog.getByRole('group', { name: 'E-Mail' }).getByRole('radio', { name: /office@zf\.test/ })).toBeChecked();

  // 4. Zusammenführen.
  await dialog.getByRole('button', { name: 'Zusammenführen' }).click();
  await expect(page.getByText(`Kunden zusammengeführt: ${RICHTIG}`)).toBeVisible({ timeout: 20_000 });
  await keineFehlermeldung(page);

  // Die Akte trägt Baustelle und E-Mail; die Dublette ist weg; die Rechnung behält ihren Namen.
  await expect(page.getByText('office@zf.test').first()).toBeVisible({ timeout: 20_000 });
  expect((await admin.from('customers').select('id').eq('id', doppelt)).data).toEqual([]);
  const { data: rechnung } = await admin.from('invoices').select('customer_id, customer_name').eq('id', re!.id).single();
  expect(rechnung).toEqual({ customer_id: richtig, customer_name: DOPPELT });
  const { data: baustelle } = await admin.from('projects').select('customer_id, customer_name').eq('project_number', NUMMER).eq('company_id', BETRIEB).single();
  expect(baustelle).toEqual({ customer_id: richtig, customer_name: RICHTIG });

  // Ein altes Lesezeichen auf die Dublette sagt, dass es sie nicht mehr gibt.
  await page.goto(`/customers/${doppelt}`);
  await expect(page.getByText('Diesen Kunden gibt es nicht (mehr).')).toBeVisible({ timeout: 20_000 });
});
