import { test, expect } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * Der Handwerksschein mit zwei Unterschriften.
 *
 * DER EINZIGE WEG, DER MIT EINER ZEICHNUNG ENDET. Beide Unterschriften
 * entstehen auf einem `<canvas>`, werden als Bild ausgelesen und im Schein
 * eingefroren. Daran hängt mehr als Sorgfalt: der Schein ist die Grundlage
 * der Rechnung, und ein Schein ohne Unterschrift des Kunden ist ein halber
 * Beleg.
 *
 * ES WIRD WIRKLICH GEZEICHNET, mit Mausbewegungen über die Fläche. Ein
 * untergeschobenes Bild würde den Teil überspringen, der auf Geräten mit
 * Finger und Stift schon zweimal gebrochen ist.
 */
async function unterschreiben(flaeche: import('@playwright/test').Locator, hoehe: number) {
  // ERST IN DEN SICHTBAREN BEREICH ROLLEN. Die Maus arbeitet mit Koordinaten
  // des Fensters; liegt das Feld darunter, zeigt der Zeiger ins Leere und es
  // entsteht kein Strich — ohne dass irgendetwas fehlschlägt.
  await flaeche.scrollIntoViewIfNeeded();
  const kasten = await flaeche.boundingBox();
  if (!kasten) throw new Error('Unterschriftsfeld nicht sichtbar');
  const y = kasten.y + kasten.height / 2;
  await flaeche.page().mouse.move(kasten.x + 20, y);
  await flaeche.page().mouse.down();
  // Mehrere Zwischenschritte: ein einzelner Sprung von A nach B hinterlässt
  // auf manchen Flächen keinen Strich, und dann prüft man ein leeres Bild.
  for (let i = 1; i <= 8; i += 1) {
    await flaeche.page().mouse.move(
      kasten.x + 20 + (kasten.width - 40) * (i / 8),
      y + (i % 2 === 0 ? hoehe : -hoehe),
    );
  }
  await flaeche.page().mouse.up();
}

test('Ein Monteur schreibt einen Schein und lässt ihn unterschreiben', async ({ page }) => {
  await anmelden(page, MONTEUR.email);

  await page.getByRole('link', { name: 'Handwerksscheine' }).first().click();
  await page.getByRole('link', { name: 'Neuer Schein' }).click();

  await page.getByLabel('Baustelle').selectOption(BAUSTELLE.nummer);
  await page.getByLabel('Tätigkeit (optional)').fill('Bad entkernt, Leitungen neu verlegt.');
  await page.getByLabel(/^Bis/).fill('16:00');
  /*
    ERST ÜBERNEHMEN, DANN UNTERSCHREIBEN. Bis zum 23.09.2026 stand hier kein
    Klick — und dieser Weg unterschrieb einen Schein OHNE Leistungszeit, ohne
    dass es jemand merkte, weil nur die Unterschriften geprüft wurden. Heute
    sperrt der Schein das Unterschreiben, solange eine eingetippte Zeit nicht
    auf ihm steht; die Stunden werden unten nachgesehen.
  */
  await page.getByRole('button', { name: 'Zeile hinzufügen' }).click();

  /*
    DER NAME DES KUNDEN IN DRUCKBUCHSTABEN IST PFLICHT, und der Knopf bleibt
    ohne ihn gesperrt. Eine gekritzelte Unterschrift allein sagt später
    niemandem, WER unterschrieben hat — auf dem Schein steht deshalb beides.
  */
  await page.getByLabel('Kunde (Name in Druckbuchstaben)').fill(BAUSTELLE.kunde);

  const felder = page.locator('canvas');
  await expect(felder).toHaveCount(2);
  /*
    ZWEI VERSCHIEDENE ZÜGE, und das ist kein Schmuck. Mit demselben Strich auf
    beiden Feldern wäre diese Prüfung blind dafür, dass die Ansicht zweimal
    dasselbe Bild einfriert — ein Schein, auf dem der Kunde die Handschrift des
    Monteurs trägt. Genau diese Mutation ist beim ersten Anlauf durchgekommen.
  */
  await unterschreiben(felder.nth(0), 12);
  await unterschreiben(felder.nth(1), 28);

  await page.getByRole('button', { name: 'Unterschreiben und abschließen' }).click();

  await expect(async () => {
    const { data } = await admin
      .from('work_sheets').select('project_number, unterschrift_monteur, unterschrift_kunde')
      .eq('company_id', BETRIEB);
    expect(data ?? []).toHaveLength(1);
    const schein = (data ?? [])[0];
    expect(schein.project_number).toBe(BAUSTELLE.nummer);
    // BEIDE Unterschriften, und beide mit einem Bild darin: ein leeres Feld
    // würde als Objekt durchgehen und wäre auf dem Papier ein weisser Fleck.
    expect(String((schein.unterschrift_monteur as { bild?: string })?.bild ?? ''))
      .toMatch(/^data:image/);
    expect(String((schein.unterschrift_kunde as { bild?: string })?.bild ?? ''))
      .toMatch(/^data:image/);
    // Und zwei VERSCHIEDENE Bilder — siehe oben.
    expect((schein.unterschrift_kunde as { bild?: string })?.bild)
      .not.toBe((schein.unterschrift_monteur as { bild?: string })?.bild);
  }).toPass({ timeout: 20_000 });

  // Und die Zeit steht darauf: 08:00 bis 16:00, ohne Pause.
  const { data: stunden } = await admin
    .from('work_sheet_hours').select('von, bis, minuten').eq('company_id', BETRIEB);
  expect(stunden ?? []).toHaveLength(1);
  expect((stunden ?? [])[0].minuten).toBe(480);

  await keineFehlermeldung(page);
});
