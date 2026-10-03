import { test, expect } from '@playwright/test';
import { MONTEUR } from './aufbau';
import { anmelden } from './helfer';

/*
  KEIN FOKUSRAHMEN UM DEN GANZEN INHALT (gemeldet am 03.10.2026, iPhone).

  Nach einem Seitenwechsel bekommt `<main id="inhalt">` den Fokus, damit
  Tastatur und Vorlesehilfe am neuen Inhalt weitermachen. Die allgemeine
  Regel `:focus-visible` zeichnete darum einen gerundeten Rahmen in Petrol.
  Oben verschwand er in der Kopfleiste, seitlich ausserhalb des Bildschirms;
  sichtbar blieben nur die zwei Ecken über der weissen Fuge. Safari wertet
  den Fokus per Skript öfter als „sichtbar“ als Chromium. Hier wird er über
  die Tastatur ausgelöst, dann gilt er auch in Chromium als sichtbar. Im
  WebKit-Telefon läuft dieselbe Prüfung mit, weil der Fehler dort auftrat.
*/
test('Der Inhalt bekommt nach dem Seitenwechsel den Fokus, aber keinen Rahmen', async ({ page }, info) => {
  await anmelden(page, MONTEUR.email);

  const reiter = page.getByRole('link', { name: /Zeit/ }).first();
  await reiter.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/time/);

  const inhalt = page.locator('main#inhalt');
  await expect(inhalt).toBeFocused();
  const stand = await inhalt.evaluate((el) => {
    const s = getComputedStyle(el);
    return { sichtbar: el.matches(':focus-visible'), stil: s.outlineStyle, breite: s.outlineWidth };
  });
  // Gegenprobe zur Prüfung selbst: in Chromium gilt der Fokus nach der
  // Tastatur sicher als sichtbar. WebKit entscheidet das nach eigener Regel.
  if (info.project.name !== 'webkit-telefon') expect(stand.sichtbar).toBe(true);
  expect(stand.stil).toBe('none');
});
