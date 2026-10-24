import { test, expect } from '@playwright/test';
import { admin, ARTIKEL, BETRIEB, CHEFIN, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung, menue } from './helfer';

/**
 * Material anfordern — der zweite Weg, der auf der Baustelle entsteht.
 *
 * Er geht über dieselbe Naht wie die Zeitbuchung (Ausgangsfach, Live-Liste),
 * aber über einen ANDEREN WARENKORB: die Positionen sammeln sich örtlich und
 * gehen erst beim Absenden einzeln hinaus. Ein Fehler in der Mitte lässt
 * halbe Bestellungen zurück, und der Monteur bestellt beim zweiten Versuch
 * doppelt.
 */
// Aus demselben Grund wie in `zeitBuchen.spec.ts`: eine Prüfung, die die
// Reste einer anderen zählt, beweist nichts.
test.beforeEach(async () => {
  await admin.from('material_orders').delete().eq('company_id', BETRIEB);
});

test('Ein Monteur legt Material in den Korb und sendet es ab', async ({ page }) => {
  await anmelden(page, MONTEUR.email);

  await menue(page, 'Material anfordern', 'Material');
  await page.getByRole('button', { name: new RegExp(`${ARTIKEL.name} zur Anforderung`) }).click();
  await page.getByRole('button', { name: /^Anforderung \(\d+\) abschicken$/ }).click();

  await expect(async () => {
    const { data } = await admin
      .from('material_orders').select('material_name, quantity, status')
      .eq('company_id', BETRIEB);
    expect(data ?? []).toHaveLength(1);
    expect((data ?? [])[0].material_name).toBe(ARTIKEL.name);
    expect((data ?? [])[0].status).toBe('Offen');
  }).toPass({ timeout: 15_000 });

  await keineFehlermeldung(page);
});

/*
  DIE RÜCKGABE STEHT SICHTBAR (20.10.2026): eine Zeile auf der Seite statt
  im „⋯“. Geprüft bis in den Bestand: Neues wird dem Lager gutgeschrieben.
*/
test('Ein Monteur gibt übriges Material über die sichtbare Zeile zurück', async ({ page }) => {
  const bestand = async () => {
    const { data } = await admin.from('materials').select('stock')
      .eq('company_id', BETRIEB).eq('name', ARTIKEL.name).single();
    return Number(data?.stock ?? 0);
  };
  const vorher = await bestand();

  await anmelden(page, MONTEUR.email);
  await menue(page, 'Material anfordern', 'Material');
  await page.getByRole('button', { name: /^Material zurückgeben/ }).click();

  const fenster = page.getByRole('dialog', { name: 'Material zurückgeben' });
  await fenster.getByRole('searchbox', { name: 'Material' }).fill('Kupfer');
  await fenster.getByRole('button', { name: new RegExp(`${ARTIKEL.name} zurückgeben`) }).click();
  await fenster.getByLabel('Menge').fill('2');
  await fenster.getByRole('button', { name: 'Retoure erfassen' }).click();
  await expect(fenster).toBeHidden();

  await expect(async () => {
    const { data } = await admin.from('material_orders')
      .select('material_name, quantity, transaction_type, condition')
      .eq('company_id', BETRIEB).eq('transaction_type', 'return');
    expect(data ?? []).toHaveLength(1);
    expect(Number((data ?? [])[0].quantity)).toBe(2);
    expect((data ?? [])[0].condition).toBe('neu');
    expect(await bestand()).toBe(vorher + 2);
  }).toPass({ timeout: 15_000 });

  await keineFehlermeldung(page);
});

/*
  DAS LAGER ERFASST FÜR DEN MONTEUR (A4, 24.10.2026). Bisher stand eine so
  erfasste Retoure auf dem Namen dessen, der erfasst. Geprüft bis in die
  Datenbank: sie lautet auf den Monteur, „erfasst von“ ist die Chefin, und
  Neues ist gutgeschrieben.
*/
test('Die Führung erfasst eine Retoure für den Monteur, der sie hereinbringt', async ({ page }) => {
  const bestand = async () => {
    const { data } = await admin.from('materials').select('stock')
      .eq('company_id', BETRIEB).eq('name', ARTIKEL.name).single();
    return Number(data?.stock ?? 0);
  };
  const kennung = async (email: string) => {
    const { data } = await admin.from('users').select('id').eq('email', email).single();
    return data!.id as string;
  };
  const vorher = await bestand();

  await anmelden(page, CHEFIN.email);
  await page.goto('/anforderungen');
  await page.getByRole('button', { name: /^Retouren/ }).click();
  await page.getByRole('button', { name: 'Retoure erfassen' }).click();

  const fenster = page.getByRole('dialog', { name: 'Material zurückgeben' });
  await fenster.getByRole('searchbox', { name: 'Material' }).fill('Kupfer');
  await fenster.getByRole('button', { name: new RegExp(`${ARTIKEL.name} zurückgeben`) }).click();
  await fenster.getByLabel('Menge').fill('1');
  const wer = fenster.getByRole('combobox', { name: 'Zurückgebracht von' });
  await expect(wer.getByRole('option', { name: MONTEUR.name })).toBeAttached();
  await wer.selectOption({ label: MONTEUR.name });
  await fenster.getByRole('button', { name: 'Retoure erfassen' }).click();
  await expect(fenster).toBeHidden();

  const monteur = await kennung(MONTEUR.email);
  const chefin = await kennung(CHEFIN.email);
  await expect(async () => {
    const { data } = await admin.from('material_orders')
      .select('user_id, user_name, erfasst_von, transaction_type')
      .eq('company_id', BETRIEB).eq('transaction_type', 'return');
    expect(data ?? []).toEqual([
      { user_id: monteur, user_name: MONTEUR.name, erfasst_von: chefin, transaction_type: 'return' },
    ]);
    expect(await bestand()).toBe(vorher + 1);
  }).toPass({ timeout: 15_000 });

  // In der Liste und im Seitenfenster steht beides.
  await page.getByRole('button', { name: new RegExp(`^${ARTIKEL.name}`) }).click();
  const anforderung = page.getByRole('dialog', { name: 'Anforderung' });
  await expect(anforderung.getByText('Zurückgebracht von')).toBeVisible();
  await expect(anforderung.getByText(`${MONTEUR.name}, erfasst von ${CHEFIN.name}`)).toBeVisible();

  await keineFehlermeldung(page);
});
