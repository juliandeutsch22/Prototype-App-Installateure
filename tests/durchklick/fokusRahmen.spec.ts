import { test, expect, type Locator } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, MONTEUR } from './aufbau';
import { anmelden } from './helfer';

/*
  KEIN FOKUSRAHMEN UM DEN GANZEN INHALT (gemeldet am 03.10.2026, iPhone).

  Nach einem Seitenwechsel bekommt `<main id="inhalt">` den Fokus, damit
  Tastatur und Vorlesehilfe am neuen Inhalt weitermachen. Die allgemeine
  Regel `:focus-visible` zeichnete darum einen gerundeten Rahmen in Petrol.
  Oben verschwand er in der Kopfleiste, seitlich ausserhalb des Bildschirms;
  sichtbar blieben nur die zwei Ecken über der weissen Fuge. Safari wertet
  den Fokus per Skript öfter als „sichtbar“ als Chromium. Hier wird er über
  die Tastatur ausgelöst, dann gilt er auch in Chromium als sichtbar. Im
  WebKit-Telefon läuft dieselbe Prüfung mit, weil der Fehler dort auftrat.
*/
test('Der Inhalt bekommt nach dem Seitenwechsel den Fokus, aber keinen Rahmen', async ({ page }, info) => {
  await anmelden(page, MONTEUR.email);

  const reiter = page.getByRole('link', { name: /Zeit/ }).first();
  await reiter.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/time/);

  const inhalt = page.locator('main#inhalt');
  await expect(inhalt).toBeFocused();
  const stand = await inhalt.evaluate((el) => {
    const s = getComputedStyle(el);
    return { sichtbar: el.matches(':focus-visible'), stil: s.outlineStyle, breite: s.outlineWidth };
  });
  // Gegenprobe zur Prüfung selbst: in Chromium gilt der Fokus nach der
  // Tastatur sicher als sichtbar. WebKit entscheidet das nach eigener Regel.
  if (info.project.name !== 'webkit-telefon') expect(stand.sichtbar).toBe(true);
  expect(stand.stil).toBe('none');
});

/*
  FELDER UND ZEILEN ZEIGEN DEN FOKUS SCHLANK (E75, 10.11.2026: „die doppelte
  Border um Such- und Eingabefelder ist zu dick und sieht aktiv sehr globig
  aus“; „der Balken schaut schrecklich aus und schneidet den Text ab“).

  Ein Feld bekommt den Fokus auch mit dem Finger — und der Browser zählt ihn
  bei Feldern immer als sichtbar. Darum: nur der Rand färbt sich, keine zweite
  Linie, kein Hof. Eine Zeile zeigt den Fokus nur, wenn sie mit der Tastatur
  erreicht wird, 2 px nach außen, nie über ihrem Text.

  Gegenprobe: mit dem Stand vor E75 (Hof von 3 px, Ring mit Abstand um die
  Suche, Rahmen nach innen bei jedem Fokus in der Zeile) sind beide rot.
*/
const PETROL = 'rgb(15, 69, 82)';
const fokus = (l: Locator) => l.evaluate((el) => {
  const s = getComputedStyle(el);
  return { rand: `${s.borderTopWidth} ${s.borderTopColor}`, schatten: s.boxShadow, linie: s.outlineStyle, breite: s.outlineWidth, versatz: s.outlineOffset };
});

test('Such- und Eingabefelder zeigen den Fokus als eine Linie, auch nach einem Tipp', async ({ page }) => {
  await anmelden(page, MONTEUR.email);
  await page.goto('/material');
  const suche = page.locator('.listenleiste-suche').first();
  await suche.locator('input').click();
  expect(await fokus(suche)).toMatchObject({ rand: `1px ${PETROL}`, schatten: 'none', linie: 'none' });
  expect(await fokus(suche.locator('input'))).toMatchObject({ schatten: 'none', linie: 'none' });

  await page.goto('/time');
  const feld = page.locator('#comment');
  await feld.click();
  expect(await fokus(feld)).toMatchObject({ rand: `1px ${PETROL}`, schatten: 'none', linie: 'none' });
});

test('Eine Zeile zeigt den Fokus nur mit der Tastatur, 2 px außen, nicht über dem Text', async ({ page, browserName }) => {
  const { data: person } = await admin.from('users').select('id').eq('company_id', BETRIEB).eq('email', MONTEUR.email).single();
  const id = crypto.randomUUID();
  await admin.from('time_entries').insert({ id, company_id: BETRIEB, user_id: person!.id, user_name: MONTEUR.name,
    date: '2026-11-03', status: 'Anwesend', start_time: '07:00', end_time: '09:00', break_duration: 0,
    comment: 'Fokusprobe', project_number: BAUSTELLE.nummer, customer_name: BAUSTELLE.kunde });
  try {
    await anmelden(page, MONTEUR.email);
    await page.goto('/time');
    const zeile = page.locator('.zeile-ganz').filter({ hasText: 'Fokusprobe' });
    const ziel = zeile.locator('.zeile-ziel');
    /*
      Nach einem Tipp: so kommt der Fokus auf die Zeile zurück, wenn ein
      Fenster schließt, das sie geöffnet hat (gemeldet in „Arbeitstag
      prüfen“). Ein Tipp daneben, dann setzt die App den Fokus selbst.
    */
    await page.locator('h1').first().click();
    await ziel.focus();
    await expect(ziel).toBeFocused();
    expect((await fokus(zeile)).linie).toBe('none');

    // Mit der Tastatur: einmal weg und zurück. WebKit springt mit Tab ab Werk nur zwischen Feldern, nicht zu Knöpfen.
    if (browserName === 'webkit') return;
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(ziel).toBeFocused();
    expect(await fokus(zeile)).toMatchObject({ linie: 'solid', breite: '2px', versatz: '0px' });
  } finally {
    await admin.from('time_entries').delete().eq('id', id);
  }
});
