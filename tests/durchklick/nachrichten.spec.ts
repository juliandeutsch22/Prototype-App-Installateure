import { test, expect, type Page } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, BUERO, CHEFIN, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung, menue } from './helfer';

/**
 * NACHRICHTEN, VON ANFANG BIS ENDE (M10/B09, E64) — in Chromium, auf dem
 * Telefon (WebKit) und auf dem Tablet (`MONTEUR_WEGE`).
 *
 *   1. Der Monteur schreibt dem Büro privat, das Büro antwortet, der Monteur
 *      liest die Antwort. Die Geschäftsführung sieht das Gespräch weder in
 *      ihren Nachrichten noch an der Akte des Monteurs.
 *   2. Das Büro schreibt mit einem Bild in den Thread der Baustelle; der
 *      Monteur, der im Team steht, liest Text und Bild.
 *   3. Senden springt nicht (E65): die eben gesendete Nachricht steht ab dem
 *      ersten Bild bis zur Bestätigung durchgehend da, die Zahl der
 *      Nachrichten geht nie zurück, und der Verlauf rollt nicht zurück.
 *
 * Direktnachrichten sind seit E65 ab Werk an — hier ohne jede Festlegung.
 */
const BILD = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function uid(email: string): Promise<string> {
  const { data } = await admin.from('users').select('id').eq('company_id', BETRIEB).eq('email', email).single();
  return (data as { id: string }).id;
}

async function abraeumen() {
  const { data: anhaenge } = await admin.from('nachricht_anhaenge').select('eimer, pfad').eq('company_id', BETRIEB);
  for (const a of (anhaenge ?? []) as { eimer: string; pfad: string }[]) await admin.storage.from(a.eimer).remove([a.pfad]);
  await admin.from('nachricht_meldungen').delete().eq('company_id', BETRIEB);
  await admin.from('nachrichten_kanaele').delete().eq('company_id', BETRIEB);
  await admin.from('companies').update({ modules: {} }).eq('id', BETRIEB);
  await admin.from('projects').update({ assigned_employees: [] }).eq('company_id', BETRIEB).eq('project_number', BAUSTELLE.nummer);
}

test.beforeEach(abraeumen);
test.afterEach(abraeumen);

async function senden(seite: Page, text: string) {
  const feld = seite.getByRole('textbox', { name: 'Nachricht' });
  await feld.fill(text);
  await seite.getByRole('button', { name: 'Senden' }).click();
  await expect(seite.getByRole('list', { name: 'Verlauf' }).getByText(text)).toBeVisible({ timeout: 15_000 });
  await expect(seite.getByText('wird gesendet')).toHaveCount(0, { timeout: 15_000 });
}

