/**
 * Misst die Schrift jeder Seite: je Route, Rolle, Breite und Reiter jedes
 * sichtbare Element mit eigenem Text (oder Feldwert) — Größe, Schriftart,
 * Gewicht, Klassen, Textprobe. Schreibt eine JSON-Datei; die Auswertung
 * steht am Ende (Größen je Schriftart, mit Fundstellen).
 *
 *   node tools/vorschau/schriften.mjs <ziel.json> [filter]
 *
 * Voraussetzung: der Vorschau-Server läuft auf :5199 (`npm run vorschau`).
 * Entstanden für E97 (17.11.2026): „die Schriftgrößen sind sehr
 * uneinheitlich“ — gemessen wird, was der Browser wirklich zeichnet, nicht
 * was im CSS steht (Tailwind-Klassen, Erbe, Überschreibungen).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const [, , ziel = 'schriften.json', filter = ''] = process.argv;
const BASIS = process.env.VORSCHAU_URL ?? 'http://localhost:5199/tools/vorschau/';

const M = 'Mitarbeiter', B = 'Buchhaltung', A = 'Administrator';

/** Jede Seite einmal, mit der Rolle, die am meisten sieht; die Seiten des Monteurs als Monteur. */
export const SEITEN = [
  ['/', A], ['/', M], ['/', B],
  ['/time', M], ['/time', A],
  ['/material', M], ['/anforderungen', A], ['/lager', A],
  ['/my-schedule/mein', M], ['/my-projects', M],
  ['/vacations', A], ['/vacations', M], ['/sonderurlaub', A],
  ['/worksheets', A], ['/worksheet', M],
  ['/quotes', A], ['/quotes/q1', A],
  ['/eingaenge', A],
  ['/customers', A], ['/customers/k1', A],
  ['/liegenschaften', A],
  ['/wartungen', A],
  ['/admin-projects', A], ['/admin-projects/p1', A],
  ['/assignments/tag', A], ['/assignments/woche', A], ['/assignments/monat', A],
  ['/nachrichten', A], ['/nachrichten/k-direkt', A],
  ['/user-mgmt', A], ['/user-mgmt/u1', A],
  ['/settings/meldungen', A], ['/settings/firma', A], ['/settings/saetze', A], ['/settings/nummern', A],
  ['/settings/personal', A], ['/settings/konten', A], ['/settings/support', A], ['/settings/module', A],
  ['/settings/sicherung', A],
  ['/costing', A], ['/invoices', A], ['/invoices/kontoauszug', A], ['/accounting', A],
  ['/impressum', A], ['/datenschutz', A],
];
const BREITEN = [390, 834, 1440];

/** Im Browser: jedes sichtbare Element mit eigenem Text. */
function erfassen() {
  const familie = (f) => (/mono/i.test(f) ? 'mono' : /serif 4|georgia|serif$/i.test(f.split(',')[0]) ? 'serif' : 'sans');
  const klassen = (el) => (typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 6).join('.') : '');
  const pfad = (el) => {
    const teile = [];
    for (let e = el, i = 0; e && e !== document.body && i < 4; e = e.parentElement, i++) {
      const k = klassen(e);
      teile.unshift(e.tagName.toLowerCase() + (k ? '.' + k : ''));
    }
    return teile.join(' > ');
  };
  const sichtbar = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || +s.opacity === 0) return false;
    if (el.closest('.sr-only,[aria-hidden="true"] svg')) return false;
    for (let e = el; e; e = e.parentElement) if (getComputedStyle(e).display === 'none') return false;
    return true;
  };
  const aus = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg,script,style,noscript,.sr-only')) continue;
    const eigen = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
    const feld = el.matches('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]),select,textarea');
    if (!eigen && !feld) continue;
    if (!sichtbar(el)) continue;
    const s = getComputedStyle(el);
    aus.push({
      px: Math.round(parseFloat(s.fontSize) * 100) / 100,
      lh: s.lineHeight,
      fam: familie(s.fontFamily),
      w: s.fontWeight,
      tag: el.tagName.toLowerCase(),
      pfad: pfad(el),
      text: (eigen || el.value || el.placeholder || '').slice(0, 50),
      kopf: !!el.closest('h1,.seitenkopf,header.seitenkopf,.page-header'),
      nav: !!el.closest('nav,aside.seitenleiste,.unten-leiste,[role=navigation]'),
    });
  }
  return aus;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PFAD || undefined });
const ergebnis = [];
for (const [route, rolle] of SEITEN) {
  if (filter && !route.includes(filter)) continue;
  for (const breite of BREITEN) {
    const seite = await browser.newPage({ locale: 'de-AT', timezoneId: 'Europe/Vienna', viewport: { width: breite, height: 1000 } });
    try {
      await seite.goto(`${BASIS}?pfad=${encodeURIComponent(route)}&rolle=${rolle}`, { waitUntil: 'networkidle', timeout: 30000 });
      await seite.waitForTimeout(700);
      await seite.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
      const reiter = await seite.locator('[role=tablist] [role=tab]').all();
      const namen = [];
      for (const r of reiter) namen.push(((await r.textContent()) ?? '').trim());
      const zustaende = namen.length ? namen : [''];
      for (let i = 0; i < zustaende.length; i++) {
        if (namen.length) {
          try {
            await seite.locator('[role=tablist] [role=tab]').nth(i).click({ timeout: 3000 });
            await seite.waitForTimeout(500);
            await seite.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
          } catch { continue; }
        }
        const elemente = await seite.evaluate(erfassen);
        // Eine abgestürzte Ansicht misst die Fehlerseite, nicht die Seite — das wird gemeldet.
        const absturz = elemente.some((e) => e.text.startsWith('Da ist etwas schiefgelaufen'));
        ergebnis.push({ route, rolle, breite, reiter: zustaende[i], elemente, ...(absturz ? { fehler: 'Ansicht abgestürzt' } : {}) });
      }
    } catch (e) {
      ergebnis.push({ route, rolle, breite, reiter: '', fehler: String(e).slice(0, 160), elemente: [] });
    }
    await seite.close();
  }
}
await browser.close();
fs.writeFileSync(ziel, JSON.stringify(ergebnis));

// Auswertung: Größen je Schriftart (ohne Seitenkopf und Navigation), je mit Seitenzahl.
const zaehler = new Map();
for (const z of ergebnis) for (const e of z.elemente) {
  if (e.kopf || e.nav) continue;
  const k = `${e.fam} ${e.px}px`;
  const v = zaehler.get(k) ?? { n: 0, seiten: new Set() };
  v.n++; v.seiten.add(z.route);
  zaehler.set(k, v);
}
for (const z of ergebnis) if (z.fehler) console.log(`FEHLER ${z.route} ${z.breite} ${z.reiter}: ${z.fehler}`);
for (const [k, v] of [...zaehler].sort((a, b) => b[1].n - a[1].n)) console.log(`${k.padEnd(16)} ${String(v.n).padStart(6)}  auf ${v.seiten.size} Seiten`);
