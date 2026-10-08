#!/usr/bin/env node
/**
 * Testbestand „fünf Jahre Betrieb“ (Umbau „Lot“, Phase B, B1).
 *
 * Legt im LOKALEN Stapel einen eigenen Betrieb `ui-testbestand` an — mit den
 * Mengen aus Abschnitt 3 des Protokolls: 25 Mitarbeiter, 1.500 Kunden,
 * 3.000 Baustellen, 4.000 Angebote, 20.000 Einsätze, 150.000 Zeitbuchungen,
 * 15.000 Scheine, 12.000 Rechnungen, 14.000 Zahlungen, 30.000 Anforderungen,
 * 800 Lager- und 40.000 Katalogartikel, 60.000 Lagerbewegungen, 1.200
 * Wartungen und 3.000 Urlaubs- und Abwesenheitsanträge.
 *
 *   node scripts/ui-umbau/testbestand.mjs
 *
 * NUR GEGEN DEN LOKALEN STAPEL. Die Adressen von Schnittstelle und Datenbank
 * werden vor jedem Schritt geprüft; alles ausser 127.0.0.1 und localhost
 * bricht ab — auch wenn jemand die Umgebungsvariablen umbiegt. In der
 * Produktionsdatenbank wird nichts angelegt (CLAUDE.md).
 *
 * WIE GESCHRIEBEN WIRD. Die Konten (mit Passwort, zum Anmelden) über die
 * Verwaltungsschnittstelle der Anmeldung mit dem Dienstschlüssel des lokalen
 * Stapels — der Schlüssel ist der öffentliche Entwicklungsschlüssel der
 * Supabase-CLI, wie in `tests/supabase/helfer.ts`. Die Mengen als
 * Massen-Inserts (`insert … select from generate_series`) direkt in die
 * lokale Datenbank, mit der Rolle des Dienstschlüssels
 * (`request.jwt.claims = {"role":"service_role"}`): dieselben Auslöser
 * greifen wie bei einem Schreiben über die Schnittstelle mit diesem
 * Schlüssel. Über die Schnittstelle in Paketen hiesse das bei 400.000 Zeilen
 * eine Stunde statt Minuten.
 *
 * WAS DER DIENST NICHT RECHNET, rechnet dieses Skript: die Stunden einer
 * Buchung, die Summen einer Rechnung, den Stand „bezahlt“. Das sind
 * Beispieldaten für die Messung von Ladezeiten und Mengen — keine
 * Buchhaltung. Sie sind in sich stimmig genug, dass jede Liste und jede Akte
 * sich öffnen lässt.
 *
 * Läuft nur einmal: gibt es den Betrieb schon, bricht das Skript ab, statt
 * etwas zu überschreiben. Gelöscht wird nichts.
 */
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
// Öffentlicher Entwicklungsschlüssel der Supabase-CLI (siehe tests/supabase/helfer.ts) — kein Geheimnis.
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export const BETRIEB = 'ui-testbestand';
export const PASSWORT = 'Testbestand-2026!';
/** Stichtag des Bestands: „heute“ für den Generator, damit zwei Läufe dasselbe ergeben. */
const HEUTE = process.env.TESTBESTAND_HEUTE ?? '2026-10-07';

/** Die Sicherung: nur 127.0.0.1 oder localhost, sonst Abbruch. */
function nurLokal(adresse, was) {
  let host;
  try {
    host = new URL(adresse).hostname;
  } catch {
    throw new Error(`${was}: keine gültige Adresse (${adresse})`);
  }
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`${was} zeigt auf ${host} — dieses Skript schreibt nur in den lokalen Stapel (127.0.0.1/localhost).`);
  }
}

nurLokal(API, 'SUPABASE_URL');
nurLokal(DB, 'SUPABASE_DB_URL');

/**
 * Die Belegschaft: 25 Personen, alle Rollen, drei Lehrlinge, einer davon
 * unter 18. `anmeldung` ist das Konto, mit dem man sich in der App anmeldet.
 */
