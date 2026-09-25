/**
 * Der Betrieb, durch den geklickt wird.
 *
 * ANGELEGT WIRD ÜBER DEN DIENSTZUGANG, nicht über die App. Das ist Absicht:
 * geprüft werden soll der Weg des Monteurs, nicht das Anlegen von Konten —
 * und ein Aufbau, der selbst durch die Oberfläche geht, fällt bei jedem
 * Fehler in der Oberfläche gleich zweimal um, ohne zu sagen, welcher der
 * beiden gemeint war.
 *
 * LEER ZUM START. Der Aufbau räumt seinen Betrieb vorher ab; sonst stünde
 * beim zweiten Lauf die Buchung vom ersten im Weg, und eine Prüfung, die nur
 * auf einer frischen Datenbank durchgeht, glaubt einem irgendwann niemand
 * mehr.
 */
import { createClient } from '@supabase/supabase-js';

const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export const admin = createClient(API, SERVICE, { auth: { persistSession: false } });

export const BETRIEB = 'durchklick';
export const PASSWORT = 'durchklick-2026';

export const MONTEUR = { email: 'monteur@durchklick.test', name: 'Max Monteur' };
/*
  DAS BÜRO IST BUCHHALTUNG, nicht Verwaltung. „Rechnungen" steht nur der
  Buchhaltung und der Führung offen — mit der Verwaltungsrolle fehlt der
  Eintrag in der Navigation, und der Durchlauf sucht einen Verweis, den es für
  diesen Benutzer richtigerweise nicht gibt.
*/
export const BUERO = { email: 'buero@durchklick.test', name: 'Berta Büro' };
/*
  DIE CHEFIN GIBT ES WEGEN DES KATALOGIMPORTS. Er setzt Einkaufspreise, und
  die setzt nur die Geschäftsführung — mit der Buchhaltungsrolle fehlt der
  Reiter, richtigerweise.
*/
export const CHEFIN = { email: 'chefin@durchklick.test', name: 'Carla Chefin' };

export const BAUSTELLE = { nummer: 'B-2026-0001', kunde: 'Familie Huber' };
export const ARTIKEL = { name: 'Kupferrohr 15mm', einheit: 'm' };

/** Legt ein Konto an — oder richtet das vorhandene wieder her. */
async function konto(
  email: string, name: string, rolle: string,
): Promise<string> {
  /*
    MIT SEITENGRÖSSE. `listUsers()` liefert ohne Angabe die ersten fünfzig —
    auf einem Entwicklungsstapel, auf dem sich Konten angesammelt haben, ist
    das vorhandene Konto dann nicht dabei, und das Anlegen scheitert mit
    „already been registered". Auf einer frischen Datenbank fiel das nie auf.
  */
  const vorhanden = await admin.auth.admin.listUsers({ perPage: 1000 });
  const alt = vorhanden.data.users.find((u) => u.email === email);
  if (alt) await admin.auth.admin.deleteUser(alt.id);

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORT,
    email_confirm: true,
    app_metadata: { company_id: BETRIEB, role: rolle, active: true },
  });
  if (error) throw error;
  const uid = data.user!.id;
  const { error: fehler } = await admin.from('users').upsert({
    id: uid, company_id: BETRIEB, name, email, role: rolle, active: true,
  });
  if (fehler) throw new Error(fehler.message);
  return uid;
}

export default async function aufbau(): Promise<void> {
  // Mit Anschrift: ohne sie stellt die App keine Rechnung aus (§ 11 UStG,
  // Launch-Check 25.09.2026, M1) — ein Betrieb ohne sie ist ein anderer Test.
  await admin.from('companies').upsert({
    id: BETRIEB, name: 'Durchklick GmbH', address_line: 'Prüfgasse 1, 1010 Wien',
  });

  // Abräumen in der Reihenfolge der Abhängigkeiten: die Fremdschlüssel halten
  // sonst fest, was weg soll.
  for (const t of [
    'work_sheet_zeiten', 'work_sheet_material', 'work_sheet_fotos', 'work_sheets',
    'invoice_positions', 'invoices', 'material_orders', 'time_entries',
    'assignments', 'datanorm_zeilen', 'datanorm_laeufe', 'material_prices',
    'rabattsaetze', 'materials', 'projects', 'customers', 'suppliers',
  ]) {
    await admin.from(t).delete().eq('company_id', BETRIEB);
  }

  await konto(MONTEUR.email, MONTEUR.name, 'Mitarbeiter');
  await konto(BUERO.email, BUERO.name, 'Buchhaltung');
  await konto(CHEFIN.email, CHEFIN.name, 'Geschäftsführung');

  const { error: kundeFehler } = await admin.from('customers').insert({
    company_id: BETRIEB, name: BAUSTELLE.kunde, address: 'Hauptstrasse 1, 1010 Wien',
  });
  if (kundeFehler) throw new Error(kundeFehler.message);

  const { error: baustelleFehler } = await admin.from('projects').insert({
    company_id: BETRIEB,
    project_number: BAUSTELLE.nummer,
    description: 'Badsanierung Huber',
    customer_name: BAUSTELLE.kunde,
    address: 'Hauptstrasse 1, 1010 Wien',
    status: 'Aktiv',
  });
  if (baustelleFehler) throw new Error(baustelleFehler.message);

  const { error: artikelFehler } = await admin.from('materials').insert({
    company_id: BETRIEB, name: ARTIKEL.name, unit: ARTIKEL.einheit, stock: 100,
    category: 'Rohre', article_number: 'KR-15',
  });
  if (artikelFehler) throw new Error(artikelFehler.message);
}
