import { test, expect, devices, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { admin, BETRIEB, BUERO, MONTEUR, PASSWORT } from './aufbau';
import { anmelden } from './helfer';

/**
 * DIE LEISTE BEIM DARÜBERFAHREN UND DIE REAKTIONEN (E77, 11.11.2026).
 *
 *   1. „Die Leiste darf den Text nicht verdecken“: in drei Breiten über
 *      jede Nachricht fahren, von oben nach unten und zurück — die Leiste
 *      trifft keinen Text, keine Blase, keine Reaktion, keine Tageszeile,
 *      und die Blase unter der Maus bleibt stehen.
 *   2. Der eine reagiert, der andere sieht es ohne Neuladen und setzt
 *      dieselbe; nach dem Neuladen steht beides noch.
 *   3. Am Handy tut ein kurzer Tipp nichts; langes Drücken öffnet die
 *      schwebende Leiste an der Nachricht (E79), das Zeichen dort setzt die
 *      Reaktion; langes Drücken auf das Kästchen zeigt, wer reagiert hat.
 *
 * Gegenprobe: mit der Leiste aus dem Entwurf (an der Ecke der Blase, 22 px
 * über ihr) ist (1) rot; mit dem Stand vor E77 gibt es weder Leiste noch
 * Kästchen.
 */
const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
// Der öffentliche Schlüssel des lokalen Stapels (wie in playwright.config.ts) — kein Geheimnis.
const ANON = process.env.SUPABASE_ANON_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

async function konto(email: string): Promise<SupabaseClient> {
  const c = createClient(API, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORT });
  if (error) throw error;
  return c;
}

async function uid(email: string): Promise<string> {
  const { data } = await admin.from('users').select('id').eq('company_id', BETRIEB).eq('email', email).single();
  return (data as { id: string }).id;
}

async function abraeumen() {
  await admin.from('nachrichten_kanaele').delete().eq('company_id', BETRIEB);
  await admin.from('companies').update({ modules: {} }).eq('id', BETRIEB);
}

/** Ein Gespräch zwischen Monteur und Büro, abwechselnd, kurz und lang — wie es im Betrieb aussieht. */
const TEXTE: [boolean, string][] = [
  [true, 'Bin auf der Baustelle.'],
  [true, 'Der Verteiler im Keller ist fertig montiert und gespült, die Druckprobe hält seit einer halben Stunde.'],
  [false, 'Danke!'],
  [true, 'Ok'],
  [false, 'Kannst du heute Nachmittag noch bei Familie Huber vorbeischauen? Der Heizkörper im Bad wird nicht warm, vermutlich Luft im System.'],
  [true, 'Mach ich, so gegen drei.'],
  [false, 'Passt.'],
  [true, 'Die Pressbacken 15 und 18 bring ich mit, die 22er liegen noch im Lager.'],
];

let kanal = '';

test.beforeEach(async () => {
  await abraeumen();
  const monteur = await konto(MONTEUR.email);
  const buero = await konto(BUERO.email);
  const { data, error } = await monteur.rpc('nachrichten_kanal_direkt', { p_mit: await uid(BUERO.email) });
  if (error) throw error;
  kanal = String(data);
  for (const [vomMonteur, text] of TEXTE) {
    const { error: e } = await (vomMonteur ? monteur : buero).rpc('nachricht_senden', {
      p_id: randomUUID(), p_kanal: kanal, p_text: text, p_anhaenge: [], p_erwaehnt: [], p_geraet_zeit: new Date().toISOString(), p_aus: null,
    });
    if (e) throw e;
  }
});
test.afterEach(abraeumen);

/** Wo die Leiste liegt und was sie träfe; wie weit sich die Blase bewegt hat. */
async function messen(page: Page, i: number, vorher: number) {
  return page.evaluate(([i, vorher]) => {
    const blatt = document.querySelectorAll('li[data-nachricht] .nachricht-blatt')[i]!;
    const l = document.querySelector('.nachricht-leiste');
    if (!l) return { leiste: false, treffer: [] as string[], ruck: 0, lage: '' };
    const k = l.getBoundingClientRect();
    const treffer = [...document.querySelectorAll('.nachricht-text, .nachricht-blatt, .nachricht-reaktionen, .verlauf-tag > span, .nachricht-kopf, .nachricht-status, .chat-kopf, .eingabe')]
      .filter((el) => { const t = el.getBoundingClientRect(); return t.left < k.right && t.right > k.left && t.top < k.bottom && t.bottom > k.top; })
      .map((el) => `${el.className}: ${(el.textContent ?? '').slice(0, 30)}`);
    const r = document.querySelector('.gespraech-verlauf')!;
    const lage = `${l.hasAttribute('data-schwebend') ? 'frei' : 'zeile'} st=${Math.round(r.scrollTop)} sh=${r.scrollHeight} ch=${r.clientHeight} i=${i} vorLeiste=${l.compareDocumentPosition(blatt) & 4 ? 'oben' : 'unten'}`;
    return { leiste: getComputedStyle(l).visibility === 'visible', treffer, ruck: Math.round(blatt.getBoundingClientRect().top - vorher), lage };
  }, [i, vorher] as const);
}

