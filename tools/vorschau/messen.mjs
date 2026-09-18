/**
 * Geht jede Route auf drei Breiten durch und meldet, was aus seinem Behaelter
 * laeuft. Siehe `tools/vorschau/README.md`.
 *
 * Voraussetzung: `npm run vorschau` laeuft in einem zweiten Fenster.
 */
import { chromium } from 'playwright';

const BASIS = process.env.VORSCHAU_URL ?? 'http://localhost:5199/tools/vorschau/';

/** Jede Route einmal — und die Startseite zusaetzlich aus drei Rollen. */
const ROUTEN = [
  ['/', 'Administrator'], ['/', 'Mitarbeiter'], ['/', 'Buchhaltung'],
  ['/time', 'Mitarbeiter'], ['/voice', 'Mitarbeiter'],
  ['/material', 'Mitarbeiter'], ['/anforderungen', 'Administrator'], ['/lager', 'Administrator'],
  ['/my-schedule', 'Mitarbeiter'], ['/my-projects', 'Mitarbeiter'],
  ['/vacations', 'Administrator'], ['/worksheets', 'Administrator'], ['/worksheet', 'Administrator'],
  ['/quotes', 'Administrator'], ['/customers', 'Administrator'], ['/wartungen', 'Administrator'],
  ['/admin-projects', 'Administrator'],
  ['/assignments/tag', 'Administrator'], ['/assignments/woche', 'Administrator'],
  ['/user-mgmt', 'Administrator'],
  ['/settings/meldungen', 'Administrator'], ['/settings/firma', 'Administrator'],
  ['/settings/saetze', 'Administrator'], ['/settings/module', 'Administrator'],
  ['/settings/sicherung', 'Administrator'],
  ['/costing', 'Administrator'], ['/invoices', 'Administrator'], ['/accounting', 'Administrator'],
];

/**
 * 834 px steht in der Mitte, und dort ist der blinde Fleck: die Seitenleiste
 * ist schon da, der Platz aber knapp. Telefon und Schreibtisch sind beide
 * gutmuetig.
 */
const BREITEN = [['mobil', 390], ['tablet', 834], ['desktop', 1440]];

/** Was die Messung meldet, ohne dass es ein Fehler waere. */
const HARMLOS = [
  (b) => b.el.includes('sr-only'),
  (b) => b.el.includes('section-label') && b.px <= 8,
  (b) => b.el.includes('input') && b.el.includes('file'),
  (b) => b.art === 'abgeschnitten' && b.el.includes('truncate'),
  (b) => b.el.includes('th.sticky'),
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PFAD || undefined,
});
const befunde = [];

for (const [pfad, rolle] of ROUTEN) {
  for (const [bname, breite] of BREITEN) {
    const seite = await browser.newPage({ viewport: { width: breite, height: 1000 } });
    const fehler = [];
    seite.on('pageerror', (e) => fehler.push(String(e).slice(0, 140)));
    try {
      await seite.goto(`${BASIS}?pfad=${encodeURIComponent(pfad)}&rolle=${rolle}`, {
        waitUntil: 'networkidle', timeout: 20000,
      });
      await seite.waitForTimeout(800);

      // ALLES aufklappen — sonst misst man die zugeklappte Haelfte der App.
      await seite.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
      for (const k of (await seite.locator('button[aria-expanded="false"]').all()).slice(0, 6)) {
        try { await k.click({ timeout: 1500 }); } catch { /* nicht jeder ist klickbar */ }
      }
      await seite.waitForTimeout(400);
      await seite.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
      await seite.waitForTimeout(300);

      const r = await seite.evaluate(() => {
        const VW = document.documentElement.clientWidth;
        const raus = [];
        const nenn = (el) => {
          const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 46);
          const c = typeof el.className === 'string' ? el.className.split(/\s+/).slice(0, 3).join('.') : '';
          return `${el.tagName.toLowerCase()}${c ? '.' + c : ''} "${t}"`;
        };
        const scrollbarerVorfahr = (el) => {
          for (let a = el.parentElement; a; a = a.parentElement) {
            if (/(auto|scroll)/.test(getComputedStyle(a).overflowX)) return true;
          }
          return false;
        };
        for (const el of document.querySelectorAll('main *')) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const bb = el.getBoundingClientRect();
          if (!bb.width || !bb.height) continue;
          if (bb.right > VW + 1.5 && !scrollbarerVorfahr(el)) {
            raus.push({ art: 'ragt hinaus', px: Math.round(bb.right - VW), el: nenn(el) });
          }
          if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && !/(auto|scroll)/.test(cs.overflowX)) {
            const kuerzt = cs.textOverflow === 'ellipsis';
            raus.push({ art: kuerzt ? 'abgeschnitten' : 'laeuft ueber', px: el.scrollWidth - el.clientWidth, el: nenn(el) });
          }
        }
        return { raus, seitenUeberlauf: document.documentElement.scrollWidth > VW + 1 };
      });

      const echt = r.raus.filter((b) => !HARMLOS.some((f) => f(b)));
      if (echt.length || r.seitenUeberlauf || fehler.length) {
        befunde.push({ pfad, rolle, bname, raus: echt, seitenUeberlauf: r.seitenUeberlauf, fehler });
      }
    } catch (e) {
      befunde.push({ pfad, rolle, bname, absturz: String(e).slice(0, 140) });
    }
    await seite.close();
  }
}
await browser.close();

let schwer = 0;
for (const f of befunde) {
  if (f.absturz) { console.log(`\n### ${f.pfad} [${f.bname}] ABSTURZ ${f.absturz}`); schwer++; continue; }
  console.log(`\n### ${f.pfad} · ${f.rolle} · ${f.bname}${f.seitenUeberlauf ? '  ← SEITE SCROLLT WAAGRECHT' : ''}`);
  if (f.seitenUeberlauf) schwer++;
  for (const e of f.fehler) { console.log(`  JS-FEHLER: ${e}`); schwer++; }
  const gesehen = new Set();
  for (const b of f.raus) {
    const k = b.art + b.el;
    if (gesehen.has(k)) continue;
    gesehen.add(k);
    console.log(`  [${b.art}] +${b.px}px  ${b.el}`);
  }
}
console.log(`\n${befunde.length} Ansichten mit Befunden · ${schwer} schwerwiegend`);
process.exit(schwer > 0 ? 1 : 0);
