import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PFAD });
for (const w of [390, 834, 1440]) {
  const s = await b.newPage({ viewport: { width: w, height: 900 } });
  await s.goto('http://localhost:5199/tools/vorschau/?pfad=%2Fadmin-projects%2Fp1&rolle=Administrator', { waitUntil: 'networkidle' });
  await s.waitForTimeout(600);
  console.log(w, await s.evaluate(() => { const m = document.querySelector('.akten-termin-monat'); const d = m.parentElement; return { monatBreite: m.scrollWidth, platz: d.clientWidth - 10, ueber: m.getBoundingClientRect().right > d.getBoundingClientRect().right }; }));
  await s.close();
}
await b.close();
