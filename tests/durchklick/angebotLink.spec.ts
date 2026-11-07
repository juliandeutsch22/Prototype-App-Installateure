import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { admin, BETRIEB, CHEFIN } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * ANGEBOTSANNAHME PER LINK (M02a, A06) — im echten Browser gegen die echte
 * Datenbank und die echte Edge Function, der ganze Weg:
 *
 * Das Büro erzeugt im Angebot den Link (Abrechnungsart Pflicht) → ein
 * ZWEITER, nicht angemeldeter Browser am Handy öffnet ihn, sieht das
 * Angebot, unterschreibt mit der Maus auf dem Canvas und nimmt an → das Büro
 * sieht „angenommen über Link“ mit Namen und Unterschrift und kommt zur
 * Baustelle → erneutes Öffnen zeigt „bereits angenommen“. Die öffentliche
 * Seite misst axe (WCAG 2.1 AA) am Handy.
 */

const KUNDE = 'Familie Linkprobe';
const NUMMER = 'AN-2026-LK01';
const REGELN = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function aufraeumen() {
  // Der Dienstschlüssel darf, was die App nie darf: ein angenommenes Angebot samt Baustelle wegräumen.
  const { data: alte } = await admin.from('quotes').select('id').eq('company_id', BETRIEB).eq('customer_name', KUNDE);
  const ids = (alte ?? []).map((q) => q.id as string);
  if (ids.length) {
    await admin.from('angebot_links').delete().in('quote_id', ids);
    await admin.from('quotes').delete().in('id', ids);
  }
  await admin.from('projects').delete().eq('company_id', BETRIEB).eq('customer_name', KUNDE);
}
test.beforeEach(aufraeumen);
test.afterEach(aufraeumen);

