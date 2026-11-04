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
  await page.getByRole('button', { name: new RegExp(`${ARTIKEL.name} in die Liste`) }).click();
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
  DER KNOPF IM KATALOG BRICHT NICHT IM WORT UND BLEIBT LIEGEN (04.11.2026).
  Am Telefon stand „Zur Anforderun / g“ auf drei Zeilen. Jetzt heißt er
  „In die Liste“ und bleibt einzeilig; ist neben der Menge kein Platz, steht
  er in einer eigenen Zeile darunter. Getippt wird oft mehrmals hintereinander
  — der Knopf darf dabei nicht wandern: vorher schob das „×1“ davor ihn beim
  ersten Tipp in die nächste Zeile, und der zweite traf das Plus.
*/
test('Der Katalogknopf bleibt einzeilig und an seinem Platz, auf jeder Breite', async ({ page }) => {
  await anmelden(page, MONTEUR.email);
  await menue(page, 'Material anfordern', 'Material');
  const knopf = page.getByRole('button', { name: new RegExp(`${ARTIKEL.name} in die Liste$`) });
  const lage = () =>
    knopf.evaluate((el) => {
      const zeile = el.closest('li')!.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      // Nur der Text selbst: jede Zeile, auf die er umbricht, ist ein Rechteck.
      const knoten = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode()!;
      const text = document.createRange();
      text.selectNodeContents(knoten);
      return {
        x: r.left - zeile.left, y: r.top - zeile.top, breite: r.width, hoehe: r.height,
        textzeilen: text.getClientRects().length,
        drin: r.left >= zeile.left - 0.5 && r.right <= zeile.right + 0.5,
      };
    });

  // Gemessen wird erst, wenn die Lage über zwei Bilder gleich bleibt: Nach
  // einem Breitenwechsel rastet das Blatt ein Bild später auf die Rasterlinien
  // ein (`taktHalten`) — in der CI lag „vorher“ sonst noch eine Zelle daneben.
  const ruhig = async () => {
    let zuletzt = '';
    await expect
      .poll(async () => {
        await page.evaluate(() => new Promise((fertig) => requestAnimationFrame(() => requestAnimationFrame(fertig))));
        const jetzt = JSON.stringify(await lage());
        const gleich = jetzt === zuletzt;
        zuletzt = jetzt;
        return gleich;
      }, { timeout: 10_000 })
      .toBe(true);
    return JSON.parse(zuletzt) as Awaited<ReturnType<typeof lage>>;
  };

  for (const breite of [320, 360, 375, 393, 430, 834, 1280]) {
    await page.setViewportSize({ width: breite, height: 900 });
    await expect(knopf).toHaveText('In die Liste');
    const vor = await ruhig();
    expect(vor.textzeilen, `${breite} px: Beschriftung auf einer Zeile`).toBe(1);
    expect(vor.drin, `${breite} px: Knopf in der Zeile`).toBe(true);

    await knopf.click();
    await knopf.click();
    await knopf.click();
    await expect(page.getByText(`3 ${ARTIKEL.einheit} in der Liste`)).toBeVisible();
    const nach = await ruhig();
    // Gefüllt so breit wie leer: sonst entschiede an einer Breite genau an der
    // Grenze der Zustand, ob er neben der Menge oder darunter steht.
    expect(Math.abs(nach.breite - vor.breite), `${breite} px: gleich breit`).toBeLessThanOrEqual(0.5);
    // Wo der erste Tipp lag, trifft auch der nächste — mit Rand.
    const mitteX = vor.x + vor.breite / 2;
    const mitteY = vor.y + vor.hoehe / 2;
    expect(mitteX > nach.x + 8 && mitteX < nach.x + nach.breite - 8, `${breite} px: waagrecht getroffen`).toBe(true);
    expect(mitteY > nach.y + 8 && mitteY < nach.y + nach.hoehe - 8, `${breite} px: senkrecht getroffen`).toBe(true);
    // Am Telefon steht er unter dem Text: dort wandert er gar nicht.
    if (breite < 760) expect(Math.abs(nach.y - vor.y), `${breite} px: senkrecht`).toBeLessThanOrEqual(1);

    await page.getByRole('button', { name: 'Liste leeren' }).click();
    await expect(page.getByText(/ in der Liste$/)).toHaveCount(0);
  }
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
