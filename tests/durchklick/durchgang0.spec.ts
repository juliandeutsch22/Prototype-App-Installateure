import { test, expect, type Page } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, CHEFIN, MONTEUR, ARTIKEL } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * ZWEITER DURCHGANG (Paket 0, 12.11.2026): die Abläufe, die bis dahin keinen
 * Browserweg hatten — Urlaub entscheiden, Wartung anlegen, Mahnung
 * erzeugen, Wareneingang buchen. Im Durchgang liefen sie ohne Fehler; diese
 * Wege halten fest, dass es so bleibt. Geprüft wird je Weg, was der Betrieb
 * danach in der Datenbank stehen hat, nicht nur, was die Seite zeigt.
 */

/** Ein Montag in zwei Wochen — weit genug, dass kein anderer Weg dort plant. */
function montag(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7) + 7);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(d);
}

async function uid(email: string): Promise<string> {
  const { data } = await admin.from('users').select('id').eq('company_id', BETRIEB).eq('email', email).single();
  return (data as { id: string }).id;
}

/** Kein Fehler auf der Seite und keine abgelehnte Anfrage an die Datenbank. */
function ohneFehler(page: Page): string[] {
  const fehler: string[] = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/rest/v1/')) fehler.push(`${r.status()} ${r.url()}`);
  });
  return fehler;
}

test('Urlaub: der Monteur beantragt am Handy, die Chefin genehmigt, der Monteur sieht es', async ({ browser }) => {
  const tag = montag();
  const max = await uid(MONTEUR.email);
  await admin.from('vacations').delete().eq('user_id', max).eq('von', tag);
  try {
    const handy = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    const fehlerM = ohneFehler(handy);
    await anmelden(handy, MONTEUR.email);
    await handy.goto('/vacations');
    await handy.getByLabel('Von', { exact: true }).first().fill(tag);
    await handy.getByLabel('Bis (einschließlich)').first().fill(tag);
    await handy.getByRole('button', { name: 'Antrag einreichen' }).click();
    await expect.poll(async () => (await admin.from('vacations').select('status').eq('user_id', max).eq('von', tag)).data?.[0]?.status, { timeout: 15_000 })
      .toBe('Beantragt');

    const tisch = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    const fehlerC = ohneFehler(tisch);
    await anmelden(tisch, CHEFIN.email);
    await tisch.goto('/vacations');
    await tisch.getByRole('button', { name: 'Genehmigen' }).first().click();
    await expect.poll(async () => (await admin.from('vacations').select('status').eq('user_id', max).eq('von', tag)).data?.[0]?.status, { timeout: 15_000 })
      .toBe('Genehmigt');

    await handy.reload();
    await expect(handy.getByText(`Genehmigt von ${CHEFIN.name}`)).toBeVisible({ timeout: 15_000 });
    await keineFehlermeldung(handy);
    expect([...fehlerM, ...fehlerC]).toEqual([]);
  } finally {
    await admin.from('vacations').delete().eq('user_id', max).eq('von', tag);
  }
});

test('Wartung: am Handy anlegen, der nächste Termin folgt aus dem letzten, die Liste nennt sie überfällig', async ({ page }) => {
  const ANLAGE = 'Durchgang0 Gastherme';
  await admin.from('wartungen').delete().eq('company_id', BETRIEB).eq('anlage', ANLAGE);
  const fehler = ohneFehler(page);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await anmelden(page, CHEFIN.email);
    await page.goto('/wartungen');
    await page.getByRole('button', { name: 'Neue Wartung' }).click();
    await page.getByPlaceholder('Name, Anschrift, Telefon oder E-Mail').fill('Huber');
    await page.getByRole('button', { name: BAUSTELLE.kunde }).first().click();
    await page.getByPlaceholder('z. B. Therme im Keller').fill(ANLAGE);
    // Zuletzt vor einem Jahr und zehn Tagen, Intervall zwölf Monate: seit zehn Tagen fällig.
    const zuletzt = new Date();
    zuletzt.setFullYear(zuletzt.getFullYear() - 1);
    zuletzt.setDate(zuletzt.getDate() - 10);
    const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(zuletzt);
    await page.getByLabel(/Zuletzt gewartet/).fill(iso);
    const erwartet = new Date(`${iso}T12:00:00Z`);
    erwartet.setUTCFullYear(erwartet.getUTCFullYear() + 1);
    await expect(page.getByLabel(/Nächster Termin/)).toHaveValue(erwartet.toISOString().slice(0, 10));
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText(/Seit \d+ Tagen überfällig/).first()).toBeVisible({ timeout: 15_000 });
    const { data } = await admin.from('wartungen').select('anlage, intervall_monate').eq('company_id', BETRIEB).eq('anlage', ANLAGE);
    expect(data).toEqual([{ anlage: ANLAGE, intervall_monate: 12 }]);
    await keineFehlermeldung(page);
    expect(fehler).toEqual([]);
  } finally {
    await admin.from('wartungen').delete().eq('company_id', BETRIEB).eq('anlage', ANLAGE);
  }
});

