import { test, expect, type Page } from '@playwright/test';
import { admin, BETRIEB, CHEFIN } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * BAUSTELLEN UND NACHKALKULATION MIT LUFT (Auftrag 04.11.2026):
 * „Baustellen: wirkt eng, viel Text, viel Infos, wenig Abstände … in allen
 * Ansichten. Nachkalkulation: viel Text, unübersichtlich … Detailansicht mit
 * einem Overlay … lädt sehr langsam, beim Tabwechsel wird nachgeladen.“
 *
 * Gemessen im echten Browser:
 * - Baustellen: am Tablet und Handy stehen Zustand und Maßlinie UNTER dem
 *   Text (vorher daneben, der Name brach in drei Zeilen), am Schreibtisch
 *   rechts daneben; Adresse/Telefon und Leitung/Team in getrennten Zeilen;
 *   nirgends seitlich zu rollen; ein Tipp auf die Maßlinie öffnet die Akte.
 * - Nachkalkulation: die Zeile nennt nur, wie viele Artikel ohne
 *   Einkaufspreis sind; das Seitenfenster schlüsselt auf; der Wechsel
 *   zwischen „Abgeschlossen“ und „Laufend“ zeigt die Liste sofort.
 */

const NR = 'LUFT-1';
const NK = 'LUFT-NK-1';
let kostensaetzeAngelegt = false;

async function abraeumen() {
  const { data: p } = await admin.from('projects').select('id').eq('company_id', BETRIEB).in('project_number', [NR, NK]);
  const ids = (p ?? []).map((x) => x.id as string);
  if (ids.length) {
    const { data: q } = await admin.from('quotes').select('id').eq('company_id', BETRIEB).in('project_id', ids);
    const qids = (q ?? []).map((x) => x.id as string);
    if (qids.length) {
      await admin.from('quote_lines').delete().in('quote_id', qids);
      await admin.from('quotes').delete().in('id', qids);
    }
  }
  const { data: r } = await admin.from('invoices').select('id').eq('company_id', BETRIEB).eq('project_number', NK);
  const rids = (r ?? []).map((x) => x.id as string);
  if (rids.length) {
    await admin.from('invoice_lines').delete().in('invoice_id', rids);
    await admin.from('invoices').delete().in('id', rids);
  }
  if (ids.length) await admin.from('projects').delete().in('id', ids);
  if (kostensaetzeAngelegt) {
    await admin.from('betrieb_kostensaetze').delete().eq('company_id', BETRIEB);
    kostensaetzeAngelegt = false;
  }
}
test.beforeEach(abraeumen);
test.afterEach(abraeumen);

/** Wo Text, Stand und Aktionen der Zeile liegen — und ob irgendetwas seitlich übersteht. */
async function zeileMessen(page: Page) {
  return page.evaluate((nr) => {
    const zeile = [...document.querySelectorAll<HTMLElement>('li.zeile')].find((li) => li.textContent?.includes(nr))!;
    const r = (el: Element | null) => el?.getBoundingClientRect() ?? null;
    const text = r(zeile.querySelector('.zeile-text'))!;
    const meta = r(zeile.querySelector('.zeile-meta'))!;
    const stand = r(zeile.querySelector('.zeile-stand'))!;
    const aktionen = r(zeile.querySelector('.zeile-aktionen'))!;
    const zeilen = [...zeile.querySelectorAll('.baustelle-zeile')].map((z) => z.getBoundingClientRect());
    return {
      // Wie weit der Text vor dem „⋯“ aufhört: nur der Spaltenabstand, wenn nichts dazwischen steht.
      luckeVorAktionen: aktionen.left - text.right,
      standUnterText: stand.top >= meta.bottom - 0.5,
      standRechts: stand.left >= text.right - 0.5,
      zeilenUntereinander: zeilen.length === 2 && zeilen[1].top >= zeilen[0].bottom - 0.5,
      seitlich: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ueberZeile: zeile.scrollWidth - zeile.clientWidth,
    };
  }, NR);
}

