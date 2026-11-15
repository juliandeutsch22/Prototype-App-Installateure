/**
 * LEISTUNG JE SEITE MIT EINEM GEWACHSENEN BESTAND (Plan 15.11.2026, L11).
 *
 * Gegen die Vorschau, wie die Linkprüfung — läuft also in der CI mit
 * (`npm run pruefen:links`). Jede Seite wird zweimal geöffnet: mit den
 * Beispieldaten und mit `?bestand=gewachsen` (50 Personen, 2.000 Kunden,
 * 4.000 Baustellen, 6.000 Rechnungen; `tools/testbestand/gewachsenerBetrieb.ts`).
 *
 * GEPRÜFT WIRD, WAS OHNE DATENBANK PRÜFBAR IST:
 *   - Datenaufrufe je Seite (Abfragen und Abos, gezählt in den Attrappen der
 *     Datenschicht): unter einem Budget, und mit dem großen Bestand nicht
 *     mehr als mit dem kleinen. Fragt eine Seite je Zeile nach (N+1), wächst
 *     die Zahl mit dem Bestand — hier fällt das auf;
 *   - gezeichnete Elemente im Inhalt: eine Liste, die alle 2.000 Kunden
 *     zeichnet statt der ersten 20 je Gruppe (Regel 4), sprengt die Grenze.
 *
 * WAS ES NICHT PRÜFT: Zeilen und Dauer je Abfrage. Die Attrappen filtern
 * nicht nach Person oder Zeitraum; das misst `scripts/ui-umbau/messung.mjs`
 * gegen den örtlichen Stapel.
 */
import { test, expect, type Page } from '@playwright/test';

interface Seite {
  pfad: string;
  rolle: string;
  /** Höchstens so viele Datenaufrufe beim Öffnen. */
  aufrufe: number;
}

/*
  Die Seiten des Monteurs (bis 15.11.2026 in keiner Messung) und die Listen
  und Übersichten, die mit dem Betrieb wachsen. Budgets mit Luft über dem
  Stand vom 15.11.2026 (in Klammern).
*/
const SEITEN: Seite[] = [
  { pfad: '/', rolle: 'Mitarbeiter', aufrufe: 30 }, // (22)
  { pfad: '/time', rolle: 'Mitarbeiter', aufrufe: 30 }, // (22)
  { pfad: '/worksheets', rolle: 'Mitarbeiter', aufrufe: 12 }, // (6)
  { pfad: '/vacations', rolle: 'Mitarbeiter', aufrufe: 15 }, // (10)
  { pfad: '/nachrichten', rolle: 'Mitarbeiter', aufrufe: 12 }, // (6)
  { pfad: '/', rolle: 'Geschäftsführung', aufrufe: 48 }, // (38)
  { pfad: '/customers', rolle: 'Geschäftsführung', aufrufe: 12 }, // (7)
  { pfad: '/quotes', rolle: 'Geschäftsführung', aufrufe: 14 }, // (9)
  { pfad: '/wartungen', rolle: 'Geschäftsführung', aufrufe: 12 }, // (7)
  { pfad: '/admin-projects', rolle: 'Geschäftsführung', aufrufe: 14 }, // (9)
  { pfad: '/accounting', rolle: 'Geschäftsführung', aufrufe: 28 }, // (21)
  { pfad: '/user-mgmt', rolle: 'Administrator', aufrufe: 12 }, // (6)
  { pfad: '/invoices', rolle: 'Buchhaltung', aufrufe: 22 }, // (16)
];

/** Elemente im Inhalt höchstens — gemessen höchstens 4.800 (Zeiterfassung, gewachsen). */
const HOECHSTENS_ELEMENTE = 8000;

/*
  Was zwischen zwei Läufen derselben Seite schwanken darf: ein Abo, das
  nach dem ersten Bild noch einmal aufgeht. Eine Nachfrage je Zeile wären
  hunderte.
*/
const SCHWANKUNG = 2;

async function messen(page: Page, s: Seite, bestand: '' | 'gewachsen') {
  const fehler: string[] = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  await page.goto(
    `./?pfad=${encodeURIComponent(s.pfad)}&rolle=${encodeURIComponent(s.rolle)}${bestand ? `&bestand=${bestand}` : ''}`,
    { waitUntil: 'networkidle' },
  );
  await page.locator('main h1').first().waitFor();
  // Bis keine Ladeanzeige mehr steht und die Zahl der Aufrufe eine Weile ruht.
  await page.waitForFunction(() => !document.querySelector('main [aria-busy="true"]'));
  let vorher = -1;
  for (let i = 0; i < 20; i++) {
    const jetzt = await page.evaluate(() => (window as unknown as { __datenaufrufe?: { gesamt?: number } }).__datenaufrufe?.gesamt ?? 0);
    if (jetzt === vorher) break;
    vorher = jetzt;
    await page.waitForTimeout(400);
  }
  return page.evaluate((f) => {
    const z = (window as unknown as { __datenaufrufe?: Record<string, number> }).__datenaufrufe ?? {};
    return {
      aufrufe: z.gesamt ?? 0,
      namen: Object.entries(z).filter(([k]) => k.includes(':')).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}×${v}`),
      elemente: document.querySelectorAll('main *').length,
      fehler: f,
    };
  }, fehler);
}

for (const s of SEITEN) {
  test(`Leistung ${s.pfad} (${s.rolle})`, async ({ page }) => {
    const klein = await messen(page, s, '');
    const gross = await messen(page, s, 'gewachsen');
    const bericht = `klein ${klein.aufrufe} Aufrufe/${klein.elemente} Elemente, gewachsen ${gross.aufrufe}/${gross.elemente}; häufigste: ${gross.namen.join(', ')}`;
    test.info().annotations.push({ type: 'Messung', description: bericht });

    expect(klein.fehler, 'die Seite rendert ohne Fehler (sonst misst die Prüfung eine Fehlerseite)').toEqual([]);
    expect(gross.fehler).toEqual([]);
    // Gegenprobe der Zählung selbst: jede dieser Seiten fragt etwas.
    expect(klein.aufrufe, bericht).toBeGreaterThan(0);
    expect(gross.aufrufe, `Datenaufrufe über dem Budget — ${bericht}`).toBeLessThanOrEqual(s.aufrufe);
    expect(gross.aufrufe, `mit dem Bestand mehr Datenaufrufe — ${bericht}`).toBeLessThanOrEqual(klein.aufrufe + SCHWANKUNG);
    expect(gross.elemente, `zu viel gezeichnet — ${bericht}`).toBeLessThanOrEqual(HOECHSTENS_ELEMENTE);
  });
}
