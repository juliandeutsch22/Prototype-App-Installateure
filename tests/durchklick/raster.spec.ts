import { test, expect, type Page } from '@playwright/test';
import { admin, BETRIEB, CHEFIN } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * RASTER UND BLÄTTER (E33, 01.11.2026): jedes Blatt liegt mit Ober-, Unter-,
 * linker und rechter Kante auf einer Linie des Rasters — auf jeder Seite, am
 * Handy, am Tablet und am Schreibtisch. Gemessen wird im echten Browser, denn
 * die Lage entsteht erst beim Zeichnen; der Taktgeber (`lib/takt.ts`) rundet
 * Abstand und Höhe auf ganze Zellen.
 *
 * Ohne Taktgeber lagen auf Baustellen und Start 10 von 11 Linien neben dem
 * Raster (Messung vom 01.11.2026); diese Prüfung schlägt dann fehl.
 */

/** Dieselbe Auswahl wie `TAKT_SELEKTOR` in `src/lib/takt.ts`. */
const BLAETTER =
  ".inhalt .karte:not(.karte .karte):not(:is(.fenster, .fenster-breit, .blatt, [role='dialog'], .akten-kontext, .beleg-kontext) .karte), .inhalt :is(.ue-liste, .ue-liste-woche, .ue-vergleich, .lot-einrichtung), .inhalt .monatskalender:not(:is(.karte, .fenster, .fenster-breit, .blatt, [role='dialog']) .monatskalender), .inhalt :is(.akten-kontext, .beleg-kontext)";

interface Kante { blatt: string; kante: string; abstand: number }

/** Wie weit liegt jede Kante jedes Blatts neben der nächsten Rasterlinie? */
async function kanten(page: Page): Promise<{ anzahl: number; daneben: Kante[] }> {
  // Der Taktgeber rechnet je Bild nach; zwei Bilder abwarten.
  await page.evaluate(() => new Promise((fertig) => requestAnimationFrame(() => requestAnimationFrame(fertig))));
  return page.evaluate((auswahl) => {
    const flaeche = document.querySelector<HTMLElement>('.hauptflaeche')!;
    const r = flaeche.getBoundingClientRect();
    const [px, py] = getComputedStyle(flaeche).backgroundPosition.split(' ').map(parseFloat);
    const neben = (wert: number, ursprung: number) => {
      const rest = ((Math.round(wert - ursprung) % 24) + 24) % 24;
      return rest > 12 ? rest - 24 : rest;
    };
    const daneben: { blatt: string; kante: string; abstand: number }[] = [];
    const blaetter = [...document.querySelectorAll<HTMLElement>(auswahl)].filter((b) => b.getBoundingClientRect().height > 0);
    for (const b of blaetter) {
      const q = b.getBoundingClientRect();
      const name = `${b.className.toString().split(' ').slice(0, 3).join('.')} „${(b.textContent ?? '').trim().slice(0, 30)}“`;
      for (const [kante, wert, ursprung] of [
        ['oben', q.top, r.top + py], ['unten', q.bottom, r.top + py], ['links', q.left, r.left + px], ['rechts', q.right, r.left + px],
      ] as const) {
        const abstand = neben(wert, ursprung);
        if (abstand !== 0) daneben.push({ blatt: name, kante, abstand });
      }
    }
    return { anzahl: blaetter.length, daneben };
  }, BLAETTER);
}

const BREITEN = [
  { name: 'Schreibtisch', width: 1440, height: 900 },
  { name: 'Tablet', width: 834, height: 1112 },
  { name: 'Handy', width: 390, height: 844 },
];

test('Jedes Blatt liegt auf dem Raster — auf allen Seiten der Geschäftsführung, in drei Breiten', async ({ page }) => {
  test.setTimeout(300_000);
  const { data: kunde } = await admin.from('customers').select('id').eq('company_id', BETRIEB).limit(1).single();
  const { data: baustelle } = await admin.from('projects').select('id').eq('company_id', BETRIEB).limit(1).single();
  const SEITEN = [
    '/', '/admin-projects', `/admin-projects/${baustelle!.id}`, '/assignments', '/worksheets', '/quotes',
    '/customers', `/customers/${kunde!.id}`, '/wartungen', '/invoices', '/costing', '/time', '/vacations',
    '/accounting', '/user-mgmt', '/material', '/lager', '/anforderungen', '/settings', '/settings/firma',
  ];
  await anmelden(page, CHEFIN.email);
  const fehler: string[] = [];
  let gemessen = 0;
  for (const breite of BREITEN) {
    await page.setViewportSize({ width: breite.width, height: breite.height });
    for (const pfad of SEITEN) {
      await page.goto(pfad);
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 15_000 });
      const { anzahl, daneben } = await kanten(page);
      gemessen += anzahl;
      for (const d of daneben) fehler.push(`${breite.name} ${pfad}: ${d.blatt} ${d.kante} ${d.abstand > 0 ? '+' : ''}${d.abstand} px`);
    }
  }
  expect(gemessen).toBeGreaterThan(40);
  expect(fehler).toEqual([]);
  await keineFehlermeldung(page);
});

test('Die Blätter folgen, wenn sich der Inhalt ändert — ein Filter macht die Liste kürzer', async ({ page }) => {
  await anmelden(page, CHEFIN.email);
  await page.goto('/admin-projects');
  await page.waitForLoadState('networkidle');
  expect((await kanten(page)).daneben).toEqual([]);
  await page.getByPlaceholder(/Kunde, Nummer oder Adresse/).fill('gibt es nicht 4711');
  await page.waitForTimeout(400);
  expect((await kanten(page)).daneben).toEqual([]);
});
