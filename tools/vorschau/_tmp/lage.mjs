import { chromium } from 'playwright';
const port = process.argv[2] ?? '5199';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PFAD });
const seiten = [['/', 'Buchhaltung'], ['/', 'Administrator'], ['/accounting', 'Administrator'], ['/admin-projects', 'Administrator'], ['/admin-projects/p1', 'Administrator'], ['/invoices', 'Administrator'], ['/costing', 'Administrator'], ['/quotes/q1', 'Administrator'], ['/time', 'Administrator'], ['/vacations', 'Administrator'], ['/customers/k1', 'Administrator'], ['/user-mgmt/u1', 'Administrator'], ['/lager', 'Administrator'], ['/anforderungen', 'Administrator'], ['/worksheets', 'Administrator'], ['/eingaenge', 'Administrator'], ['/wartungen', 'Administrator']];
for (const w of [760, 834, 1024, 1199, 1200, 1440]) for (const [p, r] of seiten) {
  const s = await b.newPage({ viewport: { width: w, height: 900 } });
  await s.goto(`http://localhost:${port}/tools/vorschau/?pfad=${encodeURIComponent(p)}&rolle=${r}`, { waitUntil: 'networkidle' });
  await s.waitForTimeout(500);
  const z = await s.evaluate(() => [...document.querySelectorAll('.schriftfeld .lage-name')].filter((e) => e.offsetWidth > 0 && e.scrollWidth > e.clientWidth + 0.5).map((e) => `${e.textContent} +${e.scrollWidth - e.clientWidth}`));
  if (z.length) console.log(w, p, r, z.join(' | '));
  await s.close();
}
await b.close();
