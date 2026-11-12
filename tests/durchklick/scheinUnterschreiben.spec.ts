import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung, menue } from './helfer';

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
  // ERST IN DIE MITTE DES FENSTERS ROLLEN. Die Maus arbeitet mit Koordinaten
  // des Fensters; liegt das Feld darunter, zeigt der Zeiger ins Leere und es
  // entsteht kein Strich — ohne dass irgendetwas fehlschlägt. Am Telefon
  // liegt unten die Tableiste über dem Inhalt; ein Feld, das nur „irgendwie
  // im Bild" ist, kann darunter stecken. Deshalb mittig.
  await flaeche.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const kasten = await flaeche.boundingBox();
  if (!kasten) throw new Error('Unterschriftsfeld nicht sichtbar');
  const y = kasten.y + kasten.height / 2;
  // Und nachsehen, dass unter dem Zeiger wirklich das Feld liegt — sonst
  // zeichnete die Maus auf die Leiste darüber, und die Prüfung fiele erst
  // Zeilen später mit einer irreführenden Meldung.
  expect(
    await flaeche
      .page()
      .evaluate(
        ([x, yy]) => document.elementFromPoint(x, yy)?.tagName,
        [kasten.x + kasten.width / 2, y] as const,
      ),
  ).toBe('CANVAS');
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
  /*
    NUR DER SCHEIN AUS DIESEM LAUF ZÄHLT. Seit dem 02.10.2026 läuft dieser Weg
    in drei Browsern nacheinander (Chromium, WebKit am Telefon, Tablet), und
    ein unterschriebener Schein lässt sich nicht wegräumen — er ist ein Beleg.
    Deshalb wird gemerkt, was vorher da war.
  */
  const { data: vorher } = await admin.from('work_sheets').select('id').eq('company_id', BETRIEB);
  const alteIds = new Set((vorher ?? []).map((z) => z.id as string));
  let neuerSchein = '';

  await anmelden(page, MONTEUR.email);

  await menue(page, 'Handwerksscheine', 'Scheine');
  await page.getByRole('link', { name: 'Neuer Schein' }).first().click();

  /*
    AB HIER AM TELEFON. Der Schein wird dort geschrieben, und dort steht er
    als Schrittfolge — Zeiten, Material, Fotos, Unterschrift —, am
    Schreibtisch als eine Seite. Geprüft wird der Weg, auf dem der Monteur
    ihn wirklich ausfüllt, samt der Frage, ob das Weiterklicken die Eingaben
    der vorigen Schritte mitnimmt. Die Navigation davor bleibt am
    Schreibtisch: sie ist nicht Gegenstand dieses Wegs.
  */
  await page.setViewportSize({ width: 390, height: 844 });
  const schritt = page
    .getByRole('navigation', { name: 'Schritte des Scheins' })
    .locator('[aria-current="step"]');

  await page.getByLabel('Baustelle', { exact: true }).selectOption(BAUSTELLE.nummer);
  await expect(schritt).toHaveText('1 Zeiten');
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
    WEITER DURCH DIE SCHRITTE. Material bleibt leer — es ist
    freiwillig, und „Weiter" sperrt nicht. Jeder Schritt muss aber wirklich
    erscheinen, sonst klickte die Prüfung durch eine Leiste, die nichts tut.
  */
  await page.getByRole('button', { name: 'Weiter: Material' }).click();
  await expect(schritt).toHaveText('2 Material');
  await expect(page.getByLabel('Freie Zeile (nicht im Lager geführt)')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter: Fotos' }).click();
  await expect(schritt).toHaveText('3 Fotos');
  await expect(page.getByLabel('Notizen, Regiearbeiten, Mängel')).toBeVisible();
  /*
    EIN FOTO (Nachtest 01.10.2026, Paket E: „Schein mit Unterschrift und
    Foto“). Das Bild entsteht im Browser selbst — ein echtes JPEG, das die App
    verkleinern muss wie eines aus der Kamera.
  */
  const jpeg = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 480;
    const x = c.getContext('2d')!;
    x.fillStyle = '#2f7d6b';
    x.fillRect(0, 0, 640, 480);
    x.fillStyle = '#ffffff';
    x.fillRect(80, 80, 200, 120);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  });
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: 'baustelle.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg, 'base64'),
  });
  await expect(page.getByText('Weiteres Foto')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Nicht hochgeladen/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Weiter: Unterschrift' }).click();
  await expect(schritt).toHaveText('4 Unterschrift');
  /*
    KEIN KNOPF DER LEISTE IST ABGESCHNITTEN (E82). Bei 390 px stand hier
    „schreiben und abschli“: 207 px Text in 168 px Knopf, weil „Zurück“ als
    Wort zwei Fünftel der Leiste nahm. Jetzt ist es ein Pfeil, der seinen
    Schritt nennt, und der Abschluss hat den Rest.
  */
  await expect(page.getByRole('button', { name: 'Unterschreiben und abschließen' })).toBeVisible();
  expect(await page.locator('.aktionsleiste-knoepfe > *').evaluateAll((knoepfe) =>
    knoepfe.filter((k) => k.scrollWidth > k.clientWidth + 1).map((k) => k.textContent))).toEqual([]);
  await expect(page.getByRole('button', { name: 'Zurück: Fotos' })).toBeVisible();

  // Die Zusammenfassung trägt die Zeit aus dem ersten Schritt: 08:00 bis 16:00.
  await expect(page.getByText('08:00 Std', { exact: true })).toBeVisible();

  /*
    DER NAME DES KUNDEN IN DRUCKBUCHSTABEN IST PFLICHT, und der Knopf bleibt
    ohne ihn gesperrt. Eine gekritzelte Unterschrift allein sagt später
    niemandem, WER unterschrieben hat — auf dem Schein steht deshalb beides.
  */
  await page.getByLabel('Kunde (Name in Druckbuchstaben)').fill(BAUSTELLE.kunde);

  const felder = page.locator('canvas');
  await expect(felder).toHaveCount(2);
  await expect(felder.nth(0)).toBeVisible();
  await expect(felder.nth(1)).toBeVisible();
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
    const { data: alle } = await admin
      .from('work_sheets').select('id, project_number, unterschrift_monteur, unterschrift_kunde')
      .eq('company_id', BETRIEB);
    const data = (alle ?? []).filter((z) => !alteIds.has(z.id as string));
    expect(data).toHaveLength(1);
    const schein = data[0];
    neuerSchein = schein.id as string;
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
    .from('work_sheet_hours').select('von, bis, minuten').eq('work_sheet_id', neuerSchein);
  expect(stunden ?? []).toHaveLength(1);
  expect((stunden ?? [])[0].minuten).toBe(480);

  // Das Foto hängt am Schein, und die Datei liegt im Speicher.
  const { data: bilder } = await admin
    .from('work_sheet_photos').select('pfad').eq('work_sheet_id', neuerSchein);
  expect(bilder ?? []).toHaveLength(1);
  const { data: datei, error: dateiFehler } = await admin.storage
    .from('scheinfotos').download(String((bilder ?? [])[0].pfad));
  expect(dateiFehler).toBeNull();
  expect((await datei!.arrayBuffer()).byteLength).toBeGreaterThan(500);

  await keineFehlermeldung(page);
});

