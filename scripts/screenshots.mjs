import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://127.0.0.1:5173';
const OUT = '/tmp/shots';
mkdirSync(OUT, { recursive: true });

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
  await page.waitForSelector('h1:has-text("Willkommen")', { timeout: 15000 });
}

const browser = await chromium.launch();

// --- Desktop ---
const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await desktop.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.screenshot({ path: `${OUT}/01-login.png` });

await login(page, 'chefin@perl.at', 'demo1234');
await page.screenshot({ path: `${OUT}/02-dashboard-gf.png`, fullPage: true });

await page.goto(`${BASE}/voice`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1:has-text("KI-Erfassung")');
await page.screenshot({ path: `${OUT}/03-voice.png`, fullPage: true });

await desktop.close();

// --- Mitarbeiter: Zeiterfassung mit echten Daten ---
const emp = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page2 = await emp.newPage();
await login(page2, 'max@perl.at', 'demo1234');
await page2.goto(`${BASE}/time`, { waitUntil: 'domcontentloaded' });
await page2.waitForSelector('h2:has-text("Meine Einträge")');
await page2.waitForTimeout(800); // Live-Daten laden
await page2.screenshot({ path: `${OUT}/04-time.png`, fullPage: true });
await emp.close();

// --- Mobile (Außendienst) ---
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page3 = await mobile.newPage();
await login(page3, 'max@perl.at', 'demo1234');
await page3.screenshot({ path: `${OUT}/05-mobile-dashboard.png`, fullPage: true });
await page3.goto(`${BASE}/voice`, { waitUntil: 'domcontentloaded' });
await page3.waitForSelector('h1:has-text("KI-Erfassung")');
await page3.screenshot({ path: `${OUT}/06-mobile-voice.png`, fullPage: true });
await mobile.close();

await browser.close();
console.log('Screenshots in', OUT);
