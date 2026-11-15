import { test, expect } from '@playwright/test';
import { admin, ARTIKEL, BAUSTELLE, BETRIEB, CHEFIN, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * DAS OFFENE EINSATZFORMULAR UND FREMDE ÄNDERUNGEN (Durchsicht 15.11.2026, P1)
 * — im echten Browser, mit einer zweiten Sitzung, die schreibt
 * (Dienstschlüssel, wie in `liveAktualisierung.spec.ts`):
 *
 *   1. Die Chefin stellt in „Tag planen“ Max und eine Aufgabe zusammen. Für
 *      einen ANDEREN Tag derselben Baustelle wird inzwischen geplant, samt
 *      Rüstliste. Die Eingabe bleibt stehen, es erscheint kein Hinweis.
 *      (Vorher setzte genau diese Meldung das Formular zurück.)
 *   2. Für DIESES Paar aus Tag und Baustelle plant jemand anderes. Die
 *      Eingabe bleibt, „Inzwischen geändert — übernehmen?“ steht da, das
 *      Speichern wartet; „Übernehmen“ holt den neuen Stand.
 *   3. Das eigene Speichern meldet sich live zurück — ohne Hinweis, und was
 *      danach schon weitergetippt ist, bleibt stehen.
 */
const heute = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
// Im selben Monat: „Tag planen“ hält den ganzen Monat live, der Kalender zeigt den Tag als geplant.
const andererTag = () => `${heute().slice(0, 8)}${heute().slice(8) === '15' ? '16' : '15'}`;
const kalenderName = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' });

async function maxId(): Promise<string> {
  const { data } = await admin.from('users').select('id').eq('company_id', BETRIEB).eq('email', MONTEUR.email).single();
  return (data as { id: string }).id;
}

async function aufraeumen() {
  for (const tag of [heute(), andererTag()]) {
    await admin.from('assignments').delete().eq('company_id', BETRIEB).eq('date', tag).eq('project_number', BAUSTELLE.nummer);
    await admin.from('einsatz_material').delete().eq('company_id', BETRIEB).eq('date', tag).eq('project_number', BAUSTELLE.nummer);
  }
}
test.beforeEach(aufraeumen);
test.afterEach(aufraeumen);

test('Fremde Änderungen: woanders bleibt alles stehen, am selben Paar fragt das Formular', async ({ page }) => {
  const max = await maxId();
  await anmelden(page, CHEFIN.email);
  await page.goto('/assignments/tag');
  const baustelle = page.getByLabel('Baustelle', { exact: true }).first();
  await expect(baustelle).toBeVisible({ timeout: 15_000 });
  await baustelle.selectOption(BAUSTELLE.nummer);
  const haken = page.getByRole('checkbox', { name: new RegExp(`^${MONTEUR.name}`) });
  await haken.check();
  const aufgabe = page.getByLabel('Kommentar / Aufgabe');
  await aufgabe.fill('Vorwand setzen');
  const hinweis = page.getByText(/Inzwischen geändert/);
  const speichern = page.getByRole('button', { name: /speichern$/ }).first();

  // ---- 1. Ein anderer Tag derselben Baustelle, mit Rüstliste
  expect((await admin.from('assignments').insert({
    company_id: BETRIEB, date: andererTag(), project_number: BAUSTELLE.nummer, user_id: max, user_name: MONTEUR.name,
    comment: 'Vorausgeplant',
  })).error).toBeNull();
  const { data: kopf, error: kopfFehler } = await admin.from('einsatz_material').insert({
    company_id: BETRIEB, date: andererTag(), project_number: BAUSTELLE.nummer, uids: [max], geladen: {},
  }).select('id').single();
  expect(kopfFehler).toBeNull();
  expect((await admin.from('einsatz_material_positionen').insert({
    id: 'dk-p1-live', company_id: BETRIEB, einsatz_material_id: (kopf as { id: string }).id, position: 0,
    name: ARTIKEL.name, menge: 2, einheit: ARTIKEL.einheit,
  })).error).toBeNull();
  // Angekommen ist die Meldung, sobald der Kalender den anderen Tag als geplant zeigt.
  await expect(page.getByRole('button', { name: new RegExp(`^${kalenderName(andererTag())}.*Baustellen? geplant`) }))
    .toBeVisible({ timeout: 15_000 });
  await expect(aufgabe).toHaveValue('Vorwand setzen');
  await expect(haken).toBeChecked();
  await expect(hinweis).toHaveCount(0);
  await expect(speichern).toBeEnabled();

  // ---- 2. Dasselbe Paar: jemand anderes plant Max heute mit einer anderen Aufgabe
  expect((await admin.from('assignments').insert({
    company_id: BETRIEB, date: heute(), project_number: BAUSTELLE.nummer, user_id: max, user_name: MONTEUR.name,
    comment: 'Silikon',
  })).error).toBeNull();
  await expect(page.getByText('Inzwischen geändert — übernehmen?')).toBeVisible({ timeout: 15_000 });
  await expect(aufgabe).toHaveValue('Vorwand setzen');
  await expect(speichern).toBeDisabled();
  await page.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(aufgabe).toHaveValue('Silikon');
  await expect(hinweis).toHaveCount(0);

  // ---- 3. Das eigene Speichern ist keine fremde Änderung
  await aufgabe.fill('Silikon und Abdichtung');
  await speichern.click();
  await expect(page.getByText(/Einsatz( und Rüstliste)? gespeichert/).first()).toBeVisible({ timeout: 15_000 });
  await aufgabe.fill('Silikon, Abdichtung, Endkontrolle');
  // Die Liste der Einsätze zeigt die gespeicherte Aufgabe erst, wenn die eigene Meldung zurück ist.
  await expect(page.getByText('Silikon und Abdichtung').first()).toBeVisible({ timeout: 15_000 });
  await expect(hinweis).toHaveCount(0);
  await expect(aufgabe).toHaveValue('Silikon, Abdichtung, Endkontrolle');
  await expect(speichern).toBeEnabled();

  const { data } = await admin.from('assignments').select('comment').eq('company_id', BETRIEB)
    .eq('date', heute()).eq('project_number', BAUSTELLE.nummer);
  expect(data).toEqual([{ comment: 'Silikon und Abdichtung' }]);
  await keineFehlermeldung(page);
});
