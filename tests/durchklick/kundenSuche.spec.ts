import { test, expect } from '@playwright/test';
import { admin, BETRIEB, CHEFIN } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * DIE KUNDENAUSWAHL ÜBER DEN GANZEN STAMM — im echten Browser (Ladezeit,
 * 19.10.2026).
 *
 * Bis hierher füllten die ersten 500 Kunden ein Auswahlfeld; der 600. war
 * nicht wählbar. Jetzt sucht das Feld auf dem Server. Geprüft wird der ganze
 * Weg: suchen, den Treffer antippen, die Anschrift als Vorschlag, und das
 * Formular wird dabei nicht abgeschickt.
 */
const MARKE = 'Suchkunde';
const VIELE = 600;

async function abraeumen() {
  await admin.from('customers').delete().eq('company_id', BETRIEB).like('name', `${MARKE} %`);
}

test.beforeAll(async () => {
  await abraeumen();
  const zeilen = Array.from({ length: VIELE }, (_, i) => ({
    company_id: BETRIEB,
    name: `${MARKE} ${String(i).padStart(4, '0')}`,
    strasse: `Gasse ${i}`,
    plz: '1010',
    ort: 'Wien',
  }));
  for (let i = 0; i < zeilen.length; i += 300) {
    const { error } = await admin.from('customers').insert(zeilen.slice(i, i + 300));
    expect(error).toBeNull();
  }
});
test.afterAll(abraeumen);

test('Angebot: den 600. Kunden suchen und wählen — mit seiner Anschrift als Vorschlag', async ({ page }) => {
  test.setTimeout(90_000);
  await anmelden(page, CHEFIN.email);
  await page.goto('/quotes');
  await page.getByRole('button', { name: 'Neues Angebot' }).click();

  const suche = page.getByRole('searchbox', { name: 'Kunde' });
  await suche.fill(`${MARKE} 0599`);
  await page.getByRole('button', { name: `${MARKE} 0599` }).click();

  await expect(page.getByRole('button', { name: 'Anderen Kunden wählen' })).toBeVisible();
  await expect(page.getByText('Gasse 599, 1010 Wien').first()).toBeVisible();
  await expect(page.getByLabel('Ort der Leistung')).toHaveValue('Gasse 599, 1010 Wien');
  // Nichts angelegt: der Wechsel des Kunden schickt nichts ab.
  await page.getByRole('button', { name: 'Anderen Kunden wählen' }).click();
  await expect(page.getByRole('searchbox', { name: 'Kunde' })).toBeVisible();
  const { count } = await admin.from('quotes').select('id', { count: 'exact', head: true }).eq('company_id', BETRIEB).like('customer_name', `${MARKE}%`);
  expect(count).toBe(0);
  await keineFehlermeldung(page);
});
