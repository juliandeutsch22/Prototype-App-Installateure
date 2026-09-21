import { test, expect } from '@playwright/test';
import { admin, BETRIEB, PASSWORT } from './aufbau';

/**
 * Der Weg, an dem ALLE anderen hängen: der allererste Besuch.
 *
 * WARUM ES DIESEN WEG GIBT. Bis zum 20.09.2026 fehlte in dieser App jede
 * Stelle, an der jemand sein Passwort setzt. Der Rücksetzlink — dieselbe
 * Adresse, die der erste Administrator eines neuen Betriebs bekommt und die
 * in jeder Willkommensmail an einen Mitarbeiter steht — meldete den
 * Empfänger an und liess ihn stehen. Er war drin, kannte aber kein Passwort;
 * das zufällige aus der Edge Function kennt niemand. Beim nächsten Start
 * hatte er nichts einzutippen.
 *
 * KEINE PRÜFUNG HAT DAS GESEHEN, und der Grund ist lehrreich: alle anderen
 * melden sich mit einem Passwort an, das der Aufbau selbst gesetzt hat, und
 * keine meldet sich ZWEIMAL an. Gefunden hat es der Probelauf eines echten
 * Betriebs. Dieser Weg hält die Lücke zu.
 *
 * ER GEHT DURCH DEN ECHTEN LINK, nicht an ihm vorbei: erzeugt wird er so,
 * wie ihn `betrieb-anlegen` und `provisionUser` erzeugen.
 */

/** Ein frisches Konto, das noch nie ein Passwort gesehen hat. */
async function neuling(): Promise<string> {
  const email = `neuling-${crypto.randomUUID().slice(0, 8)}@durchklick.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    // Genau wie die Edge Function: ein Zufallspasswort, das niemand erfährt.
    // Ohne Passwort-Anbieter liesse sich gar kein Rücksetzlink erzeugen.
    password: `${crypto.randomUUID()}-Aa1!`,
    email_confirm: true,
    app_metadata: { company_id: BETRIEB, role: 'Mitarbeiter', active: true },
  });
  if (error) throw error;
  const { error: fehler } = await admin.from('users').upsert({
    id: data.user!.id, company_id: BETRIEB, name: 'Nora Neuling',
    email, role: 'Mitarbeiter', active: true,
  });
  if (fehler) throw new Error(fehler.message);
  return email;
}

test('Wer über den Link kommt, vergibt ein Passwort — und kommt damit wieder herein', async ({
  page, baseURL,
}) => {
  const email = await neuling();

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: baseURL! },
  });
  if (error) throw error;

  await page.goto(data.properties!.action_link);

  /*
    ZUERST DIE MASKE, NICHT DIE APP. Stünde hier schon die Navigation, wäre
    genau der alte Zustand wieder da: angemeldet, ohne je nach einem Passwort
    gefragt worden zu sein.
  */
  await expect(page.getByRole('heading', { name: 'Willkommen' })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('nav')).toHaveCount(0);

  const knopf = page.getByRole('button', { name: 'Passwort vergeben', exact: true });

  // Ein vertipptes Passwort fiele sonst erst beim nächsten Start auf — und
  // dann hilft nur noch ein neuer Link.
  await page.getByLabel('Neues Passwort').fill(PASSWORT);
  await page.getByLabel('Noch einmal').fill(`${PASSWORT}x`);
  await expect(knopf).toBeDisabled();

  await page.getByLabel('Noch einmal').fill(PASSWORT);
  await knopf.click();

  // Nach dem Vergeben geht es weiter in die App — ohne zweite Anmeldung.
  await expect(page.getByRole('navigation').or(page.locator('nav')).first())
    .toBeVisible({ timeout: 20_000 });

  /*
    DER EIGENTLICHE BEWEIS steht hinter dem Abmelden. Dass die Maske
    erscheint, sagt noch nichts; dass das Passwort danach TRÄGT, ist die
    Frage, an der der alte Stand gescheitert ist.
  */
  await page.getByRole('button', { name: /Abmelden/ }).first().click();
  await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible({ timeout: 20_000 });

  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill(PASSWORT);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('button', { name: 'Anmelden' })).toHaveCount(0, { timeout: 20_000 });

  /*
    UND ES BLEIBT ÄNDERBAR. „Mein Konto" ist die einzige Unterseite der
    Einstellungen, die jede Rolle sieht — ein Monteur kommt an „Sätze und
    Kosten" gar nicht heran.
  */
  await page.goto('/settings/meldungen');
  await expect(page.getByRole('heading', { name: 'Passwort ändern' })).toBeVisible({
    timeout: 20_000,
  });
});
