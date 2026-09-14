import { expect, type Page } from '@playwright/test';
import { PASSWORT } from './aufbau';

/**
 * Anmelden wie ein Mensch: über die Maske, nicht über eine untergeschobene
 * Sitzung.
 *
 * WARUM NICHT ABGEKÜRZT. Ein Token in den Speicher zu legen spart zehn
 * Sekunden je Prüfung — und überspringt genau den Weg, der beim Umzug auf
 * Supabase Auth neu gebaut wurde. Was dabei bricht, bricht für jeden
 * Benutzer beim ersten Aufruf des Tages.
 */
export async function anmelden(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill(PASSWORT);
  await page.getByRole('button', { name: 'Anmelden' }).click();

  // Angekommen ist man, wenn die Anmeldemaske weg ist — nicht, wenn irgendein
  // Text erscheint. Ein `waitForTimeout` an dieser Stelle wäre der Anfang
  // einer Prüfung, die auf einem langsamen Rechner flattert.
  await expect(page.getByRole('button', { name: 'Anmelden' })).toHaveCount(0, {
    timeout: 20_000,
  });
}

/**
 * Keine Fehlermeldung auf dem Bildschirm.
 *
 * Der rote Kasten ist die Stelle, an der die App sagt, dass etwas nicht
 * geklappt hat. Eine Prüfung, die nur schaut, ob ihr Knopf da ist, geht an
 * einem Bildschirm voller Fehler fröhlich vorbei.
 */
export async function keineFehlermeldung(page: Page): Promise<void> {
  const meldungen = page.getByRole('alert');
  const anzahl = await meldungen.count();
  for (let i = 0; i < anzahl; i += 1) {
    const text = (await meldungen.nth(i).textContent()) ?? '';
    expect(text, `Fehlermeldung auf dem Bildschirm: ${text}`).not.toMatch(
      /konnte nicht|fehlgeschlagen|Fehler|nicht geladen/i,
    );
  }
}
