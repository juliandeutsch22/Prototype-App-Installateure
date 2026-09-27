/* Liest den sichtbaren Text jeder Route (aufgeklappt) und meldet verdächtige Zahlformate. */
import { chromium } from 'playwright';
const BASIS = process.env.VORSCHAU_URL ?? 'http://localhost:5199/tools/vorschau/';
const ROUTEN = [['/', 'Administrator'], ['/', 'Mitarbeiter'], ['/', 'Buchhaltung'], ['/time', 'Mitarbeiter'], ['/time', 'Administrator'],
 ['/material', 'Mitarbeiter'], ['/anforderungen', 'Administrator'], ['/lager', 'Administrator'], ['/my-schedule/mein', 'Mitarbeiter'],
 ['/my-projects', 'Mitarbeiter'], ['/vacations', 'Administrator'], ['/vacations', 'Mitarbeiter'], ['/worksheets', 'Administrator'], ['/worksheet', 'Administrator'],
 ['/quotes', 'Administrator'], ['/quotes/q1', 'Administrator'], ['/customers', 'Administrator'], ['/customers/k1', 'Administrator'], ['/wartungen', 'Administrator'],
 ['/admin-projects', 'Administrator'], ['/admin-projects/p1', 'Administrator'], ['/assignments/tag', 'Administrator'], ['/assignments/woche', 'Administrator'],
 ['/user-mgmt', 'Administrator'], ['/user-mgmt/u1', 'Administrator'], ['/settings/meldungen', 'Administrator'], ['/settings/firma', 'Administrator'],
 ['/settings/saetze', 'Administrator'], ['/settings/nummern', 'Administrator'], ['/settings/personal', 'Administrator'], ['/settings/konten', 'Administrator'],
 ['/settings/support', 'Administrator'], ['/settings/module', 'Administrator'], ['/settings/sicherung', 'Administrator'], ['/costing', 'Administrator'],
 ['/invoices', 'Administrator'], ['/accounting', 'Administrator']];
const MUSTER = [
  ['ISO-Datum', /\b\d{4}-\d{2}-\d{2}\b/g],
  ['Dezimalpunkt+h', /\b\d+\.\d+\s?(h|Std|H)\b/g],
  ['Dezimal+h', /[+−-]?\d+,\d+\s?(h|Std|H)\b/g],
  ['Monatsname', /\b\d{1,2}\.\s(Jänner|Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\b/g],
  ['ungepolstert', /\b\d{1,2}\.\d\.(\d{4})?(?!\d)|\b\d\.\d{1,2}\.(\d{4})?(?!\d)/g],
  ['ganze h', /[+−-]?\b\d+\s?h\b/g],
];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const [pfad, rolle] of ROUTEN) {
  const s = await b.newPage({ locale: 'de-AT', timezoneId: 'Europe/Vienna', viewport: { width: 1440, height: 900 } });
  await s.goto(`${BASIS}?pfad=${encodeURIComponent(pfad)}&rolle=${rolle}`, { waitUntil: 'networkidle' });
  await s.waitForTimeout(300);
  await s.evaluate(() => { document.querySelectorAll('details').forEach((d) => (d.open = true)); });
  for (const k of await s.locator('main [aria-expanded="false"]').all()) { try { await k.click({ timeout: 500 }); } catch {} }
  await s.waitForTimeout(300);
  const text = await s.evaluate(() => document.querySelector('main')?.innerText ?? document.body.innerText);
  const funde = [];
  for (const [name, re] of MUSTER) for (const m of text.matchAll(re)) {
    const i = m.index; funde.push(`${name}: «${text.slice(Math.max(0, i - 35), i + m[0].length + 15).replace(/\s+/g, ' ')}»`);
  }
  if (funde.length) console.log(`\n## ${pfad} (${rolle})\n  ` + [...new Set(funde)].join('\n  '));
  await s.close();
}
await b.close();
