import { test, expect, type Page } from '@playwright/test';

/*
  E97 (17.11.2026) — DIE SCHRIFTSKALA, WIE DER BROWSER SIE ZEICHNET. Im Stil
  prüft `schriftskala.test.ts` die Werte; hier zählt, was auf der Seite
  ankommt: Tailwind-Klassen, Erbe vom `body` (vorher 16 px des Browsers),
  Überschreibungen in anderer Reihenfolge.

  1. Jede Seite, jeder Reiter, drei Breiten: jede Schrift im Inhalt ist eine
     Stufe der Skala — 12, 13, 15 px (Feld und Nachricht 16). Titel,
     Kennwerte, Zeichen, Kürzel und die Navigation haben eigene Größen.
  2. In den Akten dieselbe Rolle in derselben Größe: Beschriftung über dem
     Wert 13, Wert 15, Leersatz 15, Verweis 13 — vorher 12/13, 13/14/15,
     14/16 und 13/14 px nebeneinander.

  Gegenprobe: am Stand vor E97 sind beide rot (14-px-Leersätze, 16-px-Text
  ohne Klasse, Dachzeilen in 9 bis 11,5 px, `dt` in 12 px).
*/

const A = 'Administrator', M = 'Mitarbeiter', B = 'Buchhaltung';
const SEITEN: [string, string][] = [
  ['/', A], ['/', M], ['/', B], ['/time', M], ['/time', A], ['/material', M], ['/anforderungen', A], ['/lager', A],
  ['/my-schedule/mein', M], ['/my-projects', M], ['/vacations', A], ['/vacations', M], ['/sonderurlaub', A],
  ['/worksheets', A], ['/worksheet', M], ['/quotes', A], ['/quotes/q1', A], ['/eingaenge', A], ['/customers', A],
  ['/customers/k1', A], ['/liegenschaften', A], ['/wartungen', A], ['/admin-projects', A], ['/admin-projects/p1', A],
  ['/assignments/tag', A], ['/assignments/woche', A], ['/assignments/monat', A], ['/nachrichten', A],
  ['/nachrichten/k-direkt', A], ['/user-mgmt', A], ['/user-mgmt/u1', A], ['/settings/meldungen', A],
  ['/settings/firma', A], ['/settings/saetze', A], ['/settings/nummern', A], ['/settings/personal', A],
  ['/settings/konten', A], ['/settings/support', A], ['/settings/module', A], ['/settings/sicherung', A],
  ['/costing', A], ['/invoices', A], ['/invoices/kontoauszug', A], ['/accounting', A], ['/impressum', A], ['/datenschutz', A],
];
const BREITEN = [390, 834, 1440];
const pfad = (route: string, rolle: string) => `./?pfad=${encodeURIComponent(route)}&rolle=${rolle}`;

/*
  Was eine eigene Größe hat — dieselben Rollen wie `EIGENE_GROESSE` im Stil:
  Titel, Kennwerte und Uhr, Zeichen und Kürzel, die Navigation (Leiste,
  Kopfzeile, Firmenname, untere Leiste).
*/
const EIGEN = [
  'h1', 'h2', 'h3', 'h4', '.titel-karte', '.seitenkopf', '.fenster-titel', '.chat-kopf-titel', '.kopfzeile',
  '.start-einsatz-name', '.start-einsatz-titel', '.arbeitstag-start-titel', '.antrag-zeitraum', '.planung-titel',
  '.planung-ablage-titel', '.anmelde-buehne-satz', '.ue-titel-gross',
  '.rollzahl-neu', '.lage-wert', '.arbeitstag-uhr', '.timer-leiste-uhr', '.akten-termin-tag', '.budget-prozent',
  '.nachkalk-db', '.fenster-zahl', '.pf-kennzahl-wert', '.ue-zahl-stark', '.ue-gesamtsaldo-zahl', '.rechnung-stand-betrag',
  '.leiste-zeichen', '.reaktion-zeichen', '.eingabe-at', '.mengen-schritt', '.plattform-zeilenpfeil',
  '.lot-avatar', '.postfach-kuerzel', '.chat-kuerzel',
  '.navi', 'nav', '.unten',
].join(',');

