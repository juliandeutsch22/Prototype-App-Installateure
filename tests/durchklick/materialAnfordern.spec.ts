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
  EIN TIPP LEGT IN DIE LISTE (C1, E89, 13.11.2026). Vorher Minus, Menge, Plus
  und daneben der Kreis — zwei Bedienungen für eine Absicht, und was schon in
  der Liste lag, stand in einer zweiten Zeile. Jetzt steht nur der
  Petrol-Kreis (48 × 48 px, rund, in der Zeile); ein Tipp legt eines hinein,
  und AN DERSELBEN STELLE steht danach die Menge mit Minus und Plus: rechte
  Kante und Mitte wie der Kreis, die Zeile bleibt so hoch wie vorher.
*/
test('Ein Tipp auf den Kreis legt eines hinein, danach steht die Menge an derselben Stelle, auf jeder Breite', async ({ page }) => {
  await anmelden(page, MONTEUR.email);
  await menue(page, 'Material anfordern', 'Material');
  const zeile = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: `${ARTIKEL.name} in die Liste` }) });
  const kreis = page.getByRole('button', { name: `${ARTIKEL.name} in die Liste`, exact: true });
  const mehr = page.getByRole('button', { name: `${ARTIKEL.name} in die Liste (eines mehr)` });
  const feld = page.getByRole('textbox', { name: `Menge ${ARTIKEL.einheit} für ${ARTIKEL.name} in der Liste` });
  const lage = (wer: 'kreis' | 'gruppe') =>
    page.evaluate(([w, name]) => {
      const knopf = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === `${name} in die Liste`);
      const feld = [...document.querySelectorAll('input')].find((i) => i.getAttribute('aria-label')?.endsWith(`für ${name} in der Liste`));
      const el = (w === 'kreis' ? knopf : feld?.closest('.mengen-wahl')) as HTMLElement;
      const z = el.closest('li')!.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return {
        rechts: z.right - r.right, mitte: r.top + r.height / 2 - z.top, zeile: z.height,
        breite: r.width, hoehe: r.height, rund: getComputedStyle(el).borderTopLeftRadius,
        drin: r.left >= z.left - 0.5 && r.right <= z.right + 0.5,
      };
    }, [wer, ARTIKEL.name] as const);

  // Gemessen wird erst, wenn die Lage über zwei Bilder gleich bleibt: Nach
  // einem Breitenwechsel rastet das Blatt ein Bild später auf die Rasterlinien
  // ein (`taktHalten`) — in der CI lag „vorher“ sonst noch eine Zelle daneben.
  const ruhig = async (wer: 'kreis' | 'gruppe') => {
    let zuletzt = '';
    await expect
      .poll(async () => {
        await page.evaluate(() => new Promise((fertig) => requestAnimationFrame(() => requestAnimationFrame(fertig))));
        const jetzt = JSON.stringify(await lage(wer));
        const gleich = jetzt === zuletzt;
        zuletzt = jetzt;
        return gleich;
      }, { timeout: 10_000 })
      .toBe(true);
    return JSON.parse(zuletzt) as Awaited<ReturnType<typeof lage>>;
  };

  for (const breite of [320, 360, 375, 390, 393, 430, 834, 1280]) {
    await page.setViewportSize({ width: breite, height: 900 });
    await expect(kreis).toHaveText('');
    const vor = await ruhig('kreis');
    expect(vor.breite, `${breite} px: 48 px breit`).toBe(48);
    expect(vor.hoehe, `${breite} px: 48 px hoch`).toBe(48);
    expect(vor.rund, `${breite} px: ein Kreis`).toBe('999px');
    expect(vor.drin, `${breite} px: Kreis in der Zeile`).toBe(true);

    await kreis.click();
    await expect(feld).toHaveValue('1');
    await mehr.click();
    await mehr.click();
    await expect(feld).toHaveValue('3');
    const nach = await ruhig('gruppe');
    expect(nach.drin, `${breite} px: Menge in der Zeile`).toBe(true);
    // Wo der Kreis lag, steht die Menge: dieselbe rechte Kante, dieselbe Mitte, die Zeile nicht höher.
    expect(Math.abs(nach.rechts - vor.rechts), `${breite} px: rechte Kante`).toBeLessThanOrEqual(1);
    if (breite >= 390) {
      expect(Math.abs(nach.mitte - vor.mitte), `${breite} px: Mitte`).toBeLessThanOrEqual(1);
      expect(nach.zeile, `${breite} px: einzeilig`).toBeLessThanOrEqual(vor.zeile + 0.5);
    }
    await expect(zeile.getByText(/ in der Liste$/)).toHaveCount(0);

    await page.getByRole('button', { name: 'Liste leeren' }).click();
    await expect(kreis).toBeVisible();
    await expect(feld).toHaveCount(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await keineFehlermeldung(page);
});

