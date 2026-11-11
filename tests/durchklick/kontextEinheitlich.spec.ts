import { test, expect, type Page } from '@playwright/test';
import { admin, BETRIEB, CHEFIN } from './aufbau';
import { anmelden } from './helfer';

/*
  DIE ZUSAMMENFASSUNG RECHTS IST ÜBERALL GLEICH (E78, 11.11.2026):
  „Auftragseingang und Angebote, Detailansicht: hier passt der Kasten mit
  der Zusammenfassung noch nicht zu Baustellen und Kunden, das muss
  einheitlich sein.“

  Gemessen am Schreibtisch: Breite, Polster und Fläche der Spalte, Gestalt
  der Überschriften und der Angaben, keine Linie über den Abschnitten — in
  Eingang und Angebot genau wie in Baustelle und Kunde. Und ein Verweis
  (der Kunde) steht in der Zeilenhöhe der Angaben, nicht 12 px tiefer.

  Gegenprobe: mit dem Stand davor (weiße Fläche, 20 rem, Titel in 16 px,
  Linie über jedem Abschnitt) ist der Vergleich rot.
*/
const KUNDE = 'Kontext-Probe GmbH';

async function aufraeumen() {
  await admin.from('quotes').delete().eq('company_id', BETRIEB).eq('quote_number', 'AN-KONTEXT-1');
  await admin.from('auftragseingaenge').delete().eq('company_id', BETRIEB).eq('anliegen', 'Kontext-Probe');
  await admin.from('projects').delete().eq('company_id', BETRIEB).eq('project_number', 'KP-2026-0001');
  await admin.from('customers').delete().eq('company_id', BETRIEB).eq('name', KUNDE);
}
test.beforeEach(aufraeumen);
test.afterEach(aufraeumen);

/** Was an der Spalte zu sehen ist — die Zahlen, die gleich sein müssen. */
async function spalte(page: Page, sel: string) {
  const k = page.locator(sel);
  await expect(k).toBeVisible({ timeout: 20_000 });
  return k.evaluate((el) => {
    const cs = getComputedStyle(el);
    const h2 = getComputedStyle(el.querySelector('.karte-kopf h2')!);
    const kopf = getComputedStyle(el.querySelector('.karte-kopf')!);
    const dtEl = el.querySelector('dt'), ddEl = el.querySelector('dd');
    const dt = dtEl && getComputedStyle(dtEl), dd = ddEl && getComputedStyle(ddEl);
    return {
      breite: Math.round(el.getBoundingClientRect().width),
      polster: [cs.paddingTop, cs.paddingLeft, cs.paddingRight].join(' '),
      flaeche: cs.backgroundColor,
      titel: [h2.fontSize, h2.lineHeight, h2.textTransform, h2.letterSpacing, h2.color, h2.fontWeight].join(' '),
      kopf: kopf.padding,
      linien: [...el.querySelectorAll('.karte')].map((c) => getComputedStyle(c).borderTopWidth).filter((b) => b !== '0px').length,
      wort: dt ? [dt.fontSize, dt.lineHeight, dt.color, dt.marginBottom].join(' ') : null,
      wert: dd ? [dd.fontSize, dd.lineHeight, dd.marginTop].join(' ') : null,
    };
  });
}

/** Der Verweis in einer Angabe: so hoch wie die Zeile, direkt unter dem Wort. */
async function verweis(page: Page, sel: string, name: RegExp) {
  return page.locator(sel).getByRole('link', { name }).first().evaluate((a) => {
    const dd = a.closest('dd')!, dt = dd.previousElementSibling ?? dd.parentElement!.querySelector('dt')!;
    const zeile = dd.getBoundingClientRect();
    // Die Zeile so hoch wie jede Angabe; die Tastfläche des Verweises bleibt 44 px (Polster und Gegenrand).
    return { zeile: Math.round(zeile.height), abstand: Math.round(zeile.top - dt.getBoundingClientRect().bottom), tastflaeche: Math.round(a.getBoundingClientRect().height) };
  });
}

test('Eingang und Angebot: dieselbe Zusammenfassung wie Baustelle und Kunde', async ({ page }) => {
  test.setTimeout(120_000);
  const { data: k } = await admin.from('customers').insert({ company_id: BETRIEB, name: KUNDE, kundenart: 'privat', strasse: 'Probegasse 1', plz: '1010', ort: 'Wien', contact_phone: '0664 1111' }).select('id').single();
  const kunde = k!.id as string;
  const { data: b } = await admin.from('projects').insert({ company_id: BETRIEB, project_number: 'KP-2026-0001', customer_id: kunde, customer_name: KUNDE, address: 'Probegasse 1, 1010 Wien', status: 'Aktiv' }).select('id').single();
  const { data: q } = await admin.from('quotes').insert({ company_id: BETRIEB, quote_number: 'AN-KONTEXT-1', customer_id: kunde, customer_name: KUNDE, quote_date: '2026-11-06', valid_until: '2099-12-31', status: 'Versendet', vat_rate: 0.2, subtotal_netto: 100, total_netto: 100, total_vat: 20, total_brutto: 120, kalkulierte_stunden: 1 }).select('id').single();
  const { data: e } = await admin.from('auftragseingaenge').insert({ company_id: BETRIEB, quelle: 'email', customer_id: kunde, anliegen: 'Kontext-Probe' }).select('id').single();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await anmelden(page, CHEFIN.email);

  await page.goto(`/admin-projects/${b!.id}`);
  const baustelle = await spalte(page, '.akten-kontext');
  const zurAkte = await verweis(page, '.akten-kontext', new RegExp(KUNDE));
  await page.goto(`/customers/${kunde}`);
  const kundeSpalte = await spalte(page, '.akten-kontext');
  await page.goto(`/quotes/${q!.id}`);
  const angebot = await spalte(page, '.beleg-kontext');
  const angebotKunde = await verweis(page, '.beleg-kontext', new RegExp(KUNDE));
  await page.goto(`/eingaenge/${e!.id}`);
  const eingang = await spalte(page, '.beleg-kontext');

  // Die Akten untereinander gleich — der Maßstab.
  expect(kundeSpalte).toEqual(baustelle);
  // Eingang trägt rechts nur den Stand (ohne Angaben): verglichen wird, was er hat.
  const ohneAngaben = (m: typeof baustelle) => ({ ...m, wort: null, wert: null });
  expect(angebot).toEqual(baustelle);
  expect(ohneAngaben(eingang)).toEqual(ohneAngaben(baustelle));
  expect(baustelle).toMatchObject({ breite: 288, linien: 0, flaeche: 'rgba(0, 0, 0, 0)' });

  // Der Kunde als Verweis: eine Zeile von 20 px wie jede Angabe, 2 px unter dem Wort — im Angebot wie in der Baustelle.
  // („· Zur Kundenakte“ läuft in der Baustelle über zwei Zeilen: dann 40 px.)
  expect(angebotKunde).toEqual({ zeile: 20, abstand: 2, tastflaeche: 44 });
  for (const v of [angebotKunde, zurAkte]) {
    expect(v.zeile % 20, 'ganze Zeilen zu 20 px').toBe(0);
    expect(v.abstand).toBe(2);
    expect(v.tastflaeche).toBe(v.zeile + 24);
  }
});
