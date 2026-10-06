import { test, expect } from '@playwright/test';
import { admin, BETRIEB, BUERO, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * DER NACHWEIS ZUM SONDERURLAUB, VON ANFANG BIS ENDE (Testbericht Runde 3,
 * G26). Im Test ließ sich die Datei mit dem Werkzeug nicht anhängen — hier
 * hängt der Browser sie an (`setInputFiles`), das Büro sieht sie beim
 * Bestätigen, und nach „Nachweis geprüft“ ist die Datei weg; es bleibt der
 * Vermerk. Läuft in Chromium und in WebKit (iPhone, `MONTEUR_WEGE`).
 *
 * Das Foto am echten Handy ersetzt diese Prüfung nicht: ob die Kamera eine
 * HEIC- oder JPEG-Datei liefert, entscheidet das Gerät.
 */
const EIMER = 'freistellungsnachweise';

async function monteurUid(): Promise<string> {
  const { data } = await admin.from('users').select('id').eq('company_id', BETRIEB).eq('email', MONTEUR.email).single();
  return (data as { id: string }).id;
}

async function dateienIm(ordner: string): Promise<string[]> {
  const { data } = await admin.storage.from(EIMER).list(ordner, { limit: 100 });
  return (data ?? []).map((d) => d.name);
}

async function abraeumen() {
  const { data: antraege } = await admin.from('freistellungen').select('id, user_id').eq('company_id', BETRIEB);
  for (const a of (antraege ?? []) as { id: string; user_id: string }[]) {
    const ordner = `${BETRIEB}/${a.user_id}/${a.id}`;
    const namen = await dateienIm(ordner);
    if (namen.length) await admin.storage.from(EIMER).remove(namen.map((n) => `${ordner}/${n}`));
  }
  // Zuerst die Tage, dann die Anträge: der Fremdschlüssel würde sie nur loslösen.
  await admin.from('time_entries').delete().eq('company_id', BETRIEB).not('freistellung_id', 'is', null);
  await admin.from('freistellungen').delete().eq('company_id', BETRIEB);
}

test.beforeEach(abraeumen);
test.afterEach(abraeumen);

test('Sonderurlaub mit Nachweis: anhängen, beim Bestätigen ansehen, nach „geprüft“ gelöscht', async ({ browser }) => {
  test.setTimeout(150_000);

  // 1. Der Monteur beantragt und hängt den Nachweis an.
  const monteur = await (await browser.newContext()).newPage();
  await anmelden(monteur, MONTEUR.email);
  await monteur.goto('/vacations');
  await monteur.getByLabel('Art').selectOption('dienstverhinderung');
  await monteur.getByLabel(/^Anlass/).selectOption('hochzeit');
  await monteur.getByLabel('Tag des Ereignisses').fill('2026-12-16');
  await monteur.getByLabel('Von').fill('2026-12-14');
  await monteur.getByLabel('Bis (einschließlich)').fill('2026-12-16');
  await monteur.getByLabel('Nachweis auswählen').setInputFiles({
    name: 'heiratsurkunde.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n'),
  });
  await expect(monteur.getByText('heiratsurkunde.pdf')).toBeVisible();
  await monteur.getByRole('button', { name: 'Antrag einreichen' }).click();
  await expect(monteur.getByText('Mein Sonderurlaub')).toBeVisible({ timeout: 15_000 });
  await expect(monteur.getByText(/Nachweis liegt bei/)).toBeVisible({ timeout: 15_000 });
  await keineFehlermeldung(monteur);

  // In der Datenbank: Pfad am Antrag, Datei im Speicher.
  const uid = await monteurUid();
  let antragId = '';
  await expect(async () => {
    const { data } = await admin.from('freistellungen').select('id, nachweis_pfad').eq('company_id', BETRIEB);
    expect(data).toHaveLength(1);
    const a = (data as { id: string; nachweis_pfad: string | null }[])[0];
    expect(a.nachweis_pfad).toMatch(new RegExp(`^${BETRIEB}/${uid}/${a.id}/.+\\.pdf$`));
    antragId = a.id;
    expect(await dateienIm(`${BETRIEB}/${uid}/${a.id}`)).toHaveLength(1);
  }).toPass({ timeout: 15_000 });

  // 2. Das Büro sieht den Nachweis beim Bestätigen.
  const kontext = await browser.newContext();
  const buero = await kontext.newPage();
  await anmelden(buero, BUERO.email);
  await buero.goto('/vacations');
  const karte = buero.locator('section', { has: buero.getByRole('heading', { name: /Sonderurlaub bestätigen/ }) });
  await expect(karte.getByText(/Eigene Eheschließung/)).toBeVisible({ timeout: 15_000 });
  const neuesFenster = kontext.waitForEvent('page', { timeout: 15_000 });
  await karte.getByRole('button', { name: 'Nachweis ansehen' }).click();
  const fenster = await neuesFenster;
  await expect.poll(() => fenster.url(), { timeout: 15_000 }).toMatch(new RegExp(`/storage/v1/object/sign/${EIMER}/`));
  // Die Adresse liefert die Datei aus — für das Büro, solange der Antrag offen ist.
  const antwort = await buero.request.get(fenster.url());
  expect(antwort.status()).toBe(200);
  await fenster.close();

  // 3. Ohne „Nachweis geprüft“ kein Bestätigen; mit dem Haken bestätigt — und die Datei ist weg.
  await karte.getByLabel('Nachweis geprüft').check();
  await karte.getByRole('button', { name: 'Bestätigen', exact: true }).click();
  await expect(buero.getByText(/Bestätigt — 3 Tage eingetragen/)).toBeVisible({ timeout: 15_000 });
  await keineFehlermeldung(buero);

  await expect(async () => {
    const { data } = await admin.from('freistellungen')
      .select('status, nachweis_pfad, nachweis_geprueft_von_name, nachweis_geprueft_am').eq('id', antragId).single();
    expect(data).toMatchObject({ status: 'Bestätigt', nachweis_pfad: null, nachweis_geprueft_von_name: BUERO.name });
    expect(data?.nachweis_geprueft_am).toBeTruthy();
    expect(await dateienIm(`${BETRIEB}/${uid}/${antragId}`)).toEqual([]);
  }).toPass({ timeout: 15_000 });

  // 4. Der Monteur sieht den Vermerk, die Datei gibt es nicht mehr.
  await monteur.reload();
  await expect(monteur.getByText(/Nachweis geprüft von Berta Büro/)).toBeVisible({ timeout: 15_000 });
});