/*
  DIE WARENKORB-LEISTE IST AB DEM TABLET EIN BLATT (E47, 05.11.2026). Vorher
  ein schwebender, gerundeter Kasten mit Petrol-Rahmen neben dem Raster.
  Jetzt eckig, mit der Linie der Blätter, denselben Kanten wie der Katalog
  darüber, Text eine Zelle vom Rand, ganze Zellen hoch und in Ruhe mit
  beiden Kanten auf Rasterlinien. Am Handy ein Balken mit Linie oben wie die
  Aktionsleiste der Formulare.
*/
test('Die Warenkorb-Leiste liegt als Blatt auf dem Raster, am Handy als Balken', async ({ page }) => {
  await anmelden(page, MONTEUR.email);
  await menue(page, 'Material anfordern', 'Material');
  await page.getByRole('button', { name: `${ARTIKEL.name} in die Liste`, exact: true }).click();
  const leiste = page.getByRole('region', { name: 'Warenkorb' });
  await expect(leiste).toBeVisible();
  await expect(leiste.locator('.korb-info')).toHaveClass(/stand-offen/);

  const messen = () =>
    page.evaluate(() => {
      const korb = document.querySelector<HTMLElement>('.korb')!;
      const katalog = [...document.querySelectorAll<HTMLElement>('.karte')].find(
        (k) => k.querySelector('.titel-karte')?.textContent === 'Katalog',
      )!;
      const flaeche = document.querySelector<HTMLElement>('.hauptflaeche')!;
      const [, versatz] = getComputedStyle(flaeche).backgroundPosition.split(' ').map(parseFloat);
      const ursprung = flaeche.getBoundingClientRect().top + versatz;
      const k = korb.getBoundingClientRect();
      const b = katalog.getBoundingClientRect();
      const s = getComputedStyle(korb);
      const probe = document.createElement('i');
      probe.style.color = 'var(--border)';
      document.body.append(probe);
      const linieDerLeisten = getComputedStyle(probe).color;
      probe.remove();
      const aufLinie = (y: number) => Math.min(((y - ursprung) % 24 + 24) % 24, 24 - (((y - ursprung) % 24 + 24) % 24));
      return {
        links: k.left - b.left, rechts: k.right - b.right, hoehe: k.height, breiteFenster: window.innerWidth,
        linksAbs: k.left, rechtsAbs: k.right,
        oben: aufLinie(k.top), unten: aufLinie(k.bottom),
        rund: s.borderTopLeftRadius, polster: s.paddingLeft,
        linie: s.boxShadow, linieBlatt: getComputedStyle(katalog).boxShadow,
        vorher: getComputedStyle(korb, '::before').borderTopColor + ' ' + getComputedStyle(korb, '::before').borderLeftWidth,
        vorherBlatt: getComputedStyle(katalog, '::before').borderTopColor + ' ' + getComputedStyle(katalog, '::before').borderLeftWidth,
        obenLinie: s.borderTopWidth + ' ' + s.borderTopColor, umriss: s.outlineWidth + ' ' + s.outlineColor, linieDerLeisten,
      };
    });
  const ruhig = async () => {
    let zuletzt = '';
    await expect
      .poll(async () => {
        await page.evaluate(() => new Promise((fertig) => requestAnimationFrame(() => requestAnimationFrame(fertig))));
        const jetzt = JSON.stringify(await messen());
        const gleich = jetzt === zuletzt;
        zuletzt = jetzt;
        return gleich;
      }, { timeout: 10_000 })
      .toBe(true);
    return JSON.parse(zuletzt) as Awaited<ReturnType<typeof messen>>;
  };

  for (const breite of [834, 1280]) {
    await page.setViewportSize({ width: breite, height: 700 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const m = await ruhig();
    expect(Math.abs(m.links), `${breite} px: linke Kante wie der Katalog`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(m.rechts), `${breite} px: rechte Kante wie der Katalog`).toBeLessThanOrEqual(0.5);
    // V10: ein Blatt mit 16 px Radius und Kontur, wie der Katalog darüber.
    expect(m.rund, `${breite} px: Radius des Blatts`).toBe('16px');
    expect(m.polster, `${breite} px: Text eine Zelle vom Rand`).toBe('24px');
    expect(m.hoehe % 24, `${breite} px: ganze Zellen hoch (${m.hoehe})`).toBe(0);
    expect(m.linie, `${breite} px: kein Schatten, wie das Blatt`).toBe(m.linieBlatt);
    expect(m.umriss, `${breite} px: Umriss wie das Blatt`).toBe(`1px ${m.linieDerLeisten}`);
    // In Ruhe, an ihrem Platz unter dem Katalog: beide Kanten auf Linien.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const r = await ruhig();
    expect(r.oben, `${breite} px: Oberkante auf einer Rasterlinie`).toBeLessThanOrEqual(0.5);
    expect(r.unten, `${breite} px: Unterkante auf einer Rasterlinie`).toBeLessThanOrEqual(0.5);
  }

  await page.setViewportSize({ width: 390, height: 800 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const handy = await ruhig();
  expect(handy.linksAbs, 'Handy: von Rand zu Rand').toBeLessThanOrEqual(0.5);
  expect(handy.breiteFenster - handy.rechtsAbs, 'Handy: von Rand zu Rand').toBeLessThanOrEqual(0.5);
  expect(handy.rund, 'Handy: eckig').toBe('0px');
  expect(handy.obenLinie, 'Handy: Linie oben wie die Aktionsleiste').toBe(`1px ${handy.linieDerLeisten}`);
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