async function befunde(page: Page): Promise<string[]> {
  return page.evaluate((eigen) => {
    const aus: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('main *, [role="dialog"] *')) {
      const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
      if (!text || el.closest('svg,.sr-only,[aria-hidden="true"]') || el.closest(eigen)) continue;
      // Ein einzelnes Zeichen ohne Buchstaben (⋯, ›, ×) ist ein Symbol, kein Text.
      if (text.length === 1 && !/[\p{L}\p{N}]/u.test(text)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden') continue;
      const px = Math.round(parseFloat(s.fontSize) * 100) / 100;
      const feld = el.matches('input,select,textarea') || el.closest('.nachricht-text');
      const erlaubt = feld ? [16] : [12, 13, 15];
      if (!erlaubt.includes(px)) aus.push(`${px}px ${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).slice(0, 3).join('.')} „${text.slice(0, 40)}“`);
    }
    return [...new Set(aus)];
  }, EIGEN);
}

test.describe('E97 Schriftskala auf jeder Seite', () => {
  for (const [route, rolle] of SEITEN) {
    test(`${route} als ${rolle}: jede Schrift im Inhalt auf einer Stufe der Skala`, async ({ page }) => {
      test.setTimeout(120_000);
      const fehler: string[] = [];
      for (const breite of BREITEN) {
        await page.setViewportSize({ width: breite, height: 1000 });
        await page.goto(pfad(route, rolle));
        await page.waitForLoadState('networkidle');
        await expect(page.locator('main')).toBeVisible();
        const reiter = page.locator('main [role=tablist] [role=tab]');
        const anzahl = Math.max(1, await reiter.count());
        for (let i = 0; i < anzahl; i++) {
          if (await reiter.count()) await reiter.nth(i).click();
          await page.evaluate(() => document.querySelectorAll('main details').forEach((d) => { d.open = true; }));
          await page.waitForTimeout(300);
          for (const f of await befunde(page)) fehler.push(`${breite} px${anzahl > 1 ? ` Reiter ${i + 1}` : ''}: ${f}`);
        }
      }
      expect([...new Set(fehler)]).toEqual([]);
    });
  }
});

test.describe('E97 dieselbe Rolle in derselben Größe — in den Akten', () => {
  for (const route of ['/admin-projects/p1', '/customers/k1', '/quotes/q1', '/user-mgmt/u1']) {
    for (const breite of [390, 1440]) {
      test(`${route} bei ${breite} px: Beschriftung 13, Wert 15, Leersatz 15, Verweis 13`, async ({ page }) => {
        await page.setViewportSize({ width: breite, height: 1000 });
        await page.goto(pfad(route, A));
        await page.waitForLoadState('networkidle');
        await expect(page.locator('main')).toBeVisible();
        const groessen = await page.evaluate(() => {
          const px = (sel: string) => [...new Set([...document.querySelectorAll<HTMLElement>(`main ${sel}`)]
            .filter((e) => e.getBoundingClientRect().width > 0 && e.textContent?.trim())
            .map((e) => parseFloat(getComputedStyle(e).fontSize)))];
          return {
            beschriftung: px('dl dt'),
            wert: px('dl dd'),
            leersatz: px('.leer-satz p'),
            verweis: px('.akten-verweis, .link-still'),
          };
        });
        expect(groessen.beschriftung.length + groessen.wert.length).toBeGreaterThan(0);
        for (const g of groessen.beschriftung) expect(g, 'Beschriftung über dem Wert').toBe(13);
        for (const g of groessen.wert) expect(g, 'Wert').toBe(15);
        for (const g of groessen.leersatz) expect(g, 'Leersatz').toBe(15);
        for (const g of groessen.verweis) expect(g, 'Verweis').toBe(13);
      });
    }
  }
});
