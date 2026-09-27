import { chromium } from 'playwright';
const [,, pfad, rolle, breite, datei, sel, hoehe='900', klick=''] = process.argv;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const s = await b.newPage({ locale: 'de-AT', timezoneId: 'Europe/Vienna', viewport: { width: +breite, height: +hoehe }, deviceScaleFactor: 2 });
await s.goto(`${process.env.VORSCHAU_URL ?? 'http://localhost:5199/tools/vorschau/'}?pfad=${encodeURIComponent(pfad)}&rolle=${encodeURIComponent(rolle)}`, { waitUntil: 'networkidle' });
await s.waitForTimeout(500);
if (klick) { await s.locator(klick).first().click(); await s.waitForTimeout(400); }
if (sel) await s.locator(sel).first().screenshot({ path: datei }); else await s.screenshot({ path: datei });
await b.close();