test('Die Leiste verdeckt keinen Text — am Tablet und am Schreibtisch, von oben nach unten und zurück', async ({ page }) => {
  test.setTimeout(120_000);
  await anmelden(page, BUERO.email);
  const fehler: string[] = [];
  for (const breite of [834, 1200, 1440]) {
    await page.setViewportSize({ width: breite, height: 900 });
    await page.goto(`/nachrichten/${kanal}`);
    const blaetter = page.locator('li[data-nachricht] .nachricht-blatt');
    await expect(blaetter).toHaveCount(TEXTE.length, { timeout: 15_000 });
    const folge = [...TEXTE.keys(), ...[...TEXTE.keys()].reverse()];
    for (const i of folge) {
      // Wer zeigt, sieht die Nachricht: erst ins Bild, dann die Maus darauf.
      await blaetter.nth(i).evaluate((el) => {
        const r = el.closest('.gespraech-verlauf')!.getBoundingClientRect(), b = el.getBoundingClientRect();
        if (b.top < r.top || b.bottom > r.bottom) el.scrollIntoView({ block: 'center' });
      });
      const b = (await blaetter.nth(i).boundingBox())!;
      await page.mouse.move(b.x + Math.min(24, b.width / 2), b.y + b.height / 2, { steps: 3 });
      const vorher = (await blaetter.nth(i).boundingBox())!.y;
      await expect(page.getByRole('toolbar', { name: /^Zur Nachricht von/ })).toBeVisible();
      await page.waitForTimeout(200);
      const m = await messen(page, i, vorher);
      if (!m.leiste) fehler.push(`${breite}/${i}: keine Leiste`);
      if (m.treffer.length) fehler.push(`${breite}/${i}: verdeckt ${m.treffer.join(' | ')}`);
      // Mit der Lage der Leiste und dem Rollstand — so fand sich am 11.11. der Fall „ganz unten, Leiste geht weg“.
      if (Math.abs(m.ruck) > 1) fehler.push(`${breite}/${i}: Blase ist ${m.ruck} px gerückt (${m.lage})`);
    }
  }
  expect(fehler).toEqual([]);
});

test('Der eine reagiert, der andere sieht es ohne Neuladen und setzt dieselbe', async ({ browser }) => {
  test.setTimeout(120_000);
  const buero = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await anmelden(buero, BUERO.email);
  await buero.goto(`/nachrichten/${kanal}`);
  const monteur = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await anmelden(monteur, MONTEUR.email);
  await monteur.goto(`/nachrichten/${kanal}`);
  const letzte = TEXTE[TEXTE.length - 1][1];
  // Im Verlauf — derselbe Text steht als Vorschau auch im Posteingang.
  await expect(monteur.getByRole('list', { name: 'Verlauf' }).getByText(letzte)).toBeVisible({ timeout: 15_000 });

  await buero.getByRole('list', { name: 'Verlauf' }).getByText(letzte).hover();
  const leiste = buero.getByRole('toolbar', { name: `Zur Nachricht von ${MONTEUR.name}` });
  await leiste.getByRole('button', { name: 'Reagieren: Daumen hoch' }).click();
  await expect(buero.getByRole('button', { name: 'Daumen hoch, 1: Du — zurücknehmen' })).toBeVisible();

  // Beim Monteur, ohne Neuladen.
  const fremd = monteur.getByRole('button', { name: `Daumen hoch, 1: ${BUERO.name}` });
  await expect(fremd).toBeVisible({ timeout: 15_000 });
  await fremd.click();
  await expect(monteur.getByRole('button', { name: `Daumen hoch, 2: Du, ${BUERO.name} — zurücknehmen` })).toBeVisible();
  await expect(buero.getByRole('button', { name: `Daumen hoch, 2: Du, ${MONTEUR.name} — zurücknehmen` })).toBeVisible({ timeout: 15_000 });

  // Gespeichert: nach dem Neuladen steht es noch, die Namen beim Darüberfahren.
  await buero.reload();
  const kaestchen = buero.getByRole('button', { name: `Daumen hoch, 2: Du, ${MONTEUR.name} — zurücknehmen` });
  await expect(kaestchen).toBeVisible({ timeout: 15_000 });
  await expect(kaestchen).toHaveAttribute('title', `Du, ${MONTEUR.name}`);
});

