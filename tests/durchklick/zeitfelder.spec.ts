import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, BUERO, CHEFIN, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * FREIE ZEITFELDER (M06b, N01) — durch die ganze Kette.
 *
 *   1. Die Geschäftsführung legt zwei Felder an (Auswahl mit Pflicht, Zahl
 *      mit Einheit) — jedes ergibt eine Fassung.
 *   2. Der Monteur bucht mit Werten.
 *   3. Das Büro sieht sie im Fenster der Person und in der Monats-CSV.
 *   4. Das Büro ändert einen Wert; der Verlauf zeigt „alt → neu“.
 *   5. Ohne Netz: der Monteur bucht unter der Fassung, die sein Gerät kennt;
 *      inzwischen verlangt eine neue Fassung ein weiteres Pflichtfeld. Mit
 *      dem Netz kommt die Buchung an — nach ihrer Fassung angenommen, mit
 *      „Nachpflege“ in der Liste.
 *
 * Gegenprobe: ohne Migration und Bausteine gibt es weder die Seite noch die
 * Felder in der Maske — rot.
 *
 * DIE FELDER RÄUMT DIE PRÜFUNG SELBST WEG: eine Pflicht „Kostenstelle“, die
 * liegen bliebe, ließe jede spätere Buchung anderer Wege scheitern.
 */
async function aufraeumen() {
  await admin.from('time_entries').delete().eq('company_id', BETRIEB);
  await admin.from('zeitbuchung_feldwerte').delete().eq('company_id', BETRIEB);
  await admin.from('zeitfeld_fassungen').delete().eq('company_id', BETRIEB);
  await admin.from('zeitfeld_definitionen').update({ ersetzt_durch: null }).eq('company_id', BETRIEB);
  await admin.from('zeitfeld_definitionen').delete().eq('company_id', BETRIEB);
}

/*
  DER TAG IN WIEN, nicht der des Testprozesses: die App bucht nach dem Wiener
  Kalender. Kurz nach Mitternacht lagen die beiden sonst einen Tag auseinander.
*/
const heuteWien = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());


test.beforeEach(aufraeumen);
test.afterEach(aufraeumen);

