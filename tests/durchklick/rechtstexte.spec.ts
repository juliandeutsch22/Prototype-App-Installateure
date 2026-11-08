import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';
import { admin, BETRIEB, CHEFIN, MONTEUR, PASSWORT } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';
import { totp } from '../totp';

/**
 * RECHTSTEXTE IM GLOBALEN ADMIN (Auftrag 04.11.2026, E45) — der ganze Weg im
 * echten Browser gegen die echte Datenbank:
 *
 * 1. Die Plattform trägt die Betreiberangaben ein, ergänzt das Impressum um
 *    einen Abschnitt und setzt einen neuen Unterauftragsverarbeiter in die
 *    Datenschutzerklärung — jeweils als Entwurf, dann veröffentlicht. Ein
 *    vertippter Platzhalter hält das Veröffentlichen auf.
 * 2. Die öffentlichen Seiten zeigen, ohne Anmeldung, sofort die neuen
 *    Fassungen: Angaben eingesetzt, Fettdruck und Verweis gesetzt, kein
 *    Markup durchgereicht, „Entwurf“, solange Angaben offen sind.
 * 3. Die Geschäftsführung des Betriebs sieht den neuen
 *    Unterauftragsverarbeiter und nimmt ihn zur Kenntnis; ein Monteur sieht
 *    „Die Datenschutzerklärung wurde … geändert“ und blendet es aus.
 *
 * Danach wird zurückgeräumt — an der Datenbank vorbei, denn über die App
 * lässt sich eine veröffentlichte Fassung absichtlich nicht löschen.
 */

const EMAIL = 'rechtstexte-plattform@durchklick.test';
const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
let faktor = '';
test.use({ actionTimeout: 20_000 });

async function zuruecksetzen() {
  const db = new Client({ connectionString: DB });
  await db.connect();
  try {
    await db.query('begin');
    // Der Auslöser hält veröffentlichte Fassungen fest; nur hier, im Test, geht es an ihm vorbei.
    await db.query('set local session_replication_role = replica');
    await db.query('delete from public.rechtstexte where nummer is null or nummer > 1');
    await db.query('update public.companies set verarbeiter_kenntnis_am = null where id = $1', [BETRIEB]);
    await db.query('commit');
  } finally {
    await db.end();
  }
}

async function plattformAnmelden(page: Page) {
  await page.goto('/');
  await page.getByLabel('E-Mail oder Benutzername', { exact: true }).fill(EMAIL);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORT);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Zwei-Faktor-Anmeldung', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Einrichtung beginnen' }).click();
  faktor = ((await page.locator('span.font-mono').first().textContent()) ?? '').trim();
  await page.getByLabel('Code aus der App').fill(totp(faktor));
  await page.getByRole('button', { name: 'Bestätigen', exact: true }).click();
  await page.getByRole('button', { name: 'Codes notiert — weiter' }).click();
  await expect(page.getByRole('heading', { name: 'Betriebe', exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('navigation', { name: 'Bereiche der Plattform' }).getByRole('button', { name: 'Rechtstexte' }).click();
  await expect(page.getByRole('heading', { name: 'Rechtstexte', level: 1 })).toBeVisible();
}

async function veroeffentlichen(page: Page, name: string, nummer: number) {
  await page.getByRole('button', { name: 'Veröffentlichen …' }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'veröffentlichen' });
  await expect(dialog).toContainText(`Wird Fassung ${nummer}.`);
  await dialog.getByRole('button', { name: 'Veröffentlichen', exact: true }).click();
  await expect(page.getByText(`${name}: Fassung ${nummer} gilt`)).toBeVisible();
}

test.beforeAll(async () => {
  await zuruecksetzen();
  const alt = (await admin.auth.admin.listUsers({ perPage: 1000 })).data.users.find((u) => u.email === EMAIL);
  if (alt) await admin.auth.admin.deleteUser(alt.id);
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORT, email_confirm: true });
  if (error) throw error;
  const { error: fehler } = await admin.from('platform_admins').upsert({ id: data.user!.id, name: 'Rechtstexte Plattform' });
  if (fehler) throw fehler;
});
test.afterAll(zuruecksetzen);

