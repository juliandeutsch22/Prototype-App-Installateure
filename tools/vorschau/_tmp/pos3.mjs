import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PFAD });
const s = await b.newPage({ viewport: { width: 390, height: 900 } });
await s.goto(`http://localhost:5199/tools/vorschau/?pfad=%2Fquotes%2Fq1&rolle=Administrator`, { waitUntil: 'networkidle' });
await s.waitForTimeout(500);
console.log(JSON.stringify(await s.evaluate(() => { const th = document.querySelector('.positionen-tabelle th'); const c = getComputedStyle(th); const td = document.querySelector('.positionen-tabelle td.pos'); return { pl: c.paddingLeft, pr: c.paddingRight, ls: c.letterSpacing, tdw: td && getComputedStyle(td).width, tdpl: td && getComputedStyle(td).paddingLeft, klassen: th.closest('table').className }; })));
await b.close();
