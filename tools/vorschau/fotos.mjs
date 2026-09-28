/**
 * Fotografiert jede Route je berechtigter Rolle auf 390 / 834 / 1440 px und
 * misst dabei `scrollWidth <= innerWidth`.
 *
 *   node tools/vorschau/fotos.mjs <zielordner> [filter]
 *
 * Voraussetzung: der Vorschau-Server laeuft auf :5199.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [, , ziel = 'fotos', filter = ''] = process.argv;
const BASIS = process.env.VORSCHAU_URL ?? 'http://localhost:5199/tools/vorschau/';

const M = 'Mitarbeiter', V = 'Verwaltung', B = 'Buchhaltung', P = 'Projektleiter', G = 'Geschäftsführung', A = 'Administrator';
const ALL = [M, V, B, P, G, A];
const LEAD = [P, G, A];
const TOP = [G, A];

/* Abgeleitet aus src/app/navigation.ts (NAV und UNTER). */
const ROUTEN = [
  ['/', ALL],
  ['/time', ALL],
  ['/material', [M, V, ...LEAD]],
  ['/anforderungen', [V, ...LEAD]],
  ['/lager', [V, ...LEAD]],
  ['/my-schedule/mein', [M]],
  ['/my-projects', [M]],
  ['/vacations', ALL],
  ['/worksheets', [M, B, V, ...LEAD]],
  ['/worksheet', [M, ...LEAD]],
  ['/quotes', [B, ...LEAD]],
  ['/quotes/q1', [B, ...LEAD]],
  ['/customers', [B, V, ...LEAD]],
  ['/customers/k1', [B, V, ...LEAD]],
  ['/wartungen', [V, ...LEAD]],
  ['/admin-projects', LEAD],
  ['/admin-projects/p1', LEAD],
  ['/assignments/tag', LEAD],
  ['/assignments/woche', LEAD],
  ['/user-mgmt', TOP],
  ['/user-mgmt/u1', TOP],
  ['/settings/meldungen', ALL],
  ['/settings/firma', TOP],
  ['/settings/saetze', TOP],
  ['/settings/nummern', TOP],
  ['/settings/personal', TOP],
  ['/settings/konten', [...TOP, B]],
  ['/settings/support', TOP],
  ['/settings/module', [A]],
  ['/settings/sicherung', TOP],
  ['/costing', TOP],
  ['/invoices', [B, ...TOP]],
  ['/accounting', [B, ...TOP]],
  ['/impressum', [A]],
  ['/datenschutz', [A]],
];
const BREITEN = [375, 390, 834, 1440];

fs.mkdirSync(ziel, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const ergebnis = [];
for (const [pfad, rollen] of ROUTEN) {
  if (filter && !pfad.includes(filter)) continue;
  for (const rolle of rollen) {
    for (const breite of BREITEN) {
      const seite = await browser.newPage({ locale: 'de-AT', timezoneId: 'Europe/Vienna', viewport: { width: breite, height: 900 } });
      const fehler = [];
      seite.on('pageerror', (e) => fehler.push(String(e).slice(0, 160)));
      try {
        await seite.goto(`${BASIS}?pfad=${encodeURIComponent(pfad)}&rolle=${encodeURIComponent(rolle)}`, {
          waitUntil: 'networkidle',
          timeout: 30000,
        });
        await seite.waitForTimeout(500);
        const sw = await seite.evaluate(() => document.documentElement.scrollWidth);
        const name = `${pfad.replace(/\//g, '_') || '_'}__${rolle}__${breite}.png`.replace(/^_+/, 'r_');
        await seite.screenshot({ path: path.join(ziel, name), fullPage: true });
        ergebnis.push({ pfad, rolle, breite, sw, ok: sw <= breite, fehler });
      } catch (e) {
        ergebnis.push({ pfad, rolle, breite, sw: null, ok: false, fehler: [String(e).slice(0, 160)] });
      }
      await seite.close();
    }
  }
}
await browser.close();
fs.writeFileSync(path.join(ziel, 'messung.json'), JSON.stringify(ergebnis, null, 1));
const schlecht = ergebnis.filter((e) => !e.ok || e.fehler.length);
console.log(`${ergebnis.length} Aufnahmen, ${ergebnis.filter((e) => !e.ok).length} mit Seitwärts-Scrollen, ${ergebnis.filter((e) => e.fehler.length).length} mit JS-Fehlern`);
for (const s of schlecht.slice(0, 40)) console.log(`  ${s.pfad} ${s.rolle} ${s.breite}: sw=${s.sw} ${s.fehler.join(' | ')}`);
