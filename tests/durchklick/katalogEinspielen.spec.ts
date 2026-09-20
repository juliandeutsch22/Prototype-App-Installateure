import { test, expect } from '@playwright/test';
import { admin, BETRIEB, CHEFIN } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * Den Artikelkatalog des Grosshändlers einspielen.
 *
 * WARUM DIESER WEG IM ECHTEN BROWSER GEPRÜFT WIRD. Ein verrutschtes Feld in
 * einer DATANORM-Datei setzt nicht einen falschen Preis, sondern
 * zehntausend — und ab da rechnet jede Baustelle falsch, ohne dass irgendwo
 * etwas rot wird. Die Bausteinprüfungen sehen den Leser, die
 * Datenbankprüfungen die Übernahme; was dazwischen liegt — Datei auswählen,
 * dekodieren, Bericht zeigen, Rabattsatz setzen, in Blöcken übertragen —
 * sieht nur dieser Weg.
 *
 * DIE ZAHLEN AM ENDE SIND DER EIGENTLICHE INHALT. Dass ein Knopf klickbar
 * war, sagt nichts; dass aus „10000" bei 40 % Rabatt 60,00 € werden und aus
 * „2350" bei Preiseinheit 100 gerade 0,141 €, sagt alles.
 */

const DATEI = [
  'V;20092026;HTI Grosshandel;EUR',
  // Listenpreis 100,00 €, Rabattgruppe 10 — daraus werden mit 40 % 60,00 €.
  'A;N;DN-1;0;Eckventil 1/2 Zoll;verchromt;0;0;Stk;10000;10;0',
  // Nettopreis: schon der Einkaufspreis, der Rabattsatz wirkt hier NICHT.
  'A;N;DN-2;0;Kugelhahn;messing;1;0;Stk;1890;10;0',
  // Preiseinheit 2 heisst „je 100 Stück": 23,50 € / 100 = 0,235 € Liste.
  'A;N;DN-3;0;Dichtring;;0;2;Stk;2350;10;0',
  // Diese Zeile ist kaputt und muss es bleiben — sie darf nicht in den Stamm.
  'A;N;DN-4;0;Kaputt;;0;0;Stk;PST;10;0',
].join('\n');

test('Katalog einspielen: erst der Probelauf, dann die Übernahme', async ({ page }) => {
  await anmelden(page, CHEFIN.email);

  await page.goto('/lager');
  await page.getByRole('tab', { name: 'Katalog einspielen' }).click();

  await page.getByLabel('Name des Lieferanten').fill('HTI Grosshandel');
  await page.getByLabel('DATANORM-Datei').setInputFiles({
    name: 'katalog.001', mimeType: 'text/plain', buffer: Buffer.from(DATEI, 'utf-8'),
  });

  // Der Probelauf steht, und die kaputte Zeile steht mit Nummer und Grund da.
  await expect(page.getByRole('heading', { name: 'Probelauf' })).toBeVisible();
  await expect(page.getByText('Zeile 5: Preisfeld „PST" ist keine Zahl.')).toBeVisible();

  // NOCH IST NICHTS GESCHRIEBEN.
  const { data: vorher } = await admin
    .from('materials').select('id').eq('company_id', BETRIEB).like('article_number', 'DN-%');
  expect(vorher).toEqual([]);

  await page.getByLabel(/Gruppe 10/).fill('40');
  await page.getByRole('button', { name: /3 Artikel übernehmen/ }).click();
  await expect(page.getByRole('heading', { name: 'Übernommen' })).toBeVisible({ timeout: 30_000 });
  await keineFehlermeldung(page);

  const { data: stamm } = await admin
    .from('materials').select('article_number, name, unit, einkaufspreis, ausgelaufen')
    .eq('company_id', BETRIEB).like('article_number', 'DN-%').order('article_number');
  expect(stamm).toEqual([
    { article_number: 'DN-1', name: 'Eckventil 1/2 Zoll verchromt', unit: 'Stk', einkaufspreis: 60, ausgelaufen: false },
    { article_number: 'DN-2', name: 'Kugelhahn messing', unit: 'Stk', einkaufspreis: 18.9, ausgelaufen: false },
    { article_number: 'DN-3', name: 'Dichtring', unit: 'Stk', einkaufspreis: 0.141, ausgelaufen: false },
  ]);

  // Der Listenpreis geht nicht verloren — er steht beim Lieferanten, samt
  // dem Satz, aus dem der Einkauf gerechnet wurde.
  const { data: preise } = await admin
    .from('material_prices').select('listenpreis, rabatt_prozent, einkaufspreis, rabattgruppe')
    .eq('company_id', BETRIEB).order('einkaufspreis');
  expect(preise).toContainEqual({
    listenpreis: 100, rabatt_prozent: 40, einkaufspreis: 60, rabattgruppe: '10',
  });
  // Beim Nettopreis steht KEIN Listenpreis — er ist keiner.
  expect(preise).toContainEqual({
    listenpreis: null, rabatt_prozent: null, einkaufspreis: 18.9, rabattgruppe: '10',
  });

  // Das Zwischenlager ist geräumt, der Lauf trägt das Protokoll.
  const { data: zeilen } = await admin
    .from('datanorm_zeilen').select('id').eq('company_id', BETRIEB);
  expect(zeilen).toEqual([]);

  const { data: lauf } = await admin
    .from('datanorm_laeufe').select('status, dateiname, zeichensatz, bericht')
    .eq('company_id', BETRIEB).single();
  expect(lauf).toMatchObject({
    status: 'uebernommen', dateiname: 'katalog.001', zeichensatz: 'utf-8',
  });
  expect((lauf as { bericht: Record<string, unknown> }).bericht).toMatchObject({
    unverstanden: 1,
    uebernahme: { angelegt: 3, geaendert: 0, ohneRabattsatz: 0 },
  });
});
