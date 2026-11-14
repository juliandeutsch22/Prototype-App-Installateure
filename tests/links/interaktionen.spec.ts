import { test, expect, type Page, type CDPSession } from '@playwright/test';

/*
  Seit E75 (10.11.2026) zeigt ein Suchfeld den Fokus nur noch mit seinem Rand
  in Petrol, ohne Ring außen herum. Geprüft wird der Linienstil, nicht die
  Breite: Chromium meldet bei `outline-style: none` als Breite den Grundwert
  3 px. Petrol ist im dunklen Bild heller, darum der Wert aus dem Token.
*/
for (const width of [390, 1440]) for (const theme of ['hell', 'dunkel']) {
  test(`Suchfelder: im Fokus nur der Rand, kein Ring ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(t => localStorage.setItem('senklot.darstellung', t), theme);
    for (const route of ['/invoices', '/quotes', '/customers']) await test.step(route, async () => {
      await page.goto(`./?pfad=${encodeURIComponent(route)}&rolle=Administrator`);
      const feld = page.locator('.listenleiste-suche input');
      await feld.focus();
      await expect(feld).toHaveCSS('box-shadow', 'none');
      await expect(feld).toHaveCSS('outline-style', 'none');
      const petrol = await page.evaluate(() => {
        const probe = document.createElement('i');
        probe.style.color = 'var(--brand-fixed)';
        document.body.append(probe);
        const farbe = getComputedStyle(probe).color;
        probe.remove();
        return farbe;
      });
      const rahmen = feld.locator('..');
      await expect(rahmen).toHaveCSS('outline-style', 'none');
      await expect(rahmen).toHaveCSS('box-shadow', 'none');
      await expect(rahmen).toHaveCSS('border-top-color', petrol);
      await feld.fill('Prüfung');
      await expect(feld).toHaveValue('Prüfung');
    });
  });
}

for (const fall of [
  { route: '/invoices', rolle: 'Administrator', role: 'button' as const, name: 'Erledigt', selected: 'aria-pressed' },
  { route: '/customers/k1', rolle: 'Administrator', role: 'tab' as const, name: 'Stammdaten', selected: 'aria-selected' },
  { route: '/assignments/woche', rolle: 'Administrator', role: 'button' as const, name: 'Monat', selected: 'aria-pressed' },
  { route: '/assignments/woche', rolle: 'Administrator', role: 'button' as const, name: 'Tag', selected: 'aria-pressed' },
  { route: '/assignments/tag', rolle: 'Administrator', role: 'button' as const, name: 'Monat', selected: 'aria-pressed' },
  { route: '/settings/firma', rolle: 'Administrator', role: 'link' as const, name: 'Personal', selected: 'aria-current' },
]) test(`Filter und Ansicht halten die Seitenposition ${fall.route} → ${fall.name}`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`./?pfad=${encodeURIComponent(fall.route)}&rolle=${fall.rolle}`);
  const wahl = page.getByRole(fall.role, { name: fall.name, exact: true });
  await expect(wahl).toBeVisible();
  // Genügend Seitenhöhe isoliert den Positionsfehler von der unvermeidbaren
  // Browser-Begrenzung, wenn ein Filter nur noch eine kurze Liste übrig lässt.
  await page.evaluate(() => {
    const main = document.querySelector('main')!;
    main.style.minHeight = '3000px';
    const platz = document.createElement('div'); platz.style.height = '700px'; main.prepend(platz);
  });
  await wahl.scrollIntoViewIfNeeded();
  const vorher = await page.evaluate(() => scrollY);
  expect(vorher).toBeGreaterThan(100);
  await wahl.click();
  await expect(wahl).toHaveAttribute(fall.selected, fall.role === 'link' ? 'page' : 'true');
  expect(Math.abs(await page.evaluate(() => scrollY) - vorher)).toBeLessThanOrEqual(2);
});

test('Wegwischen: die Abdunkelung nimmt bis zum Abbau ausschließlich ab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('./?pfad=%2F&rolle=Administrator');
  await page.locator('.unten button').filter({ hasText: 'Mehr' }).click();
  const dialog = page.getByRole('dialog', { name: 'Weitere Bereiche', exact: true });
  const griff = (await page.locator('.blatt-griff').boundingBox())!;
  await page.mouse.move(griff.x + griff.width / 2, griff.y + 8); await page.mouse.down();
  await page.mouse.move(griff.x + griff.width / 2, griff.y + 188, { steps: 12 });
  await page.evaluate(() => {
    const overlay = document.querySelector('.schleier.lot-overlay')!;
    const werte: number[] = []; (window as unknown as { abdunkelung: number[] }).abdunkelung = werte;
    // WebKit kann RAF in einem Hintergrundfenster drosseln. Zusätzlich jede
    // Stil-/Phasenänderung messen: auch ein nur kurz zurückgesetzter Schleier
    // wird dadurch erfasst, ohne auf eine feste Zahl gerenderter Bilder zu hoffen.
    const protokoll = () => {
      werte.push(overlay.isConnected ? Number(getComputedStyle(overlay).opacity) : 0);
      if (!overlay.isConnected) beobachter.disconnect();
    };
    const beobachter = new MutationObserver(protokoll);
    beobachter.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'data-phase'] });
    const bild = () => { protokoll(); if (overlay.isConnected) requestAnimationFrame(bild); };
    bild();
  });
  await page.mouse.up();
  await expect(dialog).toHaveCount(0);
  const werte = await page.evaluate(() => (window as unknown as { abdunkelung: number[] }).abdunkelung);
  expect(werte.length).toBeGreaterThan(2);
  expect(werte[0]).toBeLessThan(0.6);
  for (let i = 1; i < werte.length; i++) expect(werte[i]).toBeLessThanOrEqual(werte[i - 1] + 0.01);
  await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden');
});

async function finger(page: Page, cdp: CDPSession, x: number, y: number, dx: number, dy: number) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 12, y: y + dy * i / 12 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test.describe('Native Touchbedienung', () => {
test.use({ hasTouch: true, isMobile: true });
test('Echte Touchgesten: seitlich fest, Tabelle bedienbar, vertikal scrollbar und abwärts schließbar', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Echte Touchereignisse werden über die Chromium-Schnittstelle eingespeist.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?pfad=%2Fcustomers&rolle=Administrator');
  await page.getByRole('button', { name: 'Neuer Kunde', exact: true }).last().click();
  const dialog = page.getByRole('dialog', { name: 'Neuen Kunden anlegen', exact: true });
  await expect(dialog).toBeVisible();
  await page.evaluate(() => {
    const body = document.querySelector('.fenster-inhalt')!;
    const probe = document.createElement('div'); probe.id = 'fingerprobe'; probe.style.height = '80px'; probe.textContent = 'Freie Wischfläche';
    const tabelle = document.createElement('div'); tabelle.id = 'tabellenprobe'; tabelle.style.cssText = 'overflow-x:auto;width:100%;height:70px';
    const breit = document.createElement('div'); breit.style.cssText = 'width:900px;height:60px;background:linear-gradient(90deg,#ccc,#aaa)'; breit.textContent = 'Breite Tabelleninhalte bleiben erreichbar'; tabelle.append(breit);
    body.prepend(probe, tabelle);
  });
  const cdp = await page.context().newCDPSession(page);
  const box = (await page.locator('#fingerprobe').boundingBox())!;
  await finger(page, cdp, box.x + 50, box.y + 25, 180, 20);
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  expect(await page.locator('.fenster-inhalt').evaluate(e => e.scrollLeft)).toBe(0);
  const table = (await page.locator('#tabellenprobe').boundingBox())!;
  await finger(page, cdp, table.x + 280, table.y + 30, -200, 0);
  expect(await page.locator('#tabellenprobe').evaluate(e => e.scrollLeft)).toBeGreaterThan(60);
  await expect(dialog).toBeVisible();
  // Aufwärts scrollt der lange Kundenbogen, ohne die Schließgeste zu starten.
  await finger(page, cdp, box.x + 40, box.y + 55, 0, -160);
  expect(await page.locator('.fenster-inhalt').evaluate(e => e.scrollTop)).toBeGreaterThan(50);
  await expect(dialog).toBeVisible();
  // Erst den nativen Schwung auslaufen lassen. Ein bei scrollTop > 0
  // begonnener Wisch bleibt absichtlich Inhaltsscroll, auch wenn er oben endet.
  await page.locator('.fenster-inhalt').evaluate(el => new Promise<void>(fertig => {
    let vorher = el.scrollTop, ruhig = 0;
    const bild = () => {
      ruhig = Math.abs(el.scrollTop - vorher) < 0.1 ? ruhig + 1 : 0;
      vorher = el.scrollTop;
      if (ruhig >= 4) fertig(); else requestAnimationFrame(bild);
    };
    requestAnimationFrame(bild);
  }));
  await page.locator('.fenster-inhalt').evaluate(async el => {
    el.scrollTop = 0;
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });
  await finger(page, cdp, box.x + 50, box.y + 25, 0, 180);
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden');
});
test('Echter Touch am Griff schließt trotz nativer Pointer-Capture zuverlässig', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Touch-Schnittstelle von Chromium.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?pfad=%2F&rolle=Administrator');
  await page.locator('.unten button').filter({ hasText: 'Mehr' }).click();
  const griff = (await page.locator('.blatt-griff').boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  await finger(page, cdp, griff.x + griff.width / 2, griff.y + 10, 0, 180);
  await expect(page.getByRole('dialog', { name: 'Weitere Bereiche', exact: true })).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden');
});
});

/*
  DIE WARENKORB-LEISTE ZEIGT JEDEN NEUEN ARTIKEL (14.11.2026, gemeldet mit
  Bildschirmfoto vom iPhone): Safari ließ in der klebenden Leiste den alten
  Titel stehen — zwei Texte übereinander, die Zahl scheinbar unverändert.
  Geprüft wird nach jedem Artikel der Text und das Bild: was gezeichnet ist,
  muss dem gleichen, was nach einem erzwungenen Neuzeichnen dasteht. Läuft
  in Chromium und in WebKit (iPhone 13).
*/
test('Warenkorb-Leiste: jeder weitere Artikel steht sofort und sauber im Titel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`./?pfad=${encodeURIComponent('/material')}&rolle=Mitarbeiter`);
  await page.locator('select').first().selectOption({ index: 1 });
  const kreise = page.locator('.korb-kreis');
  await expect(kreise.first()).toBeVisible();
  const titel = page.locator('.korb .korb-titel');
  for (let n = 1; n <= 3; n++) {
    // Der erste noch freie Kreis — was in der Liste liegt, zeigt statt des Kreises die Menge.
    // In die Mitte gerollt: am unteren Rand läge er unter der klebenden Leiste.
    await kreise.first().evaluate((k) => k.scrollIntoView({ block: 'center' }));
    await kreise.first().click();
    await expect(titel).toHaveText(new RegExp(`^${n} Artikel`));
    await expect(titel).toHaveCount(1);
    // Ein fester Ausschnitt des Fensters: das Foto eines Elements rollt die Seite, und eine
    // klebende Leiste stünde danach an ihrem Platz im Fluss statt unten.
    const bild = async () => {
      await page.evaluate(() => new Promise((fertig) => requestAnimationFrame(() => requestAnimationFrame(fertig))));
      const r = (await page.locator('.korb').boundingBox())!;
      return { r, png: await page.screenshot({ clip: { x: r.x, y: r.y, width: r.width, height: r.height } }) };
    };
    const gezeichnet = await bild();
    await page.evaluate(() => {
      const k = document.querySelector<HTMLElement>('.korb')!;
      k.style.display = 'none';
      void k.offsetHeight;
      k.style.display = '';
    });
    const neu = await bild();
    expect(neu.r, `nach ${n} Artikel: an derselben Stelle`).toEqual(gezeichnet.r);
    const gleich = gezeichnet.png.equals(neu.png);
    expect(gleich, `nach ${n} Artikel: gezeichnet wie neu`).toBe(true);
  }
});

/*
  KLEBENDE SPEICHERLEISTE BEIM ROLLEN (iPhone, Firmendaten, 14.11.2026):
  Safari ließ den Umriss der Leiste beim Rollen stehen — zwei Rahmenstücke,
  eine Linie durch „Speichern“. Gerollt wird in Schritten; nach jedem muss
  die Leiste gezeichnet so aussehen wie nach einem erzwungenen Neuzeichnen
  und unten kleben. In der CI läuft das auch in WebKit (iPhone 13).
*/
test('Speicherleiste der Firmendaten: beim Rollen sauber gezeichnet, ohne stehengebliebene Kontur', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`./?pfad=${encodeURIComponent('/settings/firma')}&rolle=Administrator`);
  const leiste = page.locator('.aktionsleiste').first();
  await expect(leiste).toBeVisible();
  const bild = async () => {
    await page.evaluate(() => new Promise((fertig) => requestAnimationFrame(() => requestAnimationFrame(fertig))));
    const r = (await leiste.boundingBox())!;
    return { r, png: await page.screenshot({ clip: { x: r.x, y: r.y, width: r.width, height: r.height } }) };
  };
  for (const y of [300, 700, 1100]) {
    await page.mouse.wheel(0, y - (await page.evaluate(() => window.scrollY)));
    await page.waitForTimeout(250);
    const gezeichnet = await bild();
    await leiste.evaluate((l: HTMLElement) => { l.style.display = 'none'; void l.offsetHeight; l.style.display = ''; });
    const neu = await bild();
    expect(neu.r, `bei ${y} px: an derselben Stelle`).toEqual(gezeichnet.r);
    expect(gezeichnet.png.equals(neu.png), `bei ${y} px: gezeichnet wie neu`).toBe(true);
    // Die Kontur ist keine Umrisslinie (die Safari stehen ließ), sondern eine innere Linie.
    expect(await leiste.evaluate((l) => getComputedStyle(l).outlineStyle)).toBe('none');
  }
});

/*
  ZAHLENSPALTEN DER RECHNUNG (14.11.2026): Menge und Betrag in Mono klebten
  mit 10–15 px Lücke aneinander („1 pausch 18 420,50“), weil der Abstand an
  den Zellen gegen `.tabelle-eng td` verlor. Gemessen wird die Lücke zwischen
  den Texten, in drei Breiten; Kopf und Wert stehen rechtsbündig übereinander.
*/
test('Rechnungsfenster: Menge und Betrag stehen getrennt und unter ihrem Kopf', async ({ page }) => {
  for (const breite of [390, 834, 1440]) {
    await page.setViewportSize({ width: breite, height: 900 });
    await page.goto(`./?pfad=${encodeURIComponent('/invoices')}&rolle=Administrator`);
    await page.locator('.inhalt .zeile-ganz .zeile-ziel').first().click();
    const tabelle = page.locator('table.rechnung-stueckliste').first();
    await expect(tabelle).toBeVisible();
    const m = await tabelle.evaluate((t) => {
      const text = (c: Element) => {
        const r = document.createRange(); r.selectNodeContents(c);
        const rs = [...r.getClientRects()].filter((x) => x.width > 0);
        return { links: Math.min(...rs.map((x) => x.left)), rechts: Math.max(...rs.map((x) => x.right)) };
      };
      const kopf = [...t.querySelectorAll('thead th')].map(text);
      const zeile = [...t.querySelectorAll('tbody tr:first-child td')].map(text);
      return {
        luecke: Math.round(zeile[3].links - zeile[2].rechts),
        mengeBuendig: Math.abs(kopf[2].rechts - zeile[2].rechts) < 1,
        betragBuendig: Math.abs(kopf[3].rechts - zeile[3].rechts) < 1,
      };
    });
    expect(m.luecke, `${breite} px`).toBeGreaterThanOrEqual(24);
    expect(m, `${breite} px`).toMatchObject({ mengeBuendig: true, betragBuendig: true });
  }
});
