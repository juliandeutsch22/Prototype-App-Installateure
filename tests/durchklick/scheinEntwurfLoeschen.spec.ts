import { test, expect } from '@playwright/test';
import { admin, BETRIEB, CHEFIN } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * HANDWERKSSCHEINE (Auftrag 04.11.2026): „das Stunden-ohne-Buchung-Fenster
 * erscheint so unnötig groß … außerdem kann man Entwürfe bzw. verworfene
 * Entwürfe nicht löschen.“
 *
 * Im echten Browser gegen die echte Datenbank und den echten Speicher:
 * - ist nichts offen, ist die Karte „Stunden ohne Buchung“ am Schreibtisch
 *   höchstens 168 px hoch (vorher rund 300), „Weiter zurück prüfen“ steht da;
 * - ein Entwurf mit Foto lässt sich aus seinem Fenster löschen: die Zeile ist
 *   weg, in der Datenbank der Schein samt Foto-Zeile, im Speicher die Datei;
 * - ebenso ein verworfener Entwurf;
 * - ein unterschriebener Schein bietet kein „Löschen“ an.
 */

const KUNDEN = ['Familie Löschprobe', 'Familie Verworfenprobe', 'Familie Belegprobe'];

async function aufraeumen() {
  const { data } = await admin.from('work_sheets').select('id').eq('company_id', BETRIEB).in('customer_name', KUNDEN);
  const ids = (data ?? []).map((x) => x.id as string);
  if (ids.length === 0) return;
  for (const id of ids) {
    const { data: dateien } = await admin.storage.from('scheinfotos').list(`scheine/${BETRIEB}/${id}`);
    if (dateien?.length) await admin.storage.from('scheinfotos').remove(dateien.map((d) => `scheine/${BETRIEB}/${id}/${d.name}`));
  }
  // Der Dienstschlüssel darf, was die App nie darf: auch den unterschriebenen Probeschein wegräumen.
  await admin.from('work_sheets').delete().in('id', ids);
}
test.beforeEach(aufraeumen);
test.afterEach(aufraeumen);

async function scheinAnlegen(kunde: string, status: 'Entwurf' | 'Verworfen' | 'Unterschrieben', mitFoto = false) {
  const { data: chefin } = await admin.from('users').select('id').eq('company_id', BETRIEB).eq('email', CHEFIN.email).single();
  const id = crypto.randomUUID();
  const { error } = await admin.from('work_sheets').insert({
    id, company_id: BETRIEB, project_number: 'B-2026-0001', customer_name: kunde, datum: '2026-11-03',
    status: 'Entwurf', abrechnung: 'Regie', erstellt_von_uid: chefin!.id, erstellt_von_name: CHEFIN.name,
  });
  expect(error).toBeNull();
  let pfad: string | null = null;
  if (mitFoto) {
    pfad = `scheine/${BETRIEB}/${id}/probe.jpg`;
    const hoch = await admin.storage.from('scheinfotos').upload(pfad, new Blob(['probe'], { type: 'image/jpeg' }), { contentType: 'image/jpeg' });
    expect(hoch.error).toBeNull();
    const z = await admin.from('work_sheet_photos').insert({
      company_id: BETRIEB, work_sheet_id: id, pfad, hash: 'a'.repeat(64), bytes: 5, geraet_zeit: new Date().toISOString(), position: 0,
    });
    expect(z.error).toBeNull();
  }
  if (status === 'Verworfen') {
    const v = await admin.from('work_sheets').update({ status: 'Verworfen', verworfen_von_name: CHEFIN.name }).eq('id', id);
    expect(v.error).toBeNull();
  }
  if (status === 'Unterschrieben') {
    const u = { name: 'Unterschrift', bild: 'data:image/png;base64,AAA', geraetZeit: 1776000000000 };
    const s = await admin.from('work_sheets').update({
      status: 'Unterschrieben', unterschrieben_am: new Date().toISOString(), unterschrift_monteur: u, unterschrift_kunde: u,
    }).eq('id', id);
    expect(s.error).toBeNull();
  }
  return { id, pfad };
}

