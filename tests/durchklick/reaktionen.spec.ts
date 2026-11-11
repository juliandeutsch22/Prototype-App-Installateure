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
 *   3. Am Handy tut ein kurzer Tipp nichts; langes Drücken öffnet die Wahl,
 *      das Zeichen dort setzt die Reaktion; langes Drücken auf das Kästchen
 *      zeigt, wer reagiert hat.
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
    const treffer = [...document.querySelectorAll('.nachricht-text, .nachricht-blatt, .nachricht-reaktionen, .verlauf-tag > span, .nachricht-von, .nachricht-status, .chat-kopf, .eingabe')]
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

test('Am Handy: kurzer Tipp tut nichts, langes Drücken öffnet die Wahl — und am Kästchen, wer reagiert hat', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  await anmelden(page, MONTEUR.email);
  await page.goto(`/nachrichten/${kanal}`);
  const ziel = page.getByRole('button', { name: new RegExp(`^Nachricht von ${BUERO.name}`) }).last();
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
  const wahl = page.getByRole('dialog', { name: 'Nachricht' });
  await expect(wahl).toBeVisible();
  // Eine fremde Nachricht: reagieren, kopieren, melden — nicht bearbeiten oder löschen.
  await expect(wahl.getByRole('group', { name: 'Reagieren' }).getByRole('button')).toHaveCount(6);
  await expect(wahl.getByRole('button', { name: 'Melden …' })).toBeVisible();
  await expect(wahl.getByRole('button', { name: 'Löschen' })).toHaveCount(0);
  await wahl.getByRole('button', { name: 'Reagieren: Herz' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const kaestchen = page.getByRole('button', { name: 'Herz, 1: Du — zurücknehmen' });
  await expect(kaestchen).toBeVisible({ timeout: 15_000 });

  await druecken(800, kaestchen);
  const wer = page.getByRole('dialog', { name: 'Nachricht' });
  await expect(wer.getByRole('heading', { name: 'Reaktionen' })).toBeVisible();
  await expect(wer.getByRole('list', { name: 'Wer reagiert hat' })).toContainText('Du');
  // Das lange Drücken hat die eigene Reaktion nicht nebenbei zurückgenommen.
  await expect(page.getByRole('button', { name: 'Herz, 1: Du — zurücknehmen' })).toHaveCount(1);
  await ctx.close();
});
