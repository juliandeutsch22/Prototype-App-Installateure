import { test, expect } from '@playwright/test';
import { admin, ARTIKEL, BAUSTELLE, BETRIEB, CHEFIN, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * LAGERORTE UND FAHRZEUGLAGER (M04a, E10) — im echten Browser gegen die
 * echte Datenbank, der ganze Weg:
 *
 *  1. Die Chefin legt unter Einstellungen › Fahrzeuge ein Fahrzeug an, mit
 *     dem Monteur als Standardfahrer.
 *  2. Im Lager lagert sie 5 m vom Hauptlager ins Fahrzeug um.
 *  3. Der Monteur hakt seine Rüstliste ab — vorgeschlagen ist sein Fahrzeug,
 *     und von dort wird abgebucht.
 *  4. Der Bestand je Ort stimmt: in der Datenbank, im Lager unter dem Ort und
 *     unter „Mein Fahrzeug“.
 *  5. Der Monteur gibt Übriges per Retoure zurück ins Hauptlager.
 */

const KENNZEICHEN = 'W-DK1';
const heute = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());

async function aufraeumen() {
  const { data: f } = await admin.from('fahrzeuge').select('id').eq('company_id', BETRIEB).eq('kennzeichen', KENNZEICHEN);
  for (const { id } of (f ?? []) as { id: string }[]) {
    const { data: o } = await admin.from('lagerorte').select('id').eq('fahrzeug_id', id);
    for (const { id: ort } of (o ?? []) as { id: string }[]) {
      await admin.from('material_orders').delete().eq('lagerort_id', ort);
      await admin.from('lagerbewegungen').delete().or(`lagerort_id.eq.${ort},gegenort_id.eq.${ort}`);
      await admin.from('lagerbestaende').delete().eq('lagerort_id', ort);
      await admin.from('lagerorte').delete().eq('id', ort);
    }
    await admin.from('fahrzeuge').delete().eq('id', id);
  }
  await admin.from('einsatz_material').delete().eq('company_id', BETRIEB).eq('date', heute()).eq('project_number', BAUSTELLE.nummer);
  // Nur, was dieser Durchlauf anlegt — andere Durchläufe arbeiten im selben Betrieb.
  await admin.from('material_orders').delete().eq('company_id', BETRIEB).eq('transaction_type', 'return')
    .eq('user_name', MONTEUR.name).eq('material_name', ARTIKEL.name);
}
test.beforeEach(aufraeumen);
test.afterEach(aufraeumen);

