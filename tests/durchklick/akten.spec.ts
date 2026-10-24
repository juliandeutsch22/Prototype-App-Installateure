import { test, expect } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, CHEFIN, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

// Die Naht zur Datenbank: lesen, bewusst bearbeiten, Abbrechen ohne Verlust,
// speichern und nach einem erneuten Öffnen denselben Stand lesen.
test('Die drei Akten behalten ihre Schreibwege und geschützten Entwürfe', async ({ page }) => {
  test.setTimeout(120_000);
  const { data: baustelle, error: bFehler } = await admin.from('projects').select('id, description, project_number')
    .eq('company_id', BETRIEB).eq('project_number', BAUSTELLE.nummer).single();
  const { data: kunde, error: kFehler } = await admin.from('customers').select('id, notes')
    .eq('company_id', BETRIEB).eq('name', BAUSTELLE.kunde).single();
  const { data: person, error: pFehler } = await admin.from('users').select('id, name, role')
    .eq('company_id', BETRIEB).eq('email', MONTEUR.email).single();
  expect([bFehler, kFehler, pFehler]).toEqual([null, null, null]);
  await anmelden(page, CHEFIN.email);
  try {
    await page.goto(`/admin-projects/${baustelle!.id}`);
    /*
      30 STATT 10 SEKUNDEN FÜR DEN ERSTEN AUFBAU (24.10.2026). Dieser Weg ist
      der erste im WebKit-Projekt: der Browser ist kalt, und nach dem `goto`
      startet die App neu (Anmeldung, Betrieb, Seitencode, Baustelle). In der
      CI brauchte schon die Anmeldung davor bis zu 20 s; die Reiter kamen
      zweimal in drei Läufen nicht binnen 10 s. Danach gilt wieder die
      übliche Wartezeit.
    */
    await expect(page.getByRole('tab')).toHaveText(['Übersicht', 'Scheine', 'Termine', 'Pläne'], { timeout: 30_000 });
    await expect(page.getByLabel(/Projektnummer/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
    const bFenster = page.getByRole('dialog', { name: 'Baustelle bearbeiten' });
    const beschreibung = bFenster.getByLabel('Beschreibung / Auftragsumfang');
    await beschreibung.fill('Aktenprüfung · Auftrag bleibt vollständig');
    await bFenster.getByRole('button', { name: 'Schließen', exact: true }).click();
    await page.getByRole('dialog', { name: 'Ungespeicherte Änderungen verwerfen?' }).getByRole('button', { name: 'Abbrechen' }).click();
    await expect(beschreibung).toHaveValue('Aktenprüfung · Auftrag bleibt vollständig');
    await bFenster.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(bFenster).toBeHidden();
    await expect(page.getByText('Aktenprüfung · Auftrag bleibt vollständig')).toBeVisible();
    const bStand = await admin.from('projects').select('description, project_number').eq('id', baustelle!.id).single();
    expect(bStand.data).toEqual({ description: 'Aktenprüfung · Auftrag bleibt vollständig', project_number: baustelle!.project_number });
    await page.getByRole('tab', { name: 'Termine' }).click();
    await expect(page.getByRole('button', { name: 'Termin anlegen', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Pläne' }).click();
    await expect(page.getByRole('heading', { name: 'Pläne und Dokumente' })).toBeVisible();
    await keineFehlermeldung(page);

    await page.goto(`/customers/${kunde!.id}`);
    await expect(page.getByRole('tab')).toHaveText(['Übersicht', 'Baustellen', 'Belege', 'Termine und Wartungen', 'Stammdaten']);
    await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
    const kFenster = page.getByRole('dialog', { name: 'Kunde bearbeiten' });
    const kundenname = kFenster.getByLabel('Name', { exact: false }).first();
    const gespeicherterName = await kundenname.inputValue();
    await kundenname.fill(`${gespeicherterName} · Entwurf`);
    // Speichern muss schon bei einer Änderung ganz oben erreichbar sein.
    await expect(kFenster.getByRole('button', { name: 'Speichern', exact: true })).toBeInViewport();
    await kundenname.fill(gespeicherterName);
    await kFenster.getByLabel('Notiz').fill('Aktenprüfung · Schlüssel im Büro');
    await kFenster.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(kFenster).toBeHidden();
    await expect(page.getByText('Aktenprüfung · Schlüssel im Büro')).toBeVisible();
    expect((await admin.from('customers').select('notes').eq('id', kunde!.id).single()).data?.notes).toBe('Aktenprüfung · Schlüssel im Büro');
    await page.getByRole('tab', { name: 'Belege' }).click();
    await expect(page.getByRole('heading', { name: 'Rechnungen', exact: true })).toBeVisible();
    await keineFehlermeldung(page);

    await page.goto(`/user-mgmt/${person!.id}`);
    await expect(page.getByRole('tab')).toHaveText(['Profil', 'Arbeitszeit und Urlaub', 'Zugang und Rechte']);
    await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
    const pFenster = page.getByRole('dialog', { name: 'Benutzer bearbeiten' });
    await pFenster.getByLabel('Name', { exact: false }).first().fill('Max Monteur · Aktenprüfung');
    await pFenster.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(pFenster).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Max Monteur · Aktenprüfung' })).toBeVisible();
    expect((await admin.from('users').select('name, role').eq('id', person!.id).single()).data)
      .toEqual({ name: 'Max Monteur · Aktenprüfung', role: person!.role });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Max Monteur · Aktenprüfung' })).toBeVisible();
    await page.getByRole('tab', { name: 'Arbeitszeit und Urlaub' }).click();
    await expect(page.getByRole('heading', { name: 'Zeitkonto-Einstellungen' })).toBeVisible();
    await page.getByRole('tab', { name: 'Zugang und Rechte' }).click();
    await expect(page.getByRole('button', { name: 'Passwort-Mail senden' })).toBeVisible();
    await keineFehlermeldung(page);
  } finally {
    // Ausschließlich der örtliche Durchklick-Betrieb; nachfolgende Wege
    // benutzen dieselben Personen und Auftragsbezeichnungen.
    for (const antwort of await Promise.all([
      admin.from('projects').update({ description: baustelle!.description }).eq('company_id', BETRIEB).eq('id', baustelle!.id),
      admin.from('customers').update({ notes: kunde!.notes }).eq('company_id', BETRIEB).eq('id', kunde!.id),
      admin.from('users').update({ name: person!.name }).eq('company_id', BETRIEB).eq('id', person!.id),
    ])) expect(antwort.error).toBeNull();
  }
});
