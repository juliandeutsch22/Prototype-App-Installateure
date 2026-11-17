import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PFAD });
const s = await b.newPage({ viewport: { width: 1440, height: 900 } });
s.on('pageerror', e => console.log('ERR', String(e.stack||e).slice(0,600)));
await s.goto('http://localhost:5199/tools/vorschau/?pfad=%2Fadmin-projects%2Fp1&rolle=Administrator', { waitUntil: 'networkidle' });
await s.waitForTimeout(600);
for (const t of ['Verlauf der Baustelle', 'Änderungsverlauf']) {
  await s.getByText(t).first().click(); await s.waitForTimeout(800);
  console.log(t, await s.locator('h1').first().textContent());
}
await b.close();
