import { randomUUID } from 'node:crypto';
import { test, expect, type Download, type Page } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, CHEFIN, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * PDF-ABLÄUFE IM ECHTEN BROWSER (Auftrag 14.11.2026: „checke auch die
 * Abläufe beim Erzeugen eines PDFs“). Rechnung, Stundenbericht, erste Mahnung
 * und Belegarchiv laufen schon in eigenen Wegen; hier die übrigen, mit der
 * echten Datenbank und der echten PDF-Bibliothek: Angebot, Schein aus der
 * Liste, eine gespeicherte Mahnung erneut laden, Stornorechnung ausstellen
 * und erneut laden.
 *
 * Geprüft wird je Weg: die Datei kommt mit dem richtigen Namen, ist ein PDF
 * und nennt den Beleg; keine Fehlermeldung, kein Laufzeitfehler, kein
 * abgewiesener Datenbankaufruf; der Knopf ist danach wieder bedienbar.
 */

const heute = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });

function ohneFehler(page: Page): string[] {
  const fehler: string[] = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/rest/v1/')) fehler.push(`${r.status()} ${r.url()}`);
  });
  return fehler;
}

/** Die Datei ist ein PDF und nennt den Beleg (jsPDF schreibt den Text ungepackt). */
async function istPdfMit(datei: Download, text: string) {
  const teile = await (await datei.createReadStream()).toArray();
  const inhalt = Buffer.concat(teile).toString('latin1');
  expect(inhalt.startsWith('%PDF-')).toBe(true);
  expect(inhalt).toContain(text);
}

test('Angebot: „PDF herunterladen“ liefert das Angebot, der Knopf bleibt bedienbar', async ({ page }) => {
  const NR = 'A-PDF-0001';
  await admin.from('quotes').delete().eq('company_id', BETRIEB).eq('quote_number', NR);
  const fehler = ohneFehler(page);
  try {
    const { data, error } = await admin.from('quotes').insert({
      company_id: BETRIEB, quote_number: NR, customer_name: BAUSTELLE.kunde, address: 'Probegasse 7, 1010 Wien',
      quote_date: heute(), valid_until: '2099-12-31', status: 'Versendet', vat_rate: 0.2,
      subtotal_netto: 1800, total_netto: 1800, total_vat: 360, total_brutto: 2160,
    }).select('id').single();
    expect(error).toBeNull();
    expect((await admin.from('quote_lines').insert(
      { company_id: BETRIEB, quote_id: data!.id, position: 0, label: 'Gastherme', qty: 1, unit: 'Stk', unit_price: 1800, netto: 1800 },
    )).error).toBeNull();

    await anmelden(page, CHEFIN.email);
    await page.goto(`/quotes/${data!.id}`);
    const knopf = page.getByRole('button', { name: 'PDF herunterladen' });
    await expect(knopf).toBeVisible({ timeout: 20_000 });
    const [datei] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), knopf.click()]);
    expect(datei.suggestedFilename()).toBe(`Angebot_${NR}.pdf`);
    await istPdfMit(datei, NR);
    await expect(knopf).toBeEnabled();
    await keineFehlermeldung(page);
    expect(fehler).toEqual([]);
  } finally {
    await admin.from('quotes').delete().eq('company_id', BETRIEB).eq('quote_number', NR);
  }
});

test('Schein aus der Liste: das PDF trägt Zeiten und Firma, die Meldung sagt „gespeichert“', async ({ page }) => {
  const id = randomUUID();
  const fehler = ohneFehler(page);
  const { data: m } = await admin.from('users').select('id').eq('email', MONTEUR.email).single();
  // Erst als Entwurf: ein unterschriebener Schein nimmt keine Zeilen mehr an.
  expect((await admin.from('work_sheets').insert({
    id, company_id: BETRIEB, project_number: BAUSTELLE.nummer, customer_name: BAUSTELLE.kunde,
    datum: heute(), status: 'Entwurf', abrechnung: 'Regie', erstellt_von_uid: m!.id, erstellt_von_name: MONTEUR.name,
  })).error).toBeNull();
  try {
    expect((await admin.from('work_sheet_hours').insert({
      company_id: BETRIEB, work_sheet_id: id, position: 0, datum: heute(),
      mitarbeiter: MONTEUR.name, von: '07:00', bis: '15:30', pause_min: 30, minuten: 480,
    })).error).toBeNull();
    expect((await admin.from('work_sheets').update({ status: 'Unterschrieben' }).eq('id', id)).error).toBeNull();

    await anmelden(page, CHEFIN.email);
    await page.goto('/worksheets');
    const knopf = page.getByRole('button', { name: new RegExp(`^Schein ${BAUSTELLE.nummer} vom .* als PDF teilen oder speichern$`) });
    await expect(knopf.first()).toBeVisible({ timeout: 20_000 });
    const [datei] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), knopf.first().click()]);
    expect(datei.suggestedFilename()).toBe(`Handwerksschein_${BAUSTELLE.nummer}_${heute()}.pdf`);
    await istPdfMit(datei, MONTEUR.name);
    await expect(page.getByText('PDF gespeichert').first()).toBeVisible();
    await expect(knopf.first()).toBeEnabled();
    await keineFehlermeldung(page);
    expect(fehler).toEqual([]);
  } finally {
    await admin.from('work_sheets').delete().eq('id', id);
  }
});

