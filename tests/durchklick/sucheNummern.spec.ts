import { test, expect } from '@playwright/test';
import { admin, ARTIKEL, BETRIEB, BUERO, CHEFIN, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * „Suchen oder springen“ findet Nummern (C3, E91) — im echten Browser,
 * gegen den echten Stapel: die Abfrage, der Zeilenschutz und der Sprung bis
 * zur offenen Rechnung. Die Bausteine prüfen jedes Stück einzeln; die Naht
 * (Treffer → Adresse → Seite, die ihn aufmacht) nur hier.
 */

const RECHNUNG = 'RE-SUCHE-0042';
const ZWEITE = { nummer: 'B-2026-0091', kunde: 'Familie Suchtest' };

test.afterEach(async () => {
  await admin.from('invoices').delete().eq('company_id', BETRIEB).eq('invoice_number', RECHNUNG);
  await admin.from('projects').delete().eq('company_id', BETRIEB).like('project_number', 'B-2026-009%');
});

async function suchen(page: import('@playwright/test').Page, begriff: string) {
  await page.keyboard.press('Control+k');
  const fenster = page.getByRole('dialog', { name: 'Suchen oder springen' });
  await fenster.getByRole('combobox', { name: 'Suchen oder springen' }).fill(begriff);
  return fenster;
}

test('Das Büro sucht eine Rechnungsnummer und landet in der offenen Rechnung', async ({ page }) => {
  const { error } = await admin.from('invoices').insert({
    company_id: BETRIEB, invoice_number: RECHNUNG, invoice_date: '2026-10-02', due_date: '2026-10-16',
    total_netto: 100, total_vat: 20, total_brutto: 120, payment_status: 'Bezahlt', bezahlt_betrag: 120,
    project_number: 'B-2026-0001', customer_name: 'Familie Huber',
  });
  if (error) throw new Error(error.message);

  await anmelden(page, BUERO.email);
  const fenster = await suchen(page, 'SUCHE-0042');
  const treffer = fenster.getByRole('option', { name: new RegExp(RECHNUNG) });
  await expect(treffer).toContainText('02.10.2026');
  await treffer.click();

  // Bezahlt und trotzdem da: die Suche gilt über alle, und das Fenster der Rechnung steht offen.
  await expect(page.getByRole('dialog', { name: new RegExp(`^Rechnung ${RECHNUNG}`) })).toBeVisible();
  await keineFehlermeldung(page);
});

test('Der Monteur findet einen Artikel und landet bei „Material anfordern“ — Rechnungen findet er nicht', async ({ page }) => {
  const { error } = await admin.from('invoices').insert({
    company_id: BETRIEB, invoice_number: RECHNUNG, invoice_date: '2026-10-02', due_date: '2026-10-16',
    total_netto: 100, total_vat: 20, total_brutto: 120, payment_status: 'Offen',
    project_number: 'B-2026-0001', customer_name: 'Familie Huber',
  });
  if (error) throw new Error(error.message);

  await anmelden(page, MONTEUR.email);
  let fenster = await suchen(page, 'SUCHE-0042');
  await expect(fenster.getByText('Nichts gefunden.')).toBeVisible();
  await expect(fenster.getByRole('group', { name: 'Rechnungen' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  fenster = await suchen(page, 'Kupferrohr');
  await fenster.getByRole('option', { name: new RegExp(ARTIKEL.name) }).click();
  await expect(page).toHaveURL(/\/material\?suche=/);
  await expect(page.getByRole('searchbox', { name: /Suche/ })).not.toHaveValue('');
  await expect(page.getByText(ARTIKEL.name).first()).toBeVisible();
  await keineFehlermeldung(page);
});

test('Zwei Baustellen eines Kunden: die Kurzbezeichnung steht im Treffer und in der Auswahl', async ({ page }) => {
  const anlegen = await admin.from('projects').insert([
    { company_id: BETRIEB, project_number: ZWEITE.nummer, customer_name: ZWEITE.kunde, bezeichnung: 'Bad', address: 'Gasse 2, 1010 Wien', status: 'Aktiv' },
    { company_id: BETRIEB, project_number: 'B-2026-0092', customer_name: ZWEITE.kunde, bezeichnung: 'Heizung', address: 'Gasse 2, 1010 Wien', status: 'Aktiv' },
  ]);
  if (anlegen.error) throw new Error(anlegen.error.message);

  await anmelden(page, CHEFIN.email);
  const fenster = await suchen(page, 'Suchtest');
  await expect(fenster.getByRole('option', { name: new RegExp(ZWEITE.nummer) })).toContainText('Bad');
  await expect(fenster.getByRole('option', { name: /B-2026-0092/ })).toContainText('Heizung');
  await page.keyboard.press('Escape');

  // Dieselbe Unterscheidung in der Auswahl der Zeiterfassung — dort mit der Nummer vorn (Runde 6, G3).
  await page.goto('/time');
  // Im Büro steht die Baustelle hinter „Erweiterte Erfassung“ — so ist es gewollt.
  await page.getByRole('checkbox', { name: /Erweiterte Erfassung/ }).check();
  // Das Formular der Zeiterfassung (`#project`), nicht die Auswahl des Timers.
  const auswahl = page.locator('select#project');
  await expect(auswahl.locator('option', { hasText: 'B-2026-0091 · Familie Suchtest · Bad' })).toHaveCount(1);
  await expect(auswahl.locator('option', { hasText: 'B-2026-0092 · Familie Suchtest · Heizung' })).toHaveCount(1);
});
