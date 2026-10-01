import { test, expect, type Page } from '@playwright/test';
import { admin, PASSWORT } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * Die Startseite mit einem vollen Betrieb (Nachtest 01.10.2026, Paket B,
 * Abnahme): 40 aktive Baustellen, 20 Anforderungen, 10 Personen — am
 * Telefon (390 px) und am Schreibtisch (1280 px).
 *
 * Geprüft wird, was mit dem Betrieb wachsen könnte und nicht soll:
 *   - kein Abschnitt zeigt mehr als drei Zeilen;
 *   - die Seite bleibt bei etwa zwei Bildschirmhöhen;
 *   - nichts ragt seitlich heraus;
 *   - keine Fehlermeldung, nichts „nicht geladen“.
 *
 * Ein eigener Betrieb, damit die anderen Wege ihren leeren Betrieb behalten.
 */

const BETRIEB = 'startseite-gross';
const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
const tag = (n: number) => {
  const d = new Date(`${heute}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const KONTEN = {
  chefin: { email: 'chefin@startseite-gross.test', name: 'Andrea Steiner', rolle: 'Geschäftsführung' },
  lager: { email: 'lager@startseite-gross.test', name: 'Sabine Fuchs', rolle: 'Verwaltung' },
  monteur: { email: 'monteur@startseite-gross.test', name: 'Markus Leitner', rolle: 'Mitarbeiter' },
};

async function konto(email: string, name: string, rolle: string, eintritt?: string): Promise<string> {
  const vorhanden = await admin.auth.admin.listUsers({ perPage: 1000 });
  const alt = vorhanden.data.users.find((u) => u.email === email);
  if (alt) await admin.auth.admin.deleteUser(alt.id);
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORT, email_confirm: true,
    app_metadata: { company_id: BETRIEB, role: rolle, active: true },
  });
  if (error) throw error;
  const uid = data.user!.id;
  const { error: f } = await admin.from('users').upsert({
    id: uid, company_id: BETRIEB, name, email, role: rolle, active: true,
    ...(eintritt ? { app_start_date: eintritt } : {}),
  });
  if (f) throw new Error(f.message);
  return uid;
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  await admin.from('companies').upsert({
    id: BETRIEB, name: 'Haustechnik Steiner GmbH', address_line: 'Hauptplatz 1, 8200 Gleisdorf',
    strasse: 'Hauptplatz 1', plz: '8200', ort: 'Gleisdorf', iban: 'AT611904300234573201',
  });
  for (const t of ['material_orders', 'assignments', 'time_entries', 'materials', 'projects']) {
    await admin.from(t).delete().eq('company_id', BETRIEB);
  }

  const chefin = await konto(KONTEN.chefin.email, KONTEN.chefin.name, KONTEN.chefin.rolle);
  // Ohne Eintritt: die Verwaltung der Skizze hat keine eigenen fehlenden Tage.
  await konto(KONTEN.lager.email, KONTEN.lager.name, KONTEN.lager.rolle);
  const monteur = await konto(KONTEN.monteur.email, KONTEN.monteur.name, KONTEN.monteur.rolle, tag(-30));
  const leute = [{ uid: monteur, name: KONTEN.monteur.name }];
  for (let i = 1; i <= 7; i += 1) {
    const name = `Monteur ${i}`;
    leute.push({ uid: await konto(`m${i}@startseite-gross.test`, name, 'Mitarbeiter', tag(-30)), name });
  }

  // 40 aktive Baustellen; jede vierte ohne Projektleiter, jede fünfte über dem Endtermin.
  const baustellen = Array.from({ length: 40 }, (_, i) => ({
    company_id: BETRIEB,
    project_number: `PR-2026-${String(150 + i).padStart(4, '0')}`,
    customer_name: `Kunde ${String(i + 1).padStart(2, '0')}`,
    address: `Ludwig-Binder-Straße ${i + 1}, 8200 Gleisdorf`,
    status: 'Aktiv',
    project_managers: i % 4 === 0 ? [] : [chefin],
    estimated_hours: i % 3 === 0 ? 40 : null,
    end_date: i % 5 === 0 ? tag(-3) : null,
  }));
  const { error: pf } = await admin.from('projects').insert(baustellen);
  if (pf) throw new Error(pf.message);

  // Heute im Einsatz: sechs Leute auf fünf Baustellen, der Monteur zweimal.
  const einsaetze = [
    ...leute.slice(0, 6).map((l, i) => ({
      company_id: BETRIEB, date: heute, project_number: baustellen[i % 5].project_number,
      user_id: l.uid, user_name: l.name, comment: 'Steigleitungen spülen, Druckprobe mit Protokoll',
    })),
    { company_id: BETRIEB, date: heute, project_number: baustellen[7].project_number, user_id: monteur, user_name: KONTEN.monteur.name, comment: 'Wartung Gastherme' },
  ];
  const { error: af } = await admin.from('assignments').insert(einsaetze);
  if (af) throw new Error(af.message);

  // Sechs Lagerartikel unter der Mindestmenge.
  const { error: mf } = await admin.from('materials').insert(Array.from({ length: 6 }, (_, i) => ({
    company_id: BETRIEB, name: `Pressfitting Bogen ${15 + i} mm`, unit: 'Stk', stock: 2 + i, lagerartikel: true, mindestmenge: 20,
  })));
  if (mf) throw new Error(mf.message);

  // 20 Anforderungen: offen (zwei Eil), bestellt (zwei überfällig, eine heute), abholbereit, erledigt.
  const anforderungen = Array.from({ length: 20 }, (_, i) => {
    const l = leute[i % leute.length];
    // Jede Zeile mit denselben Feldern: ein Sammel-Insert setzt fehlende sonst auf NULL statt auf den Vorgabewert.
    const basis = {
      id: crypto.randomUUID(), company_id: BETRIEB, material_name: `Artikel ${i + 1}`, quantity: 1 + (i % 5),
      transaction_type: 'order', user_id: l.uid, user_name: l.name, project_number: baustellen[i].project_number,
      is_urgent: false, processed: false, beschaffung: null as string | null, bestellt_am: null as string | null,
      liefertermin: null as string | null,
    };
    if (i < 9) return { ...basis, status: 'Offen', is_urgent: i < 2 };
    if (i < 13) {
      return {
        ...basis, status: 'In Bearbeitung', beschaffung: 'einkauf', bestellt_am: new Date().toISOString(),
        liefertermin: i < 11 ? tag(-2 - i) : i === 11 ? heute : tag(5),
      };
    }
    if (i < 17) return { ...basis, status: 'Abholbereit' };
    return { ...basis, status: 'Erledigt', processed: true };
  });
  const { error: of } = await admin.from('material_orders').insert(anforderungen);
  if (of) throw new Error(of.message);
});

async function startseitePruefen(page: Page): Promise<number> {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Fertig ist die Seite, wenn kein Ladeblock mehr läuft.
  await expect(page.locator('[data-geladen="ja"]')).toHaveCount(1, { timeout: 20_000 });
  await expect(page.getByText(/Nicht geladen/)).toHaveCount(0);
  await keineFehlermeldung(page);

  // Höchstens drei Zeilen je Abschnitt — „und N weitere“ trägt den Rest.
  const abschnitte = page.locator('section.karte section[aria-label]');
  const n = await abschnitte.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i += 1) {
    expect(await abschnitte.nth(i).locator(':scope > ul > li').count()).toBeLessThanOrEqual(3);
  }

  const masse = await page.evaluate(() => ({
    hoehe: document.documentElement.scrollHeight,
    breite: document.documentElement.scrollWidth,
    sicht: window.innerHeight,
    sichtBreite: window.innerWidth,
  }));
  // Nichts ragt seitlich heraus.
  expect(masse.breite).toBeLessThanOrEqual(masse.sichtBreite);
  // Etwa zwei Bildschirmhöhen — mit Luft für Kopfleiste und Leiste unten.
  expect(masse.hoehe / masse.sicht).toBeLessThanOrEqual(2.25);
  return masse.hoehe / masse.sicht;
}

for (const [breite, hoehe, wo] of [[390, 844, 'am Telefon'], [1280, 900, 'am Schreibtisch']] as const) {
  test.describe(`Startseite mit vollem Betrieb ${wo}`, () => {
    test.use({ viewport: { width: breite, height: hoehe } });

    test('Geschäftsführung: Themen statt Listen, Heute, vier Kennzahlen', async ({ page }) => {
      await anmelden(page, KONTEN.chefin.email);
      const verhaeltnis = await startseitePruefen(page);
      test.info().annotations.push({ type: 'Höhe', description: `${verhaeltnis.toFixed(2)} Bildschirme` });
      await expect(page.getByText(/Handlungsbedarf/).first()).toBeVisible();
      await expect(page.getByText(/Themen?$/).first()).toBeVisible();
      await expect(page.getByRole('link', { name: /Aktive Baustellen/ })).toContainText('40');
      // Lagerarbeit gehört der Verwaltung, die es hier gibt.
      await expect(page.getByText(/Anforderungen offen/)).toHaveCount(0);
    });

    test('Verwaltung: Anforderungen, Bestellungen, Mindestmenge, Lieferungen heute', async ({ page }) => {
      await anmelden(page, KONTEN.lager.email);
      const verhaeltnis = await startseitePruefen(page);
      test.info().annotations.push({ type: 'Höhe', description: `${verhaeltnis.toFixed(2)} Bildschirme` });
      await expect(page.getByRole('region', { name: 'Offene Anforderungen' })).toContainText('und 6 weitere');
      await expect(page.getByRole('region', { name: 'Bestellt und überfällig' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Unter Mindestmenge' })).toContainText('und 3 weitere');
      await expect(page.getByText('1 Lieferung')).toBeVisible();

      // „und N weitere →“ führt auf die gefilterte Liste — der Filter steht dort.
      await page.getByRole('region', { name: 'Offene Anforderungen' }).getByRole('link', { name: /und 6 weitere/ }).click();
      await expect(page).toHaveURL(/\/anforderungen\?filter=offen/);
      await expect(page.getByText(/Gefiltert:/)).toBeVisible();
    });

    test('Monteur: Einsatz, Wie zuletzt, Danach', async ({ page }) => {
      await anmelden(page, KONTEN.monteur.email);
      await startseitePruefen(page);
      await expect(page.getByText('2 Einsätze')).toBeVisible();
      await expect(page.getByRole('heading', { name: /Danach/ })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Tage ohne Buchung' })).toBeVisible();
    });
  });
}