async function befunde(page: Page, wo: string): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(REGELN).analyze();
  return r.violations.map((v) => `${wo}: ${v.id} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

/** Wirklich zeichnen, wie in `scheinUnterschreiben.spec.ts` — kein untergeschobenes Bild. */
async function unterschreiben(flaeche: Locator) {
  await flaeche.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const kasten = await flaeche.boundingBox();
  if (!kasten) throw new Error('Unterschriftsfeld nicht sichtbar');
  const y = kasten.y + kasten.height / 2;
  expect(await flaeche.page().evaluate(([x, yy]) => document.elementFromPoint(x, yy)?.tagName, [kasten.x + kasten.width / 2, y] as const))
    .toBe('CANVAS');
  await flaeche.page().mouse.move(kasten.x + 20, y);
  await flaeche.page().mouse.down();
  for (let i = 1; i <= 8; i += 1) {
    await flaeche.page().mouse.move(kasten.x + 20 + (kasten.width - 40) * (i / 8), y + (i % 2 === 0 ? 24 : -24));
  }
  await flaeche.page().mouse.up();
}

test('Büro erzeugt den Link, der Kunde nimmt am Handy an, das Büro sieht die Baustelle', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const { data, error } = await admin.from('quotes').insert({
    company_id: BETRIEB, quote_number: NUMMER, customer_name: KUNDE, address: 'Probegasse 7, 1010 Wien',
    quote_date: '2026-11-06', valid_until: '2099-12-31', status: 'Versendet', vat_rate: 0.2, notes: 'Therme tauschen.',
    subtotal_netto: 2100, total_netto: 2100, total_vat: 420, total_brutto: 2520, kalkulierte_stunden: 4,
  }).select('id').single();
  expect(error).toBeNull();
  const id = data!.id as string;
  expect((await admin.from('quote_lines').insert([
    { company_id: BETRIEB, quote_id: id, position: 0, label: 'Gastherme', qty: 1, unit: 'Stk', unit_price: 1800, netto: 1800 },
    { company_id: BETRIEB, quote_id: id, position: 1, label: 'Montage', qty: 4, unit: 'h', unit_price: 75, netto: 300, ist_arbeitszeit: true },
  ])).error).toBeNull();

  // 1. Das Büro erzeugt den Link — ohne Abrechnungsart geht es nicht.
  await anmelden(page, CHEFIN.email);
  await page.goto(`/quotes/${id}`);
  await page.getByRole('button', { name: 'Annahme-Link' }).click();
  const fenster = page.getByRole('dialog', { name: 'Annahme-Link' });
  const erzeugen = fenster.getByRole('button', { name: 'Link erzeugen' });
  await expect(erzeugen).toBeDisabled();
  await fenster.getByLabel(/Abrechnung der Baustelle/).selectOption('Pauschal');
  await fenster.getByLabel('Vorsatz der Baustellennummer').fill('LK');
  await erzeugen.click();
  const feld = fenster.getByLabel(/Link für den Kunden — nur jetzt sichtbar/);
  await expect(feld).toHaveValue(/\/angebot\/annehmen#[A-Za-z0-9_-]{43}$/);
  const adresse = await feld.inputValue();
  await expect(fenster.getByRole('link', { name: 'Per Mail-Programm senden' })).toHaveAttribute('href', /^mailto:/);
  await fenster.getByRole('button', { name: 'Fertig' }).click();
  const karte = page.locator('section', { has: page.getByRole('heading', { name: 'Annahme per Link' }) }).first();
  // Die Bindefrist liegt weiter als ein Jahr: der Link gilt ein Jahr.
  await expect(karte).toContainText('Offen bis');
  await expect(karte).toContainText('Noch nicht geöffnet');

  // 2. Ein zweiter Browser, NICHT angemeldet, am Handy.
  const handy = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'de-AT', timezoneId: 'Europe/Vienna',
  });
  try {
    const kunde = await handy.newPage();
    await kunde.goto(adresse);
    await expect(kunde.getByRole('heading', { level: 1, name: 'Angebot' })).toBeVisible({ timeout: 20_000 });
    await expect(kunde.getByText('Gastherme')).toBeVisible();
    await expect(kunde.getByText(NUMMER).first()).toBeVisible();
    await kunde.waitForLoadState('networkidle');
    // Am Handy nichts breiter als der Bildschirm.
    expect(await kunde.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(await befunde(kunde, 'Annahme-Link (offen)')).toEqual([]);

    // Ohne Unterschrift geht es nicht.
    await kunde.getByLabel(/Ihr Name/).fill('Maria Linkprobe');
    await kunde.getByLabel('Ich nehme dieses Angebot verbindlich an.').check();
    await kunde.getByRole('button', { name: 'Verbindlich annehmen' }).click();
    await expect(kunde.getByRole('alert')).toContainText('Bitte im Feld unterschreiben.');
    await unterschreiben(kunde.locator('canvas'));
    await kunde.getByRole('button', { name: 'Verbindlich annehmen' }).click();
    await expect(kunde.getByText(/Vielen Dank\. Sie haben das Angebot am .* verbindlich angenommen \(Maria Linkprobe\)\./)).toBeVisible({ timeout: 20_000 });
    expect(await befunde(kunde, 'Annahme-Link (angenommen)')).toEqual([]);

    // 3. Das Büro sieht „angenommen über Link“, von wem, die Unterschrift — und die Baustelle.
    await page.reload();
    await expect(karte).toContainText('Angenommen von Maria Linkprobe am', { timeout: 20_000 });
    await expect(karte.getByRole('img', { name: 'Unterschrift von Maria Linkprobe' })).toBeVisible();
    await expect(karte).toContainText('verbindlich angenommen über den Link');
    await keineFehlermeldung(page);
    const { data: q } = await admin.from('quotes').select('status, project_number, project_id').eq('id', id).single();
    expect(q!.status).toBe('Angenommen');
    expect(String(q!.project_number)).toMatch(/^LK-\d{4}-\d{4}$/);
    await page.getByRole('link', { name: String(q!.project_number) }).first().click();
    await expect(page).toHaveURL(new RegExp(`/admin-projects/${q!.project_id}$`));
    await expect(page.getByText(String(q!.project_number)).first()).toBeVisible();

    // 4. Erneut öffnen: bereits angenommen — ohne Formular.
    await kunde.goto('about:blank');
    await kunde.goto(adresse);
    await expect(kunde.getByText(/Bereits angenommen am .* von Maria Linkprobe\./)).toBeVisible({ timeout: 20_000 });
    await expect(kunde.getByRole('button', { name: 'Verbindlich annehmen' })).toHaveCount(0);
  } finally {
    await handy.close();
  }
});

test('ein unbekannter Link zeigt dieselbe Meldung wie ein ungültiger — ohne Anmeldung, barrierefrei', async ({ browser }) => {
  const handy = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'de-AT', baseURL: test.info().project.use.baseURL,
  });
  try {
    const kunde = await handy.newPage();
    await kunde.goto(`/angebot/annehmen#${'Z'.repeat(43)}`);
    await expect(kunde.getByRole('heading', { level: 1, name: 'Link nicht gültig' })).toBeVisible({ timeout: 20_000 });
    await kunde.waitForLoadState('networkidle');
    expect(await befunde(kunde, 'Annahme-Link (ungültig)')).toEqual([]);
  } finally {
    await handy.close();
  }
});
