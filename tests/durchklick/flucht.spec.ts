import { test, expect, type Page } from '@playwright/test';
import { admin, BETRIEB, BUERO, CHEFIN, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * JEDER TEXT EINER KARTE AUF DER FLUCHT IHRES TITELS (E98, 18.11.2026).
 *
 * „Bei Baustellen › Scheine klebt der Platzhaltertext auch noch am Rand.
 * Wie kann dir das immer entgehen?“ — die bisherige Prüfung („Bündige
 * Karten“, `interaktionen.spec.ts`) sah sechs Seiten der Vorschau an, mit
 * Beispieldaten, in denen kaum eine Liste leer ist. Leersätze gibt es aber
 * vor allem in einem frischen Betrieb. Hier deshalb gegen die echte
 * Datenbank des Durchklicks: jede Seite jeder Rolle, jeder Reiter der Akten,
 * am Schreibtisch und am Handy — und jeder sichtbare Text in einer Karte,
 * nicht nur bekannte Klassen. Steht einer links vom Titel, liegt er näher am
 * Rand als der Titel selbst.
 *
 * Gegenprobe: auf dem Stand vor E98 rot — Scheine der Baustelle (−24 px),
 * „Meine Einträge“ in der Zeiterfassung (−8 px), „Offene Rechnungen“ ohne
 * Rechnung am Handy (−4 px).
 */

/** Was in den Karten auf der Seite links vom Titel beginnt. */
async function nebenDerFlucht(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const aus: string[] = [];
    for (const karte of document.querySelectorAll<HTMLElement>('.inhalt .karte')) {
      const titel = karte.querySelector<HTMLElement>(':scope > .karte-kopf .titel-karte');
      if (!titel || titel.getBoundingClientRect().width === 0) continue;
      const flucht = titel.getBoundingClientRect().left;
      const koerper = karte.querySelector(':scope > .karte-buendig, :scope > .karte-koerper');
      if (!koerper) continue;
      const gang = document.createTreeWalker(koerper, NodeFilter.SHOW_TEXT);
      let t: Node | null;
      while ((t = gang.nextNode())) {
        if (!t.textContent?.trim()) continue;
        const el = t.parentElement!;
        // Unsichtbares, Zeichen, Tabellen (rollen seitlich) und Karten in der Karte zählen nicht.
        if (el.closest('.sr-only, [aria-hidden="true"], svg, table, .karte .karte')) continue;
        if (getComputedStyle(el).visibility === 'hidden') continue;
        const r = document.createRange();
        r.selectNodeContents(t);
        const q = r.getClientRects()[0];
        if (!q || q.width === 0) continue;
        if (q.left < flucht - 1) aus.push(`${titel.textContent?.trim().slice(0, 30)}: „${t.textContent.trim().slice(0, 40)}“ ${Math.round(q.left - flucht)} px`);
      }
    }
    return [...new Set(aus)];
  });
}

const ALLE = ['/', '/admin-projects', '/assignments', '/worksheets', '/quotes', '/eingaenge', '/customers', '/liegenschaften',
  '/wartungen', '/invoices', '/costing', '/time', '/vacations', '/accounting', '/user-mgmt', '/material', '/lager', '/anforderungen',
  '/nachrichten', '/settings', '/settings/firma', '/settings/saetze', '/settings/nummern', '/settings/personal', '/settings/konten',
  '/settings/module', '/settings/nachrichten', '/settings/papierkorb', '/settings/fahrzeuge', '/settings/zeitfelder',
  '/settings/meldungen', '/settings/sicherung'];
const EIGENE = ['/', '/time', '/material', '/my-schedule/mein', '/my-projects', '/worksheet', '/worksheets', '/vacations',
  '/nachrichten', '/anforderungen', '/invoices', '/accounting', '/customers', '/quotes', '/lager', '/settings'];

/** Akten: die ersten Baustellen, Kunden und Personen — leere und volle Reiter. */
async function akten(): Promise<string[]> {
  const ids = async (tabelle: string, n: number) =>
    ((await admin.from(tabelle).select('id').eq('company_id', BETRIEB).order('id').limit(n)).data ?? []).map((z) => z.id as string);
  return [
    ...(await ids('projects', 3)).map((id) => `/admin-projects/${id}`),
    ...(await ids('customers', 2)).map((id) => `/customers/${id}`),
    ...(await ids('users', 2)).map((id) => `/user-mgmt/${id}`),
    ...(await ids('quotes', 1)).map((id) => `/quotes/${id}`),
  ];
}

/** In Gruppen, damit ein langer Lauf den Browser nicht erschöpft (siehe `raster.spec.ts`). */
const gruppen = <T,>(liste: T[], groesse: number) =>
  Array.from({ length: Math.ceil(liste.length / groesse) }, (_, i) => liste.slice(i * groesse, (i + 1) * groesse));

const FAELLE: { rolle: string; email: string; seiten: string[] | 'akten' }[] = [
  ...gruppen(ALLE, 8).map((seiten) => ({ rolle: 'Geschäftsführung', email: CHEFIN.email, seiten })),
  { rolle: 'Geschäftsführung', email: CHEFIN.email, seiten: 'akten' },
  ...gruppen(EIGENE, 8).map((seiten) => ({ rolle: 'Mitarbeiter', email: MONTEUR.email, seiten })),
  ...gruppen(EIGENE, 8).map((seiten) => ({ rolle: 'Buchhaltung', email: BUERO.email, seiten })),
];

for (const fall of FAELLE) {
  const name = fall.seiten === 'akten' ? 'Akten (jeder Reiter)' : `${fall.seiten[0]} … ${fall.seiten[fall.seiten.length - 1]}`;
  test(`Jeder Text einer Karte beginnt auf der Flucht ihres Titels — ${fall.rolle}, ${name}`, async ({ page }) => {
    test.setTimeout(240_000);
    const seiten = fall.seiten === 'akten' ? await akten() : fall.seiten;
    // Ohne Vorladen, wie in `raster.spec.ts`: die Lage der Texte hängt nicht daran.
    await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true }));
    await anmelden(page, fall.email);
    const fehler: string[] = [];
    for (const pfad of seiten) {
      for (const breite of [{ name: 'Schreibtisch', width: 1440, height: 900 }, { name: 'Handy', width: 390, height: 844 }]) {
        await page.setViewportSize({ width: breite.width, height: breite.height });
        await page.goto(pfad);
        await page.waitForLoadState('networkidle');
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 15_000 });
        // Gemessen wird, was geladen ist — nicht der Platzhalter davor.
        await expect(page.locator('.inhalt [aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
        const reiter = page.locator('main [role=tablist] [role=tab]');
        const anzahl = Math.max(1, await reiter.count());
        for (let i = 0; i < anzahl; i++) {
          if (await reiter.count()) {
            await reiter.nth(i).click();
            await page.waitForLoadState('networkidle');
            await expect(page.locator('.inhalt [aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
          }
          for (const f of await nebenDerFlucht(page)) fehler.push(`${breite.name} ${pfad}${anzahl > 1 ? ` (Reiter ${i + 1})` : ''}: ${f}`);
        }
      }
    }
    expect([...new Set(fehler)]).toEqual([]);
    await keineFehlermeldung(page);
  });
}
