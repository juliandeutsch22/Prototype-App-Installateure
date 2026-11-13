import { test, expect, type Page } from '@playwright/test';
import { CHEFIN, MONTEUR } from './aufbau';
import { anmelden } from './helfer';

/*
  KANTEN UND ABSCHLÜSSE DER BLÄTTER (E76, 10.11.2026). Gemeldet mit
  Bildschirmfotos: „mitfliegender Button … hat links keine Border“, „Für wen
  klebt fast am Rand“, „die Kalender haben unten eine Lücke, keinen schönen
  Abschluss“, „Termin anlegen“ als Wortknopf. Gemessen wird, was man sieht:
  wo die Leiste beginnt, wie weit der Text vom Rand steht, ob der Kalender
  ohne angehängten Streifen auf dem Raster endet.

  Gegenprobe: mit dem Stand vor E76 ist jede dieser Prüfungen rot.
*/
const BLATT = ".inhalt .karte:not(.karte .karte):not(:is(.fenster, .fenster-breit, .blatt, [role='dialog'], .akten-kontext, .beleg-kontext) .karte)";

async function handy(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
}

/*
  SEIT C6 (E90) steht das Formular am Handy im Blatt von unten; auf der
  Seite — und mit ihm die mitfliegende Leiste — erst ab dem Tablet.
  Gemessen wird deshalb an dessen schmalster Breite.
*/
test('Die mitfliegende Leiste der Zeiterfassung lässt die linke Linie des Blatts frei', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 900 });
  await anmelden(page, MONTEUR.email);
  await page.goto('/time');
  const leiste = page.locator('.zeit-formularkarte .aktionsleiste');
  await expect(leiste).toBeVisible();
  // Erst nach dem Rollen ins Formular klebt sie (G22) — dann liegt sie über der Linie.
  await page.evaluate(() => {
    const f = document.querySelector('.zeit-formularkarte form')!;
    window.scrollTo(0, f.getBoundingClientRect().top + window.scrollY - 120);
  });
  await expect(leiste).not.toHaveClass(/aktionsleiste-frei/);
  const m = await leiste.evaluate((l) => {
    const b = l.closest('.karte')!.getBoundingClientRect(), r = l.getBoundingClientRect();
    return { links: r.left - b.left, rechts: b.right - r.right, pos: getComputedStyle(l).position, knopf: l.querySelector('button')!.getBoundingClientRect().left - b.left };
  });
  expect(m.pos).toBe('sticky');
  // Die Knöpfe auf dem Polster des Blatts: ab dem Tablet 24 px (am Handy waren es 16, E86).
  expect(m).toMatchObject({ links: 1, rechts: 0, knopf: 24 });
});

test('Frei auf der Seite ist die Leiste so breit wie die Spalte (Firmendaten)', async ({ page }) => {
  await handy(page);
  await anmelden(page, CHEFIN.email);
  await page.goto('/settings/firma');
  const leiste = page.locator('.aktionsleiste');
  await expect(leiste).toBeVisible();
  const m = await leiste.evaluate((l, sel) => {
    const alle = [...document.querySelectorAll(sel)];
    const blatt = alle[alle.length - 1].getBoundingClientRect(), r = l.getBoundingClientRect();
    const knopf = l.querySelector('button[type=submit]')!;
    return { links: r.left - blatt.left, rechts: r.right - blatt.right, linie: getComputedStyle(l).boxShadow.includes('inset'), passt: knopf.scrollWidth <= knopf.clientWidth };
  }, BLATT);
  expect(m).toEqual({ links: 0, rechts: 0, linie: true, passt: true });
});

test('Der Monatskalender am Handy: eine Zelle Luft rundum, unten ohne angehängten Streifen', async ({ page }) => {
  await handy(page);
  await anmelden(page, CHEFIN.email);
  await page.goto('/assignments/woche');
  await page.getByRole('button', { name: 'Monat', exact: true }).first().click();
  const huelle = page.locator('.kal-huelle');
  await expect(huelle.getByRole('group', { name: /^Monat/ })).toBeVisible();
  const m = await huelle.evaluate((h) => {
    const karte = h.closest<HTMLElement>('.karte')!, k = karte.getBoundingClientRect();
    const label = h.querySelector('label')!.getBoundingClientRect();
    const zellen = [...h.querySelectorAll('.kal-raster > *')].map((z) => z.getBoundingClientRect());
    const unten = Math.max(...zellen.map((z) => z.bottom));
    return { oben: Math.round(label.top - k.top), links: Math.round(label.left - k.left), unten: Math.round(k.bottom - unten), takt: karte.dataset.taktUnten, hoehe: Math.round(k.height) % 24 };
  });
  expect(m).toEqual({ oben: 24, links: 24, unten: 24, takt: '0', hoehe: 0 });
});

test('Der Kalender der Tagesplanung endet mit der letzten Woche an der Kante', async ({ page }) => {
  await anmelden(page, CHEFIN.email);
  await page.goto('/assignments/tag');
  const kalender = page.locator('.monatskalender');
  await expect(kalender.getByRole('button', { name: 'Nächster Monat' })).toBeVisible();
  const m = await kalender.evaluate((k) => {
    const r = k.getBoundingClientRect();
    const tage = [...k.querySelectorAll('.grid.grid-cols-7:last-child > *')].map((z) => z.getBoundingClientRect());
    return { takt: (k as HTMLElement).dataset.taktUnten, luecke: Math.round(r.bottom - Math.max(...tage.map((z) => z.bottom))), woche: Math.round(tage[0].height) };
  });
  expect(m).toEqual({ takt: '0', luecke: 0, woche: 72 });
});

test('„Termin anlegen“ ist der Petrol-Kreis neben dem Titel der Karte, auch am Handy', async ({ page }) => {
  await handy(page);
  await anmelden(page, CHEFIN.email);
  await page.goto('/assignments/tag');
  const kopf = page.locator('.karte-kopf').filter({ has: page.getByRole('heading', { name: /^Termine am/ }) });
  const plus = kopf.getByRole('button', { name: 'Termin anlegen' });
  await expect(plus).toHaveClass(/symbol-rund/);
  const m = await kopf.evaluate((k) => {
    const t = k.querySelector('h2')!.getBoundingClientRect(), p = k.querySelector('.symbol-rund')!.getBoundingClientRect();
    const s = getComputedStyle(k.querySelector('.symbol-rund')!);
    return { nebenDemTitel: p.left > t.right && p.top < t.bottom, tastflaeche: Math.round(p.width), kreis: Math.round(p.width - 2 * parseFloat(s.paddingLeft)), clip: s.backgroundClip };
  });
  // Sichtbar 40 px, getippt 48 px (E76: „etwas kleiner“).
  expect(m).toEqual({ nebenDemTitel: true, tastflaeche: 48, kreis: 40, clip: 'content-box' });
  // Beim Darüberfahren bleibt er so groß (11.11.2026: „die runden Icons werden beim Hover größer“).
  await plus.hover();
  await expect(plus).toHaveCSS('background-color', await plus.evaluate(() => {
    const p = document.createElement('i'); p.style.color = 'var(--petrol-tief)'; document.body.append(p);
    const f = getComputedStyle(p).color; p.remove(); return f;
  }));
  await expect(plus).toHaveCSS('background-clip', 'content-box');
});
