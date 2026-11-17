import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PFAD });
for (const w of [390, 1440]) for (const r of ['/quotes/q1', '/admin-projects/p1', '/customers/k1', '/user-mgmt/u1']) {
const s = await b.newPage({ viewport: { width: w, height: 1000 } });
await s.goto(`http://localhost:5199/tools/vorschau/?pfad=${encodeURIComponent(r)}&rolle=Administrator`, { waitUntil: 'networkidle' });
await s.waitForTimeout(500);
console.log(w, r, JSON.stringify(await s.evaluate(() => [...document.querySelectorAll('main dl dt')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => `${getComputedStyle(e).fontSize} ${e.className.slice(0, 40)} ${e.parentElement.className.slice(0, 30)} „${e.textContent.slice(0, 20)}“`).filter((x) => !x.startsWith('13px')))));
await s.close(); }
await b.close();