test('Am Handy: kurzer Tipp tut nichts, langes Drücken öffnet die Leiste an der Nachricht — und am Kästchen, wer reagiert hat', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  await anmelden(page, MONTEUR.email);
  await page.goto(`/nachrichten/${kanal}`);
  const ziel = page.getByRole('group', { name: new RegExp(`^Nachricht von ${BUERO.name}`) }).last();
  await expect(ziel).toBeVisible({ timeout: 15_000 });
  await ziel.scrollIntoViewIfNeeded();
  const cdp = await ctx.newCDPSession(page);
  const druecken = async (ms: number, wo = ziel) => {
    const b = (await wo.boundingBox())!;
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForTimeout(ms);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };

  await druecken(80);
  await page.waitForTimeout(600);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('toolbar')).toHaveCount(0);

  await druecken(800);
  const wahl = page.getByRole('dialog', { name: `Zur Nachricht von ${BUERO.name}` });
  await expect(wahl).toBeVisible();
  // Eine fremde Nachricht: reagieren, kopieren, melden — nicht bearbeiten oder löschen.
  const leiste = wahl.getByRole('toolbar');
  await expect(leiste.getByRole('button', { name: /^Reagieren: / })).toHaveCount(6);
  await expect(leiste.getByRole('button', { name: 'Melden' })).toBeVisible();
  await expect(leiste.getByRole('button', { name: 'Löschen' })).toHaveCount(0);
  await expect(leiste.getByRole('button', { name: 'Bearbeiten' })).toHaveCount(0);

  /*
    „Viel schlanker“ (E79): eine Leiste an der Nachricht statt eines Fensters
    über die halbe Höhe — im Bild, neben der Blase (verdeckt sie nicht),
    nicht höher als zwei Reihen, jedes Ziel 44 px für den Finger.
    Gegenprobe: mit dem Stand von E78 gibt es keinen Dialog dieses Namens.
  */
  const lage = await ziel.evaluate((el) => {
    const b = el.closest('.nachricht-blatt')!.getBoundingClientRect();
    const w = document.querySelector('.wahl-schwebend')!.getBoundingClientRect();
    const knoepfe = [...document.querySelectorAll('.wahl-schwebend .leiste-knopf')].map((k) => k.getBoundingClientRect());
    return {
      imBild: w.left >= 0 && w.right <= innerWidth && w.top >= 0 && w.bottom <= innerHeight,
      deckt: w.top < b.bottom && w.bottom > b.top,
      abstand: Math.round(Math.min(Math.abs(b.top - w.bottom), Math.abs(w.top - b.bottom))),
      hoeheOk: w.height <= 2 * 44 + 16,
      ziele: knoepfe.every((k) => Math.round(k.width) >= 44 && Math.round(k.height) >= 44),
    };
  });
  expect(lage).toEqual({ imBild: true, deckt: false, abstand: 8, hoeheOk: true, ziele: true });

  await leiste.getByRole('button', { name: 'Reagieren: Herz' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const kaestchen = page.getByRole('button', { name: 'Herz, 1: Du — zurücknehmen' });
  await expect(kaestchen).toBeVisible({ timeout: 15_000 });

  // Ein Tipp daneben schließt die Leiste, ohne etwas auszulösen.
  await druecken(800);
  await expect(wahl).toBeVisible();
  await page.touchscreen.tap(5, 300);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Herz, 1: Du — zurücknehmen' })).toHaveCount(1);

  await druecken(800, kaestchen);
  const wer = page.getByRole('dialog', { name: 'Nachricht' });
  await expect(wer.getByRole('heading', { name: 'Reaktionen' })).toBeVisible();
  await expect(wer.getByRole('list', { name: 'Wer reagiert hat' })).toContainText('Du');
  // Das lange Drücken hat die eigene Reaktion nicht nebenbei zurückgenommen.
  await expect(page.getByRole('button', { name: 'Herz, 1: Du — zurücknehmen' })).toHaveCount(1);
  await ctx.close();
});

