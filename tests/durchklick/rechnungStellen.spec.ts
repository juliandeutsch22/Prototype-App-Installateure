import { test, expect } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, BUERO, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * Aus gebuchter Arbeitszeit wird eine Rechnung.
 *
 * DER WEG, AN DEM GELD HÄNGT. Er ist der längste der fünf und der einzige,
 * der etwas SPERRT: die Zeiteinträge, die auf die Rechnung wandern, werden
 * als verrechnet markiert und können nicht ein zweites Mal darauf. Bricht das
 * in der Mitte, steht dieselbe Stunde entweder zweimal auf einer Rechnung
 * oder gar nicht.
 *
 * DIE ZEITBUCHUNG KOMMT HIER AUS DER DATENBANK, nicht aus der Oberfläche.
 * Eine Prüfung, die erst den Monteur-Weg nachspielt, prüfte zwei Dinge auf
 * einmal und sagte bei Rot nicht, welches gemeint ist — und `zeitBuchen.spec`
 * prüft den Teil ohnehin schon.
 */
test.beforeEach(async () => {
  await admin.from('invoices').delete().eq('company_id', BETRIEB);
  await admin.from('time_entries').delete().eq('company_id', BETRIEB);

  const { data: leute } = await admin
    .from('users').select('id').eq('email', MONTEUR.email).single();

  const { error } = await admin.from('time_entries').insert({
    // DIE KENNUNG KOMMT VOM GERÄT, nicht aus der Datenbank — die Spalte hat
    // bewusst keine Vorgabe (das ist die Bedingung fürs Nachsenden ohne
    // Empfang). Wer hier eine vergisst, bekommt genau diesen Fehler.
    id: crypto.randomUUID(),
    company_id: BETRIEB,
    user_id: leute!.id,
    user_name: MONTEUR.name,
    date: '2026-09-01',
    status: 'Anwesend',
    start_time: '07:00',
    end_time: '16:00',
    break_duration: 30,
    project_number: BAUSTELLE.nummer,
    source: 'manual',
  });
  if (error) throw new Error(error.message);
});

test('Das Büro stellt aus der gebuchten Zeit eine Rechnung', async ({ page }) => {
  await anmelden(page, BUERO.email);

  await page.getByRole('link', { name: 'Rechnungen' }).first().click();
  // Zwei Baustellen-Auswahlen auf der Seite: die Rechnung und daneben der
  // Zeitraum-Auszug. Gemeint ist die im Kasten „Neue Rechnung aus Baustelle".
  await page.locator('#invproj').selectOption(BAUSTELLE.nummer);
  await page.getByRole('button', { name: 'Positionen zusammenstellen' }).click();

  await page.getByRole('button', { name: /Rechnung erstellen/ }).click();

  await expect(async () => {
    const { data } = await admin
      .from('invoices').select('invoice_number, project_number, total_netto, payment_status')
      .eq('company_id', BETRIEB);
    expect(data ?? []).toHaveLength(1);
    const r = (data ?? [])[0];
    expect(r.project_number).toBe(BAUSTELLE.nummer);
    expect(r.payment_status).toBe('Offen');
    // Nicht null: eine Rechnung über nichts wäre formal eine Rechnung und
    // fachlich ein Fehler — die gebuchten achteinhalb Stunden müssen drauf.
    expect(Number(r.total_netto)).toBeGreaterThan(0);
  }).toPass({ timeout: 25_000 });

  /*
    UND DIE STUNDE IST GESPERRT. Ohne diese Zeile prüfte der Durchlauf nur,
    dass eine Rechnung entsteht — die Doppelverrechnung, vor der die Sperre
    schützt, bliebe unbemerkt.
  */
  const { data: zeiten, error: zeitenFehler } = await admin
    .from('time_entries').select('is_billed, invoice_number').eq('company_id', BETRIEB);
  expect(zeitenFehler).toBeNull();
  expect(zeiten ?? []).toHaveLength(1);
  expect((zeiten ?? [])[0].is_billed).toBe(true);
  expect((zeiten ?? [])[0].invoice_number).toBeTruthy();

  await keineFehlermeldung(page);
});