export const BELEGSCHAFT = [
  { kurz: 'gf', name: 'Gerda Geschäftsführerin', role: 'Geschäftsführung' },
  { kurz: 'admin', name: 'Adam Administrator', role: 'Administrator' },
  { kurz: 'verwaltung1', name: 'Vera Verwaltung', role: 'Verwaltung', kundenPflegen: true, katalogEinspielen: true },
  { kurz: 'verwaltung2', name: 'Viktor Verwaltung', role: 'Verwaltung' },
  { kurz: 'buchhaltung', name: 'Berta Buchhaltung', role: 'Buchhaltung', kundenPflegen: true },
  { kurz: 'pl1', name: 'Paul Projektleiter', role: 'Projektleiter', rechnungenLesen: true },
  { kurz: 'pl2', name: 'Petra Projektleiterin', role: 'Projektleiter' },
  { kurz: 'pl3', name: 'Peter Projektleiter', role: 'Projektleiter' },
  ...Array.from({ length: 14 }, (_, i) => ({
    kurz: `monteur${i + 1}`,
    name: `Monteur ${String(i + 1).padStart(2, '0')} ${['Huber', 'Gruber', 'Bauer', 'Wagner', 'Müller', 'Pichler', 'Steiner', 'Moser', 'Mayer', 'Hofer', 'Leitner', 'Berger', 'Fuchs', 'Eder'][i]}`,
    role: 'Mitarbeiter',
    einstufung: i < 3 ? 'obermonteur' : i < 11 ? 'facharbeiter' : 'helfer',
  })),
  { kurz: 'lehrling1', name: 'Lena Lehrling (U18)', role: 'Mitarbeiter', einstufung: 'lehrling', lehrbeginn: '2025-09-01', geburtsdatum: '2009-05-14' },
  { kurz: 'lehrling2', name: 'Luca Lehrling', role: 'Mitarbeiter', einstufung: 'lehrling', lehrbeginn: '2024-09-01', geburtsdatum: '2006-03-02' },
  { kurz: 'lehrling3', name: 'Lukas Lehrling', role: 'Mitarbeiter', einstufung: 'lehrling', lehrbeginn: '2023-09-01', geburtsdatum: '2005-11-20' },
].map((p) => ({ ...p, email: `${p.kurz}@${BETRIEB}.test` }));

/**
 * `--neu`: entfernt NUR den Testbetrieb `ui-testbestand` (Zeilen mit seiner
 * Kennung und seine Konten) — etwa nach einem abgebrochenen Lauf. Mehrere
 * Durchgänge, weil die Reihenfolge der Fremdschlüssel nicht feststeht; was
 * ein Auslöser im ersten Durchgang noch festhält, geht im nächsten.
 */
async function entfernen(db) {
  nurLokal(DB, 'SUPABASE_DB_URL');
  const tabellen = (await db.query(`
    select c.relname from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and a.attname = 'company_id' and c.relname <> 'users'`)).rows.map((r) => r.relname);
  for (let durchgang = 0; durchgang < 6; durchgang += 1) {
    let rest = 0;
    for (const t of [...tabellen, 'users']) {
      try {
        await db.query(`delete from public.${t} where company_id = $1`, [BETRIEB]);
      } catch {
        rest += 1;
      }
    }
    if (!rest) break;
  }
  await db.query('delete from public.companies where id = $1', [BETRIEB]);
  const admin = createClient(API, SERVICE, { auth: { persistSession: false } });
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data.users.filter((x) => x.email?.endsWith(`@${BETRIEB}.test`))) await admin.auth.admin.deleteUser(u.id);
  console.log(`Betrieb ${BETRIEB} entfernt.`);
}