/*
  E79 (11.11.2026): „der Balken sollte nur erscheinen, wenn man direkt über
  die Nachricht hovert“ und „man sollte Nachrichtentext frei markieren
  können“. Gemessen am Schreibtisch und am Tablet: neben der Blase (in
  derselben Zeile) kommt keine Leiste, auf der Blase schon; die Maus auf der
  Leiste hält sie, ganz weg geht sie zu. Ein Ziehen über den Text markiert
  ihn, ein Doppelklick ein Wort — und beides öffnet nichts.
  Gegenprobe: mit dem Stand von E78 öffnet die ganze Zeile die Leiste, und
  der Text ist ein Knopf, den man nicht markieren kann.
  V10 (13.11.2026): eingehender Text steht ohne Blase und füllt am Tablet
  die Zeile bis zum Rand; „neben dem Beitrag“ ist dort der Einzug links
  (Flucht des Namens), nicht mehr der freie Platz rechts einer Blase.
*/
test('Die Leiste kommt nur über der Blase, und der Text lässt sich markieren', async ({ page }) => {
  test.setTimeout(90_000);
  await anmelden(page, BUERO.email);
  for (const breite of [834, 1440]) {
    await page.setViewportSize({ width: breite, height: 900 });
    await page.goto(`/nachrichten/${kanal}`);
    const verlauf = page.getByRole('list', { name: 'Verlauf' });
    const text = TEXTE[TEXTE.length - 1][1];
    await expect(verlauf.getByText(text)).toBeVisible({ timeout: 15_000 });
    const zeile = page.locator('li[data-nachricht]').last();
    const blatt = zeile.locator('.nachricht-blatt');
    const leiste = page.getByRole('toolbar', { name: /^Zur Nachricht von/ });
    const b = (await blatt.boundingBox())!, z = (await zeile.boundingBox())!;

    // Neben dem Beitrag, in seiner Zeile: im Einzug links davon (eigene Blasen: links der Blase).
    expect(b.x - z.x, `${breite}: Einzug`).toBeGreaterThan(20);
    await page.mouse.move(b.x - 12, b.y + b.height / 2, { steps: 3 });
    await page.waitForTimeout(500);
    await expect(leiste, `${breite}: neben der Blase`).toHaveCount(0);

    await page.mouse.move(b.x + 20, b.y + b.height / 2, { steps: 3 });
    await expect(leiste, `${breite}: auf der Blase`).toBeVisible();
    const l = (await leiste.boundingBox())!;
    await page.mouse.move(l.x + l.width / 2, l.y + l.height / 2, { steps: 6 });
    await page.waitForTimeout(500);
    await expect(leiste, `${breite}: auf der Leiste`).toBeVisible();
    // Ganz weg: in die Eingabe.
    const e = (await page.locator('#nachricht-text').boundingBox())!;
    await page.mouse.move(e.x + 20, e.y + e.height / 2, { steps: 3 });
    await expect(leiste, `${breite}: Maus weg`).toHaveCount(0);

    // Markieren durch Ziehen über die erste Zeile des Textes.
    const t = (await zeile.locator('.nachricht-text').boundingBox())!;
    await page.mouse.move(t.x + 1, t.y + 8);
    await page.mouse.down();
    await page.mouse.move(t.x + t.width - 1, t.y + 8, { steps: 10 });
    await page.mouse.up();
    const markiert = await page.evaluate(() => String(getSelection()));
    expect(markiert.length, `${breite}: markiert „${markiert}“`).toBeGreaterThan(10);
    expect(text.startsWith(markiert.trim()), `${breite}: „${markiert}“`).toBe(true);
    await page.mouse.dblclick(t.x + 12, t.y + 8);
    expect(await page.evaluate(() => String(getSelection()).trim())).toBe('Die');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});

/*
  E78 (11.11.2026): die Leiste kommt sanft, das Kästchen ist leicht. Gemessen:
  die Leiste blendet ein (Animation läuft, am Ende deckend), das Kästchen ist
  24 px hoch, ohne Rahmen — und 10 px darüber trifft ein Tipp noch das
  Kästchen (44 px Tastfläche). V10 (13.11.2026): keine Pille mehr, der
  Radius einer Arbeitszeile (8 px). Gegenprobe: mit dem Stand von E77 ist es
  32 px hoch mit Rahmen, und die Leiste hat keine Animation; mit E78 rund.
*/
test('Die Leiste blendet ein, das Kästchen ist klein und ohne Rahmen', async ({ page }) => {
  test.setTimeout(60_000);
  const buero = await konto(BUERO.email);
  const { data: n } = await buero.rpc('nachrichten_verlauf', { p_kanal: kanal, p_vor: null, p_vor_id: null, p_anzahl: 1 });
  const id = String((n as { id: string }[])[0].id);
  const { error } = await buero.rpc('nachricht_reagieren', { p_nachricht: id, p_zeichen: '👍', p_an: true });
  expect(error).toBeNull();

  await page.setViewportSize({ width: 1440, height: 900 });
  await anmelden(page, BUERO.email);
  await page.goto(`/nachrichten/${kanal}`);
  const kaestchen = page.getByRole('button', { name: 'Daumen hoch, 1: Du — zurücknehmen' });
  await expect(kaestchen).toBeVisible({ timeout: 15_000 });
  const k = await kaestchen.evaluate((el) => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    const darueber = document.elementFromPoint(r.left + r.width / 2, r.top - 9);
    return { hoehe: Math.round(r.height), rahmen: s.borderTopWidth, radius: s.borderTopLeftRadius, tippDarueber: darueber === el };
  });
  expect(k).toEqual({ hoehe: 24, rahmen: '0px', radius: '8px', tippDarueber: true });

  await page.getByRole('list', { name: 'Verlauf' }).getByText(TEXTE[TEXTE.length - 1][1]).hover();
  const leiste = page.getByRole('toolbar', { name: /^Zur Nachricht von/ });
  await expect(leiste).toBeVisible();
  expect(await leiste.evaluate((l) => {
    const s = getComputedStyle(l);
    return { name: s.animationName, dauer: parseFloat(s.animationDuration) > 0 };
  })).toEqual({ name: 'leiste-ein', dauer: true });
  await expect(leiste).toHaveCSS('opacity', '1');
});

