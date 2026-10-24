import { test, expect } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, MONTEUR } from './aufbau';
import { anmelden } from './helfer';

/**
 * Pläne sofort widerrufen (A14, 24.10.2026): der Monteur öffnet einen Plan
 * seiner Baustelle; das Büro stellt ihn auf „nur fürs Büro“; beim nächsten
 * Tippen öffnet er nicht mehr — auch wenn die Liste ihn noch zeigt, weil sie
 * seither nicht neu geladen wurde.
 *
 * Vorher galten die Adressen eine Stunde und kamen mit der Liste: der
 * zweite Klick hätte die Datei noch geöffnet.
 */

const EIMER = 'baustellendokumente';
let projektId = '';
let dokId = '';
let pfad = '';
/** Das Team vorher — andere Wege rechnen mit der Baustelle, wie sie angelegt ist. */
let teamVorher: string[] | null = null;

test.beforeAll(async () => {
  const monteur = await admin.from('users').select('id').eq('email', MONTEUR.email).single();
  if (monteur.error) throw new Error(monteur.error.message);
  const projekt = await admin.from('projects').select('id, assigned_employees')
    .eq('company_id', BETRIEB).eq('project_number', BAUSTELLE.nummer).single();
  if (projekt.error) throw new Error(projekt.error.message);
  projektId = (projekt.data as { id: string }).id;
  teamVorher = (projekt.data as { assigned_employees: string[] | null }).assigned_employees;
  const team = new Set([...(teamVorher ?? []), (monteur.data as { id: string }).id]);
  const t = await admin.from('projects').update({ assigned_employees: [...team] }).eq('id', projektId);
  if (t.error) throw new Error(t.error.message);

  pfad = `baustellen/${BETRIEB}/${projektId}/${crypto.randomUUID()}.pdf`;
  const hoch = await admin.storage.from(EIMER).upload(pfad, new Blob(['%PDF-1.4 Grundriss'], { type: 'application/pdf' }), { contentType: 'application/pdf' });
  if (hoch.error) throw new Error(hoch.error.message);
  const zeile = await admin.from('project_documents').insert({
    company_id: BETRIEB, project_id: projektId, pfad, dateiname: 'Grundriss Widerruf.pdf',
    mime: 'application/pdf', bytes: 18, hochgeladen_von_name: 'Büro',
  }).select('id').single();
  if (zeile.error) throw new Error(zeile.error.message);
  dokId = (zeile.data as { id: string }).id;
});

test.afterAll(async () => {
  await admin.from('project_documents').delete().eq('id', dokId);
  await admin.storage.from(EIMER).remove([pfad]);
  await admin.from('projects').update({ assigned_employees: teamVorher }).eq('id', projektId);
});

test('Monteur öffnet den Plan — nach „nur fürs Büro“ öffnet er nicht mehr', async ({ page, context }) => {
  await anmelden(page, MONTEUR.email);
  await page.goto('/my-projects');
  const plan = page.getByRole('button', { name: 'Grundriss Widerruf.pdf' });
  await expect(plan).toBeVisible({ timeout: 20_000 });

  /*
    GEPRÜFT WIRD DIE ANFRAGE, NICHT DIE ADRESSE DES FENSTERS. Ein Chromium
    ohne PDF-Anzeige (das der CI) lädt die Datei herunter, und das Fenster
    bleibt auf „about:blank“ — die App hat trotzdem alles richtig gemacht.
    Dass die Adresse gilt, zeigt der Abruf mit ihr.
  */
  const signiert = context.waitForEvent('request', {
    // Der Abruf mit der Adresse (GET mit Token), nicht ihre Anforderung (POST).
    predicate: (r) => r.method() === 'GET' && r.url().includes('/storage/v1/object/sign/') && r.url().includes('token='),
    timeout: 15_000,
  });
  const [fenster] = await Promise.all([context.waitForEvent('page'), plan.click()]);
  const adresse = (await signiert).url();
  const abruf = await page.request.get(adresse);
  expect(abruf.status()).toBe(200);
  expect((await abruf.body()).toString()).toContain('%PDF');
  await fenster.close();

  const umgestellt = await admin.from('project_documents').update({ nur_buero: true }).eq('id', dokId);
  expect(umgestellt.error).toBeNull();

  // Dieselbe Liste, ohne neu zu laden: der Plan steht noch da, öffnet aber nicht.
  await plan.click();
  await expect(page.getByRole('alert').filter({ hasText: /nicht öffnen|nur fürs Büro|not found/i })).toBeVisible({ timeout: 15_000 });
});
