import { expect, type Locator, type Page } from '@playwright/test';
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
  /*
    UND DIE STARTRUNDE ABWARTEN (02.10.2026). Nach dem Anmelden läuft die App
    noch ihre Startrunde — Anmeldung prüfen, Startseite aufbauen. Ein
    `page.goto` mitten hinein brach WebKit mit „Frame load interrupted“ ab;
    an zwei Wegen nacheinander, deshalb hier und nicht je Prüfung. Angekommen
    ist man, wenn das Netz ruht und die Startseite ihre Überschrift zeigt.
  */
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 });
}

/**
 * Keine Fehlermeldung auf dem Bildschirm.
 *
 * Der rote Kasten ist die Stelle, an der die App sagt, dass etwas nicht
 * geklappt hat. Eine Prüfung, die nur schaut, ob ihr Knopf da ist, geht an
 * einem Bildschirm voller Fehler fröhlich vorbei.
 */
export async function keineFehlermeldung(page: Page): Promise<void> {
  /*
    ALLE TEXTE AUF EINMAL, nicht erst zählen und dann einzeln lesen: eine
    Erfolgsmeldung („gebucht“) verschwindet von selbst. Verschwand sie
    zwischen Zählen und Lesen, wartete `nth(i)` bis zum Zeitlimit auf ein
    Element, das es nicht mehr gab (10.10.2026, lokal nachgestellt).
  */
  const texte = await page.getByRole('alert').allTextContents();
  for (const text of texte) {
    expect(text, `Fehlermeldung auf dem Bildschirm: ${text}`).not.toMatch(
      /konnte nicht|fehlgeschlagen|Fehler|nicht geladen/i,
    );
  }
}

/**
 * Zu einem Menüpunkt, so wie man es auf DIESEM Gerät tut (Nachtest
 * 01.10.2026, Paket E): am Schreibtisch und auf dem Tablet über die
 * Seitenleiste, am Telefon über die Leiste unten (dort steht die Kurzform,
 * etwa „Material“) oder über „Mehr“.
 */
export async function menue(page: Page, name: string, kurz?: string): Promise<void> {
  const leiste = page.getByRole('navigation', { name: 'Hauptnavigation' }).locator('visible=true');
  await leiste.first().waitFor({ timeout: 20_000 });
  // Nicht genau: mit offenen Posten heißt der Link „…, 2 offene …“.
  const voll = leiste.getByRole('link', { name }).locator('visible=true');
  if (await voll.count()) {
    await voll.first().click();
    return;
  }
  if (kurz) {
    const tab = leiste.getByRole('link', { name: kurz }).locator('visible=true');
    if (await tab.count()) {
      await tab.first().click();
      return;
    }
  }
  await page.getByRole('button', { name: /^Mehr/ }).click();
  await page.getByRole('link', { name }).locator('visible=true').first().click();
}

/**
 * Das Zeitformular öffnen, wo es nicht schon auf der Seite steht: am Handy
 * kommt es seit C6 (E90) als Blatt über „Neuer Eintrag“. Wartet, bis eines
 * von beiden da ist — das Formular auf der Seite oder der Knopf.
 */
export async function zeitFormularOeffnen(page: Page): Promise<void> {
  const neu = page.getByRole('button', { name: 'Neuer Eintrag' });
  const feld = page.locator('#comment');
  await expect(neu.or(feld).first()).toBeVisible({ timeout: 20_000 });
  if (await neu.isVisible()) await neu.click();
  await expect(feld).toBeVisible();
}

/**
 * EIN EINTRAG IM ⋯ EINES FENSTERS ODER EINER AKTE (U4, Durchsicht 15.11.2026).
 * Fenster tragen seit U4 eine Hauptaktion und höchstens eine zweite als
 * Knopf, alles Weitere und alles Unumkehrbare steht im ⋯ (`Fensteraktionen`).
 * Öffnet das ⋯ in `im` — es muss genau eines geben — und gibt den Eintrag
 * zurück; der Klick darauf löst die Handlung aus. Das Menü hängt am Ende von
 * `body`, also außerhalb des Fensters: wer es von hier aus bedient, prüft
 * gleich mit, dass das Fenster dabei nicht zugeht.
 */
export async function imMenue(page: Page, im: Locator, eintrag: string | RegExp): Promise<Locator> {
  await im.getByRole('button', { name: /^Weitere Aktionen für / }).click();
  const menue = page.getByRole('menu');
  await expect(menue).toBeVisible();
  return menue.getByRole('menuitem', typeof eintrag === 'string' ? { name: eintrag, exact: true } : { name: eintrag });
}

/**
 * AM HANDY? Nach der Breite, wie die App selbst: Handy bis 759 px
 * (CLAUDE.md, „Breiten“). Entschieden wird nach der Regel, nicht danach,
 * was gerade zu sehen ist: so prüft der Weg mit, dass am Handy wirklich die
 * Handy-Bedienung steht — und ein Knopf, der zu spät kommt, wird nicht mit
 * „steht im ⋯“ verwechselt.
 */
export function amHandy(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < 760;
}

/**
 * EINE AKTION DES SEITENKOPFS (U1, Durchsicht 15.11.2026): ab dem Tablet ein
 * Knopf. Am Handy trägt eine Akte höchstens ihre eine Hauptaktion als Knopf
 * (die Kundenakte etwa „Bearbeiten“), alles Weitere steht im ⋯ (die
 * Baustellenakte trägt dort auch „Bearbeiten“). Gibt den Knopf bzw. den
 * Eintrag des geöffneten Menüs zurück; der Klick darauf löst die Handlung aus.
 * Gewartet wird auf das ⋯: es steht im selben Seitenkopf wie die Hauptaktion
 * und erscheint mit ihr — danach ist sicher, ob es den Knopf gibt.
 */
export async function seitenAktion(page: Page, name: string): Promise<Locator> {
  const knopf = page.locator('main').getByRole('button', { name, exact: true });
  if (!amHandy(page)) return knopf;
  const mehr = page.locator('main').getByRole('button', { name: /^Weitere Aktionen für / }).first();
  await expect(mehr).toBeVisible({ timeout: 20_000 });
  if (await knopf.locator('visible=true').count()) return knopf.locator('visible=true').first();
  await mehr.click();
  const menue = page.getByRole('menu');
  await expect(menue).toBeVisible();
  return menue.getByRole('menuitem', { name, exact: true });
}
