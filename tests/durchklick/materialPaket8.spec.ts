import { test, expect } from '@playwright/test';
import { admin, ARTIKEL, BAUSTELLE, BETRIEB, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung, menue } from './helfer';

/**
 * Material, Paket 8 (E89): zuletzt angefordert (C5), „Abgeholt“ mit Herkunft
 * (C7) und das Abgeholte als Vorschlag am Schein (C2) — ein Weg vom
 * Anfordern bis auf den Schein, bis in die Datenbank nachgesehen.
 */
test.beforeEach(async () => {
  await admin.from('material_orders').delete().eq('company_id', BETRIEB);
});

const kennung = async (email: string) => {
  const { data } = await admin.from('users').select('id').eq('email', email).single();
  return data!.id as string;
};
const bestand = async () => {
  const { data } = await admin.from('materials').select('stock')
    .eq('company_id', BETRIEB).eq('name', ARTIKEL.name).single();
  return Number(data?.stock ?? 0);
};

test('Angefordert, beim Händler mitgenommen, zuletzt angefordert — der Bestand bleibt', async ({ page }) => {
  const vorher = await bestand();
  await anmelden(page, MONTEUR.email);
  await menue(page, 'Material anfordern', 'Material');
  await page.getByRole('combobox', { name: /Für welche Baustelle/ }).selectOption(BAUSTELLE.nummer);
  await page.getByRole('button', { name: `${ARTIKEL.name} in die Liste`, exact: true }).click();
  await page.getByRole('textbox', { name: `Menge ${ARTIKEL.einheit} für ${ARTIKEL.name} in der Liste` }).fill('4');
  await page.getByRole('button', { name: /^Anforderung \(\d+\) abschicken$/ }).click();

  // C5: der Artikel steht oben, für diese Baustelle.
  const zuletzt = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Zuletzt angefordert' }) });
  await expect(zuletzt.getByText('Für diese Baustelle')).toBeVisible({ timeout: 15_000 });
  await expect(zuletzt.getByText(new RegExp(`zuletzt 4 ${ARTIKEL.einheit}`))).toBeVisible();

  // C7: „Abgeholt“ fragt nach der Herkunft; vom Händler bucht nichts ab.
  await page.getByRole('button', { name: 'Abgeholt', exact: true }).click();
  const frage = page.getByRole('dialog', { name: 'Material abgeholt?' });
  await frage.getByRole('radio', { name: 'Beim Händler mitgenommen' }).check();
  await frage.getByRole('button', { name: 'Abgeholt', exact: true }).click();
  await expect(async () => {
    const { data } = await admin.from('material_orders').select('status, abgeholt_herkunft, processed')
      .eq('company_id', BETRIEB);
    expect(data ?? []).toEqual([{ status: 'Erledigt', abgeholt_herkunft: 'haendler', processed: true }]);
  }).toPass({ timeout: 15_000 });
  expect(await bestand()).toBe(vorher);
  await expect(page.getByText('beim Händler mitgenommen').first()).toBeVisible();
  await keineFehlermeldung(page);
});

test('Am Schein steht das Abgeholte als Vorschlag — erst ein Tipp übernimmt es', async ({ page }) => {
  // Ein Entwurf, den dieser Weg hinterlässt, käme dem nächsten Lauf als „Weiterbearbeiten“ in die Quere.
  const { data: vorher } = await admin.from('work_sheets').select('id').eq('company_id', BETRIEB);
  const alt = new Set((vorher ?? []).map((z) => z.id as string));
  const { data: artikel } = await admin.from('materials').select('id')
    .eq('company_id', BETRIEB).eq('name', ARTIKEL.name).single();
  const { error } = await admin.from('material_orders').insert({
    id: crypto.randomUUID(), company_id: BETRIEB, material_id: artikel!.id, material_name: ARTIKEL.name, quantity: 7,
    status: 'Erledigt', processed: true, transaction_type: 'order', user_id: await kennung(MONTEUR.email),
    user_name: MONTEUR.name, project_number: BAUSTELLE.nummer, abgeholt_herkunft: 'lager',
  });
  expect(error).toBeNull();

  await anmelden(page, MONTEUR.email);
  await menue(page, 'Handwerksscheine', 'Scheine');
  await page.getByRole('link', { name: 'Neuer Schein' }).first().click();
  await page.getByLabel('Baustelle', { exact: true }).selectOption(BAUSTELLE.nummer);
  const weiter = page.getByRole('button', { name: 'Weiter: Material' });
  if (await weiter.isVisible()) await weiter.click();

  const vorschlag = page.getByRole('button', { name: `${ARTIKEL.name} auf den Schein` });
  await expect(page.getByText('Für diese Baustelle abgeholt')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(`7 ${ARTIKEL.einheit} abgeholt`)).toBeVisible();
  // Nichts von selbst: noch keine Zeile.
  await expect(page.getByText(/Noch kein Material eingetragen/)).toBeVisible();
  await vorschlag.click();
  await expect(page.getByText(/Noch kein Material eingetragen/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: `${ARTIKEL.name} vom Schein nehmen` })).toBeVisible();
  await expect(page.getByText('Für diese Baustelle abgeholt')).toHaveCount(0);
  await keineFehlermeldung(page);
  const { data: nachher } = await admin.from('work_sheets').select('id, status').eq('company_id', BETRIEB);
  const neu = (nachher ?? []).filter((z) => !alt.has(z.id as string) && z.status === 'Entwurf').map((z) => z.id as string);
  if (neu.length) await admin.from('work_sheets').delete().in('id', neu);
});
