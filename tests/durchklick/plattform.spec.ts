import { test, expect, type Page } from '@playwright/test';
import { admin, PASSWORT } from './aufbau';
import { totp } from '../totp';

const EMAIL = 'lot-plattform@durchklick.test';
let faktor = '';
test.use({ actionTimeout: 20_000 });

async function anmelden(page: Page) {
  await test.step('Mit verpflichtendem zweiten Faktor anmelden', async () => {
  await page.goto('/');
  await page.getByLabel('E-Mail oder Benutzername', { exact: true }).fill(EMAIL);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORT);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Zwei-Faktor-Anmeldung', exact: true })).toBeVisible();
  if (!faktor) {
    await page.getByRole('button', { name: 'Einrichtung beginnen' }).click();
    faktor = ((await page.locator('span.font-mono').first().textContent()) ?? '').trim();
    await page.getByLabel('Code aus der App').fill(totp(faktor));
    await page.getByRole('button', { name: 'Bestätigen', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Wiederherstellungscodes' })).toBeVisible();
    await page.getByRole('button', { name: 'Codes notiert — weiter' }).click();
  } else {
    await page.getByLabel('Code aus der App').fill(totp(faktor));
    await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Betriebe', exact: true })).toBeVisible({ timeout: 20_000 });
  });
}

async function anlegen(page: Page, benutzername = false) {
  const kennung = `lot-browser-${Date.now().toString(36)}`;
  await page.getByRole('button', { name: 'Betrieb anlegen', exact: true }).click();
  await page.getByLabel('Name des Betriebs').fill(`Lot Browser ${kennung}`);
  await page.getByLabel('Kennung', { exact: true }).fill(kennung);
  await page.getByLabel('Erster Administrator', { exact: true }).fill('Andrea Browser');
  if (benutzername) {
    await page.getByLabel('Anmeldung mit').selectOption('benutzername');
    await page.getByLabel('Benutzername', { exact: true }).fill(`andrea.${kennung.slice(-8)}`);
    await page.getByLabel(/Testbetrieb \(/).check();
  } else {
    await page.getByLabel('Dessen E-Mail').fill(`${kennung}@durchklick.test`);
  }
  await page.getByRole('button', { name: 'Betrieb anlegen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Betrieb angelegt', exact: true })).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  return kennung;
}

async function verwalten(page: Page, kennung: string) {
  await page.getByRole('button', { name: 'Zu den Betrieben', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Betrieb suchen' }).fill(kennung);
  await page.getByRole('button', { name: `Lot Browser ${kennung} (${kennung})`, exact: true }).click();
  return page.getByRole('dialog', { name: `Lot Browser ${kennung} verwalten` });
}

test.beforeAll(async () => {
  const alt = (await admin.auth.admin.listUsers({ perPage: 1000 })).data.users.find((u) => u.email === EMAIL);
  if (alt) await admin.auth.admin.deleteUser(alt.id);
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORT, email_confirm: true });
  if (error) throw error;
  const { error: fehler } = await admin.from('platform_admins').upsert({ id: data.user!.id, name: 'Lot Browser Plattform' });
  if (fehler) throw fehler;
});

test('Plattform: E-Mail-Anlage, Bereichswechsel, Übergabe, Frist und Reaktivierung', async ({ page }) => {
  test.setTimeout(180_000);
  await anmelden(page);
  const kennung = await anlegen(page);
  const zugang = page.getByRole('link', { name: /https?:\/\// });
  await expect(zugang).toBeVisible();
  await page.getByRole('button', { name: 'Mein Konto', exact: true }).click();
  await expect(page.getByText('Für das Plattformkonto ist sie Pflicht.')).toBeVisible();
  await page.getByRole('button', { name: 'Betriebe', exact: true }).click();
  await expect(zugang).toBeVisible();
  const fenster = await verwalten(page, kennung);
  await expect(fenster.getByRole('button', { name: 'Deaktivieren', exact: true })).toBeDisabled();
  await fenster.getByLabel('Grund (steht im Protokoll)').fill('Lokaler Browserlauf: Deaktivierung');
  await fenster.getByRole('button', { name: 'Deaktivieren', exact: true }).click();
  await expect(fenster.getByRole('button', { name: 'Wieder aktivieren', exact: true })).toBeVisible();
  await expect(fenster.getByRole('button', { name: 'Löschung planen', exact: true })).toBeDisabled();
  await fenster.getByLabel('Grund (steht im Protokoll)').fill('Lokaler Browserlauf: Übergabe');
  await fenster.getByRole('button', { name: 'Übergabe erstellen', exact: true }).click();
  await expect(fenster.getByRole('link', { name: /^Daten \(JSON-Zeilen\)/ })).toBeVisible({ timeout: 30_000 });
  await expect(fenster.getByRole('link', { name: 'Verzeichnis der Dateien' })).toBeVisible();
  await fenster.getByLabel('Grund (steht im Protokoll)').fill('Lokaler Browserlauf: Löschplanung');
  await fenster.getByLabel('Frist (Tage)').fill('7');
  await fenster.getByRole('button', { name: 'Löschung planen', exact: true }).click();
  await expect(fenster.getByText('Vor Ablauf der Frist lässt sich nicht löschen.')).toBeVisible();
  await expect(fenster.getByRole('button', { name: 'Endgültig löschen', exact: true })).toHaveCount(0);
  await fenster.getByLabel('Grund (steht im Protokoll)').fill('Lokaler Browserlauf: Wiederaufnahme');
  await fenster.getByRole('button', { name: 'Wieder aktivieren', exact: true }).click();
  await expect(fenster.getByRole('button', { name: 'Deaktivieren', exact: true })).toBeVisible();
  await expect(fenster.getByRole('button', { name: 'Löschung abbrechen', exact: true })).toHaveCount(0);
});

test('Plattform: Benutzername, Notzugang und identitätsgeprüfte Wiederherstellung bis zur Testlöschung', async ({ page }) => {
  test.setTimeout(180_000);
  await anmelden(page);
  const kennung = await anlegen(page, true);
  await expect(page.getByText(/Das Startpasswort steht nur jetzt hier/)).toBeVisible();
  let fenster = await verwalten(page, kennung);
  await fenster.getByRole('button', { name: 'Notzugang öffnen', exact: true }).click();
  await expect(page.getByLabel('Betrieb', { exact: true })).toHaveValue(kennung);
  await page.getByLabel('Grund', { exact: true }).filter({ visible: true }).fill('Lokaler Browserlauf: Leitung ausgesperrt');
  await page.getByRole('button', { name: 'Notzugang öffnen', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Lot Browser ${kennung}`, exact: true })).toBeVisible();
  await page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: `Lot Browser ${kennung}`, exact: true }) }).getByRole('button', { name: 'Passwort neu setzen', exact: true }).click();
  await page.getByLabel('Konto', { exact: true }).selectOption({ index: 1 });
  await page.getByLabel('Grund', { exact: true }).filter({ visible: true }).fill('Lokaler Browserlauf: Rückruf bestätigt');
  await page.getByLabel(/^Rückruf an/).fill('+43 1 000000');
  await expect(page.getByRole('button', { name: 'Startpasswort erzeugen' })).toBeDisabled();
  await page.getByLabel(/Die Identität ist durch Rückruf/).check();
  await page.getByRole('button', { name: 'Startpasswort erzeugen' }).click();
  await expect(page.getByText(/Startpasswort für/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Fehlerprotokoll', exact: true }).click();
  await page.getByRole('button', { name: 'Supportzugänge', exact: true }).click();
  await expect(page.getByText(/Startpasswort für/)).toBeVisible();
  await page.getByRole('button', { name: 'Betriebe', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Betrieb suchen' }).fill(kennung);
  await page.getByRole('button', { name: `Lot Browser ${kennung} (${kennung})`, exact: true }).click();
  fenster = page.getByRole('dialog', { name: `Lot Browser ${kennung} verwalten` });
  await fenster.getByLabel('Grund (steht im Protokoll)').fill('Lokaler Browserlauf: Test beendet');
  await fenster.getByRole('button', { name: 'Deaktivieren', exact: true }).click();
  await expect(fenster.getByRole('button', { name: 'Wieder aktivieren', exact: true })).toBeVisible();
  await fenster.getByLabel('Grund (steht im Protokoll)').fill('Lokaler Browserlauf: Testlöschung planen');
  await expect(fenster.getByLabel('Frist (Tage)')).toHaveValue('0');
  await fenster.getByRole('button', { name: 'Löschung planen', exact: true }).click();
  await expect(fenster.getByRole('button', { name: 'Endgültig löschen', exact: true })).toBeVisible();
  await fenster.getByLabel('Grund (steht im Protokoll)').fill('Lokaler Browserlauf: Testlöschung bestätigt');
  await fenster.getByLabel(/Zur Bestätigung die Kennung eintippen/).fill('falsch');
  await expect(fenster.getByRole('button', { name: 'Endgültig löschen', exact: true })).toBeDisabled();
  await fenster.getByLabel(/Zur Bestätigung die Kennung eintippen/).fill(kennung);
  await fenster.getByRole('button', { name: 'Endgültig löschen', exact: true }).click();
  await expect(fenster).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Gelöscht:' })).toBeVisible();
  await page.getByRole('button', { name: /Löschprotokoll/ }).click();
  await expect(page.getByRole('listitem').filter({ hasText: kennung })).toBeVisible();
});

/*
  DIE PLATTFORM IN DER LINIE „LOT“ (E48, 05.11.2026). Vorher ein dunkles Band
  oben, Reiter darunter, die Seite weiß und eine grau gefüllte Spalte. Jetzt
  dieselbe Hülle wie die App: Seitenleiste mit dem Lot am Seil (Tablet,
  Schreibtisch), Kopfzeile und Reiterleiste (Handy), Raster, Blätter auf den
  Linien und die Kontextspalte (seit V10 mit feiner Linie statt Eckmarken).
*/
test('Plattform in der Linie Lot: Leiste, Raster, Blätter und Kontextspalte — in drei Breiten', async ({ page }) => {
  await anmelden(page);
  const messen = () =>
    page.evaluate(() => {
      const flaeche = document.querySelector<HTMLElement>('.hauptflaeche');
      const blatt = document.querySelector<HTMLElement>('.plattform-betriebsliste');
      const kontext = [...document.querySelectorAll<HTMLElement>('.plattform-kontext')].find((k) => k.offsetParent !== null) ?? null;
      const sichtbar = (s: string) => { const e = document.querySelector<HTMLElement>(s); return !!e && getComputedStyle(e).display !== 'none'; };
      if (!flaeche || !blatt) return null;
      const [, versatz] = getComputedStyle(flaeche).backgroundPosition.split(' ').map(parseFloat);
      const ursprung = flaeche.getBoundingClientRect().top + versatz;
      const aufLinie = (y: number) => { const r = (((y - ursprung) % 24) + 24) % 24; return Math.min(r, 24 - r); };
      const b = blatt.getBoundingClientRect();
      const k = kontext?.getBoundingClientRect();
      const aktiv = document.querySelector<HTMLElement>('.navi .navi-punkt-aktiv');
      const blei = document.querySelector<HTMLElement>('.navi-blei');
      const mitte = (e: HTMLElement | null) => { if (!e) return null; const r = e.getBoundingClientRect(); return r.top + r.height / 2; };
      return {
        leiste: sichtbar('.navi'), reiter: sichtbar('.unten'), kopfzeile: sichtbar('.kopfzeile'),
        altesBand: !!document.querySelector('.plattform-markenband, .plattform-navigation'),
        raster: getComputedStyle(flaeche).backgroundImage.includes('linear-gradient'),
        blattLinie: getComputedStyle(blatt).boxShadow, blattEcke: getComputedStyle(blatt).borderTopLeftRadius,
        blattOben: aufLinie(b.top), blattUnten: aufLinie(b.bottom),
        kontextFlaeche: kontext ? getComputedStyle(kontext).backgroundColor : null,
        kontextMarken: kontext ? getComputedStyle(kontext).backgroundImage.includes('linear-gradient') : null,
        kontextOben: k ? aufLinie(k.top) : null,
        quer: document.documentElement.scrollWidth - innerWidth,
        lotAbstand: aktiv && blei && getComputedStyle(document.querySelector('.navi')!).display !== 'none' ? Math.abs((mitte(blei) ?? 0) - (mitte(aktiv) ?? 0)) : null,
      };
    });
  const ruhig = async () => {
    let zuletzt = '';
    await expect.poll(async () => {
      await page.evaluate(() => new Promise((fertig) => requestAnimationFrame(() => requestAnimationFrame(fertig))));
      const jetzt = JSON.stringify(await messen());
      const gleich = jetzt === zuletzt;
      zuletzt = jetzt;
      return gleich;
    }, { timeout: 10_000 }).toBe(true);
    return JSON.parse(zuletzt) as NonNullable<Awaited<ReturnType<typeof messen>>>;
  };

  for (const breite of [1280, 834, 390]) {
    await page.setViewportSize({ width: breite, height: 900 });
    const m = await ruhig();
    expect(m, `${breite} px: Arbeitsfläche mit Raster und Betriebsliste`).not.toBeNull();
    expect(m.altesBand, `${breite} px: kein Band und keine Reiter von vorher`).toBe(false);
    expect(m.raster, `${breite} px: Raster`).toBe(true);
    expect(m.leiste, `${breite} px: Seitenleiste`).toBe(breite >= 760);
    expect(m.reiter, `${breite} px: Reiterleiste`).toBe(breite < 760);
    expect(m.kopfzeile, `${breite} px: Kopfzeile`).toBe(breite < 760);
    expect(m.blattLinie, `${breite} px: Liste als Blatt mit Linie`).toContain('1px 0px 0px');
    expect(m.blattEcke, `${breite} px: eckig`).toBe('0px');
    expect(m.blattOben, `${breite} px: Oberkante auf einer Linie`).toBeLessThanOrEqual(0.5);
    expect(m.blattUnten, `${breite} px: Unterkante auf einer Linie`).toBeLessThanOrEqual(0.5);
    expect(m.kontextFlaeche, `${breite} px: Kontextspalte ohne Fläche`).toBe('rgba(0, 0, 0, 0)');
    // V10 (13.11.2026): die Kontextspalte ist ruhig — keine Eckmarken mehr, wie in Akte und Beleg.
    expect(m.kontextMarken, `${breite} px: Kontextspalte ohne Eckmarken`).toBe(false);
    expect(m.kontextOben, `${breite} px: Kontextspalte auf einer Linie`).toBeLessThanOrEqual(0.5);
    expect(m.quer, `${breite} px: nichts rollt seitlich`).toBeLessThanOrEqual(0);
    await expect(page.getByRole('button', { name: 'Mein Konto', exact: true }), `${breite} px: „Mein Konto“ erreichbar`).toBeVisible();
  }

  // Das Lot fährt mit dem Bereich, nicht mit dem Pfad — die Adresse bleibt /plattform.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('navigation', { name: 'Bereiche der Plattform', exact: true }).getByRole('button', { name: 'Rechtstexte' }).click();
  await expect(page.getByRole('heading', { name: 'Rechtstexte', exact: true })).toBeVisible();
  const lot = await ruhig();
  expect(lot.lotAbstand, 'Das Blei hängt neben „Rechtstexte“').not.toBeNull();
  expect(lot.lotAbstand!, 'Das Blei hängt neben „Rechtstexte“').toBeLessThanOrEqual(2);
  await page.getByRole('navigation', { name: 'Bereiche der Plattform', exact: true }).getByRole('button', { name: 'Betriebe' }).click();
});
