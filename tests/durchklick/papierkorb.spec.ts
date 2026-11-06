import { test, expect } from '@playwright/test';
import { admin, BETRIEB, CHEFIN } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * DER PAPIERKORB FÜR ENTWÜRFE (M01d, U06) — im echten Browser gegen die
 * echte Datenbank, der ganze Weg:
 *
 * Angebotsentwurf auf seiner Seite verwerfen → er liegt im Papierkorb →
 * dort wiederherstellen → in der Angebotsliste wieder verwerfen (er
 * verschwindet aus der Liste) → im Papierkorb endgültig löschen. Am Ende
 * ist das Angebot weg, samt Positionen, und das Journal nennt das Löschen.
 */

const KUNDE = 'Familie Papierkorb';
const NUMMER = 'AN-2026-PK01';

async function aufraeumen() {
  // Der Dienstschlüssel darf, was die App nie darf: auch ein übrig gebliebenes Angebot wegräumen.
  await admin.from('quotes').delete().eq('company_id', BETRIEB).eq('customer_name', KUNDE);
}
test.beforeEach(aufraeumen);
test.afterEach(aufraeumen);

test('Angebotsentwurf verwerfen, wiederherstellen, wieder verwerfen, endgültig löschen', async ({ page }) => {
  test.setTimeout(120_000);
  const { data, error } = await admin.from('quotes').insert({
    company_id: BETRIEB, quote_number: NUMMER, customer_name: KUNDE, address: 'Probegasse 1, 1010 Wien',
    quote_date: '2026-11-06', valid_until: '2026-12-06', status: 'Entwurf', vat_rate: 0.2,
    subtotal_netto: 100, total_netto: 100, total_vat: 20, total_brutto: 120, kalkulierte_stunden: 1,
  }).select('id').single();
  expect(error).toBeNull();
  const id = data!.id as string;
  expect((await admin.from('quote_lines').insert({
    company_id: BETRIEB, quote_id: id, position: 0, label: 'Montage', qty: 1, unit: 'h', unit_price: 100, netto: 100,
  })).error).toBeNull();
  const stand = async () => (await admin.from('quotes').select('status, verworfen_von_name').eq('id', id).maybeSingle()).data;

  await anmelden(page, CHEFIN.email);

  // 1. Auf der Angebotsseite verwerfen — mit Rückfrage, die sagt, wie man zurückkommt.
  await page.goto(`/quotes/${id}`);
  await page.getByRole('button', { name: new RegExp(`^Weitere Aktionen für Angebot ${NUMMER}`) }).click();
  await page.getByRole('menuitem', { name: 'Verwerfen' }).click();
  const frage = page.getByRole('dialog', { name: 'Entwurf verwerfen?' });
  await expect(frage).toContainText('Einstellungen · Papierkorb');
  await frage.getByRole('button', { name: 'Verwerfen' }).click();
  await expect(page.getByText('In den Papierkorb gelegt')).toBeVisible();
  await expect(page.getByText(`verworfen von ${CHEFIN.name} am`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'PDF herunterladen' })).toHaveCount(0);
  expect(await stand()).toEqual({ status: 'Verworfen', verworfen_von_name: CHEFIN.name });

  // 2. Im Papierkorb wiederherstellen.
  await page.getByRole('link', { name: 'Zum Papierkorb' }).click();
  await expect(page).toHaveURL(/\/settings\/papierkorb$/);
  const zeile = page.locator('li.zeile', { hasText: NUMMER });
  await expect(zeile).toContainText(KUNDE);
  await expect(zeile).toContainText(`verworfen von ${CHEFIN.name}`);
  await zeile.getByRole('button', { name: 'Wiederherstellen' }).click();
  await expect(page.getByText(`${NUMMER}: Wiederhergestellt`)).toBeVisible();
  await expect(page.locator('li.zeile', { hasText: NUMMER })).toHaveCount(0);
  expect(await stand()).toEqual({ status: 'Entwurf', verworfen_von_name: null });

  // 3. In der Angebotsliste wieder verwerfen — danach steht es dort nicht mehr.
  await page.goto('/quotes');
  const listenZeile = page.locator('li.zeile', { hasText: NUMMER });
  await expect(listenZeile).toBeVisible({ timeout: 15_000 });
  await listenZeile.getByRole('button', { name: new RegExp(`^Weitere Aktionen für Angebot ${NUMMER}`) }).click();
  await page.getByRole('menuitem', { name: 'Verwerfen' }).click();
  await page.getByRole('dialog', { name: 'Entwurf verwerfen?' }).getByRole('button', { name: 'Verwerfen' }).click();
  await expect(page.getByText('In den Papierkorb gelegt')).toBeVisible();
  await expect(page.locator('li.zeile', { hasText: NUMMER })).toHaveCount(0);
  expect((await stand())?.status).toBe('Verworfen');

  // 4. Im Papierkorb endgültig löschen — nach Rückfrage, die sagt, dass es nicht umkehrbar ist.
  await page.goto('/settings/papierkorb');
  const nochmal = page.locator('li.zeile', { hasText: NUMMER });
  await nochmal.getByRole('button', { name: 'Endgültig löschen' }).click();
  const loeschen = page.getByRole('dialog', { name: 'Angebot endgültig löschen' });
  await expect(loeschen).toContainText('nicht rückgängig');
  await loeschen.getByRole('button', { name: 'Endgültig löschen' }).click();
  await expect(page.getByText(`${NUMMER} endgültig gelöscht`)).toBeVisible();
  await expect(page.locator('li.zeile', { hasText: NUMMER })).toHaveCount(0);

  expect(await stand()).toBeNull();
  expect((await admin.from('quote_lines').select('id').eq('quote_id', id)).data).toEqual([]);
  const journal = (await admin.from('aenderungsjournal').select('art').eq('objekt_id', id).order('am')).data!.map((z) => z.art);
  expect(journal[journal.length - 1]).toBe('geloescht');
  await keineFehlermeldung(page);
});