test('Baustellen: Zustand und Maßlinie unter dem Text am Handy und Tablet, daneben am Schreibtisch', async ({ page }) => {
  test.setTimeout(120_000);
  const { data: leute, error: leuteFehler } = await admin.from('users').select('id').eq('company_id', BETRIEB).limit(4);
  expect(leuteFehler).toBeNull();
  const team = (leute ?? []).map((u) => u.id as string);
  expect(team.length).toBeGreaterThanOrEqual(3);
  const { data: neu, error } = await admin.from('projects').insert({
    company_id: BETRIEB, project_number: NR, customer_name: 'Steirische Wohnbaugenossenschaft reg. Gen.m.b.H.',
    bezeichnung: 'Sanierung Stiegenhaus 1–4, Steigleitungen', address: 'Grazer Straße 101–115, 8200 Gleisdorf',
    contact_phone: '+43 316 123456', status: 'Aktiv', estimated_hours: 40, assigned_employees: team, project_managers: [],
  }).select('id').single();
  expect(error).toBeNull();

  await anmelden(page, CHEFIN.email);
  for (const { name, width, height } of [
    { name: 'Handy', width: 390, height: 844 },
    { name: 'Tablet', width: 834, height: 1112 },
    { name: 'Schreibtisch', width: 1440, height: 900 },
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/admin-projects');
    await expect(page.locator('li.zeile', { hasText: NR }).getByText('ohne Projektleitung')).toBeVisible({ timeout: 15_000 });
    const m = await zeileMessen(page);
    expect(m.seitlich, `${name}: nichts seitlich zu rollen`).toBeLessThanOrEqual(0);
    expect(m.ueberZeile, `${name}: nichts steht über die Zeile`).toBeLessThanOrEqual(0);
    expect(m.zeilenUntereinander, `${name}: Adresse/Telefon und Leitung/Team in zwei Zeilen`).toBe(true);
    if (width < 1200) {
      expect(m.standUnterText, `${name}: Zustand und Maßlinie unter dem Text`).toBe(true);
      expect(m.luckeVorAktionen, `${name}: der Text reicht bis an das „⋯“`).toBeLessThanOrEqual(16.5);
    } else {
      expect(m.standRechts, `${name}: Zustand und Maßlinie rechts neben dem Text`).toBe(true);
    }
  }

  // Ein Tipp auf die Maßlinie öffnet die Akte wie jeder andere in der Zeile.
  const stand = (await page.locator('li.zeile', { hasText: NR }).locator('.zeile-stand .masslinie').boundingBox())!;
  await page.mouse.click(stand.x + stand.width / 2, stand.y + stand.height / 2);
  await expect(page).toHaveURL(new RegExp(`/admin-projects/${neu!.id}$`));
  await keineFehlermeldung(page);
});

test('Nachkalkulation: kurze Zeile, Aufstellung im Seitenfenster, Wechsel ohne Nachladen', async ({ page }) => {
  test.setTimeout(120_000);
  const { data: saetze } = await admin.from('betrieb_kostensaetze').select('id').eq('company_id', BETRIEB);
  if (!saetze?.length) {
    const { error } = await admin.from('betrieb_kostensaetze').insert({ company_id: BETRIEB, fach: 42, helper: 28 });
    expect(error).toBeNull();
    kostensaetzeAngelegt = true;
  }
  const { data: p } = await admin.from('projects').insert({
    company_id: BETRIEB, project_number: NK, customer_name: 'Bäckerei Luft', status: 'Abgeschlossen',
  }).select('id').single();
  const r = await admin.from('invoices').insert({
    company_id: BETRIEB, invoice_number: 'RE-LUFT-1', project_id: p!.id, project_number: NK, customer_name: 'Bäckerei Luft',
    invoice_date: '2026-10-20', due_date: '2026-11-03', subtotal_netto: 1200, total_netto: 1200, total_vat: 240,
    total_brutto: 1440, vat_rate: 0.2, payment_status: 'Offen',
  }).select('id').single();
  expect(r.error).toBeNull();
  const q = await admin.from('quotes').insert({
    company_id: BETRIEB, quote_number: 'AN-LUFT-1', customer_name: 'Bäckerei Luft', quote_date: '2026-09-01',
    valid_until: '2026-10-01', status: 'Angenommen', vat_rate: 0.2, project_id: p!.id, project_number: NK,
    subtotal_netto: 1200, total_netto: 1200, total_vat: 240, total_brutto: 1440,
  }).select('id').single();
  expect(q.error).toBeNull();
  await admin.from('quote_lines').insert({
    company_id: BETRIEB, quote_id: q.data!.id, position: 1, label: 'Sonderteil Luft', qty: 2, unit: 'Stk', unit_price: 300, netto: 600,
  });

  await anmelden(page, CHEFIN.email);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/costing');
  const zeile = page.locator('li.zeile', { hasText: NK });
  await expect(zeile).toBeVisible({ timeout: 20_000 });
  await expect(zeile.getByText('1 Artikel ohne Einkaufspreis')).toBeVisible();
  await expect(zeile).not.toContainText('Sonderteil Luft');

  await zeile.getByRole('button', { name: new RegExp(NK) }).click();
  const fenster = page.getByRole('dialog', { name: `Nachkalkulation ${NK}` });
  await expect(fenster).toBeVisible();
  await expect(fenster.getByText('Aufstellung')).toBeVisible();
  await expect(fenster.getByRole('listitem')).toHaveText('Sonderteil Luft (aus dem Angebot)');
  await expect(fenster.getByRole('link', { name: 'Akte der Baustelle öffnen' })).toHaveAttribute('href', `/admin-projects/${p!.id}`);
  await fenster.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(fenster).toBeHidden();

  // Die laufenden sind im Hintergrund schon gerechnet: der Wechsel zeigt sie ohne Platzhalter.
  await page.waitForLoadState('networkidle');
  const gruppe = page.getByRole('group', { name: 'Baustellen' });
  await gruppe.getByRole('button', { name: 'Laufend' }).click();
  await expect(page.locator('.karte [aria-busy="true"]')).toHaveCount(0);
  await expect(page.locator('.karte li.zeile').first()).toBeVisible({ timeout: 500 });
  await gruppe.getByRole('button', { name: 'Abgeschlossen' }).click();
  await expect(page.locator('.karte [aria-busy="true"]')).toHaveCount(0);
  await expect(zeile).toBeVisible({ timeout: 500 });
  await keineFehlermeldung(page);
});

/*
  RECHNUNGEN MIT LUFT, ABZUG IM FENSTER, PFEIL DER AUSWAHL (Auftrag
  04.11.2026): „bei Rechnungen ist alles sehr crowded … der Punkt
  ‚abzüglich‘ wird immer falsch/abgeschnitten angezeigt … der Pfeil ist zu
  nah am Rand, er sollte in etwa gleich sein wie der Kalender“.
*/
const RE = ['RE-LUFT-T', 'RE-LUFT-A', 'RE-LUFT-S'];

async function rechnungenAbraeumen() {
  const { data } = await admin.from('invoices').select('id').eq('company_id', BETRIEB).in('invoice_number', RE);
  const ids = (data ?? []).map((x) => x.id as string);
  if (ids.length) {
    await admin.from('zahlungseingaenge').delete().in('invoice_id', ids);
    await admin.from('invoice_lines').delete().in('invoice_id', ids);
    await admin.from('invoices').delete().in('id', ids);
  }
}

test.describe('Rechnungen', () => {
  test.beforeEach(rechnungenAbraeumen);
  test.afterEach(rechnungenAbraeumen);

  test('die Zeile mit Teilzahlung: Linie beim Betrag, „überfällig“ am Datum, nichts überlagert — und der Abzug im Fenster steht ganz da', async ({ page }) => {
    test.setTimeout(120_000);
    const { data: p } = await admin.from('projects').select('id, project_number').eq('company_id', BETRIEB).limit(1).single();
    const kopf = (nummer: string, rest: Record<string, unknown>) => ({
      company_id: BETRIEB, invoice_number: nummer, project_id: p!.id, project_number: p!.project_number,
      customer_name: 'Steirische Wohnbaugenossenschaft reg. Gen.m.b.H.', invoice_date: '2026-09-30', due_date: '2026-10-14',
      vat_rate: 0.2, payment_status: 'Offen', ...rest,
    });
    const t = await admin.from('invoices').insert(kopf('RE-LUFT-T', {
      subtotal_netto: 2454.9, total_netto: 2454.9, total_vat: 490.98, total_brutto: 2945.88,
      mahnstufe: 1, gemahnt_am: '2026-10-21', mahnfrist: '2026-10-28',
    })).select('id').single();
    expect(t.error).toBeNull();
    // Die Teilzahlung wie im Betrieb: als Zahlungseingang, der Stand folgt daraus.
    const z = await admin.from('zahlungseingaenge').insert({ company_id: BETRIEB, invoice_id: t.data!.id, betrag: 1000, datum: '2026-10-20', art: 'Überweisung' });
    expect(z.error).toBeNull();
    const a = await admin.from('invoices').insert(kopf('RE-LUFT-A', {
      art: 'anzahlung', subtotal_netto: 1500, total_netto: 1500, total_vat: 300, total_brutto: 1800, payment_status: 'Bezahlt', bezahlt_betrag: 1800,
    })).select('id').single();
    expect(a.error).toBeNull();
    const s = await admin.from('invoices').insert(kopf('RE-LUFT-S', {
      art: 'schluss', subtotal_netto: 5000, total_netto: 3500, total_vat: 700, total_brutto: 4200,
      gesamt_netto: 5000, gesamt_vat: 1000, gesamt_brutto: 6000, due_date: '2099-12-31',
      vorrechnungen: [{ invoiceId: a.data!.id, invoiceNumber: 'RE-LUFT-A', invoiceDate: '2026-09-30', netto: 1500, vat: 300, brutto: 1800 }],
    })).select('id').single();
    expect(s.error).toBeNull();

    await anmelden(page, CHEFIN.email);
    for (const { name, width, height } of [
      { name: 'Handy', width: 390, height: 844 },
      { name: 'Tablet', width: 834, height: 1112 },
      { name: 'Schreibtisch', width: 1440, height: 900 },
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto('/invoices');
      // Die Liste, nicht der Mahnlauf darüber: dort steht dieselbe Rechnung noch einmal.
      const zeile = page.locator('li.zeile-gestapelt', { hasText: 'RE-LUFT-T' });
      await expect(zeile.getByRole('img', { name: /bezahlt von/ })).toBeVisible({ timeout: 15_000 });
      const m = await zeile.evaluate((li) => {
        const r = (el: Element | null) => el!.getBoundingClientRect();
        const ueber = (x: DOMRect, y: DOMRect) => x.left < y.right && y.left < x.right && x.top < y.bottom && y.top < x.bottom;
        const linie = r(li.querySelector('.masslinie'));
        const wort = r([...li.querySelectorAll('.zeile-meta span')].find((s) => s.textContent === 'überfällig')!);
        const texte = [...li.querySelectorAll('.zeile-meta, .zeile-zustand, .zeile-zahlen-betrag')].map((e) => e.getBoundingClientRect());
        return {
          linieInZahlen: !!li.querySelector('.zeile-zahlen .masslinie'),
          ueberlagert: texte.some((x) => ueber(x, linie)) || ueber(wort, linie),
          seitlich: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      expect(m.linieInZahlen, `${name}: die Linie steht beim Betrag`).toBe(true);
      expect(m.ueberlagert, `${name}: nichts liegt auf der Linie`).toBe(false);
      expect(m.seitlich, `${name}: nichts seitlich zu rollen`).toBeLessThanOrEqual(0);

      // Das Fenster der Schlussrechnung: der Abzug steht ganz im Fenster, Datum, netto und USt darunter.
      await page.locator('li.zeile-gestapelt', { hasText: 'RE-LUFT-S' }).getByRole('button', { name: /RE-LUFT-S/ }).click();
      const fenster = page.getByRole('dialog', { name: /RE-LUFT-S/ });
      const abzug = fenster.locator('.rechnung-detail-abzug');
      await expect(abzug.locator('dt')).toContainText('abzüglich RE-LUFT-A');
      await expect(abzug.locator('.rechnung-detail-zusatz')).toHaveText(/^vom 30\.09\.2026 · netto €\s1\s500,00 \+ USt €\s300,00$/);
      await abzug.scrollIntoViewIfNeeded();
      const lage = await abzug.evaluate((el) => {
        const dd = el.querySelector('dd')!;
        const gruppe = el.closest('dl')!.getBoundingClientRect();
        const b = dd.getBoundingClientRect();
        return { rechts: b.right - gruppe.right, ueber: dd.scrollWidth - dd.clientWidth };
      });
      expect(lage.rechts, `${name}: der Betrag endet im Fenster`).toBeLessThanOrEqual(0.5);
      expect(lage.ueber, `${name}: der Betrag passt in seine Spalte`).toBeLessThanOrEqual(0);
      await fenster.getByRole('button', { name: 'Schließen', exact: true }).click();
      await expect(fenster).toBeHidden();
    }
    await keineFehlermeldung(page);
  });
});

test('Auswahlfeld: der Pfeil steht so weit vom Rand wie das Kalenderzeichen im Datumsfeld', async ({ page }) => {
  test.setTimeout(60_000);
  await anmelden(page, CHEFIN.email);
  await page.setViewportSize({ width: 1440, height: 900 });
  // Auswahl und Datum auf zwei Seiten, die sie immer zeigen: gemessen wird je vom Rand des Felds.
  await page.goto('/settings/rechnung');
  const auswahl = page.locator('#r-vat');
  await expect(auswahl).toBeVisible({ timeout: 15_000 });
  /** Wie weit das letzte dunkle Bildpunkt-Feld vom rechten Rand des Felds entfernt ist. */
  const abstand = async (feld: typeof auswahl) => {
    await feld.scrollIntoViewIfNeeded();
    const bild = await feld.screenshot();
    return page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const x = c.getContext('2d')!;
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, img.width, img.height).data;
      for (let col = img.width - 4; col > img.width / 2; col--) {
        for (let row = 6; row < img.height - 6; row++) {
          const i = (row * img.width + col) * 4;
          if (d[i] + d[i + 1] + d[i + 2] < 300) return img.width - 1 - col;
        }
      }
      return -1;
    }, `data:image/png;base64,${bild.toString('base64')}`);
  };
  const pfeil = await abstand(auswahl);
  await page.goto('/invoices');
  const datum = page.locator('input[type=date]').first();
  await expect(datum).toBeVisible({ timeout: 15_000 });
  const kalender = await abstand(datum);
  expect(kalender, 'Kalenderzeichen gefunden').toBeGreaterThan(8);
  // Vorher stand der Pfeil 5 px vom Rand, das Kalenderzeichen 17 px.
  expect(Math.abs(pfeil - kalender), `Pfeil ${pfeil} px, Kalender ${kalender} px`).toBeLessThanOrEqual(2);
});
