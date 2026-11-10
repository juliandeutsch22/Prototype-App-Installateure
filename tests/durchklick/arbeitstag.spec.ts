import { test, expect } from '@playwright/test';
import { admin, BETRIEB, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * DER ARBEITSTAG VON ANFANG BIS ENDE (Timer, 08.11.2026) — in Chromium, am
 * Telefon und auf dem Tablet (`MONTEUR_WEGE`):
 *
 *   Start auf der Startseite → die Leiste auf einer anderen Seite (am
 *   Telefon über der Reiterleiste, nicht darüber gelegt) → Pause aus der
 *   Leiste → zurück auf der Startseite in Pause → Feierabend führt gleich
 *   ins Formular der Zeiterfassung (E73) → abgebrochen steht die Zeit unter
 *   „Arbeitstag prüfen“ mit dem Papierkorb → mit Grund nicht gebucht.
 *   Gebucht wird nichts.
 */
async function aufraeumen() {
  await admin.from('zeitsitzungen').delete().eq('company_id', BETRIEB);
  await admin.from('companies').update({ modules: { 'zeiterfassung.timer': true } }).eq('id', BETRIEB);
}
test.beforeEach(aufraeumen);
test.afterEach(async () => {
  await admin.from('zeitsitzungen').delete().eq('company_id', BETRIEB);
  await admin.from('companies').update({ modules: {} }).eq('id', BETRIEB);
});

test('Arbeitstag: Start auf der Startseite, Leiste unterwegs, Pause, Feierabend, Arbeitstag prüfen', async ({ page }) => {
  test.setTimeout(120_000);
  const vorher = (await admin.from('time_entries').select('id').eq('company_id', BETRIEB)).data?.length ?? 0;
  await anmelden(page, MONTEUR.email);

  const karte = page.getByRole('region', { name: 'Arbeitstag' });
  await karte.getByRole('button', { name: 'Arbeitstag starten', exact: true }).click();
  await expect(karte.getByText(/^Läuft seit \d\d:\d\d$/)).toBeVisible({ timeout: 15_000 });
  await expect(karte.getByRole('button', { name: 'Pause beginnen' })).toBeVisible();

  // Unterwegs: die Leiste auf einer anderen Seite.
  await page.goto('/material');
  const leiste = page.getByRole('region', { name: 'Laufender Arbeitstag' }).locator('visible=true');
  await expect(leiste).toBeVisible({ timeout: 15_000 });
  const reiter = page.locator('nav.unten');
  if (await reiter.isVisible()) {
    // Am Telefon steht sie über der Reiterleiste — nicht darüber gelegt.
    const l = (await leiste.boundingBox())!;
    const r = (await reiter.boundingBox())!;
    expect(l.y + l.height).toBeLessThanOrEqual(r.y + 1);
  }
  await leiste.getByRole('button', { name: 'Pause beginnen' }).click();
  await expect(leiste.getByText('Pause', { exact: true })).toBeVisible({ timeout: 15_000 });

  // Zurück auf der Startseite: die Karte zeigt die Pause; die Leiste steht dort nicht.
  await page.goto('/');
  await expect(karte.getByText(/^Pause seit \d\d:\d\d$/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('region', { name: 'Laufender Arbeitstag' })).toHaveCount(0);
  await karte.getByRole('button', { name: 'Stoppen und prüfen' }).click();

  // Feierabend führt gleich ins Formular der Zeiterfassung (E73); gebucht ist noch nichts.
  await expect(page).toHaveURL(/\/time$/);
  const fenster = page.getByRole('dialog', { name: 'Arbeitszeit buchen' });
  await expect(fenster).toBeVisible({ timeout: 15_000 });
  expect((await admin.from('time_entries').select('id').eq('company_id', BETRIEB)).data?.length ?? 0).toBe(vorher);
  await fenster.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(fenster).not.toBeVisible();
  // Die Zeit steht weiter zur Prüfung da, mit dem Papierkorb daneben.
  await expect(page.getByRole('heading', { name: /Arbeitstag prüfen/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /nicht buchen$/ })).toHaveCount(1);
  // Zurück auf der Startseite verweist die Karte auf den Tag, der noch wartet.
  await page.goto('/');
  const wartet = karte.getByRole('link', { name: /wartet auf die Prüfung/ });
  await expect(wartet).toBeVisible({ timeout: 15_000 });
  /*
    DER VERWEIS IST SCHLANK (E75, 10.11.2026: „der untere Teil ist noch etwas
    unnötig hoch“). Über und unter dem Text gleich viel Luft, darunter nicht
    mehr als eine Rasterzelle; die Tastfläche bleibt 44 px. Gegenprobe: mit
    dem Stand davor stand unter dem Text gut doppelt so viel Luft wie darüber.
  */
  const messen = () => wartet.evaluate((el) => {
    const k = el.closest('.arbeitstag')!.getBoundingClientRect();
    const v = el.getBoundingClientRect();
    const t = document.createRange();
    t.selectNodeContents(el.firstChild!);
    const r = t.getBoundingClientRect();
    // Die Linie über dem Verweis ist sein oberer Rand: von dort bis zum Text, und vom Text bis zum Rand der Karte.
    return { oben: Math.round(r.top - v.top), unten: Math.round(k.bottom - r.bottom), hoehe: Math.round(v.height) };
  });
  // In der Breite des Laufs und am schmalen Telefon, wo der Text in zwei Zeilen bricht.
  const breite = page.viewportSize()!;
  for (const b of [breite.width, 360]) {
    await page.setViewportSize({ width: b, height: breite.height });
    await page.waitForTimeout(300);
    const mass = await messen();
    expect(mass.hoehe, `${b} px: Tastfläche`).toBeGreaterThanOrEqual(44);
    expect(mass.unten, `${b} px: Luft unter dem Text`).toBeLessThanOrEqual(16);
    expect(Math.abs(mass.oben - mass.unten), `${b} px: über ${mass.oben} px, unter ${mass.unten} px`).toBeLessThanOrEqual(3);
  }
  await page.setViewportSize(breite);
  await page.goto('/time');
  // Und weg damit, mit Grund: der Tag ist danach erledigt, gebucht ist nichts.
  await page.getByRole('button', { name: /nicht buchen$/ }).click();
  const weg = page.getByRole('dialog', { name: 'Nicht buchen' });
  await weg.getByLabel(/Grund/).fill('Probelauf');
  await weg.getByRole('button', { name: 'Nicht buchen', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Arbeitstag prüfen/ })).toHaveCount(0, { timeout: 15_000 });
  expect((await admin.from('time_entries').select('id').eq('company_id', BETRIEB)).data?.length ?? 0).toBe(vorher);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await keineFehlermeldung(page);
});