test('Zeitfelder: anlegen, buchen, im Büro sehen und exportieren, ändern im Verlauf, offline mit alter Fassung', async ({ page, context }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });

  // 1. Die Geschäftsführung legt zwei Felder an.
  await anmelden(page, CHEFIN.email);
  await page.goto('/settings/zeitfelder');
  await page.getByRole('button', { name: 'Feld anlegen' }).click();
  await page.getByLabel(/^Name/).fill('Kostenstelle');
  await page.getByLabel('Typ').selectOption('auswahl');
  await page.getByLabel('Option 1', { exact: true }).fill('Wien');
  await page.getByRole('button', { name: 'Option hinzufügen' }).click();
  await page.getByLabel('Option 2', { exact: true }).fill('Graz');
  await page.getByLabel('Pflicht').selectOption('beim_buchen');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByText('„Kostenstelle“ gespeichert — Fassung 1')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Feld anlegen' }).click();
  await page.getByLabel(/^Name/).fill('Kilometer');
  await page.getByLabel('Typ').selectOption('zahl');
  await page.getByLabel('Nachkommastellen').selectOption('1');
  await page.getByLabel('Einheit (optional)').fill('km');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByText('„Kilometer“ gespeichert — Fassung 2')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Auswahl · Pflicht beim Buchen · Anwesend · alle Rollen')).toBeVisible();
  await keineFehlermeldung(page);

  // 2. Der Monteur bucht mit Werten — ohne Kostenstelle geht es nicht.
  await page.context().clearCookies();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await anmelden(page, MONTEUR.email);
  await page.goto('/time');
  const kostenstelle = page.getByLabel(/^Kostenstelle/);
  await expect(kostenstelle).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Baustelle').selectOption(BAUSTELLE.nummer);
  await page.getByLabel(/^Von/).fill('07:00');
  await page.getByLabel(/^Bis/).fill('16:00');
  await page.getByLabel(/Pause/).fill('30');
  await page.getByRole('button', { name: /^Zeit buchen$/ }).click();
  await expect(page.getByText('Bitte ausfüllen: Kostenstelle')).toBeVisible();
  await kostenstelle.selectOption({ label: 'Wien' });
  await page.getByLabel('Kilometer (km)').fill('12,5');
  await page.getByRole('button', { name: /^Zeit buchen$/ }).click();

  const heute = heuteWien();
  let buchungId = '';
  await expect(async () => {
    const { data } = await admin.from('time_entries').select('id, zeitfeld_fassung').eq('company_id', BETRIEB).eq('date', heute);
    expect(data ?? []).toHaveLength(1);
    expect(data![0].zeitfeld_fassung).toBe(2);
    buchungId = data![0].id as string;
    const { data: werte } = await admin.from('zeitbuchung_feldwerte').select('wert').eq('eintrag_id', buchungId);
    expect(werte ?? []).toHaveLength(2);
    expect((werte ?? []).map((w) => w.wert)).toContain(12.5);
  }).toPass({ timeout: 20_000 });
  await expect(page.locator('#meine-eintraege').getByText('Kostenstelle: Wien · Kilometer: 12,5 km')).toBeVisible({ timeout: 20_000 });
  await keineFehlermeldung(page);

  // 3. Das Büro sieht die Angaben im Fenster der Person und in der Monats-CSV.
  await page.context().clearCookies();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await anmelden(page, BUERO.email);
  await page.goto(`/accounting?monat=${heute.slice(0, 7)}`);
  await page.getByText(MONTEUR.name).first().click();
  const fenster = page.getByRole('dialog');
  await expect(fenster).toBeVisible({ timeout: 20_000 });
  const zeile = fenster.locator('li', { hasText: '07:00–16:00' });
  await expect(zeile).toContainText('Kostenstelle: Wien · Kilometer: 12,5 km', { timeout: 20_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    fenster.getByRole('button', { name: 'Monat als CSV' }).click(),
  ]);
  const csv = readFileSync((await download.path())!, 'utf8');
  expect(csv).toMatch(/Kommentar;Kostenstelle;Kilometer \(km\)\r?\n/);
  expect(csv).toMatch(/;Wien;12,5\r?\n/);

  // 4. Das Büro ändert die Kilometer — der Verlauf zeigt es.
  await zeile.getByRole('button', { name: 'Bearbeiten' }).click();
  const km = page.getByLabel('Kilometer (km)');
  await expect(km).toHaveValue('12,5', { timeout: 20_000 });
  await km.fill('20');
  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByLabel('Kilometer (km)')).toBeHidden({ timeout: 20_000 });
  await expect(page.getByRole('dialog').locator('li', { hasText: '07:00–16:00' }))
    .toContainText('Kilometer: 20 km', { timeout: 20_000 });
  const protokoll = page.getByRole('dialog').locator('details', { hasText: 'Änderungsprotokoll des Monats' });
  await protokoll.locator('summary').click();
  await expect(protokoll.locator('ol.lot > li', { hasText: 'Kilometer 12,5 km → 20 km' }).first())
    .toContainText(`Geändert von ${BUERO.name}`, { timeout: 20_000 });
  await keineFehlermeldung(page);

  // 5. Ohne Netz, mit der Fassung des Geräts.
  await page.context().clearCookies();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await anmelden(page, MONTEUR.email);
  await page.goto('/time');
  await expect(page.getByLabel(/^Kostenstelle/)).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Baustelle').selectOption(BAUSTELLE.nummer);
  await context.setOffline(true);

  /*
    Inzwischen veröffentlicht die Geschäftsführung ein weiteres Pflichtfeld
    (Fassung 3). Eingelegt wie es `zeitfeld_speichern` täte — Definition und
    Schnappschuss —, weil der Browser des Monteurs gerade kein Netz hat und
    die Chefin hier keinen zweiten braucht.
  */
  const { data: zwei } = await admin.from('zeitfeld_fassungen').select('felder').eq('company_id', BETRIEB).eq('nummer', 2).single();
  const neu = await admin.from('zeitfeld_definitionen').insert({
    company_id: BETRIEB, name: 'Baustellenbuch', typ: 'janein', pflicht: 'beim_buchen', reihenfolge: 3,
  }).select('id, typ, regeln, gilt_staende, gilt_rollen, pflicht').single();
  expect(neu.error).toBeNull();
  const n = neu.data!;
  expect((await admin.from('zeitfeld_fassungen').insert({
    company_id: BETRIEB, nummer: 3, anlass: '„Baustellenbuch“ angelegt',
    felder: { ...(zwei!.felder as object), [n.id]: { typ: n.typ, regeln: n.regeln, staende: n.gilt_staende, rollen: n.gilt_rollen, pflicht: n.pflicht } },
  })).error).toBeNull();

  /*
    HEUTE, AM ABEND — nicht gestern: der Aufbau legt den Monteur neu an, und
    sein Eintritt ist der Tag der Anlage. Auf einer frischen Datenbank (immer
    in der CI) lag „gestern“ vor dem Eintritt, und die App wies die Buchung zu
    Recht ab. Das Fenster liegt hinter der Buchung von oben (07:00–16:00).
  */
  const tag = heuteWien();
  await page.getByLabel('Datum', { exact: true }).fill(tag);
  await page.getByLabel(/^Von/).fill('18:00');
  await page.getByLabel(/^Bis/).fill('20:00');
  await page.getByLabel(/^Kostenstelle/).selectOption({ label: 'Graz' });
  await page.getByRole('button', { name: /^Zeit buchen$/ }).click();
  await expect(page.getByText(/wird automatisch gesendet/)).toBeVisible({ timeout: 20_000 });
  expect((await admin.from('time_entries').select('id').eq('company_id', BETRIEB).eq('date', tag).eq('start_time', '18:00')).data).toEqual([]);

  await context.setOffline(false);
  await expect(async () => {
    const { data } = await admin.from('time_entries').select('id, zeitfeld_fassung').eq('company_id', BETRIEB).eq('date', tag).eq('start_time', '18:00');
    expect(data ?? []).toHaveLength(1);
    expect(data![0].zeitfeld_fassung).toBe(3);
    const { data: werte } = await admin.from('zeitbuchung_feldwerte').select('fassung').eq('eintrag_id', data![0].id);
    expect(werte).toEqual([{ fassung: 2 }]);
  }).toPass({ timeout: 90_000 });

  await page.reload();
  const liste = page.locator('#meine-eintraege');
  await expect(liste.getByText('Nachpflege: Baustellenbuch')).toBeVisible({ timeout: 20_000 });
  await expect(liste.getByText('Kostenstelle: Graz')).toBeVisible();
  await keineFehlermeldung(page);
});