test('Die Plattform pflegt die Rechtstexte, die Seiten zeigen sie, Betrieb und Belegschaft erfahren davon', async ({ page, browser }) => {
  test.setTimeout(240_000);
  await plattformAnmelden(page);
  const zurueck = () => page.getByRole('button', { name: '← Rechtstexte' }).click();

  // ── 1a. Betreiberangaben ──────────────────────────────────────────────
  await page.getByRole('button', { name: /Angaben zum Betreiber/ }).click();
  await page.getByLabel(/^Name bzw\. Firma/).fill('Senklot Prüf GmbH');
  await page.getByLabel(/^Anschrift/).fill('Lotgasse 1\n1010 Wien');
  await page.getByLabel(/^E-Mail-Adresse/).fill('office@senklot.test');
  await page.getByRole('button', { name: 'Entwurf speichern' }).click();
  await expect(page.getByText('Entwurf gespeichert')).toBeVisible();
  await veroeffentlichen(page, 'Angaben zum Betreiber', 2);
  await zurueck();

  // ── 1b. Impressum: ein vertippter Platzhalter hält auf, dann ein neuer Abschnitt ──
  await page.getByRole('button', { name: /^Impressum/ }).click();
  await page.getByRole('button', { name: 'Abschnitt hinzufügen' }).click();
  await page.getByLabel('Überschrift 5').fill('Prüfabschnitt');
  await page.getByLabel('Text 5').fill('Kontakt: {Nmae}');
  await expect(page.getByText('{Nmae} ist kein bekannter Platzhalter')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Veröffentlichen …' })).toBeDisabled();
  await page.getByLabel('Text 5').fill('Kontakt: {Name}, **fett gesetzt** und [ein Verweis](https://www.ris.bka.gv.at). <script>x</script>');
  await page.getByRole('button', { name: 'Vorschau' }).click();
  const vorschau = page.getByRole('dialog', { name: /Impressum/ });
  await expect(vorschau.getByText('Kontakt: Senklot Prüf GmbH,')).toBeVisible();
  await page.keyboard.press('Escape');
  await veroeffentlichen(page, 'Impressum', 2);
  await zurueck();

  // ── 1c. Datenschutzerklärung: ein neuer Unterauftragsverarbeiter, Hinweis an alle ──
  await page.getByRole('button', { name: /^Datenschutzerklärung/ }).click();
  await page.getByRole('button', { name: 'Unterauftragsverarbeiter hinzufügen' }).click();
  await page.getByLabel('Anbieter 6').fill('Prüfpost GmbH');
  await page.getByLabel('Zweck').last().fill('Versand der Anmeldemails');
  await page.getByLabel('Standort').last().fill('Wien, Österreich');
  await page.getByRole('button', { name: 'Veröffentlichen …' }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'veröffentlichen' });
  await expect(dialog).toContainText('Neue Unterauftragsverarbeiter: Prüfpost GmbH.');
  await expect(dialog.getByLabel('Rechtlich geprüft und freigegeben')).toBeDisabled();
  await expect(dialog.getByLabel('Alle, die die App benutzen, auf die Änderung hinweisen')).toBeChecked();
  await dialog.getByRole('button', { name: 'Veröffentlichen', exact: true }).click();
  await expect(page.getByText('Datenschutzerklärung: Fassung 2 gilt')).toBeVisible();
  await keineFehlermeldung(page);

  // ── 2. Die öffentlichen Seiten, ohne Anmeldung ──────────────────────────
  const fremd = await browser.newPage();
  await fremd.goto('/impressum');
  const blatt = fremd.locator('.recht');
  await expect(blatt.getByText('Senklot Prüf GmbH').first()).toBeVisible();
  expect(await blatt.locator('p', { hasText: 'Lotgasse 1' }).first().innerHTML()).toContain('Lotgasse 1<br>1010 Wien');
  await expect(blatt.getByRole('heading', { name: 'Prüfabschnitt' })).toBeVisible();
  await expect(blatt.locator('strong', { hasText: 'fett gesetzt' })).toBeVisible();
  await expect(blatt.getByRole('link', { name: 'ein Verweis' })).toHaveAttribute('href', 'https://www.ris.bka.gv.at');
  // Was wie Markup aussieht, steht als Text da — es wird nie ausgeführt.
  await expect(blatt.getByText('<script>x</script>', { exact: false })).toBeVisible();
  expect(await fremd.locator('.recht script').count()).toBe(0);
  // Der Tag in Wien, wie ihn die Seite schreibt — nicht der des Testrechners (zwischen 23 und 24 Uhr UTC liegen sie auseinander).
  const heute = new Date().toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Vienna' });
  await expect(fremd.getByText(`Stand: ${heute}`)).toBeVisible();
  // Telefon, UID, Firmenbuch und Gewerbe fehlen noch: das Band bleibt.
  await expect(fremd.getByRole('note')).toContainText('Entwurf');
  await expect(blatt.getByText('[Telefonnummer — wird ergänzt]')).toBeVisible();

  await fremd.goto('/datenschutz');
  await expect(fremd.locator('.recht-liste').getByText('Prüfpost GmbH')).toBeVisible();
  await expect(fremd.locator('.recht').getByText('Senklot Prüf GmbH, Lotgasse 1, 1010 Wien, office@senklot.test.')).toBeVisible();
  await fremd.close();

  // ── 3a. Die Geschäftsführung nimmt den neuen Unterauftragsverarbeiter zur Kenntnis ──
  const chefin = await browser.newPage();
  await anmelden(chefin, CHEFIN.email);
  const hinweis = chefin.locator('.rechtshinweis');
  await expect(hinweis).toContainText('Neue Unterauftragsverarbeiter bei Senklot');
  await expect(hinweis).toContainText('Prüfpost GmbH');
  await expect(hinweis).toContainText('office@senklot.test');
  await hinweis.getByRole('button', { name: 'Zur Kenntnis genommen' }).click();
  await expect(hinweis).toHaveCount(0);
  const { data: betrieb } = await admin.from('companies').select('verarbeiter_kenntnis_am').eq('id', BETRIEB).single();
  expect(betrieb!.verarbeiter_kenntnis_am).not.toBeNull();
  await chefin.reload();
  await expect(chefin.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(chefin.locator('.rechtshinweis')).toHaveCount(0);
  await chefin.close();

  // ── 3b. Ein Monteur sieht die geänderte Erklärung einmal ──────────────────
  const monteur = await browser.newPage();
  await anmelden(monteur, MONTEUR.email);
  const zeile = monteur.locator('.rechtshinweis');
  await expect(zeile).toContainText(`Die Datenschutzerklärung wurde am ${heute} geändert.`);
  await expect(zeile).not.toContainText('Unterauftragsverarbeiter');
  await zeile.getByRole('button', { name: 'Ausblenden' }).click();
  await expect(zeile).toHaveCount(0);
  await monteur.reload();
  await expect(monteur.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(monteur.locator('.rechtshinweis')).toHaveCount(0);
  await monteur.close();
});
