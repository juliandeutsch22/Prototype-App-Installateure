/**
 * Jede Seite jeder Rolle unter der durchgesetzten Inhaltsregel (Testbericht
 * Runde 6, Abschnitt 8.4 Schritt 6 und Hinweis 13; 27.10.2026).
 *
 * WARUM. Die strenge Regel stand bis hierher nur meldend da. Durchgesetzt
 * sperrt sie, was nicht von der eigenen Herkunft kommt — und sperrte sie
 * etwas, das die App selbst braucht (ein Stilblock einer Bibliothek, ein Bild
 * aus dem Speicher, eine Verbindung), stünde live eine halbe oder weiße
 * Seite. Dieser Rundgang ruft deshalb jede Seite jeder Rolle im fertigen Bau
 * auf, am Schreibtisch und am Telefon, und hält jeden Verstoß fest.
 *
 * Gegenprobe im selben Lauf: ein eingeschleustes Skript und ein
 * eingeschleuster Stilblock werden gesperrt UND gemeldet. So beweist der
 * Rundgang zweierlei — dass die Regel wirkt, und dass der Melder sie sieht;
 * „keine Verstöße“ hieße sonst womöglich nur „nichts gemessen“.
 */
import { test, expect, type Page } from '@playwright/test';
import { NAV } from '@/app/navigation';
import type { Role } from '@/types';
import { darfZiel } from '../links/linkziel';
import { admin, BETRIEB, BUERO, CHEFIN, MONTEUR } from '../durchklick/aufbau';
import { anmelden } from '../durchklick/helfer';

declare global {
  interface Window { __verstoesse?: string[]; __boese?: number }
}

/** Jeden Verstoß ab dem ersten Byte mitschreiben — auch die vor dem Start der App. */
async function melderEinbauen(page: Page, sammel: string[]): Promise<void> {
  await page.addInitScript(() => {
    window.__verstoesse = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__verstoesse!.push(`${e.effectiveDirective} ${e.blockedURI || '(eingebettet)'} @ ${location.pathname}`);
    });
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) sammel.push(m.text().slice(0, 300));
  });
}

async function verstoesse(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__verstoesse ?? []);
}

const KONTEN: { konto: { email: string }; rolle: Role }[] = [
  { konto: MONTEUR, rolle: 'Mitarbeiter' },
  { konto: BUERO, rolle: 'Buchhaltung' },
  { konto: CHEFIN, rolle: 'Geschäftsführung' },
];

async function zieleFuer(rolle: Role): Promise<string[]> {
  const { data: firma } = await admin.from('companies').select('modules').eq('id', BETRIEB).single();
  const module = (firma?.modules ?? undefined) as Record<string, boolean> | undefined;
  const ziele = [...NAV.map((n) => n.path), '/worksheet', '/my-account'];
  // Je eine Akte: Kunde und Baustelle (Bilder, Pläne, Verläufe).
  const { data: kunde } = await admin.from('customers').select('id').eq('company_id', BETRIEB).limit(1).maybeSingle();
  const { data: baustelle } = await admin.from('projects').select('id').eq('company_id', BETRIEB).limit(1).maybeSingle();
  if (kunde) ziele.push(`/customers/${kunde.id}`);
  if (baustelle) ziele.push(`/admin-projects/${baustelle.id}`);
  return [...new Set(ziele)].filter((p) => darfZiel(rolle, p, module).ok);
}

test('die Auslieferung schickt die durchgesetzte Regel', async ({ page }) => {
  const antwort = await page.goto('/');
  const regel = antwort?.headers()['content-security-policy'] ?? '';
  expect(regel).toContain("default-src 'self'");
  expect(regel).toContain("script-src 'self'");
  expect(regel).toContain("style-src-elem 'self'");
  expect(antwort?.headers()['content-security-policy-report-only']).toBeUndefined();
});

test('Gegenprobe: ein eingeschleustes Skript und ein fremder Stilblock werden gesperrt und gemeldet', async ({ page }) => {
  const konsole: string[] = [];
  await melderEinbauen(page, konsole);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.__boese = 1;';
    document.head.append(s);
    const st = document.createElement('style');
    st.textContent = 'body { display: none !important; }';
    document.head.append(st);
  });
  await expect.poll(() => verstoesse(page)).toEqual(
    // Chromium nennt die genaue Anweisung (`script-src-elem`), andere Browser womöglich die allgemeine.
    expect.arrayContaining([expect.stringMatching(/^script-src(-elem)? /), expect.stringMatching(/^style-src(-elem)? /)]),
  );
  expect(await page.evaluate(() => window.__boese)).toBeUndefined();
  await expect(page.locator('body')).toBeVisible();
});

for (const { konto, rolle } of KONTEN) {
  test(`jede Seite für ${rolle} ohne Verstoß`, async ({ page }) => {
    const konsole: string[] = [];
    await melderEinbauen(page, konsole);
    await anmelden(page, konto.email);
    const ziele = await zieleFuer(rolle);
    expect(ziele.length).toBeGreaterThan(3);
    // Je Seite einsammeln: jeder Aufruf beginnt eine neue Seite und damit eine leere Liste.
    const gefunden: string[] = [...(await verstoesse(page))];
    for (const ziel of ziele) {
      await page.goto(ziel);
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { level: 1 }).first(), `Seite ${ziel}`).toBeVisible();
      // Aufklappbares öffnen: Seitenfenster und Hilfen laden eigene Teile.
      await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
      await page.waitForLoadState('networkidle');
      gefunden.push(...(await verstoesse(page)));
    }
    expect([...gefunden, ...konsole], `Verstöße für ${rolle}`).toEqual([]);
  });
}