test('Fahrzeug anlegen, umlagern, aus dem Fahrzeug abhaken, Bestand je Ort, Retoure ins Hauptlager', async ({ browser }) => {
  test.setTimeout(180_000);
  const { data: artikel } = await admin.from('materials').select('id, stock').eq('company_id', BETRIEB).eq('name', ARTIKEL.name).single();
  const artikelId = (artikel as { id: string }).id;
  const anfang = Number((artikel as { stock: number }).stock);
  const { data: monteur } = await admin.from('users').select('id').eq('company_id', BETRIEB).eq('email', MONTEUR.email).single();
  const monteurId = (monteur as { id: string }).id;
  const hauptlager = async () =>
    Number((await admin.from('materials').select('stock').eq('id', artikelId).single()).data!.stock);
  const imFahrzeug = async (ort: string) =>
    Number(((await admin.from('lagerbestaende').select('menge').eq('lagerort_id', ort).eq('material_id', artikelId)).data ?? [])[0]?.menge ?? 0);

  // ---- 1. Fahrzeug anlegen (Chefin)
  const chefSeite = await (await browser.newContext()).newPage();
  await anmelden(chefSeite, CHEFIN.email);
  await chefSeite.goto('/settings/fahrzeuge');
  await chefSeite.getByRole('button', { name: 'Fahrzeug anlegen' }).click();
  const formular = chefSeite.getByRole('dialog', { name: 'Fahrzeug' });
  await formular.getByRole('textbox', { name: /^Kennzeichen/ }).fill(KENNZEICHEN);
  await formular.getByRole('combobox', { name: /^Standardfahrer/ }).selectOption({ label: MONTEUR.name });
  await formular.getByRole('button', { name: 'Speichern' }).click();
  await expect(chefSeite.getByText(`${KENNZEICHEN} angelegt`)).toBeVisible();
  await expect(chefSeite.locator('li.zeile', { hasText: KENNZEICHEN })).toContainText(`Standardfahrer: ${MONTEUR.name}`);
  const { data: fz } = await admin.from('fahrzeuge').select('id').eq('company_id', BETRIEB).eq('kennzeichen', KENNZEICHEN).single();
  const ort = ((await admin.from('lagerorte').select('id').eq('fahrzeug_id', (fz as { id: string }).id).single()).data as { id: string }).id;

  // ---- 2. Hauptlager → Fahrzeug umlagern (Chefin)
  await chefSeite.goto('/lager');
  await chefSeite.getByRole('button', { name: ARTIKEL.name }).click();
  const blatt = chefSeite.getByRole('dialog', { name: 'Artikel' });
  await blatt.getByRole('button', { name: 'Umlagern' }).click();
  const umlagern = chefSeite.getByRole('dialog', { name: /^Umlagern: / });
  await umlagern.getByLabel('Nach').selectOption({ label: `Fahrzeug ${KENNZEICHEN}` });
  await umlagern.getByLabel(/Menge/).fill('5');
  await umlagern.getByRole('button', { name: 'Umlagern' }).click();
  await expect(chefSeite.getByText(new RegExp(`5 m ${ARTIKEL.name} umgelagert: .+ → Fahrzeug ${KENNZEICHEN}`))).toBeVisible();
  expect([await hauptlager(), await imFahrzeug(ort)]).toEqual([anfang - 5, 5]);

  // ---- 3. Der Monteur hakt die Rüstliste aus dem Fahrzeug ab
  await admin.from('assignments').delete().eq('company_id', BETRIEB).eq('date', heute()).eq('user_id', monteurId);
  expect((await admin.from('assignments').insert({
    company_id: BETRIEB, date: heute(), project_number: BAUSTELLE.nummer, user_id: monteurId, user_name: MONTEUR.name,
  })).error).toBeNull();
  const { data: kopf, error: kopfFehler } = await admin.from('einsatz_material').insert({
    company_id: BETRIEB, date: heute(), project_number: BAUSTELLE.nummer, uids: [monteurId], geladen: {},
  }).select('id').single();
  expect(kopfFehler).toBeNull();
  expect((await admin.from('einsatz_material_positionen').insert({
    id: 'dk-p1', company_id: BETRIEB, einsatz_material_id: (kopf as { id: string }).id, position: 0,
    material_id: artikelId, name: ARTIKEL.name, menge: 3, einheit: ARTIKEL.einheit,
  })).error).toBeNull();

  const monteurSeite = await (await browser.newContext()).newPage();
  await anmelden(monteurSeite, MONTEUR.email);
  await monteurSeite.goto('/');
  const quelle = monteurSeite.getByLabel('Abbuchen aus');
  await expect(quelle).toHaveValue(ort);
  await monteurSeite.getByLabel(new RegExp(ARTIKEL.name)).check();
  await expect(monteurSeite.getByText(`3 m abgebucht — Fahrzeug ${KENNZEICHEN}`)).toBeVisible();

  // ---- 4. Der Bestand je Ort stimmt
  expect([await hauptlager(), await imFahrzeug(ort)]).toEqual([anfang - 5, 2]);
  await chefSeite.goto(`/lager?ort=${ort}`);
  const zeile = chefSeite.locator('li', { has: chefSeite.getByRole('button', { name: ARTIKEL.name }) });
  await expect(zeile).toContainText('2 m');
  await monteurSeite.goto('/material');
  await expect(monteurSeite.getByText(`Mein Fahrzeug ${KENNZEICHEN}`)).toBeVisible();
  await expect(monteurSeite.locator('li', { hasText: ARTIKEL.name }).filter({ hasText: '2 m' }).first()).toBeVisible();

  // ---- 5. Retoure zurück ins Hauptlager
  await monteurSeite.getByRole('button', { name: /Material zurückgeben/ }).click();
  const retoure = monteurSeite.getByRole('dialog', { name: 'Material zurückgeben' });
  await retoure.getByLabel('Material').fill('Kupfer');
  await retoure.getByRole('button', { name: `${ARTIKEL.name} zurückgeben` }).click();
  await retoure.getByLabel('Menge').fill('1');
  await expect(retoure.getByLabel('Zurück in')).toHaveValue('');
  await retoure.getByRole('button', { name: 'Retoure erfassen' }).click();
  await expect(monteurSeite.getByText('Retoure erfasst — Material wurde dem Lager gutgeschrieben')).toBeVisible();
  expect([await hauptlager(), await imFahrzeug(ort)]).toEqual([anfang - 4, 2]);

  await keineFehlermeldung(chefSeite);
  await keineFehlermeldung(monteurSeite);
  await admin.from('assignments').delete().eq('company_id', BETRIEB).eq('date', heute()).eq('user_id', monteurId);
});