test('Rechnung: Mahnung erneut laden, Stornorechnung ausstellen und erneut laden — je ein PDF', async ({ page }) => {
  test.setTimeout(150_000);
  const NR = 'RE-PDF-0001';
  const raeumen = async () => {
    const { data } = await admin.from('invoices').select('id').eq('company_id', BETRIEB).eq('invoice_number', NR);
    for (const r of data ?? []) await admin.from('mahnungen').delete().eq('invoice_id', r.id);
    await admin.from('invoices').delete().eq('company_id', BETRIEB).eq('invoice_number', NR);
  };
  await raeumen();
  const fehler = ohneFehler(page);
  try {
    const { data: rechnung, error } = await admin.from('invoices').insert({
      company_id: BETRIEB, invoice_number: NR, project_number: BAUSTELLE.nummer, customer_name: BAUSTELLE.kunde,
      invoice_date: '2026-10-01', due_date: '2026-10-15', subtotal_netto: 1000, total_netto: 1000, total_vat: 200,
      total_brutto: 1200, vat_rate: 0.2, payment_status: 'Offen',
    }).select('id').single();
    expect(error).toBeNull();
    expect((await admin.from('invoice_lines').insert({
      company_id: BETRIEB, invoice_id: rechnung!.id, position: 1, label: 'Therme getauscht', qty: 1, unit: 'Pausch.', unit_price: 1000, netto: 1000,
    })).error).toBeNull();

    await anmelden(page, CHEFIN.email);
    await page.goto('/invoices');
    const zeile = page.getByRole('button', { name: new RegExp(`${NR}$`) }).first();
    const fenster = page.getByRole('dialog', { name: `Rechnung ${NR}` });
    const oeffnen = async () => {
      await zeile.click();
      await expect(fenster).toBeVisible({ timeout: 15_000 });
    };
    await expect(zeile).toBeVisible({ timeout: 20_000 });

    // 1. Die erste Mahnung aus dem Fenster — sie wird dabei gespeichert.
    await oeffnen();
    await fenster.getByRole('button', { name: 'Zahlungserinnerung erzeugen' }).click();
    const rueckfrage = page.getByRole('dialog').filter({ hasText: 'Zahlungserinnerung' });
    const [mahnung] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      rueckfrage.getByRole('button', { name: 'Erzeugen' }).click(),
    ]);
    expect(mahnung.suggestedFilename()).toBe(`Zahlungserinnerung_${NR}.pdf`);
    await istPdfMit(mahnung, NR);

    // 2. Dieselbe Mahnung erneut — aus der Liste „Mahnungen“ im Fenster.
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 });
    await oeffnen();
    const erneut = fenster.getByRole('button', { name: /^Zahlungserinnerung vom \d{2}\.\d{2}\.\d{4} als PDF laden$/ });
    await expect(erneut).toBeVisible({ timeout: 15_000 });
    const [wieder] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), erneut.click()]);
    expect(wieder.suggestedFilename()).toBe(`Zahlungserinnerung_${NR}.pdf`);
    await istPdfMit(wieder, NR);

    // 3. Stornieren — mit Grund.
    await fenster.getByRole('button', { name: 'Stornieren' }).click();
    const storno = page.getByRole('dialog').filter({ hasText: 'Rechnung stornieren?' });
    await storno.getByLabel(/Grund/).fill('Falscher Kunde');
    await storno.getByRole('button', { name: 'Stornieren' }).click();
    await expect.poll(async () => (await admin.from('invoices').select('payment_status').eq('id', rechnung!.id).single()).data?.payment_status, { timeout: 15_000 }).toBe('Storniert');

    // 4. Die Stornorechnung ausstellen — sie kommt gleich als PDF. Storniert steht sie unter „Erledigt“.
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 });
    await page.getByRole('group', { name: 'Rechnungen zeigen' }).getByRole('button', { name: 'Erledigt' }).click();
    await oeffnen();
    await fenster.getByRole('button', { name: 'Stornorechnung ausstellen …' }).click();
    const ausstellen = page.getByRole('dialog').filter({ hasText: 'Stornorechnung ausstellen?' });
    const [beleg] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      ausstellen.getByRole('button', { name: 'Ausstellen' }).click(),
    ]);
    const { data: nach } = await admin.from('invoices').select('storno_nummer').eq('id', rechnung!.id).single();
    const stornoNr = (nach as { storno_nummer: string | null }).storno_nummer;
    expect(stornoNr).toBeTruthy();
    expect(beleg.suggestedFilename()).toBe(`Stornorechnung_${stornoNr}.pdf`);
    await istPdfMit(beleg, stornoNr!);

    // 5. Und erneut — dieselbe Nummer, kein zweiter Beleg.
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 });
    await oeffnen();
    const [nochmal] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      fenster.getByRole('button', { name: 'Stornorechnung (PDF)' }).click(),
    ]);
    expect(nochmal.suggestedFilename()).toBe(`Stornorechnung_${stornoNr}.pdf`);
    const { data: danach } = await admin.from('invoices').select('storno_nummer').eq('id', rechnung!.id).single();
    expect((danach as { storno_nummer: string }).storno_nummer).toBe(stornoNr);

    await keineFehlermeldung(page);
    expect(fehler).toEqual([]);
  } finally {
    await raeumen();
  }
});
