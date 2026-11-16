import { test, expect } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, CHEFIN } from './aufbau';
import { anmelden, imMenue, keineFehlermeldung } from './helfer';

/**
 * RECHNUNG PER MAIL AUS DER APP (Durchsicht 15.11.2026, F16) — der ganze Weg
 * im Browser gegen den örtlichen Stapel: Rechnung öffnen, „Per Mail senden …“,
 * Empfänger und Text stehen vorbelegt, senden — die Mail liegt im Mailfänger
 * (Mailpit) mit PDF im Anhang, und der Verlauf der Rechnung sagt „Per Mail
 * versendet“ mit Empfänger.
 *
 * Braucht `[edge_runtime.secrets]` aus `supabase/config.toml` (SMTP auf
 * „inbucket“) — `supabase start` und `functions serve` lesen sie.
 */
const NUMMER = 'RE-MAIL-0001';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

async function abraeumen() {
  await admin.from('beleg_versand').delete().eq('company_id', BETRIEB).eq('beleg_nummer', NUMMER);
  await admin.from('invoices').delete().eq('company_id', BETRIEB).eq('invoice_number', NUMMER);
  // Wie der Aufbau ihn anlegt: ohne Adresse — andere Wege rechnen damit nicht.
  await admin.from('customers').update({ email: null }).eq('company_id', BETRIEB).eq('name', BAUSTELLE.kunde);
  await admin.from('companies').update({ beleg_mail_antwort: null }).eq('id', BETRIEB);
}
test.beforeEach(abraeumen);
test.afterEach(abraeumen);

test('Rechnung per Mail: vorbelegt senden, Mail mit PDF kommt an, steht im Verlauf', async ({ page }) => {
  test.setTimeout(150_000);
  await admin.from('companies').update({ beleg_mail_antwort: 'buero@durchklick.test' }).eq('id', BETRIEB);
  const { data: kunde } = await admin.from('customers').select('id').eq('company_id', BETRIEB).eq('name', BAUSTELLE.kunde).single();
  await admin.from('customers').update({ email: 'huber@kunde.test' }).eq('id', kunde!.id);
  const rechnung = await admin.from('invoices').insert({
    company_id: BETRIEB, invoice_number: NUMMER, project_number: BAUSTELLE.nummer, customer_id: kunde!.id,
    customer_name: BAUSTELLE.kunde, invoice_date: '2026-11-02', due_date: '2026-11-16',
    subtotal_netto: 600, total_netto: 600, total_vat: 120, total_brutto: 720, vat_rate: 0.2, payment_status: 'Offen',
  }).select('id').single();
  expect(rechnung.error).toBeNull();
  await admin.from('invoice_lines').insert({
    company_id: BETRIEB, invoice_id: rechnung.data!.id, position: 1, label: 'Therme getauscht', qty: 1, unit: 'Pausch.',
    unit_price: 600, netto: 600,
  });

  await anmelden(page, CHEFIN.email);
  await page.goto(`/invoices?suche=${NUMMER}&oeffnen=${rechnung.data!.id}`);
  const fenster = page.getByRole('dialog', { name: `Rechnung ${NUMMER}` });
  // U4: Hauptaktion „Zahlung erfassen“, daneben „PDF laden“ — „Per Mail senden …“ steht im ⋯ des Fensters.
  await expect(fenster).toBeVisible({ timeout: 20_000 });
  await (await imMenue(page, fenster, 'Per Mail senden …')).click();

  const mail = page.getByRole('dialog', { name: 'Rechnung per Mail' });
  await expect(mail.getByLabel(/^An/)).toHaveValue('huber@kunde.test');
  await expect(mail.getByLabel(/^Betreff/)).toHaveValue(new RegExp(`Rechnung ${NUMMER} von `));
  await expect(mail.getByLabel('Kopie an buero@durchklick.test')).toBeChecked();
  const betreff = `Rechnung ${NUMMER} Durchklick ${Date.now()}`;
  await mail.getByLabel(/^Betreff/).fill(betreff);
  await mail.getByRole('button', { name: 'Senden' }).click();
  await expect(mail).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText(`Rechnung ${NUMMER} an huber@kunde.test gesendet`, { exact: false })).toBeVisible();

  // Im Mailfänger: an den Kunden, Kopie als Blindkopie, PDF im Anhang.
  const suche = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`subject:"${betreff}"`)}`)).json() as { messages: { ID: string }[] };
  expect(suche.messages).toHaveLength(1);
  const m = await (await fetch(`${MAILPIT}/api/v1/message/${suche.messages[0].ID}`)).json() as {
    To: { Address: string }[]; Bcc: { Address: string }[] | null; Attachments: { FileName: string; ContentType: string }[];
  };
  expect(m.To.map((x) => x.Address)).toEqual(['huber@kunde.test']);
  expect((m.Bcc ?? []).map((x) => x.Address)).toEqual(['buero@durchklick.test']);
  expect(m.Attachments).toEqual([expect.objectContaining({ FileName: `Rechnung_${NUMMER}.pdf`, ContentType: 'application/pdf' })]);

  // Im Verlauf der Rechnung.
  await page.goto(`/invoices?suche=${NUMMER}&oeffnen=${rechnung.data!.id}`);
  const wieder = page.getByRole('dialog', { name: `Rechnung ${NUMMER}` });
  await wieder.getByText('Änderungsverlauf').click({ timeout: 20_000 });
  await expect(wieder.getByText(/Per Mail versendet von Carla Chefin/)).toBeVisible({ timeout: 15_000 });
  await expect(wieder.getByText('An huber@kunde.test, Kopie an buero@durchklick.test')).toBeVisible();
  await keineFehlermeldung(page);
});
