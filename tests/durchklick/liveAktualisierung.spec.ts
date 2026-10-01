import { test, expect, type Page } from '@playwright/test';
import { admin, ARTIKEL, BETRIEB, CHEFIN } from './aufbau';
import { anmelden } from './helfer';

/**
 * Live-Aktualisierung über Seitenwechsel und Tabwechsel hinweg (Nachtest
 * 01.10.2026, N1).
 *
 * Im Fehlerprotokoll stand „cannot add postgres_changes callbacks … after
 * subscribe()“, ausgelöst auf Lager und Rechnungen. Ursache: beim Zurück in
 * den Tab wurde der Kanal unter demselben Namen neu angelegt, bevor der alte
 * ausgetragen war; ab da hatte die Ansicht keinen Live-Kanal mehr.
 *
 * Geprüft wird hier mit einer zweiten Sitzung, die schreibt (Dienstschlüssel
 * — ein anderer Client als der Browser), und dem Browser, der nur zusieht:
 * die Änderung muss ohne Neuladen ankommen, auch nach Seitenwechsel und nach
 * dem Wechsel in einen anderen Tab und zurück.
 */

async function bestandSetzen(menge: number): Promise<void> {
  const { error } = await admin.from('materials').update({ stock: menge })
    .eq('company_id', BETRIEB).eq('name', ARTIKEL.name);
  expect(error).toBeNull();
}

/** Den Tab in den Hintergrund schicken und zurückholen — wie ein Fensterwechsel. */
async function tabWechsel(page: Page): Promise<void> {
  await page.evaluate(() => {
    const setze = (wert: string) => {
      Object.defineProperty(document, 'visibilityState', { value: wert, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    setze('hidden');
    setze('visible');
  });
}

test('Eine Änderung aus einer anderen Sitzung erscheint ohne Neuladen', async ({ page }) => {
  const fehler: string[] = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text()); });

  await bestandSetzen(100);
  await anmelden(page, CHEFIN.email);
  await page.goto('/lager');
  await expect(page.getByText(`100 ${ARTIKEL.einheit} frei`).first()).toBeVisible();

  await bestandSetzen(87);
  await expect(page.getByText(`87 ${ARTIKEL.einheit} frei`).first()).toBeVisible({ timeout: 15_000 });

  // Seitenwechsel und zurück.
  await page.goto('/invoices');
  await page.goto('/lager');
  await expect(page.getByText(`87 ${ARTIKEL.einheit} frei`).first()).toBeVisible();
  await bestandSetzen(64);
  await expect(page.getByText(`64 ${ARTIKEL.einheit} frei`).first()).toBeVisible({ timeout: 15_000 });

  // Tab in den Hintergrund und zurück — hier riss der Kanal vorher ab.
  await tabWechsel(page);
  await tabWechsel(page);
  await bestandSetzen(41);
  await expect(page.getByText(`41 ${ARTIKEL.einheit} frei`).first()).toBeVisible({ timeout: 15_000 });

  expect(fehler.filter((f) => /postgres_changes|after `?subscribe/.test(f))).toEqual([]);

  // Und im Fehlerprotokoll des Betriebs steht nichts davon.
  const { data } = await admin.from('fehlerprotokoll').select('nachricht')
    .eq('company_id', BETRIEB).ilike('nachricht', '%postgres_changes%');
  expect(data ?? []).toEqual([]);

  await bestandSetzen(100);
});
