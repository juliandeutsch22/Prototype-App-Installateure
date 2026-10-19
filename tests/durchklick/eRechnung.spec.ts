import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { admin, BAUSTELLE, BETRIEB, CHEFIN, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * DIE E-RECHNUNG IM ECHTEN BROWSER (ebInterface 6.1, 19.10.2026).
 *
 * Der ganze Weg: aus gebuchter Zeit eine Rechnung, im Seitenfenster
 * „E-Rechnung (ebInterface) …“, für den Bund mit Auftragsreferenz und
 * Lieferantennummer, die Datei laden — und darin dieselbe Rechnung. Die
 * Lieferantennummer wird beim Kunden gemerkt und beim nächsten Mal
 * vorgeschlagen. Ob die Datei dem Schema entspricht, prüft
 * `tests/unit/ebinterface.test.ts` gegen das offizielle Schema; hier geht es
 * darum, dass der Weg in der App von Anfang bis Ende trägt.
 */
let vorher: Record<string, unknown> | null = null;

test.beforeAll(async () => {
  const { data } = await admin.from('companies').select('strasse, plz, ort, contact_line, iban').eq('id', BETRIEB).single();
  vorher = data;
  // Was e-rechnung.gv.at vom Rechnungssteller verlangt: Anschrift, E-Mail, IBAN.
  await admin.from('companies').update({
    strasse: 'Prüfgasse 1', plz: '1010', ort: 'Wien',
    contact_line: 'Tel 01 1234567 · office@durchklick.test', iban: 'AT611904300234573201',
  }).eq('id', BETRIEB);
});

test.afterAll(async () => {
  if (vorher) await admin.from('companies').update(vorher).eq('id', BETRIEB);
  await admin.from('customers').update({ lieferantennummer: null }).eq('company_id', BETRIEB).eq('name', BAUSTELLE.kunde);
});

test.beforeEach(async () => {
  await admin.from('invoices').delete().eq('company_id', BETRIEB);
  await admin.from('time_entries').delete().eq('company_id', BETRIEB);
  const { data: leute } = await admin.from('users').select('id').eq('email', MONTEUR.email).single();
  const { error } = await admin.from('time_entries').insert({
    id: crypto.randomUUID(), company_id: BETRIEB, user_id: leute!.id, user_name: MONTEUR.name,
    date: '2026-09-01', status: 'Anwesend', start_time: '07:00', end_time: '16:00', break_duration: 30,
    project_number: BAUSTELLE.nummer, source: 'manual',
  });
  if (error) throw new Error(error.message);
});

test('Rechnung an eine Dienststelle des Bundes als E-Rechnung laden', async ({ page }) => {
  test.setTimeout(90_000);
  // Die Geschäftsführung: sie verrechnet und darf Kunden pflegen — so wird auch das Merken geprüft.
  await anmelden(page, CHEFIN.email);
  await page.getByRole('link', { name: 'Rechnungen' }).first().click();
  await page.getByRole('button', { name: 'Neue Rechnung' }).click();
  await page.locator('#invproj').selectOption(BAUSTELLE.nummer);
  await page.getByRole('button', { name: 'Positionen zusammenstellen' }).click();
  await page.getByRole('button', { name: /Rechnung erstellen/ }).click();
  await expect(async () => {
    const { data } = await admin.from('invoices').select('id').eq('company_id', BETRIEB);
    expect(data ?? []).toHaveLength(1);
  }).toPass({ timeout: 25_000 });
  const { data: rechnung } = await admin.from('invoices').select('invoice_number, total_brutto').eq('company_id', BETRIEB).single();

  await page.getByRole('button', { name: new RegExp(`^${rechnung!.invoice_number} · `) }).click();
  await page.getByRole('button', { name: 'E-Rechnung (ebInterface) …' }).click();
  const dialog = page.getByRole('dialog', { name: `E-Rechnung — ${rechnung!.invoice_number}` });
  await dialog.getByRole('button', { name: 'Bund' }).click();

  // Ohne Auftragsreferenz und Lieferantennummer sagt der Dialog, was fehlt — und lädt nichts.
  await expect(dialog.getByText(/Auftragsreferenz fehlt/)).toBeVisible();
  await dialog.getByLabel(/Auftragsreferenz/).fill('Z01:111599');
  await dialog.getByLabel(/Unsere Lieferantennummer/).fill('50012345');
  await expect(dialog.getByLabel('Lieferantennummer beim Kunden merken')).toBeChecked();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Datei laden' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`${rechnung!.invoice_number}.xml`);
  const xml = readFileSync((await download.path())!, 'utf8');
  expect(xml).toContain('xmlns="http://www.ebinterface.at/schema/6p1/"');
  expect(xml).toContain(`<InvoiceNumber>${rechnung!.invoice_number}</InvoiceNumber>`);
  expect(xml).toContain('<OrderID>Z01:111599</OrderID>');
  expect(xml).toContain('<InvoiceRecipientsBillerID>50012345</InvoiceRecipientsBillerID>');
  expect(xml).toContain(`<TotalGrossAmount>${Number(rechnung!.total_brutto).toFixed(2)}</TotalGrossAmount>`);
  await expect(page.getByText(`E-Rechnung ${rechnung!.invoice_number} geladen`)).toBeVisible();

  // Gemerkt beim Kunden — und beim nächsten Mal vorgeschlagen.
  await expect(async () => {
    const { data } = await admin.from('customers').select('lieferantennummer').eq('company_id', BETRIEB).eq('name', BAUSTELLE.kunde).single();
    expect(data?.lieferantennummer).toBe('50012345');
  }).toPass({ timeout: 10_000 });
  await page.getByRole('button', { name: new RegExp(`^${rechnung!.invoice_number} · `) }).click();
  await page.getByRole('button', { name: 'E-Rechnung (ebInterface) …' }).click();
  await expect(page.getByRole('dialog', { name: /E-Rechnung/ }).getByLabel(/Unsere Lieferantennummer/)).toHaveValue('50012345');
  await keineFehlermeldung(page);
});
