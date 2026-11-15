import { test, expect } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, CHEFIN } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * KONTOAUSZUG ABGLEICHEN (Durchsicht 15.11.2026, F13) — der ganze Weg im
 * Browser: aus den Rechnungen über ⋯ zum Abgleich, die Datei der Bank wählen,
 * der Vorschlag ordnet über die Rechnungsnummer zu, mit Rückfrage verbuchen,
 * die Rechnung ist bezahlt. Dieselbe Datei noch einmal: „schon erfasst“,
 * nichts doppelt.
 */
const NUMMER = 'RE-KA-0001';

function heute(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date());
}

async function abraeumen() {
  const { data } = await admin.from('invoices').select('id').eq('company_id', BETRIEB).eq('invoice_number', NUMMER);
  const ids = (data ?? []).map((r) => r.id as string);
  if (ids.length > 0) await admin.from('zahlungseingaenge').delete().in('invoice_id', ids);
  await admin.from('invoices').delete().eq('company_id', BETRIEB).eq('invoice_number', NUMMER);
}
test.beforeEach(abraeumen);
test.afterEach(abraeumen);

test('Kontoauszug: Datei einlesen, Vorschlag verbuchen, dieselbe Datei kein zweites Mal', async ({ page }) => {
  test.setTimeout(150_000);
  const { data: kunde } = await admin.from('customers').select('id').eq('company_id', BETRIEB).eq('name', BAUSTELLE.kunde).single();
  const rechnung = await admin.from('invoices').insert({
    company_id: BETRIEB, invoice_number: NUMMER, project_number: BAUSTELLE.nummer, customer_id: kunde!.id,
    customer_name: BAUSTELLE.kunde, invoice_date: heute(), due_date: heute(),
    subtotal_netto: 600, total_netto: 600, total_vat: 120, total_brutto: 720, vat_rate: 0.2, payment_status: 'Offen',
  }).select('id').single();
  expect(rechnung.error).toBeNull();
  const [j, m, t] = heute().split('-');
  const csv = [
    'Buchungsdatum;Partnername;Partner IBAN;Betrag;Währung;Zahlungsreferenz',
    `${t}.${m}.${j};${BAUSTELLE.kunde};AT61 1904 3002 3457 3201;720,00;EUR;${NUMMER} / ${BAUSTELLE.nummer}`,
    `${t}.${m}.${j};Stadtwerke;;-80,00;EUR;Strom`,
  ].join('\n');
  const datei = { name: 'umsaetze.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') };

  await anmelden(page, CHEFIN.email);
  await page.goto('/invoices');
  await page.getByRole('button', { name: 'Weitere Aktionen für Rechnungen' }).click();
  await page.getByRole('menuitem', { name: 'Kontoauszug abgleichen' }).click();
  await expect(page).toHaveURL(/\/invoices\/kontoauszug$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Kontoauszug abgleichen' })).toBeVisible();

  await page.locator('#kontoauszug-datei').setInputFiles(datei);
  await expect(page.getByRole('heading', { name: 'Zugeordnet (1)' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(`Gleicht ${NUMMER} aus.`)).toBeVisible();
  await expect(page.getByText(/1 Eingang, 1 Abbuchung — davon 1 nicht Rechnungen betreffend/)).toBeVisible();

  await page.getByRole('button', { name: '1 Bewegung verbuchen' }).click();
  const frage = page.getByRole('dialog');
  await expect(frage.getByText(/auf 1 Rechnung,/)).toBeVisible();
  await frage.getByRole('button', { name: 'Verbuchen' }).click();
  await expect(page.getByRole('heading', { name: 'Schon erfasst (1)' })).toBeVisible({ timeout: 20_000 });

  const { data: nachher } = await admin.from('invoices').select('payment_status, bezahlt_betrag').eq('id', rechnung.data!.id).single();
  expect(nachher).toMatchObject({ payment_status: 'Bezahlt' });
  const { data: eingang } = await admin.from('zahlungseingaenge').select('betrag, art, bank_buchung, hinweis').eq('invoice_id', rechnung.data!.id);
  expect(eingang).toHaveLength(1);
  expect(eingang![0]).toMatchObject({ art: 'Überweisung' });
  expect(eingang![0].bank_buchung).not.toBeNull();
  expect(eingang![0].hinweis).toContain(NUMMER);

  // Dieselbe Datei ein zweites Mal: erkannt, nichts zu verbuchen.
  await page.locator('#kontoauszug-datei').setInputFiles(datei);
  await expect(page.getByRole('heading', { name: 'Schon erfasst (1)' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Diese Bewegung ist schon verbucht.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Bewegungen? verbuchen/ })).toHaveCount(0);
  await keineFehlermeldung(page);
});
