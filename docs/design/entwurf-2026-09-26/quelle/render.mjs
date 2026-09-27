// node render.mjs <datei.html> <breite> <hoehe> <ziel.png>
// Playwright kommt aus node_modules des Projekts; der Browserpfad aus CHROMIUM_PFAD.
import { chromium } from 'playwright';
const [,, html, w, h, ziel] = process.argv;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
await p.goto('file://' + process.cwd() + '/' + html, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(200);
const ueber = await p.evaluate(() => { const r = []; document.querySelectorAll('*').forEach((e) => { const b = e.getBoundingClientRect(); if (b.right > innerWidth + 0.5 && b.width > 0) r.push(e.className || e.tagName); }); return { sw: document.documentElement.scrollWidth, iw: innerWidth, r: r.slice(0, 5) }; });
if (ueber.sw > ueber.iw || ueber.r.length) console.log('ÜBERLAUF', html, JSON.stringify(ueber));
await p.screenshot({ path: ziel, fullPage: false });
await b.close();
console.log(ziel);
