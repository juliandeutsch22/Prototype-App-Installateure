import { test, expect } from '@playwright/test';
import { BUERO } from './aufbau';
import { anmelden, keineFehlermeldung, menue } from './helfer';

/**
 * Die Ansichten der eigenen Navigation kommen im Leerlauf nach der Anmeldung
 * (Analyse 10.10.2026, `lib/ansichten.ts`). Der Wechsel dorthin holt den
 * Baustein dann nicht noch einmal übers Netz — die alte Seite steht nicht
 * mehr ohne Zeichen da, während er lädt.
 *
 * Im Entwicklungsserver heißt der Baustein wie seine Quelldatei, im Bau
 * trägt er eine Prüfsumme im Namen; gezählt wird beides.
 */
const ZEITERFASSUNG = /\/TimeView(?:\.tsx|-[\w-]+\.js)(?:\?|$)/;

test('Die Zeiterfassung ist vorab geholt, der Wechsel lädt sie nicht noch einmal', async ({ page }) => {
  const geholt: string[] = [];
  page.on('request', (r) => {
    if (ZEITERFASSUNG.test(r.url())) geholt.push(r.url());
  });

  await anmelden(page, BUERO.email);
  // Vorab, ohne dass jemand die Seite geöffnet hat.
  await expect.poll(() => geholt.length, { timeout: 30_000 }).toBeGreaterThan(0);
  const vorher = geholt.length;

  await menue(page, 'Zeiterfassung', 'Zeit');
  await expect(page.getByRole('heading', { level: 1, name: 'Zeiterfassung' })).toBeVisible();
  expect(geholt.length).toBe(vorher);
  // Ohne Wartezeit kein Balken.
  await expect(page.getByRole('progressbar', { name: 'Seite wird geladen' })).toHaveCount(0);
  await keineFehlermeldung(page);
});
