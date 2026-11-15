import { test, expect } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, MONTEUR } from './aufbau';
import { anmelden, zeitFormularOeffnen } from './helfer';

/**
 * Z4 (Durchsicht 15.11.2026): DIE ABGELEHNTE VORGEMERKTE BUCHUNG BLEIBT.
 *
 * Der Fall aus der Analyse: im Keller, ohne Netz, 11:00–16:00 gebucht, wo
 * schon 07:00–12:00 steht. Bisher: „ohne Verbindung gespeichert“, später eine
 * Meldung ohne Tag — und fünf Stunden fehlten. Jetzt steht die Buchung
 * zuerst als „wartet auf Verbindung“ in „Meine Einträge“, nach der Ablehnung
 * als Entwurf mit Grund, und die Zeile öffnet sie wieder im Formular.
 *
 * Gegenprobe: ohne Z4 fehlt die Zeile „wartet auf Verbindung“ (Schritt 2),
 * und nach der Ablehnung ist die Eingabe weg (Schritt 3).
 */
const heute = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date());

test.beforeEach(async () => {
  await admin.from('time_entries').delete().eq('company_id', BETRIEB);
});

test('ohne Netz gebucht, vom Server abgelehnt: Entwurf mit Tag und Grund', async ({ page, context }) => {
  test.setTimeout(120_000);
  const { data: person } = await admin.from('users').select('id').eq('company_id', BETRIEB).eq('email', MONTEUR.email).single();

  await anmelden(page, MONTEUR.email);
  await page.goto('/time');
  await zeitFormularOeffnen(page);
  // Die Baustellen kommen mit Netz; danach geht es in den Keller.
  await expect(page.getByLabel('Baustelle').locator(`option[value="${BAUSTELLE.nummer}"]`)).toHaveCount(1, { timeout: 15_000 });
  await context.setOffline(true);

  /*
    DIE ERSTE BUCHUNG KENNT NUR DER SERVER: angelegt, während das Gerät
    schon offline ist (etwa vom Kollegen am Tablet nachgetragen). Stünde sie
    vorher in der Liste, erkennte die App die Überschneidung selbst und
    sperrte „Zeit buchen“ — dann gäbe es nichts, was der Server ablehnt.
  */
  const { error } = await admin.from('time_entries').insert({
    id: crypto.randomUUID(), company_id: BETRIEB, user_id: person!.id, user_name: MONTEUR.name, date: heute,
    status: 'Anwesend', start_time: '07:00', end_time: '12:00', break_duration: 0, project_number: BAUSTELLE.nummer,
  });
  expect(error).toBeNull();

  // 1. Ohne Netz buchen: vorgemerkt.
  await page.getByLabel('Baustelle').selectOption(BAUSTELLE.nummer);
  await page.getByLabel(/^Von/).fill('11:00');
  await page.getByLabel(/^Bis/).fill('16:00');
  await page.getByLabel(/Pause/).fill('0');
  await page.getByRole('button', { name: /^(Zeit buchen|Speichern|Buchen)$/ }).click();
  await expect(page.getByText(/ohne Verbindung gespeichert/)).toBeVisible({ timeout: 15_000 });

  // 2. Sie steht in „Meine Einträge“ — als wartend.
  const liste = page.locator('#meine-eintraege');
  await expect(liste.getByText('wartet auf Verbindung')).toBeVisible({ timeout: 10_000 });

  // 3. Netz zurück: der Server lehnt ab (Überschneidung). Die Buchung wird zum Entwurf mit Grund.
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByRole('alert').filter({ hasText: /Zeitbuchung vom .* wurde nicht angenommen/ })).toBeVisible({ timeout: 30_000 });
  await expect(liste.getByText(/^Nicht angenommen: /)).toBeVisible();
  await expect(liste.getByText('wartet auf Verbindung')).toHaveCount(0);

  // 4. Die Zeile öffnet den Entwurf im Formular — mit der Eingabe von vorhin.
  await liste.getByRole('button', { name: /11:00–16:00 – Entwurf öffnen/ }).click();
  await expect(page.getByLabel(/^Von/)).toHaveValue('11:00');
  await expect(page.getByLabel(/^Bis/)).toHaveValue('16:00');

  // Und in der Datenbank steht weiter nur die erste Buchung.
  const { data } = await admin.from('time_entries').select('start_time').eq('company_id', BETRIEB);
  expect((data ?? []).map((z) => z.start_time)).toEqual(['07:00:00']);
});
