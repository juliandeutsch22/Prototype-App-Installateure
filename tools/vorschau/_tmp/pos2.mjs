import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PFAD });
const s = await b.newPage({ viewport: { width: 390, height: 900 } });
await s.goto(`http://localhost:${process.env.PORT ?? 5199}/tools/vorschau/?pfad=%2Fquotes%2Fq1&rolle=Administrator`, { waitUntil: 'networkidle' });
await s.waitForTimeout(500);
console.log(JSON.stringify(await s.evaluate(() => { const th = document.querySelector('.positionen-tabelle th'); const t = th.closest('table'); const w = t.parentElement; return { th: th.getBoundingClientRect().width, thScroll: th.scrollWidth, thClient: th.clientWidth, tabelle: t.offsetWidth, huelle: w.clientWidth, huelleScroll: w.scrollWidth }; })));
await b.close();