/*
  IM KELLER OHNE NETZ (E49, 05.11.2026). Der Schein wird mit Netz begonnen
  (die Baustellen kommen vom Server), dann reißt die Verbindung: Zeit, Foto
  und beide Unterschriften entstehen ohne Netz. Die App sagt „wird gesendet“,
  die Liste zeigt den Schein unter „Noch nicht gesendet“, die Datenbank kennt
  ihn noch nicht. Mit dem Netz kommt er an — unterschrieben, mit Zeit und Foto.

  Das Netz ist im Browser wirklich weg (`setOffline`), auch zum Entwicklungs-
  server. Gegenprobe: mit dem Stand von `main` scheitert das Unterschreiben
  mit einer Fehlermeldung, und nichts wird vorgemerkt.

  IN WEBKIT DAS FUNKLOCH IM WLAN. Dort lädt der Browser unter `setOffline`
  auch keine `blob:`-Adresse mehr („WebKit encountered an internal error“),
  also ließe sich nicht einmal das Foto verkleinern — eine Eigenheit der
  Nachbildung, ein iPhone im Flugmodus liest seine eigenen Bilder. Dort ist
  deshalb der Server nicht erreichbar, das Gerät hält sich aber für
  verbunden: das andere Funkloch, das der Sender kennen muss (er schließt
  aus der gescheiterten Anfrage, nicht aus `navigator.onLine`). Zurück kommt
  das Netz dann ohne `online`-Ereignis; der Schein geht mit dem
  Nachsehen jede Minute hinaus.
*/
const SERVER = /^http:\/\/127\.0\.0\.1:54321\//;
async function funkloch(page: Page, context: BrowserContext, webkit: boolean, an: boolean) {
  if (!webkit) return context.setOffline(an);
  if (an) await page.route(SERVER, (r) => r.abort('internetdisconnected'));
  else await page.unroute(SERVER);
}