test('privat: Monteur schreibt dem Büro, das Büro antwortet — die Geschäftsführung sieht nichts', async ({ browser }) => {
  test.setTimeout(180_000);
  const geheim = `Zählerstand ${Date.now()}`;

  const monteur = await (await browser.newContext()).newPage();
  await anmelden(monteur, MONTEUR.email);
  await menue(monteur, 'Nachrichten');
  await expect(monteur.getByRole('heading', { name: 'Nachrichten', level: 1 })).toBeVisible();
  await monteur.getByRole('button', { name: 'Neue Nachricht' }).click();
  // Ein Bogen, ein Schritt: die Personen stehen gleich da.
  await monteur.getByRole('button', { name: new RegExp(BUERO.name) }).click();
  await expect(monteur).toHaveURL(/\/nachrichten\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await senden(monteur, geheim);
  await keineFehlermeldung(monteur);

  const buero = await (await browser.newContext()).newPage();
  await anmelden(buero, BUERO.email);
  await menue(buero, 'Nachrichten');
  const zeile = buero.getByRole('link', { name: MONTEUR.name });
  await expect(zeile).toBeVisible({ timeout: 15_000 });
  await expect(zeile.locator('xpath=ancestor::li[1]')).toContainText('1 neu');
  await zeile.click();
  await expect(buero.getByRole('list', { name: 'Verlauf' }).getByText(geheim)).toBeVisible();
  await senden(buero, 'Danke, ist notiert.');

  await monteur.reload();
  await expect(monteur.getByRole('list', { name: 'Verlauf' }).getByText('Danke, ist notiert.')).toBeVisible({ timeout: 15_000 });

  // Die Geschäftsführung: kein Gespräch, an der Akte des Monteurs kein Inhalt.
  const chefin = await (await browser.newContext()).newPage();
  await anmelden(chefin, CHEFIN.email);
  await chefin.goto('/nachrichten');
  await expect(chefin.getByText('Noch kein Gespräch')).toBeVisible({ timeout: 15_000 });
  await chefin.goto(`/user-mgmt/${await uid(MONTEUR.email)}`);
  await expect(chefin.getByRole('heading', { name: MONTEUR.name })).toBeVisible({ timeout: 15_000 });
  await expect(chefin.getByText(geheim)).toHaveCount(0);
  await expect(chefin.getByRole('button', { name: 'Nachricht schreiben' })).toBeVisible();
});

test('Baustelle: das Büro schreibt mit Bild in den Thread, der Monteur im Team liest es', async ({ browser }) => {
  test.setTimeout(180_000);
  await admin.from('projects').update({ assigned_employees: [await uid(MONTEUR.email)] })
    .eq('company_id', BETRIEB).eq('project_number', BAUSTELLE.nummer);

  const buero = await (await browser.newContext()).newPage();
  await anmelden(buero, BUERO.email);
  await menue(buero, 'Nachrichten');
  await buero.getByRole('button', { name: 'Neue Nachricht' }).click();
  await buero.getByRole('button', { name: new RegExp(BAUSTELLE.nummer) }).click();
  await expect(buero).toHaveURL(/\/nachrichten\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await buero.locator('#nachricht-dateien').setInputFiles({ name: 'zaehler.png', mimeType: 'image/png', buffer: BILD });
  await expect(buero.getByText('zaehler.png')).toBeVisible();
  await senden(buero, 'Zähler fotografiert');
  await expect(buero.getByRole('img', { name: 'zaehler.png' })).toBeVisible({ timeout: 15_000 });
  await keineFehlermeldung(buero);

  const monteur = await (await browser.newContext()).newPage();
  await anmelden(monteur, MONTEUR.email);
  await menue(monteur, 'Nachrichten');
  await monteur.getByRole('link', { name: new RegExp(BAUSTELLE.nummer) }).click();
  await expect(monteur.getByRole('list', { name: 'Verlauf' }).getByText('Zähler fotografiert')).toBeVisible({ timeout: 15_000 });
  await expect(monteur.getByRole('img', { name: 'zaehler.png' })).toBeVisible({ timeout: 15_000 });
  await keineFehlermeldung(monteur);
});

test('Senden springt nicht: die Nachricht steht durchgehend, nichts rollt zurück', async ({ browser }) => {
  test.setTimeout(180_000);
  const seite = await (await browser.newContext()).newPage();
  await anmelden(seite, MONTEUR.email);
  await menue(seite, 'Nachrichten');
  await seite.getByRole('button', { name: 'Neue Nachricht' }).click();
  await seite.getByRole('button', { name: new RegExp(BUERO.name) }).click();
  await expect(seite).toHaveURL(/\/nachrichten\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  // Genug Verlauf, dass gerollt wird.
  for (let i = 0; i < 8; i++) await senden(seite, `Vorlauf ${i}: eine Zeile mit etwas Text, damit der Verlauf länger wird als das Fenster.`);

  // Von jetzt an jedes Bild mitschreiben: Zahl der Nachrichten, ob die neue da ist, wie weit gerollt ist.
  await seite.evaluate(() => {
    const w = window as unknown as { bilder: { n: number; da: boolean; rolle: number }[]; messen: boolean };
    w.bilder = []; w.messen = true;
    const rahmen = () => {
      const r = document.querySelector('.gespraech-verlauf') as HTMLElement | null;
      return r && getComputedStyle(r).overflowY === 'auto' ? r.scrollTop : window.scrollY;
    };
    const schritt = () => {
      const li = [...document.querySelectorAll('ol[aria-label="Verlauf"] > li')];
      w.bilder.push({ n: li.length, da: li.some((x) => x.textContent?.includes('Messung ohne Springen')), rolle: rahmen() });
      if (w.messen) requestAnimationFrame(schritt);
    };
    requestAnimationFrame(schritt);
  });
  await seite.getByRole('textbox', { name: 'Nachricht' }).fill('Messung ohne Springen');
  await seite.getByRole('button', { name: 'Senden' }).click();
  await expect(seite.getByText('wird gesendet')).toHaveCount(0, { timeout: 15_000 });
  await seite.waitForTimeout(1500);
  const bilder = await seite.evaluate(() => {
    const w = window as unknown as { bilder: { n: number; da: boolean; rolle: number }[]; messen: boolean };
    w.messen = false;
    return w.bilder;
  });

  console.log(JSON.stringify(bilder.map((b) => `${b.n}${b.da ? "+" : "-"}${Math.round(b.rolle)}`)));
  const erstes = bilder.findIndex((b) => b.da);
  expect(erstes, 'die Nachricht erscheint').toBeGreaterThanOrEqual(0);
  const danach = bilder.slice(erstes);
  expect(danach.every((b) => b.da), 'sie verschwindet nie mehr').toBe(true);
  for (let i = 1; i < bilder.length; i++) {
    expect(bilder[i].n, `Bild ${i}: die Zahl der Nachrichten geht nicht zurück`).toBeGreaterThanOrEqual(bilder[i - 1].n);
  }
  for (let i = erstes + 1; i < bilder.length; i++) {
    expect(bilder[i].rolle, `Bild ${i}: der Verlauf rollt nicht zurück`).toBeGreaterThanOrEqual(bilder[i - 1].rolle - 1);
  }
  await keineFehlermeldung(seite);
});

/*
 * DIE SUCHE IM POSTEINGANG UND IN „NEUE NACHRICHT“ (09.11.2026: „hat noch
 * diese komische Border innen, die wir bei anderen Suchfeldern schon entfernt
 * haben“). Die Pille ist der Rahmen; innen kein zweiter Ring. Seit E75
 * (10.11.2026) auch außen keiner mehr: im Fokus färbt sich nur der Rand der
 * Pille. Geprüft wird der Linienstil, nicht die Breite: Chromium meldet bei
 * `outline-style: none` als Breite den Grundwert 3 px. Gegenprobe: mit dem
 * Stand vor E75 (Ring außen) rot.
 */
test('Suche in den Nachrichten: im Fokus nur der Rand der Pille, kein Ring innen oder außen', async ({ page }) => {
  await anmelden(page, MONTEUR.email);
  await page.goto('/nachrichten');
  for (const [feld, vorher] of [
    [page.locator('#nachrichten-suche'), null],
    [page.locator('#neu-suche'), async () => page.getByRole('button', { name: 'Neue Nachricht' }).first().click()],
  ] as const) {
    if (vorher) await vorher();
    await expect(feld).toBeVisible({ timeout: 15_000 });
    await feld.focus();
    await expect(feld).toHaveCSS('box-shadow', 'none');
    await expect(feld).toHaveCSS('outline-style', 'none');
    const pille = feld.locator('xpath=ancestor::label[1]');
    await expect(pille).toHaveCSS('outline-style', 'none');
    await expect(pille).toHaveCSS('box-shadow', 'none');
    // V10: der Rand nimmt die Fokusfarbe (#B97B5E) an — kein Petrol mehr.
    await expect(pille).toHaveCSS('border-top-color', 'rgb(185, 123, 94)');
    await feld.fill('Büro');
    await expect(feld).toHaveValue('Büro');
  }
  await keineFehlermeldung(page);
});
