import { test, expect } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, CHEFIN } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * DIE RECHNUNG ÖFFNET SICH IN DER KUNDENAKTE (Auftrag 03.11.2026: „die
 * Rechnungen sollten sich direkt in der Akte öffnen lassen, durch ein Modal
 * oder Overlayfenster, und nicht einfach zur Rechnungsseite wechseln“).
 *
 * Von der Akte aus: Zeile antippen → das Seitenfenster mit Angaben,
 * Leistungen und Summen, die Adresse bleibt die der Akte; „PDF laden“ lädt
 * den Beleg; Schließen lässt die Akte stehen. „In Rechnungen bearbeiten“
 * führt zu den Rechnungen, wo dieselbe Rechnung schon offen ist — mit
 * „Zahlung erfassen“.
 */
const NUMMER = 'RE-AKTE-1';

async function abraeumen() {
  await admin.from('invoices').delete().eq('company_id', BETRIEB).eq('invoice_number', NUMMER);
}
test.beforeEach(abraeumen);
test.afterEach(abraeumen);

test('Kundenakte: Rechnung im Fenster lesen, als PDF laden, zum Bearbeiten öffnen', async ({ page }) => {
  test.setTimeout(150_000);
  const { data: kunde } = await admin.from('customers').select('id').eq('company_id', BETRIEB).eq('name', BAUSTELLE.kunde).single();
  const { data: baustelle } = await admin.from('projects').select('id').eq('company_id', BETRIEB).eq('project_number', BAUSTELLE.nummer).single();
  const rechnung = await admin.from('invoices').insert({
    company_id: BETRIEB, invoice_number: NUMMER, project_id: baustelle!.id, project_number: BAUSTELLE.nummer,
    customer_id: kunde!.id, customer_name: BAUSTELLE.kunde, invoice_date: '2026-11-02', due_date: '2026-11-16',
    subtotal_netto: 600, total_netto: 600, total_vat: 120, total_brutto: 720, vat_rate: 0.2, payment_status: 'Offen',
  }).select('id').single();
  expect(rechnung.error).toBeNull();
  const zeile = await admin.from('invoice_lines').insert({
    company_id: BETRIEB, invoice_id: rechnung.data!.id, position: 1, label: 'Therme getauscht', qty: 1, unit: 'Pausch.',
    unit_price: 600, netto: 600,
  });
  expect(zeile.error).toBeNull();

  await anmelden(page, CHEFIN.email);
  const akte = `/customers/${kunde!.id}`;
  await page.goto(akte);
  await page.getByRole('tab', { name: 'Belege' }).click();
  const karte = page.locator('#k-rechnungen');
  await karte.getByRole('button', { name: new RegExp(NUMMER) }).click();

  // Das Fenster steht über der Akte; die Adresse bleibt die der Akte.
  const fenster = page.getByRole('dialog', { name: `Rechnung ${NUMMER}` });
  await expect(fenster).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(new RegExp(`${akte}(\\?bereich=belege)?$`));
  await expect(fenster.getByText('Therme getauscht')).toBeVisible();
  await expect(fenster.getByText('Rechnungsdatum')).toBeVisible();

  // Der Beleg als PDF — derselbe Weg wie auf der Rechnungsseite.
  const download = page.waitForEvent('download', { timeout: 30_000 });
  await fenster.getByRole('button', { name: 'PDF laden' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);

  // Schließen lässt die Akte stehen.
  await fenster.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(fenster).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`${akte}(\\?bereich=belege)?$`));

  // Zum Bearbeiten: die Rechnungen, mit derselben Rechnung schon offen.
  await karte.getByRole('button', { name: new RegExp(NUMMER) }).click();
  await page.getByRole('dialog', { name: `Rechnung ${NUMMER}` }).getByRole('button', { name: 'In Rechnungen bearbeiten' }).click();
  await expect(page).toHaveURL(/\/invoices/);
  const dort = page.getByRole('dialog', { name: `Rechnung ${NUMMER}` });
  await expect(dort.getByRole('button', { name: 'Zahlung erfassen' })).toBeVisible({ timeout: 15_000 });
  // Einmal geöffnet, dann ist der Parameter weg: Schließen öffnet nicht wieder.
  await expect(page).not.toHaveURL(/oeffnen=/);
  await dort.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(dort).toBeHidden();
  await keineFehlermeldung(page);
});
