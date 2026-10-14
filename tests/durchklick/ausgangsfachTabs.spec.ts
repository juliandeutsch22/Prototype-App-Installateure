import { test, expect } from '@playwright/test';

// Echte Tabs, IndexedDB und Browsersperren; der kontrollierte Sender macht die
// Reihenfolge und die ausbleibende Antwort gezielt wiederholbar. Den echten
// Datenbankweg prüft zusätzlich zeitBuchen.spec.ts.
for (const ersatz of [false, true]) test.describe(ersatz ? 'IndexedDB-Sperre' : 'Web Locks', () => {
  test.beforeEach(async ({ context }) => {
    if (ersatz) await context.addInitScript(() => Object.defineProperty(navigator, 'locks', { value: undefined }));
  });
test('zwei Tabs senden einen alten Stand nicht über eine neue Änderung', async ({ page, context }) => {
  await page.goto('/');
  const zweite = await context.newPage();
  await zweite.goto('/');
  await page.evaluate(async () => {
    const pfad = '/src/lib/sync/';
    const { lagerImBrowser } = await import(pfad + 'lagerIndexedDB.ts');
    const { schreiben } = await import(pfad + 'ausgangsfach.ts');
    await schreiben({ tabelle: 'test', zeile: 'z', art: 'anlegen', daten: { wert: 1 }, uid: 'test' },
      lagerImBrowser(), async () => ({ art: 'ok' }), () => true);
  });
  const lauf1 = page.evaluate(async () => {
    const pfad = '/src/lib/sync/';
    const { lagerImBrowser } = await import(pfad + 'lagerIndexedDB.ts');
    const { nachsenden } = await import(pfad + 'ausgangsfach.ts');
    await nachsenden(lagerImBrowser(), async (v: { daten: { wert: number } }) => {
      localStorage.setItem('sender-laeuft', 'ja');
      await new Promise((r) => setTimeout(r, 300));
      const gesehen = JSON.parse(localStorage.getItem('gesehen') ?? '[]');
      localStorage.setItem('gesehen', JSON.stringify([...gesehen, v.daten.wert]));
      return { art: 'ok' };
    }, 'test');
  });
  await expect.poll(() => zweite.evaluate(() => localStorage.getItem('sender-laeuft'))).toBe('ja');
  const lauf2 = zweite.evaluate(async () => {
    const pfad = '/src/lib/sync/';
    const { lagerImBrowser } = await import(pfad + 'lagerIndexedDB.ts');
    const { nachsenden, schreiben } = await import(pfad + 'ausgangsfach.ts');
    const senden = async (v: { daten: { wert: number } }) => {
      const gesehen = JSON.parse(localStorage.getItem('gesehen') ?? '[]');
      localStorage.setItem('gesehen', JSON.stringify([...gesehen, v.daten.wert]));
      return { art: 'ok' };
    };
    await Promise.all([
      nachsenden(lagerImBrowser(), senden, 'test'),
      schreiben({ tabelle: 'test', zeile: 'z', art: 'aendern', daten: { wert: 2 }, uid: 'test' }, lagerImBrowser(), senden, () => false),
    ]);
    await nachsenden(lagerImBrowser(), senden, 'test');
    return (await lagerImBrowser().alle()).length;
  });
  const [, offen] = await Promise.all([lauf1, lauf2]);
  expect(offen).toBe(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gesehen') ?? '[]'))).toEqual([1, 2]);
});

test('eine hängende erste Antwort überlebt das Schließen des Tabs', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const pfad = '/src/lib/sync/';
    const { lagerImBrowser } = await import(pfad + 'lagerIndexedDB.ts');
    const { schreiben } = await import(pfad + 'ausgangsfach.ts');
    void schreiben({ tabelle: 'test', zeile: 'z', art: 'anlegen', daten: {}, uid: 'test' }, lagerImBrowser(),
      async () => { localStorage.setItem('sender-haengt', 'ja'); return new Promise(() => undefined); }, () => false);
  });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sender-haengt'))).toBe('ja');
  await page.close();
  const neu = await context.newPage();
  await neu.goto('/');
  const ergebnis = await neu.evaluate(async () => {
    const pfad = '/src/lib/sync/';
    const { lagerImBrowser } = await import(pfad + 'lagerIndexedDB.ts');
    const { nachsenden } = await import(pfad + 'ausgangsfach.ts');
    const lager = lagerImBrowser();
    const vorher = (await lager.alle()).length;
    const bericht = await nachsenden(lager, async () => ({ art: 'ok' }), 'test');
    return { vorher, bericht };
  });
  expect(ergebnis).toEqual({ vorher: 1, bericht: { gesendet: 1, abgelehnt: 0, offen: 0 } });
});

});
