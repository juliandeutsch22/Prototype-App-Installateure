import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://127.0.0.1:5173';
const OUT = '/tmp/shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('#email', 'chefin@perl.at');
await page.fill('#password', 'demo1234');
await page.click('button[type=submit]');
await page.waitForSelector('h1:has-text("Willkommen")', { timeout: 15000 });

async function shot(path, name, waitText) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  if (waitText) await page.waitForSelector(waitText, { timeout: 10000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}`, fullPage: true });
}

await shot('/order', 'p4-01-order.png', 'text=Katalog');
await shot('/admin-orders', 'p4-02-admin-orders.png', 'h1:has-text("Material-Dashboard")');
await shot('/admin-projects', 'p4-03-projects.png', 'h1:has-text("Baustellen")');
await shot('/assignments', 'p4-04-assignments.png', 'h1:has-text("Einsatzplanung")');

// Rechnung erstellen, dann Liste zeigen
await page.goto(`${BASE}/invoices`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1:has-text("Rechnungen")');
await page.selectOption('#invproj', { label: 'Familie Müller (2026-001)' });
await page.click('button:has-text("Rechnung erstellen")');
await page.waitForSelector('text=RE-', { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/p4-05-invoices.png`, fullPage: true });

await shot('/accounting', 'p4-06-accounting.png', 'h1:has-text("Mitarbeiterübersicht")');

await browser.close();
console.log('Phase-4-Screenshots in', OUT);
