import { chromium } from 'playwright';
const [,, pfad, rolle, breite, ziel, teile = '2'] = process.argv;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PFAD });
const s = await b.newPage({ viewport: { width: +breite, height: 900 }, deviceScaleFactor: 1 });
await s.goto(`http://localhost:5199/tools/vorschau/?pfad=${encodeURIComponent(pfad)}&rolle=${rolle}`, { waitUntil: 'networkidle' });
await s.waitForTimeout(800);
for (let i = 0; i < +teile; i++) { await s.evaluate((y) => window.scrollTo(0, y), i * 850); await s.waitForTimeout(250); await s.screenshot({ path: `${ziel}-${i}.png` }); }
await b.close();