test('Im Keller ohne Netz: Schein mit Foto unterschrieben, mit dem Netz angekommen', async ({ page, context, browserName }) => {
  const webkit = browserName === 'webkit';
  // Ohne `online`-Ereignis geht der Schein erst mit dem Nachsehen jede Minute hinaus.
  test.setTimeout(webkit ? 180_000 : 60_000);
  const { data: vorher } = await admin.from('work_sheets').select('id').eq('company_id', BETRIEB);
  const alteIds = new Set((vorher ?? []).map((z) => z.id as string));
  const neue = async () => {
    const { data } = await admin
      .from('work_sheets').select('id, status, unterschrift_kunde').eq('company_id', BETRIEB);
    return (data ?? []).filter((z) => !alteIds.has(z.id as string));
  };

  await page.setViewportSize({ width: 1280, height: 900 });
  await anmelden(page, MONTEUR.email);
  await menue(page, 'Handwerksscheine', 'Scheine');
  await page.getByRole('link', { name: 'Neuer Schein' }).first().click();
  await page.getByLabel('Baustelle', { exact: true }).selectOption(BAUSTELLE.nummer);
  await expect(page.getByRole('heading', { name: /^Fotos \(/ })).toBeVisible();

  // Ab hier im Keller.
  await funkloch(page, context, webkit, true);

  await page.getByLabel('Tätigkeit (optional)').fill('Steigleitung im Keller getauscht.');
  await page.getByLabel(/^Von/).fill('08:00');
  await page.getByLabel(/^Bis/).fill('10:30');
  await page.getByRole('button', { name: 'Zeile hinzufügen' }).click();

  const jpeg = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 240;
    const x = c.getContext('2d')!;
    x.fillStyle = '#5a4a3a';
    x.fillRect(0, 0, 320, 240);
    x.fillStyle = '#e0e0e0';
    x.fillRect(40, 40, 120, 60);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  });
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: 'keller.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg, 'base64'),
  });
  // Im Schein verzeichnet, die Datei noch im Gerät — kein Fehler.
  await expect(page.getByText('Wartet auf Netz')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Nicht hochgeladen/)).toHaveCount(0);

  await page.getByLabel('Kunde (Name in Druckbuchstaben)').fill(BAUSTELLE.kunde);
  const felder = page.locator('canvas');
  await unterschreiben(felder.nth(0), 12);
  await unterschreiben(felder.nth(1), 28);
  await page.getByRole('button', { name: 'Unterschreiben und abschließen' }).click();

  await expect(page.getByText(/Handwerksschein unterschrieben — ohne Verbindung gespeichert/)).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/worksheets$/);
  const wartend = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Noch nicht gesendet (1)' }) });
  await expect(wartend).toBeVisible();
  await expect(wartend.getByText(/wartet auf Netz/)).toBeVisible();
  expect(await neue()).toHaveLength(0);

  // Wieder Empfang: der Schein geht von selbst hinaus.
  await funkloch(page, context, webkit, false);

  await expect(async () => {
    const angekommen = await neue();
    expect(angekommen).toHaveLength(1);
    expect(angekommen[0].status).toBe('Unterschrieben');
    expect((angekommen[0].unterschrift_kunde as { name?: string })?.name).toBe(BAUSTELLE.kunde);
  }).toPass({ timeout: 90_000 });
  await expect(page.getByRole('heading', { name: /Noch nicht gesendet/ })).toHaveCount(0, { timeout: 20_000 });

  const [schein] = await neue();
  const { data: stunden } = await admin
    .from('work_sheet_hours').select('minuten').eq('work_sheet_id', schein.id);
  expect((stunden ?? []).map((z) => z.minuten)).toEqual([150]);
  const { data: bilder } = await admin
    .from('work_sheet_photos').select('pfad').eq('work_sheet_id', schein.id);
  expect(bilder ?? []).toHaveLength(1);
  const { error: dateiFehler } = await admin.storage.from('scheinfotos').download(String((bilder ?? [])[0].pfad));
  expect(dateiFehler).toBeNull();
  const { data: kopf } = await admin.from('work_sheets').select('inhalt_hash').eq('id', schein.id).single();
  expect(kopf?.inhalt_hash).toMatch(/^[0-9a-f]{64}$/);
});
