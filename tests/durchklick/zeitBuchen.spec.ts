import { test, expect } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * Der Weg, an dem Arbeitszeit hängt.
 *
 * Er geht durch alles, was beim Umzug neu gebaut wurde: Anmeldung über
 * Supabase Auth, Schreiben über das Ausgangsfach, Lesen über ein
 * Live-Abonnement. Bricht einer der drei, sieht der Monteur eine leere Liste
 * oder eine Zusage, die niemand hält — und merkt es am Monatsende.
 */
/*
  JEDE PRÜFUNG RÄUMT IHREN EIGENEN TISCH AB. Beim ersten Anlauf tat das keine,
  und die Folge war eine Prüfung, die grün wurde, ohne etwas zu beweisen: sie
  zählte EINE Zeile und fand die, die `rechnungStellen` hatte liegenlassen —
  ihre eigene Buchung war da noch gar nicht angekommen. Eine Prüfung, die von
  der Reihenfolge der Dateien abhängt, ist keine.
*/
test.beforeEach(async () => {
  await admin.from('time_entries').delete().eq('company_id', BETRIEB);
});

test('Ein Monteur meldet sich an und bucht seine Zeit', async ({ page }) => {
  await anmelden(page, MONTEUR.email);

  await page.getByRole('link', { name: /Zeit/ }).first().click();
  await page.getByRole('button', { name: /Zeit buchen|Neue Buchung|Buchen/ }).first().click();

  /*
    DIE BAUSTELLE IST PFLICHT, und der erste Anlauf dieser Prüfung ist genau
    daran hängengeblieben — der Browser meldete „Please select an item in the
    list", und gebucht wurde nichts. Das ist kein Umweg, sondern der Weg: ohne
    Baustelle fehlte der Einsatz später auf der Rechnung.
  */
  await page.getByLabel('Baustelle').selectOption(BAUSTELLE.nummer);
  await page.getByLabel(/^Von/).fill('07:00');
  await page.getByLabel(/^Bis/).fill('16:00');
  await page.getByLabel(/Pause/).fill('30');
  await page.getByRole('button', { name: /^(Zeit buchen|Speichern|Buchen)$/ }).click();

  // DIE ZEILE MUSS IN DER DATENBANK STEHEN, nicht nur auf dem Bildschirm.
  // Eine Ansicht, die den Eintrag örtlich anzeigt und beim Schreiben
  // scheitert, sähe sonst richtig aus — und genau das war der Fehler des
  // Ausgangsfachs.
  await expect(async () => {
    const { data } = await admin
      .from('time_entries').select('start_time, end_time, break_duration, project_number')
      .eq('company_id', BETRIEB);
    expect(data ?? []).toHaveLength(1);
    // UND ES MUSS DIE EIGENE BUCHUNG SEIN. Eine blosse Anzahl beweist nur,
    // dass irgendetwas dasteht — genau daran ist diese Prüfung schon einmal
    // vorbeigelaufen.
    const zeile = (data ?? [])[0];
    expect(zeile.start_time).toMatch(/^07:00/);
    expect(zeile.end_time).toMatch(/^16:00/);
    expect(zeile.break_duration).toBe(30);
    expect(zeile.project_number).toBe(BAUSTELLE.nummer);
  }).toPass({ timeout: 15_000 });

  await keineFehlermeldung(page);
});

/*
  Testbericht 30.09.2026, H9: Klicks und Eingaben gingen direkt nach dem Laden
  verloren. Die Anmeldung meldet sich beim Start mehrmals, und jede Meldung
  baute die ganze Seite neu auf. Diese Prüfung tippt, sobald das Feld da ist
  — vor dem Ende der Netzrunden — und sieht nach, ob der Text danach noch
  dasteht.
*/
test('Getippter Text bleibt stehen, auch wenn direkt nach dem Laden getippt wird', async ({ page }) => {
  await anmelden(page, MONTEUR.email);
  await page.goto('/time');
  const kommentar = page.locator('#comment');
  await kommentar.waitFor({ state: 'visible', timeout: 20_000 });
  await kommentar.fill('Verteiler gesetzt, Leitung gespült');

  await page.waitForLoadState('networkidle');
  // Die Anmeldung meldet sich auch beim Zurückkehren in den Tab.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(1500);

  await expect(page.locator('#comment')).toHaveValue('Verteiler gesetzt, Leitung gespült');
  await expect(page.getByText('Anmeldung wird geprüft …')).toHaveCount(0);
});