async function main() {
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  const sql = async (beschreibung, text, werte) => {
    const t = Date.now();
    const r = await db.query(text, werte);
    if (beschreibung) console.log(`  ${beschreibung}: ${r.rowCount ?? 0} Zeilen, ${((Date.now() - t) / 1000).toFixed(1)} s`);
    return r;
  };

  // Für die ganze Sitzung: schreiben wie mit dem Dienstschlüssel.
  await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', false)`);

  const da = await db.query('select 1 from public.companies where id = $1', [BETRIEB]);
  if (da.rowCount && process.argv.includes('--neu')) {
    await entfernen(db);
  } else if (da.rowCount) {
    console.log(`Betrieb „${BETRIEB}“ besteht schon — nichts geschrieben. Anmeldung: gf@${BETRIEB}.test / ${PASSWORT}`);
    console.log('Neu erzeugen (entfernt NUR diesen Betrieb): node scripts/ui-umbau/testbestand.mjs --neu');
    await db.end();
    return;
  }

  await db.query('select setseed(0.20261007)');

  console.log(`Betrieb ${BETRIEB} anlegen (Stichtag ${HEUTE}) …`);
  await sql('Betrieb', `
    insert into public.companies (id, name, address_line, contact_line, iban, bic, bank_name, vat_id, company_register,
      strasse, plz, ort, rates, modules, kalender_abo_erlaubt)
    values ($1, 'UI-Testbestand Installationen GmbH', 'Teststraße 1 · 2700 Wiener Neustadt',
      'Tel 02622 99999 · office@ui-testbestand.test', 'AT61 1904 3002 3457 3201', 'BKAUATWW', 'Testbank',
      'ATU12345678', 'FN 999999t', 'Teststraße 1', '2700', 'Wiener Neustadt',
      '{"fach":78,"helper":52,"vatRate":0.2,"dueDays":14,"anfahrt":45,"nightSurcharge":0.5,"emergencySurcharge":1}'::jsonb,
      '{}'::jsonb, true)`, [BETRIEB]);

  /* ---------------- Konten ---------------- */
  const admin = createClient(API, SERVICE, { auth: { persistSession: false } });
  const ids = [];
  for (const p of BELEGSCHAFT) {
    let uid;
    const { data, error } = await admin.auth.admin.createUser({
      email: p.email, password: PASSWORT, email_confirm: true,
      app_metadata: { company_id: BETRIEB, role: p.role, active: true },
    });
    if (error) {
      // Ein Konto aus einem abgebrochenen Lauf: wiederverwenden statt doppelt anlegen.
      const { data: liste } = await admin.auth.admin.listUsers({ perPage: 1000 });
      uid = liste.users.find((u) => u.email === p.email)?.id;
      if (!uid) throw error;
    } else uid = data.user.id;
    ids.push(uid);
    await db.query(`
      insert into public.users (id, company_id, name, email, role, active, weekly_target_hours, yearly_vacation_days,
        app_start_date, eintritt, kunden_pflegen, katalog_einspielen, rechnungen_lesen, einstufung, lehrbeginn, lehrzeit_monate)
      values ($1, $2, $3, $4, $5, true, 38.5, 25, '2021-10-01', '2021-10-01', $6, $7, $8, $9, $10, $11)`,
    [uid, BETRIEB, p.name, p.email, p.role, !!p.kundenPflegen, !!p.katalogEinspielen, !!p.rechnungenLesen,
      p.einstufung ?? null, p.lehrbeginn ?? null, p.lehrbeginn ? 36 : null]);
    if (p.geburtsdatum) {
      await db.query('insert into public.geburtsdaten (user_id, company_id, geburtsdatum) values ($1, $2, $3)', [uid, BETRIEB, p.geburtsdatum]);
    }
  }
  console.log(`  Konten: ${ids.length} (Passwort ${PASSWORT})`);
  const aussendienst = BELEGSCHAFT.map((p, i) => ({ ...p, id: ids[i] })).filter((p) => p.role === 'Mitarbeiter' || p.role === 'Projektleiter');
  const leitung = BELEGSCHAFT.map((p, i) => ({ ...p, id: ids[i] })).filter((p) => p.role === 'Projektleiter');

  // Personen als Tabelle, damit die Massen-Inserts sie per Index ziehen können.
  await db.query('create temp table tb_person (nr int primary key, id uuid, name text)');
  for (const [i, p] of aussendienst.entries()) {
    await db.query('insert into tb_person values ($1, $2, $3)', [i, p.id, p.name]);
  }
  const P = aussendienst.length;

  /* ---------------- Kunden und Baustellen ---------------- */
  await sql('Kunden', `
    insert into public.customers (id, company_id, name, address, strasse, plz, ort, contact_name, contact_phone, email, kundennummer, kundenart, vat_id, created_at)
    select gen_random_uuid(), $1,
      case when g % 5 = 0 then 'Hausverwaltung ' || (array['Nord','Süd','Ost','West','Mitte'])[1 + g % 5] || ' ' || g
           else (array['Familie','Herr','Frau'])[1 + g % 3] || ' ' || (array['Huber','Gruber','Bauer','Wagner','Pichler','Steiner','Moser','Mayer','Hofer','Leitner'])[1 + g % 10] || ' ' || g end,
      'Hauptstraße ' || g || ', ' || (2700 + g % 50) || ' Wiener Neustadt', 'Hauptstraße ' || g, (2700 + g % 50)::text, 'Wiener Neustadt',
      'Ansprechperson ' || g, '0664 ' || lpad(g::text, 7, '0'), 'kunde' || g || '@beispiel.test', (10000 + g)::text,
      case when g % 5 = 0 then 'unternehmen' else 'privat' end,
      case when g % 5 = 0 then 'ATU' || lpad((10000000 + g)::text, 8, '0') else null end,
      timestamptz '2021-10-01' + (g * interval '1 day' * 1.2)
    from generate_series(1, 1500) g`, [BETRIEB]);
  await db.query(`create temp table tb_kunde as select row_number() over (order by created_at, name) - 1 as nr, id, name, address from public.customers where company_id = $1`, [BETRIEB]);

  // 3.000 Baustellen über fünf Jahre; die letzten 40 laufen, ein paar ruhen.
  await sql('Baustellen', `
    insert into public.projects (id, company_id, project_number, customer_id, customer_name, address, description, status, billing_mode,
      estimated_hours, start_date, end_date, assigned_employees, project_managers, created_at)
    select gen_random_uuid(), $1, 'B-' || (2021 + (g - 1) / 600) || '-' || lpad(g::text, 4, '0'), k.id, k.name, k.address,
      (array['Heizungstausch','Badsanierung','Wartung Therme','Rohrbruch','Fußbodenheizung','Wärmepumpe'])[1 + g % 6] || ' ' || g,
      case when g > 2960 then 'Aktiv' when g > 2940 then 'Pausiert' else 'Abgeschlossen' end,
      (array['Regie','Pauschal','Einheitspreis'])[1 + g % 3],
      20 + (g % 12) * 10,
      date '2021-10-01' + (g * 0.6)::int,
      case when g > 2940 then null else date '2021-10-01' + (g * 0.6)::int + 14 + g % 30 end,
      array[(select id from tb_person where nr = g % $2), (select id from tb_person where nr = (g + 3) % $2)],
      array[(select id from tb_person where nr = ${P - 3} + g % 3)],
      timestamptz '2021-10-01' + (g * interval '14 hours' * 1.2)
    from generate_series(1, 3000) g join tb_kunde k on k.nr = g % 1500`, [BETRIEB, P - 3]);
  await db.query(`create temp table tb_baustelle as select row_number() over (order by project_number) - 1 as nr, id, project_number, customer_id, customer_name, address, status, start_date from public.projects where company_id = $1`, [BETRIEB]);
  await db.query('create index on tb_baustelle (nr)');

  /* ---------------- Angebote ---------------- */
  await sql('Angebote', `
    insert into public.quotes (id, company_id, quote_number, customer_id, customer_name, address, quote_date, valid_until, status,
      subtotal_netto, total_netto, total_vat, total_brutto, vat_rate, kalkulierte_stunden, project_number, project_id, created_at)
    select gen_random_uuid(), $1, 'A-' || (2021 + (g - 1) / 800) || '-' || lpad(g::text, 4, '0'), b.customer_id, b.customer_name, b.address,
      d, d + 30,
      case when g > 3980 then 'Entwurf' when g > 3950 then 'Versendet' when g % 3 = 0 then 'Abgelehnt' else 'Angenommen' end,
      n, n, round(n * 0.2, 2), round(n * 1.2, 2), 0.2, 8 + g % 40,
      case when g % 3 = 0 then null else b.project_number end, case when g % 3 = 0 then null else b.id end,
      d::timestamptz
    from generate_series(1, 4000) g
    join tb_baustelle b on b.nr = (g * 3 / 4) % 3000
    cross join lateral (select date '2021-10-01' + (g * 0.45)::int as d, (500 + (g % 40) * 125)::numeric as n) x`, [BETRIEB]);
  await sql('Angebotspositionen', `
    insert into public.quote_lines (company_id, quote_id, position, label, qty, unit, unit_price, netto)
    select $1, q.id, p, case p when 1 then 'Facharbeiter' else 'Material pauschal' end,
      case p when 1 then 8 else 1 end, case p when 1 then 'h' else 'pausch' end,
      case p when 1 then 78 else q.total_netto - 624 end, case p when 1 then 624 else q.total_netto - 624 end
    from public.quotes q cross join generate_series(1, 2) p where q.company_id = $1`, [BETRIEB]);

  /* ---------------- Einsätze ---------------- */
  // 20.000 Einsätze: rückwärts vom Stichtag über die Werktage, die laufenden Baustellen in den nächsten Wochen.
  await sql('Einsätze', `
    with tage as (
      select d::date as tag, row_number() over (order by d desc) - 1 as nr
      from generate_series($2::date + 14, $2::date - 2000, interval '-1 day') d
      where extract(isodow from d) < 6
    )
    insert into public.assignments (company_id, date, project_number, project_id, user_id, user_name, as_helper, comment, created_by, zeit_von, zeit_bis)
    select $1, t.tag, b.project_number, b.id, p.id, p.name, g % 7 = 0,
      case when g % 4 = 0 then 'Material vorher im Lager holen' end, 'Testbestand',
      case when g % 3 = 0 then time '07:00' end, case when g % 3 = 0 then time '15:30' end
    from generate_series(0, 19999) g
    join tage t on t.nr = g / ${P}
    join tb_person p on p.nr = g % ${P}
    join tb_baustelle b on b.nr = case when t.tag >= $2::date - 30 then 2960 + g % 40 else (g * 7) % 2940 end`, [BETRIEB, HEUTE]);

  /* ---------------- Zeitbuchungen ---------------- */
  // 150.000: je Person und Werktag sechs aufeinanderfolgende Buchungen à 80 min, ohne Überschneidung.
  await sql('Zeitbuchungen', `
    with tage as (
      select d::date as tag, row_number() over (order by d desc) as nr
      from generate_series($2::date - 1, $2::date - 3000, interval '-1 day') d
      where extract(isodow from d) < 6
    )
    insert into public.time_entries (id, company_id, user_id, user_name, date, status, start_time, end_time, break_duration,
      hours, customer_name, project_number, project_id, comment, source, is_billed, created_at)
    select gen_random_uuid(), $1, p.id, p.name, t.tag, 'Anwesend',
      time '06:00' + s * interval '80 minutes', time '06:00' + (s + 1) * interval '80 minutes', 0, round(80 / 60.0, 2),
      b.customer_name, b.project_number, b.id,
      case when s = 0 then 'Material geholt, Anfahrt' end, 'manual', t.tag < $2::date - 60,
      t.tag + time '18:00'
    from tage t
    cross join tb_person p
    cross join generate_series(0, 5) s
    join tb_baustelle b on b.nr = case when t.tag >= $2::date - 30 then 2960 + (p.nr + s) % 40 else (t.nr * 3 + p.nr + s) % 2940 end
    where t.nr <= ceil(150000.0 / (6 * ${P}))
    limit 150000`, [BETRIEB, HEUTE]);

  /* ---------------- Scheine ---------------- */
  await sql('Scheine', `
    insert into public.work_sheets (id, company_id, project_number, project_id, customer_id, customer_name, address, datum, status, abrechnung,
      notizen, erstellt_von_uid, erstellt_von_name, unterschrieben_am, created_at)
    select gen_random_uuid(), $1, b.project_number, b.id, b.customer_id, b.customer_name, b.address, d,
      'Entwurf', (array['Regie','Pauschal','Einheitspreis'])[1 + g % 3], 'Arbeiten laut Auftrag ' || g,
      p.id, p.name, null, d + time '16:00'
    from generate_series(1, 15000) g
    join tb_baustelle b on b.nr = case when g > 14900 then 2960 + g % 40 else (g / 5) % 2940 end
    join tb_person p on p.nr = g % ${P}
    cross join lateral (select $2::date - 1 - ((15000 - g) * 0.12)::int as d) x`, [BETRIEB, HEUTE]);
  await sql('Scheinzeiten', `
    insert into public.work_sheet_hours (company_id, work_sheet_id, position, datum, mitarbeiter, von, bis, pause_min, minuten, helfer)
    select $1, w.id, 1, w.datum, w.erstellt_von_name, time '07:00', time '15:30', 30, 480, false
    from public.work_sheets w where w.company_id = $1`, [BETRIEB]);
  await sql('Scheinmaterial', `
    insert into public.work_sheet_material (company_id, work_sheet_id, position, name, menge, einheit)
    select $1, w.id, 1, 'Kupferrohr 22 mm', 4, 'Stk' from public.work_sheets w where w.company_id = $1`, [BETRIEB]);

  // Erst mit Positionen unterschreiben: danach sind sie eingefroren (wie in der App).
  await sql('Scheine unterschreiben', `
    update public.work_sheets set status = 'Unterschrieben', unterschrieben_am = datum + time '16:30'
    where company_id = $1 and split_part(notizen, ' ', 4)::int <= 14990`, [BETRIEB]);
  await sql('Scheine stornieren', `
    update public.work_sheets set status = 'Storniert', storno_grund = 'Falsche Baustelle', storniert_von_name = 'Gerda Geschäftsführerin'
    where company_id = $1 and split_part(notizen, ' ', 4)::int % 97 = 0 and split_part(notizen, ' ', 4)::int <= 14990`, [BETRIEB]);

  /* ---------------- Rechnungen und Zahlungen ---------------- */
  // 12.000 Rechnungen: Einzel-, Anzahlungs- und Schlussrechnungen, 120 storniert, die jüngsten offen oder überfällig.
  await sql('Rechnungen', `
    insert into public.invoices (id, company_id, invoice_number, project_number, project_id, customer_id, customer_name, address,
      invoice_date, due_date, subtotal_netto, total_netto, total_vat, total_brutto, vat_rate, payment_status,
      art, bezahlt_betrag, cancellation_note, cancelled_at, storno_nummer, storno_am, mahnstufe, gemahnt_am, mahnfrist, created_at)
    select gen_random_uuid(), $1, (2021 + (g - 1) / 2400) || '-' || lpad(g::text, 5, '0'), b.project_number, b.id, b.customer_id, b.customer_name, b.address,
      d, d + 14, n, n, round(n * 0.2, 2), round(n * 1.2, 2), 0.2,
      st, case when g % 10 = 0 then 'anzahlung' when g % 10 = 1 then 'schluss' else 'einzel' end,
      case st when 'Bezahlt' then round(n * 1.2, 2) when 'Teilbezahlt' then round(n * 0.6, 2) else 0 end,
      case when st = 'Storniert' then 'Doppelt verrechnet' end,
      case when st = 'Storniert' then (d + 3)::timestamptz end,
      case when st = 'Storniert' then 'S-' || lpad(g::text, 5, '0') end,
      case when st = 'Storniert' then (d + 3)::timestamptz end,
      case when st = 'Überfällig' then 1 else 0 end,
      case when st = 'Überfällig' then d + 20 end, case when st = 'Überfällig' then d + 34 end,
      d::timestamptz
    from generate_series(1, 12000) g
    join tb_baustelle b on b.nr = (g / 4) % 3000
    cross join lateral (select $2::date - 1 - ((12000 - g) * 0.15)::int as d, (300 + (g % 60) * 85)::numeric as n) x
    cross join lateral (select case
      when g % 100 = 0 then 'Storniert'
      when g > 11900 then (array['Offen','Überfällig','Teilbezahlt'])[1 + g % 3]
      else 'Bezahlt' end as st) s`, [BETRIEB, HEUTE]);
  await sql('Rechnungspositionen', `
    insert into public.invoice_lines (company_id, invoice_id, position, label, qty, unit, unit_price, netto)
    select $1, i.id, p, case p when 1 then 'Facharbeiter' else 'Material' end,
      case p when 1 then 2 else 1 end, case p when 1 then 'h' else 'pausch' end,
      case p when 1 then 78 else i.total_netto - 156 end, case p when 1 then 156 else i.total_netto - 156 end
    from public.invoices i cross join generate_series(1, 2) p where i.company_id = $1`, [BETRIEB]);
  // 14.000 Zahlungen: je bezahlter Rechnung eine, bei jeder fünften zwei (Anzahlung und Rest).
  await sql('Zahlungen', `
    insert into public.zahlungseingaenge (company_id, invoice_id, datum, betrag, art, erfasst_von_name, created_at)
    select $1, i.id, i.invoice_date + 10 + teil, case when z.zwei then round(i.total_brutto / 2, 2) else i.total_brutto end,
      'Überweisung', 'Berta Buchhaltung', (i.invoice_date + 10 + teil)::timestamptz
    from (select i.*, row_number() over (order by invoice_number) as nr from public.invoices i
          where i.company_id = $1 and i.payment_status in ('Bezahlt','Teilbezahlt')) i
    cross join lateral (select i.nr % 5 = 0 and i.payment_status = 'Bezahlt' as zwei) z
    cross join lateral generate_series(0, case when z.zwei then 1 else 0 end) teil
    limit 14000`, [BETRIEB]);

  /* ---------------- Material ---------------- */
  await sql('Großhändler', `
    insert into public.suppliers (company_id, name, customer_number, bestell_email)
    select $1, n, 'K-' || i, lower(n) || '@grosshandel.test'
    from unnest(array['Frauenthal','Holter','Würth','Hornbach','Bauhaus']) with ordinality as t(n, i)`, [BETRIEB]);
  await sql('Katalog (40.000)', `
    insert into public.materials (company_id, name, category, article_number, unit, verkaufspreis, einkaufspreis, lagerartikel, warengruppe)
    select $1, (array['Kupferrohr','Pressfitting','Kugelhahn','Thermostatventil','Siphon','Dichtung','Rohrschelle','Flexschlauch'])[1 + g % 8] || ' ' || (10 + g % 40) || ' mm Typ ' || g,
      (array['Rohrleitungen','Armaturen','Kleinmaterial','Sanitär'])[1 + g % 4], 'KAT-' || lpad(g::text, 6, '0'),
      'Stk', round((2 + (g % 200) * 0.75)::numeric, 2), round((1 + (g % 200) * 0.45)::numeric, 2), false, 'WG' || (g % 30)
    from generate_series(1, 40000) g`, [BETRIEB]);
  await sql('Lagerartikel (800)', `
    insert into public.materials (company_id, name, category, article_number, unit, verkaufspreis, einkaufspreis, lagerartikel, stock, mindestmenge)
    select $1, 'Lagerartikel ' || (array['Kupferrohr 22 mm','Pressfitting 15 mm','Kugelhahn ½"','Teflonband','Silikon','Hanf'])[1 + g % 6] || ' Nr. ' || g,
      (array['Rohrleitungen','Armaturen','Kleinmaterial'])[1 + g % 3], 'LAG-' || lpad(g::text, 4, '0'), 'Stk',
      round((3 + g % 50)::numeric, 2), round((2 + g % 30)::numeric, 2), true,
      case when g % 25 = 0 then 0 when g % 10 = 0 then 2 else 20 + g % 80 end, case when g % 2 = 0 then 5 end
    from generate_series(1, 800) g`, [BETRIEB]);
  await db.query(`create temp table tb_lager as select row_number() over (order by article_number) - 1 as nr, id, name, stock from public.materials where company_id = $1 and lagerartikel`, [BETRIEB]);
  const schon = await db.query('select count(*)::int n from public.lagerbewegungen where company_id = $1', [BETRIEB]);
  await sql('Lagerbewegungen', `
    insert into public.lagerbewegungen (company_id, material_id, art, menge, bestand_nachher, grund, erfasst_von_name, created_at)
    select $1, l.id, (array['eingang','entnahme','entnahme','retoure','inventur'])[1 + g % 5],
      case when g % 5 in (1, 2) then -2 else 4 end, l.stock, 'Testbestand', 'Viktor Verwaltung',
      timestamptz '2021-10-01' + (g * interval '43 minutes')
    from generate_series(1, $2::int) g join tb_lager l on l.nr = g % 800`, [BETRIEB, 60000 - schon.rows[0].n]);

  // 30.000 Anforderungen: 40 offen (Offen, In Bearbeitung, Abholbereit), der Rest erledigt.
  await sql('Anforderungen', `
    insert into public.material_orders (id, company_id, material_id, material_name, quantity, note, project_number, project_id, status, is_urgent,
      transaction_type, condition, user_id, user_name, processed, beschaffung, created_at, abholbereit_seit)
    select gen_random_uuid(), $1, l.id, l.name, 1 + g % 12, case when g % 9 = 0 then 'Bitte bis morgen' end,
      b.project_number, b.id,
      st, g % 13 = 0, case when g % 20 = 0 then 'return' else 'order' end,
      case when g % 20 = 0 then 'unbenutzt' end, p.id, p.name, st = 'Erledigt',
      case when g % 3 = 0 then 'einkauf' else 'lager' end,
      c, case when st = 'Abholbereit' then c + interval '2 hours' end
    from generate_series(1, 30000) g
    join tb_lager l on l.nr = g % 800
    join tb_person p on p.nr = g % ${P}
    join tb_baustelle b on b.nr = case when g > 29960 then 2960 + g % 40 else (g / 10) % 2940 end
    cross join lateral (select case when g <= 29960 then 'Erledigt' else (array['Offen','In Bearbeitung','Abholbereit'])[1 + g % 3] end as st,
      timestamptz '2021-10-01' + (g * interval '87 minutes') as c) x`, [BETRIEB]);

  /* ---------------- Wartungen und Abwesenheiten ---------------- */
  await sql('Wartungen', `
    insert into public.wartungen (company_id, customer_id, customer_name, anlage, address, intervall_monate, zuletzt_am, faellig_am, aktiv, hersteller, typ, baujahr)
    select $1, k.id, k.name, (array['Gasbrennwertkessel','Wärmepumpe','Pelletkessel','Solaranlage'])[1 + g % 4], k.address,
      case when g % 4 = 0 then 24 else 12 end, $2::date - (g % 365), $2::date - (g % 365) + (case when g % 4 = 0 then 730 else 365 end),
      g % 50 <> 0, (array['Vaillant','Viessmann','Buderus','Ochsner'])[1 + g % 4], 'Typ ' || (g % 9), 2005 + g % 20
    from generate_series(1, 1200) g join tb_kunde k on k.nr = (g * 7) % 1500`, [BETRIEB, HEUTE]);
  await sql('Urlaube und Zeitausgleich', `
    insert into public.vacations (company_id, user_id, user_name, von, bis, tage, status, notiz, art, entschieden_von_name, entschieden_am, created_at)
    select $1, p.id, p.name, v, v + (g % 5), 1 + g % 5,
      case when g > 2980 then 'Beantragt' when g % 17 = 0 then 'Abgelehnt' else 'Genehmigt' end,
      case when g % 6 = 0 then 'Familienurlaub' end, case when g % 8 = 0 then 'Zeitausgleich' else 'Urlaub' end,
      case when g <= 2980 then 'Gerda Geschäftsführerin' end, case when g <= 2980 then (v - 10)::timestamptz end, (v - 14)::timestamptz
    from generate_series(1, 3000) g join tb_person p on p.nr = g % ${P}
    cross join lateral (select $2::date + 20 - ((3000 - g) * 0.6)::int as v) x`, [BETRIEB, HEUTE]);

  const zaehlen = await db.query(`
    select 'Mitarbeiter' as was, (select count(*) from public.users where company_id = $1) n union all
    select 'Kunden', (select count(*) from public.customers where company_id = $1) union all
    select 'Baustellen', (select count(*) from public.projects where company_id = $1) union all
    select 'davon laufend', (select count(*) from public.projects where company_id = $1 and status = 'Aktiv') union all
    select 'Angebote', (select count(*) from public.quotes where company_id = $1) union all
    select 'Einsätze', (select count(*) from public.assignments where company_id = $1) union all
    select 'Zeitbuchungen', (select count(*) from public.time_entries where company_id = $1) union all
    select 'Scheine', (select count(*) from public.work_sheets where company_id = $1) union all
    select 'Rechnungen', (select count(*) from public.invoices where company_id = $1) union all
    select 'Zahlungen', (select count(*) from public.zahlungseingaenge where company_id = $1) union all
    select 'Anforderungen', (select count(*) from public.material_orders where company_id = $1) union all
    select 'davon offen', (select count(*) from public.material_orders where company_id = $1 and status <> 'Erledigt') union all
    select 'Lagerartikel', (select count(*) from public.materials where company_id = $1 and lagerartikel) union all
    select 'Katalogartikel', (select count(*) from public.materials where company_id = $1 and not lagerartikel) union all
    select 'Lagerbewegungen', (select count(*) from public.lagerbewegungen where company_id = $1) union all
    select 'Wartungen', (select count(*) from public.wartungen where company_id = $1) union all
    select 'Urlaubs-/ZA-Anträge', (select count(*) from public.vacations where company_id = $1)`, [BETRIEB]);
  console.log('\nBestand:');
  for (const z of zaehlen.rows) console.log(`  ${z.was.padEnd(22)} ${Number(z.n).toLocaleString('de-AT')}`);
  console.log(`\nAnmeldung: gf@${BETRIEB}.test / ${PASSWORT} (alle Konten: <kurz>@${BETRIEB}.test)`);
  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
