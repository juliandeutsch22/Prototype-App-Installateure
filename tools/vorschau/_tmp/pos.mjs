import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PFAD });
for (const w of [375, 390, 834, 1440]) for (const p of ['/quotes/q1', '/admin-projects/p1']) {
  const s = await b.newPage({ viewport: { width: w, height: 900 } });
  await s.goto(`http://localhost:${process.env.PORT ?? 5199}/tools/vorschau/?pfad=${encodeURIComponent(p)}&rolle=Administrator`, { waitUntil: 'networkidle' });
  await s.waitForTimeout(500);
  console.log(w, p, JSON.stringify(await s.evaluate(() => [...document.querySelectorAll('.tabelle th')].filter((e) => e.offsetWidth).map((e) => `${e.textContent}:${e.scrollWidth - e.clientWidth}`))));
  await s.close();
}
await b.close();