test('Stunden ohne Buchung: knapp, wenn nichts offen ist — „Weiter zurück prüfen“ bleibt', async ({ page }) => {
  test.setTimeout(60_000);
  await scheinAnlegen(KUNDEN[0], 'Entwurf');
  await anmelden(page, CHEFIN.email);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/worksheets');
  const karte = page.locator('section, .karte').filter({ has: page.getByRole('heading', { name: 'Stunden ohne Buchung (0)' }) }).last();
  await expect(karte).toBeVisible({ timeout: 15_000 });
  await expect(karte.getByText('Alle Stunden gebucht.')).toBeVisible();
  await expect(karte.getByRole('button', { name: '30 Tage' })).toBeVisible();
  // Vorher rund 300 px; jetzt Kopf und eine Zeile mit den Knöpfen daneben.
  expect((await karte.boundingBox())!.height).toBeLessThanOrEqual(168);
});

test('ein Entwurf mit Foto lässt sich löschen — Schein, Foto-Zeile und Datei sind weg', async ({ page }) => {
  test.setTimeout(90_000);
  const { id, pfad } = await scheinAnlegen(KUNDEN[0], 'Entwurf', true);
  await anmelden(page, CHEFIN.email);
  await page.goto('/worksheets');
  await page.locator('.zeile-ziel', { hasText: KUNDEN[0] }).click();
  const fenster = page.getByRole('dialog');
  await fenster.getByRole('button', { name: 'Löschen' }).click();
  const frage = page.getByRole('dialog', { name: 'Entwurf löschen' });
  await expect(frage).toContainText('1 Foto');
  await frage.getByRole('button', { name: 'Endgültig löschen' }).click();
  await expect(page.getByText('Entwurf gelöscht')).toBeVisible();
  await expect(page.locator('.zeile-ziel', { hasText: KUNDEN[0] })).toHaveCount(0);

  expect((await admin.from('work_sheets').select('id').eq('id', id)).data).toEqual([]);
  expect((await admin.from('work_sheet_photos').select('id').eq('work_sheet_id', id)).data).toEqual([]);
  const { data: dateien } = await admin.storage.from('scheinfotos').list(`scheine/${BETRIEB}/${id}`);
  expect(dateien ?? [], `Datei ${pfad} ist weg`).toEqual([]);
  await keineFehlermeldung(page);
});

test('ein verworfener Entwurf lässt sich löschen; ein unterschriebener Schein bietet es nicht an', async ({ page }) => {
  test.setTimeout(90_000);
  const verworfen = await scheinAnlegen(KUNDEN[1], 'Verworfen');
  const beleg = await scheinAnlegen(KUNDEN[2], 'Unterschrieben');
  await anmelden(page, CHEFIN.email);
  await page.goto('/worksheets');
  await page.getByRole('checkbox', { name: /verworfene/ }).check();
  await page.locator('.zeile-ziel', { hasText: KUNDEN[1] }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await page.getByRole('dialog', { name: 'Verworfenen Entwurf löschen' }).getByRole('button', { name: 'Endgültig löschen' }).click();
  await expect(page.getByText('Entwurf gelöscht')).toBeVisible();
  expect((await admin.from('work_sheets').select('id').eq('id', verworfen.id)).data).toEqual([]);

  // Der Beleg: Fenster ohne „Löschen“, die Zeile bleibt.
  await page.getByRole('group', { name: 'Ansicht' }).getByRole('button', { name: 'Alle' }).click();
  await page.locator('.zeile-ziel', { hasText: KUNDEN[2] }).click();
  const fenster = page.getByRole('dialog');
  await expect(fenster.getByRole('button', { name: 'PDF' })).toBeVisible();
  await expect(fenster.getByRole('button', { name: 'Löschen' })).toHaveCount(0);
  expect((await admin.from('work_sheets').select('id').eq('id', beleg.id)).data).toHaveLength(1);
  await keineFehlermeldung(page);
});
