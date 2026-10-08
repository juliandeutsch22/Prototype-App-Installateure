/**
 * Jeder Link führt dorthin, wo die Rolle hin darf (offene Punkte C1).
 *
 * Im Prüflauf vom 25.09.2026 zeigten drei Links auf „Kein Zugriff" — ein
 * Knopf, den die App anbietet, und eine Seite, die dieselbe App verweigert.
 * Kein Test hat das gesehen, weil jeder nur seine eigene Ansicht kannte.
 *
 * WIE: je Rolle durch die Vorschau (echte Ansichten, Beispieldaten), von
 * den Menüpunkten der Rolle aus jedem erlaubten Link nach. Auf jeder Seite
 * wird alles aufgeklappt und jeder Link gegen `darfZiel` gehalten —
 * dieselbe Frage, die Menü und Wächter stellen. Akten zählen je Art einmal
 * (`/customers/k1` steht für jede Kundenakte).
 *
 * WAS NICHT GEPRÜFT WIRD: Knöpfe, die erst beim Klick mit `navigate()`
 * weiterleiten. Ihr Ziel steht nicht im Dokument, und sie alle zu drücken
 * hiesse, Dialoge zu öffnen und Daten zu schreiben. Links (`<Link>`, `<a>`)
 * sind der weitaus grösste Teil — auch die drei Fälle aus dem Prüflauf.
 */
import { test, expect, type Page } from '@playwright/test';
import type { Role } from '@/types';
import { NAV } from '@/app/navigation';
import { firma } from '../../tools/vorschau/daten';
import { darfZiel, pfadVon } from './linkziel';
import { SCHREIBWEISE } from './schreibweise';

const ROLLEN: Role[] = [
  'Mitarbeiter', 'Verwaltung', 'Buchhaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator',
];

/** Genug für jede Rolle; bricht ein Kreislauf aus, fällt es hier auf und nicht als Zeitüberschreitung. */
const HOECHSTENS = 90;

const AKTEN = ['/customers/', '/admin-projects/', '/quotes/', '/user-mgmt/'];


/** Unter welchem Muster ein Pfad als „schon besucht" gilt. */
function muster(pfad: string): string {
  const akte = AKTEN.find((a) => pfad.startsWith(a));
  return akte ? `${akte}:id` : pfad;
}

async function aufklappen(seite: Page): Promise<void> {
  await seite.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
  for (const k of (await seite.locator('main button[aria-expanded="false"]').all()).slice(0, 12)) {
    try { await k.click({ timeout: 1500 }); } catch { /* nicht jeder ist klickbar */ }
  }
  await seite.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
}

for (const rolle of ROLLEN) {
  test(`Links für ${rolle}`, async ({ page }) => {
    const module = firma.modules as Record<string, boolean>;
    const start = [...NAV.map((i) => i.path), '/worksheet'].filter((p) => darfZiel(rolle, p, module).ok);
    const offen = [...start];
    const gesehen = new Set(start.map(muster));
    const befunde: string[] = [];
    let besucht = 0;

    while (offen.length > 0) {
      const ziel = offen.shift()!;
      besucht += 1;
      expect(besucht, 'mehr Seiten als erwartet — läuft die Suche im Kreis?').toBeLessThanOrEqual(HOECHSTENS);

      await page.goto(`./?pfad=${encodeURIComponent(ziel)}&rolle=${encodeURIComponent(rolle)}`, {
        waitUntil: 'networkidle',
      });
      await page.locator('main').waitFor();

      // Gegenprobe der Suche selbst: eine Seite, die die Regel erlaubt, darf
      // nicht „Kein Zugriff" sagen — sonst stimmten Regel und App nicht überein.
      if (await page.getByRole('heading', { name: 'Kein Zugriff' }).count()) {
        befunde.push(`${ziel}: die Regel erlaubt die Seite, die App zeigt „Kein Zugriff"`);
        continue;
      }

      await aufklappen(page);

      /*
        SCHREIBWEISE IM SICHTBAREN (Testbericht 30.09.2026, G1): TT.MM.JJJJ
        statt ISO-Datum, Dezimalkomma bei Mengen und Stunden, kein doppelter
        Punkt nach einem Datum („Di., 29.09..“). Geprüft am gerenderten Text
        jeder Seite — die Quelle eines solchen Satzes ist oft eine
        zusammengesetzte Zeichenkette, die keine Quelltextsuche findet.
        Dateinamen (`…_2026-09-01_…`) sind Daten des Betriebs und zählen nicht.
      */
      const text = await page.locator('main').innerText();
      for (const [regel, muster] of SCHREIBWEISE) {
        const treffer = text.match(muster);
        if (treffer) befunde.push(`${ziel}: ${regel} „${treffer[0]}“`);
      }

      const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href') ?? ''));
      for (const href of new Set(hrefs)) {
        const urteil = darfZiel(rolle, href, module);
        if (!urteil.ok) {
          befunde.push(`${ziel}: Link auf ${href} — ${urteil.grund}`);
          continue;
        }
        const p = pfadVon(href);
        if (p.startsWith('/') && !gesehen.has(muster(p))) {
          gesehen.add(muster(p));
          offen.push(href);
        }
      }
    }

    expect(befunde).toEqual([]);
    // Die Suche hat wirklich gesucht: mindestens die Menüpunkte der Rolle.
    expect(besucht).toBeGreaterThanOrEqual(start.length);
  });
}

/*
  DAS ANLEGEFORMULAR (Runde 3, G1): Der Vorschlag „Vorschlag für …: … Tage“
  steht erst, wenn das Formular offen und „Tritt neu ein“ gewählt ist — die
  Suche oben öffnet keine Formulare und hat ihn darum nie gesehen. Gesehen
  wurde „Vorschlag für 2026-10-06: 5.96 Tage“.
*/
test('Schreibweise im Anlegeformular „Tritt neu ein“', async ({ page }) => {
  await page.goto(`./?pfad=${encodeURIComponent('/user-mgmt')}&rolle=Administrator`, {
    waitUntil: 'networkidle',
  });
  await page.getByRole('button', { name: 'Benutzer anlegen' }).click();
  await page.getByLabel(/Tritt neu ein/).check();
  await page.getByRole('button', { name: /Zeitkonto-Einstellungen anzeigen/ }).click();

  const satz = page.getByText(/^Vorschlag für/);
  await expect(satz).toBeVisible();
  const befunde: string[] = [];
  const text = await page.locator('main').innerText();
  for (const [regel, muster] of SCHREIBWEISE) {
    const treffer = text.match(muster);
    if (treffer) befunde.push(`${regel} „${treffer[0]}“`);
  }
  // Auch die Zahl im Feld: sie ist kein Text der Seite, steht aber vor dem Betrieb.
  const feld = await page.getByLabel(/Urlaub im ersten Jahr/).inputValue();
  if (/\d\.\d/.test(feld)) befunde.push(`Feld „Urlaub im ersten Jahr“ mit Punkt: ${feld}`);
  expect(befunde).toEqual([]);
  expect(await satz.innerText()).toMatch(/^Vorschlag für \d{2}\.\d{2}\.\d{4}: \d+(,\d+)? Tage/);
});