/*
  AM HANDY VERLÄSSLICH (11.11.2026): „das längere Drücken, damit der Balken
  erscheint, funktioniert noch nicht verlässlich, auch das Markieren des
  Textes. Beim Auswählen eines Emojis im Balken passieren oft komische
  Sprünge.“ Nachgestellt am Pixel 7 (Chromium, echte Berührungen über CDP):
  die Tastatur offen (Eingabe im Fokus), eine vorher angetippte Nachricht,
  das eigene lange Drücken von Android (`contextmenu`), eine Seite, die sich
  unter der Leiste bewegt.
*/
async function amHandy(browser: import('@playwright/test').Browser) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  await anmelden(page, MONTEUR.email);
  await page.goto(`/nachrichten/${kanal}`);
  const nachrichten = page.getByRole('group', { name: new RegExp(`^Nachricht von ${BUERO.name}`) });
  await expect(nachrichten.last()).toBeVisible({ timeout: 15_000 });
  const cdp = await ctx.newCDPSession(page);
  const mitte = async (wo: import('@playwright/test').Locator) => {
    const b = (await wo.boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const druecken = async (wo: import('@playwright/test').Locator, ms = 800) => {
    const p = await mitte(wo);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
    await page.waitForTimeout(ms);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const oben = (wo: import('@playwright/test').Locator) => wo.evaluate((el) => Math.round(el.getBoundingClientRect().top));
  return { ctx, page, cdp, nachrichten, druecken, mitte, oben };
}

test('Am Handy: die Leiste bleibt offen, auch wenn die Tastatur offen ist und die Seite sich bewegt', async ({ browser }) => {
  test.setTimeout(120_000);
  const { ctx, page, nachrichten, druecken } = await amHandy(browser);
  const ziel = nachrichten.nth(1);
  await ziel.scrollIntoViewIfNeeded();
  await page.locator('#nachricht-text').focus();
  await druecken(ziel);
  const wahl = page.getByRole('dialog', { name: `Zur Nachricht von ${BUERO.name}` });
  await expect(wahl).toBeVisible();
  // Die Tastatur bleibt, wie sie war: der Fokus wandert nicht in die Leiste.
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('nachricht-text');
  // Was eine Tastatur am Telefon auslöst: die Ansicht ändert die Größe, die Seite rollt.
  await page.evaluate(() => { window.dispatchEvent(new Event('resize')); window.scrollBy(0, 40); });
  await page.waitForTimeout(300);
  await expect(wahl).toBeVisible();
  const abstand = await ziel.evaluate((el) => {
    const w = document.querySelector('.wahl-schwebend')!.getBoundingClientRect();
    const b = el.closest('.nachricht-blatt')!.getBoundingClientRect();
    return Math.round(Math.min(Math.abs(b.top - w.bottom), Math.abs(w.top - b.bottom)));
  });
  // Sie folgt ihrer Nachricht.
  expect(abstand).toBe(8);
  // Ein Zeichen antippen: der Fokus bleibt in der Eingabe, die Tastatur bleibt offen.
  const knopf = wahl.getByRole('button', { name: 'Reagieren: Herz' });
  const k = (await knopf.boundingBox())!;
  await page.touchscreen.tap(k.x + k.width / 2, k.y + k.height / 2);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Herz, 1: Du — zurücknehmen' })).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('nachricht-text');
  await ctx.close();
});

// Bleibt-so-Prüfung: Im Emulator sprang schon der alte Stand hier nicht (ohne
// echte Tastatur ändert sich die Höhe nicht). Sie hält fest, dass die neue
// Fokusführung keinen Sprung hinzufügt; die Ursache am echten Gerät deckt der
// Fokus-Test darüber ab.
test('Am Handy: ein Zeichen in der Leiste — die Nachricht bleibt stehen, nichts springt', async ({ browser }) => {
  test.setTimeout(120_000);
  const { ctx, page, nachrichten, druecken, mitte, oben } = await amHandy(browser);
  const a = nachrichten.nth(0);
  const b = nachrichten.nth(1);
  await b.scrollIntoViewIfNeeded();
  // Vorher eine Nachricht angetippt: sie hält danach den Fokus.
  const p = await mitte(a);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(300);
  await druecken(b);
  const wahl = page.getByRole('dialog', { name: `Zur Nachricht von ${BUERO.name}` });
  await expect(wahl).toBeVisible();
  const vorher = { blase: await oben(b), rollen: await page.evaluate(() => Math.round(window.scrollY)) };
  const knopf = wahl.getByRole('button', { name: 'Reagieren: Daumen hoch' });
  const k = await mitte(knopf);
  await page.touchscreen.tap(k.x, k.y);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Daumen hoch, 1: Du — zurücknehmen' })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  const nachher = { blase: await oben(b), rollen: await page.evaluate(() => Math.round(window.scrollY)) };
  expect(nachher).toEqual(vorher);
  // Keine Leiste im Verlauf, die nachträglich aufgeht.
  await expect(page.locator('.verlauf .nachricht-leiste')).toHaveCount(0);
  await ctx.close();
});

test('Am Handy: das lange Drücken von Android selbst öffnet die Leiste sofort', async ({ browser }) => {
  test.setTimeout(120_000);
  const { ctx, page, cdp, nachrichten, mitte } = await amHandy(browser);
  const ziel = nachrichten.last();
  await ziel.scrollIntoViewIfNeeded();
  const p = await mitte(ziel);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
  await page.waitForTimeout(150);
  // Android meldet sein langes Drücken als `contextmenu` — oft vor unserer Frist.
  const verhindert = await ziel.evaluate((el) => {
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e.defaultPrevented;
  });
  await page.waitForTimeout(50);
  await expect(page.getByRole('dialog', { name: `Zur Nachricht von ${BUERO.name}` })).toBeVisible({ timeout: 100 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(verhindert).toBe(true);
  await ctx.close();
});

test('Am Handy: „Text markieren“ markiert den Text der Nachricht', async ({ browser }) => {
  test.setTimeout(120_000);
  const { ctx, page, nachrichten, druecken, mitte } = await amHandy(browser);
  const ziel = nachrichten.last();
  await ziel.scrollIntoViewIfNeeded();
  await druecken(ziel);
  const wahl = page.getByRole('dialog', { name: `Zur Nachricht von ${BUERO.name}` });
  const knopf = wahl.getByRole('button', { name: 'Text markieren' });
  const k = await mitte(knopf);
  await page.touchscreen.tap(k.x, k.y);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const vomBuero = TEXTE.filter(([m]) => !m);
  const text = vomBuero[vomBuero.length - 1][1];
  await expect.poll(() => page.evaluate(() => String(getSelection()).trim())).toBe(text);
  expect(await ziel.evaluate((el) => getComputedStyle(el).userSelect)).toBe('text');
  await ctx.close();
});