test('Mahnung: aus dem Mahnlauf am Handy erzeugt — PDF, Stufe 1, neue Frist', async ({ page }) => {
  const NR = 'RE-DG0-0001';
  await admin.from('invoices').delete().eq('company_id', BETRIEB).eq('invoice_number', NR);
  const fehler = ohneFehler(page);
  try {
    expect((await admin.from('invoices').insert({
      company_id: BETRIEB, invoice_number: NR, project_number: BAUSTELLE.nummer, customer_name: BAUSTELLE.kunde,
      invoice_date: '2026-10-01', due_date: '2026-10-15', total_netto: 1000, total_vat: 200, total_brutto: 1200, payment_status: 'Offen',
    })).error).toBeNull();
    await page.setViewportSize({ width: 390, height: 844 });
    await anmelden(page, CHEFIN.email);
    await page.goto('/invoices');
    const zeile = page.getByRole('region', { name: /Mahnlauf/ }).or(page.locator('section', { hasText: 'Mahnlauf' })).first();
    await expect(zeile.getByText(NR)).toBeVisible({ timeout: 15_000 });
    await zeile.getByRole('button', { name: 'Mahnen' }).first().click();
    const fenster = page.getByRole('dialog');
    await expect(fenster).toContainText('Zahlungserinnerung');
    const [pdf] = await Promise.all([page.waitForEvent('download'), fenster.getByRole('button', { name: 'Erzeugen' }).click()]);
    expect(pdf.suggestedFilename()).toBe(`Zahlungserinnerung_${NR}.pdf`);
    await expect.poll(async () => {
      const { data } = await admin.from('invoices').select('mahnstufe, gemahnt_am, mahnfrist').eq('company_id', BETRIEB).eq('invoice_number', NR).single();
      return data as { mahnstufe: number; gemahnt_am: string | null; mahnfrist: string | null } | null;
    }, { timeout: 15_000 }).toMatchObject({ mahnstufe: 1 });
    const { data: r } = await admin.from('invoices').select('gemahnt_am, mahnfrist').eq('company_id', BETRIEB).eq('invoice_number', NR).single();
    const stand = r as { gemahnt_am: string; mahnfrist: string };
    expect(stand.mahnfrist > stand.gemahnt_am).toBe(true);
    await keineFehlermeldung(page);
    expect(fehler).toEqual([]);
  } finally {
    await admin.from('invoices').delete().eq('company_id', BETRIEB).eq('invoice_number', NR);
  }
});

test('Wareneingang: am Handy eingebucht, der Bestand steigt um die Menge', async ({ page }) => {
  const { data: art } = await admin.from('materials').select('id, stock').eq('company_id', BETRIEB).eq('name', ARTIKEL.name).single();
  const artikel = art as { id: string; stock: number };
  const fehler = ohneFehler(page);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await anmelden(page, CHEFIN.email);
    await page.goto('/lager');
    await page.getByRole('button', { name: 'Wareneingang' }).first().click();
    await page.getByRole('dialog').getByText(ARTIKEL.name).first().click();
    const fenster = page.getByRole('dialog', { name: `Wareneingang: ${ARTIKEL.name}` });
    await fenster.getByLabel(`Menge (${ARTIKEL.einheit})`).fill('5');
    // Ohne Lieferant bucht der Eingang nicht — er gehört ins Bewegungsprotokoll.
    await fenster.getByRole('button', { name: 'Einbuchen' }).click();
    await expect(fenster.getByRole('alert')).toContainText('Von welchem Lieferanten');
    await fenster.getByLabel('Lieferant').fill('Durchgang0 Großhandel');
    await fenster.getByLabel('Lieferschein-Nr.').fill('LS-DG0-1');
    await fenster.getByRole('button', { name: 'Einbuchen' }).click();
    await expect.poll(async () => Number((await admin.from('materials').select('stock').eq('id', artikel.id).single()).data?.stock), { timeout: 15_000 })
      .toBe(Number(artikel.stock) + 5);
    const { data: bew } = await admin.from('lagerbewegungen').select('menge, lieferant, lieferschein')
      .eq('company_id', BETRIEB).eq('lieferschein', 'LS-DG0-1');
    expect(bew).toEqual([{ menge: 5, lieferant: 'Durchgang0 Großhandel', lieferschein: 'LS-DG0-1' }]);
    await keineFehlermeldung(page);
    expect(fehler).toEqual([]);
  } finally {
    // Nur der lokale Prüfbetrieb: Bestand zurück, damit andere Wege ihn wie gewohnt vorfinden.
    await admin.from('lagerbewegungen').delete().eq('company_id', BETRIEB).eq('lieferschein', 'LS-DG0-1');
    await admin.from('materials').update({ stock: artikel.stock }).eq('id', artikel.id);
  }
});
