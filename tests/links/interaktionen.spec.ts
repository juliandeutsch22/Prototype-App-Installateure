import { test, expect, type Page, type CDPSession } from '@playwright/test';

for (const width of [390, 1440]) for (const theme of ['hell', 'dunkel']) {
  test(`Suchfelder: ein äußerer Fokusrahmen ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(t => localStorage.setItem('senklot.darstellung', t), theme);
    for (const route of ['/invoices', '/quotes', '/customers']) await test.step(route, async () => {
      await page.goto(`./?pfad=${encodeURIComponent(route)}&rolle=Administrator`);
      const feld = page.locator('.listenleiste-suche input');
      await feld.focus();
      await expect(feld).toHaveCSS('box-shadow', 'none');
      await expect(feld).toHaveCSS('outline-style', 'none');
      await expect(feld.locator('..')).toHaveCSS('outline-width', '3px');
      await feld.fill('Prüfung');
      await expect(feld).toHaveValue('Prüfung');
    });
  });
}

for (const fall of [
  { route: '/invoices', rolle: 'Administrator', role: 'button' as const, name: 'Erledigt', selected: 'aria-pressed' },
  { route: '/customers/k1', rolle: 'Administrator', role: 'tab' as const, name: 'Stammdaten', selected: 'aria-selected' },
  { route: '/assignments/woche', rolle: 'Administrator', role: 'button' as const, name: 'Monat', selected: 'aria-pressed' },
]) test(`Filter und Ansicht halten die Seitenposition ${fall.route}`, async ({ page }) => {
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
  await expect(wahl).toHaveAttribute(fall.selected, 'true');
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
