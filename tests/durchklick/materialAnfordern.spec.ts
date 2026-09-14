import { test, expect } from '@playwright/test';
import { admin, ARTIKEL, BETRIEB, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

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

  await page.getByRole('link', { name: 'Material anfordern' }).first().click();
  await page.getByRole('button', { name: new RegExp(`${ARTIKEL.name} anfordern`) }).click();
  await page.getByRole('button', { name: 'Bestellung aufgeben' }).click();

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
