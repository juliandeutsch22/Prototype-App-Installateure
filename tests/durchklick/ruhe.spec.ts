import { test, expect, type Page } from '@playwright/test';
import { admin, BETRIEB, CHEFIN, MONTEUR } from './aufbau';
import { anmelden, menue } from './helfer';

/**
 * Laden ohne Springen (Analyse 10.10.2026, Stand-Datei Abschnitt 16).
 *
 * Gemessen wurde mit einem Bestand von fünf Jahren im langsamen Netz: nach
 * einem Seitenwechsel sprangen Zahlen und Zeilen noch um — „€ 0,00 offen“,
 * „Benutzer (0)“, „Keine aktiven Mitarbeiter“, ein Formular, das nach unten
 * rutschte. Diese Prüfung wiederholt die Messung bei jedem Lauf: Wechsel in
 * der App, jede Antwort der Datenbank künstlich verzögert, dann
 *
 *   - die Verschiebung der Seite (wie Googles CLS) unter 0,1,
 *   - keine vorläufige Aussage: eine Zeile mit einer Zahl oder einem
 *     „Keine …“, die zwischendurch dastand und am Ende nicht mehr.
 *
 * Der Bestand des Durchklicks ist klein; was hier rot wird, ist ein Wert,
 * der ohne seine Grundlage gezeigt wird — mit fünf Jahren Daten springt er
 * nur weiter.
 */

const VERZOEGERUNG_MS = 300;
const LADEN = /wird geladen|wird geprüft|wird noch geladen|lädt|wird zusammengestellt/i;

async function messen(page: Page, wechsel: () => Promise<void>) {
  await page.evaluate(() => {
    const w = window as unknown as { __ruhe: { cls: number; schnapp: string[]; poll: number } };
    w.__ruhe = { cls: 0, schnapp: [], poll: 0 };
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
        if (!e.hadRecentInput) w.__ruhe.cls += e.value;
      }
    }).observe({ type: 'layout-shift' });
  });
  await wechsel();
  await page.evaluate(() => {
    const w = window as unknown as { __ruhe: { schnapp: string[]; poll: number } };
    w.__ruhe.poll = window.setInterval(() => w.__ruhe.schnapp.push(document.querySelector('main')?.innerText ?? ''), 100);
  });
  // Bis die Seite ruht: eine Sekunde lang dasselbe Bild.
  await expect.poll(async () => page.evaluate(() => {
    const s = (window as unknown as { __ruhe: { schnapp: string[] } }).__ruhe.schnapp;
    return s.length > 12 && s.slice(-10).every((x) => x === s[s.length - 1]);
  }), { timeout: 30_000, intervals: [250] }).toBe(true);
  return page.evaluate(() => {
    const w = window as unknown as { __ruhe: { cls: number; schnapp: string[]; poll: number } };
    clearInterval(w.__ruhe.poll);
    return { cls: w.__ruhe.cls, schnapp: w.__ruhe.schnapp };
  });
}

function vorlaeufig(schnapp: string[]): string[] {
  const zeilen = (t: string) => t.split('\n').map((z) => z.trim()).filter(Boolean);
  const ende = new Set(zeilen(schnapp[schnapp.length - 1] ?? ''));
  const funde = new Set<string>();
  for (const s of schnapp) {
    for (const z of zeilen(s)) {
      if (ende.has(z) || LADEN.test(z)) continue;
      if (/\d/.test(z) || /^(keine|noch keine|nichts|kein )/i.test(z)) funde.add(z);
    }
  }
  return [...funde];
}

async function verzoegern(page: Page) {
  await page.route('**/rest/v1/**', async (route) => {
    await new Promise((r) => setTimeout(r, VERZOEGERUNG_MS));
    await route.continue();
  });
}

test.beforeAll(async () => {
  // Eine eigene Anforderung des Monteurs — sonst gibt es unter „Meine Anforderungen“ nichts, was springen könnte.
  const { data: m } = await admin.from('users').select('id').eq('email', MONTEUR.email).single();
  await admin.from('material_orders').delete().eq('company_id', BETRIEB).eq('note', 'ruhe');
  await admin.from('material_orders').insert({
    id: crypto.randomUUID(), company_id: BETRIEB, user_id: m!.id, user_name: MONTEUR.name,
    material_name: 'Kupferrohr 15mm', quantity: 2, status: 'Offen', transaction_type: 'order', note: 'ruhe',
  });
});

test.afterAll(async () => {
  await admin.from('material_orders').delete().eq('company_id', BETRIEB).eq('note', 'ruhe');
});

const LEITUNG: [string, string?][] = [
  ['Rechnungen'], ['Benutzerverwaltung', 'Benutzer'], ['Lager'], ['Urlaub'], ['Handwerksscheine', 'Scheine'], ['Einsatzplanung', 'Planung'],
];

test('Die Seiten der Leitung springen nicht und zeigen keine vorläufigen Werte', async ({ page }) => {
  test.setTimeout(240_000);
  await anmelden(page, CHEFIN.email);
  await verzoegern(page);
  const befunde: string[] = [];
  for (const [name, kurz] of LEITUNG) {
    // Von „Mein Konto“ aus, damit jede Seite ein echter Wechsel ist.
    await page.evaluate(() => { window.history.pushState({}, '', '/settings/meldungen'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await page.waitForTimeout(800);
    const m = await messen(page, () => menue(page, name, kurz));
    const v = vorlaeufig(m.schnapp);
    if (m.cls >= 0.1) befunde.push(`${name}: Verschiebung ${m.cls.toFixed(3)}`);
    if (v.length) befunde.push(`${name}: vorläufig ${v.join(' | ')}`);
  }
  expect(befunde).toEqual([]);
});

test('Die Seiten des Monteurs springen nicht und zeigen keine vorläufigen Werte', async ({ page }) => {
  test.setTimeout(180_000);
  await anmelden(page, MONTEUR.email);
  await verzoegern(page);
  const befunde: string[] = [];
  for (const [name, kurz] of [['Zeiterfassung', 'Zeit'], ['Material anfordern', 'Material'], ['Urlaub']] as [string, string?][]) {
    await page.evaluate(() => { window.history.pushState({}, '', '/settings/meldungen'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await page.waitForTimeout(800);
    const m = await messen(page, () => menue(page, name, kurz));
    const v = vorlaeufig(m.schnapp);
    if (m.cls >= 0.1) befunde.push(`${name}: Verschiebung ${m.cls.toFixed(3)}`);
    if (v.length) befunde.push(`${name}: vorläufig ${v.join(' | ')}`);
  }
  expect(befunde).toEqual([]);
});
