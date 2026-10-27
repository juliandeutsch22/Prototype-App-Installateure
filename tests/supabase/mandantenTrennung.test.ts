/**
 * MANDANTENTRENNUNG ÜBER JEDE TABELLE, JEDE SICHT, JEDE FUNKTION UND JEDEN
 * DATEISPEICHER (Testbericht Runde 6, Abschnitt 8.4 Schritte 1–4; 27.10.2026).
 *
 * Die übrigen Prüfungen sehen den Zeilenschutz aus seiner Beschreibung
 * (`schema.test.ts`: an auf jeder Tabelle, jede Regel nennt den Betrieb) oder
 * Tabelle für Tabelle an einzelnen Fällen. Hier wird er AUSGEFÜHRT, und zwar
 * gegen alles, was die Datenbank hat — auch gegen jede Tabelle, die erst
 * eine künftige Migration anlegt:
 *
 *   - Betrieb B bekommt in JEDER Tabelle mit `company_id` Zeilen.
 *   - Jede Rolle von Betrieb A (Mitarbeiter, Verwaltung, Buchhaltung,
 *     Projektleitung, Geschäftsführung, Administration, je mit zweitem
 *     Faktor) und der Support mit Einblick nur in A versuchen, diese Zeilen
 *     zu lesen, zu ändern und zu löschen — und mit B als Betrieb anzulegen.
 *   - Erwartet: nichts gelesen, nichts geändert, nichts gelöscht, Anlegen
 *     abgewiesen.
 *
 * Dazu: keine Sicht umgeht den Zeilenschutz; jede Funktion mit den Rechten
 * ihres Eigentümers hat einen festen Suchpfad und prüft Betrieb oder
 * Aufrufer selbst; jeder Dateispeicher ist privat, begrenzt und trennt die
 * Betriebe.
 *
 * WIE. Als `postgres` in EINER Transaktion, die am Ende zurückgerollt wird:
 * Testzeilen mit ausgesetzten Auslösern und Fremdschlüsseln (wie
 * `leseregelnGleichwertig.test.ts`), dann je Lage `set local role
 * authenticated` mit den Ansprüchen der Lage in `request.jwt.claims` — genau
 * so, wie PostgREST jede Anfrage stellt. Es bleibt nichts zurück.
 *
 * GEGENPROBE (mit ausgeführt): eine Tabelle mit absichtlich offener Regel
 * (`using (true)`) wird vom selben Vergleich gefunden — sonst hieße „nichts
 * gefunden“ womöglich nur „nichts gemessen“.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';

const VERBINDUNG =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const A = 'mt-eigen';
const B = 'mt-fremd';
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const ROLLEN = ['Mitarbeiter', 'Verwaltung', 'Buchhaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator'] as const;
const PERSON_A: Record<string, string> = Object.fromEntries(ROLLEN.map((r, i) => [r, uid(9601 + i)]));
const PERSON_B = uid(9651);
/** Ein Kollege in A: an ihm zeigt sich, was eine Rolle von ANDEREN im eigenen Betrieb sieht. */
const KOLLEGE = uid(9611);
const SUPPORT = uid(9661);

const LAGEN: [string, object][] = [
  ...ROLLEN.map((r): [string, object] => [r, {
    sub: PERSON_A[r], role: 'authenticated', aal: 'aal2', app_metadata: { company_id: A, role: r, active: true },
  }]),
  ['Support mit Einblick in A', { sub: SUPPORT, role: 'authenticated', aal: 'aal2', app_metadata: { plattform_admin: true } }],
];

/**
 * Wo Typ und Aufzählung allein keine gültige Zeile ergeben, weil eine
 * Prüfbedingung mehrere Spalten verbindet. `null` heißt hier ausdrücklich leer.
 */
const PROJEKT = uid(9681);
const ZUSATZ: Record<string, (betrieb: string) => Record<string, unknown>> = {
  buchungskonten: () => ({ zweck: 'bank' }),
  fehlerprotokoll: () => ({ art: 'fehler', nachricht: 'Prüfung' }),
  freistellungen: () => ({ art: 'unbezahlt' }),
  project_documents: (b) => ({ project_id: PROJEKT, pfad: `baustellen/${b}/${PROJEKT}/x.pdf` }),
  support_freigaben: (b) => ({ gewaehrt_von: b === A ? PERSON_A['Geschäftsführung'] : PERSON_B }),
  // Ein anderes Plattformkonto als der Support dieser Prüfung.
  support_zugriffe: () => ({ admin_uid: uid(9671) }),
  termine: () => ({ project_number: 'P-1', customer_id: null }),
  urlaubsanspruch_anpassungen: () => ({ grund: 'Prüfung', urlaubsjahr: 2026, tage: 1 }),
};

/*
  WAS JEDE ROLLE IM EIGENEN BETRIEB LIEST — Zeilen eines Kollegen bzw. des
  Betriebs, Tabelle für Tabelle, wie das Handbuch es beschreibt (Abschnitt
  „Rollen“). Eine neue Tabelle oder eine geänderte Regel fällt hier auf und
  muss bewusst eingetragen werden. Spalten innerhalb einer Tabelle (etwa der
  Einkaufspreis am Artikel) prüfen `einkaufGeschuetzt.test.ts` und
  `freigabenLagerProjektleitung.test.ts`. Den „Lehrling“ führt die App nicht
  als Rolle, sondern als Einstufung eines Mitarbeiters — er liest wie dieser.
*/
/**
 * Was jede Rolle liest: Baustellen, Katalog ohne Einkaufspreis, Einsatzplan,
 * Arbeitsscheine, Wartungen, Kontenrahmen (keine Margeninformation) und das
 * Support-Protokoll (der Betrieb sieht, was mit seinem Einblick geschah).
 */
const FUER_ALLE = ['assignments', 'aussteller_staende', 'baustelle_alte_nummern', 'betriebsurlaube', 'buchungskonten',
  'einsatz_material', 'einsatz_material_positionen', 'materials', 'projects', 'suppliers', 'support_freigaben',
  'support_zugriffe', 'users', 'wartung_ausfuehrungen', 'wartungen', 'work_sheet_hours', 'work_sheet_material',
  'work_sheet_photos', 'work_sheets'];
/** Lohn, Zeiten, Abwesenheiten anderer und Rechnungen: Buchhaltung und Spitze. */
const LOHN_UND_RECHNUNG = ['arbeitszeit_begruendungen', 'freistellungen', 'geburtsdaten', 'invoice_coverage', 'invoice_lines',
  'invoices', 'krankmeldungen', 'mahnungen', 'time_entries', 'urlaubsanspruch_anpassungen', 'vacations', 'zahlungseingaenge',
  'zeitkonto_anfang'];
/** Kunden, Lager, Anforderungen, Pläne, UID-Prüfungen: das Büro und die Leitung. */
const BUERO = ['customers', 'lagerbewegungen', 'material_orders', 'project_documents', 'uid_pruefungen'];
/** Einkaufspreise, Preislisten, Kostensätze, Katalogdateien, Kontoumstellungen, Systemläufe: nur die Spitze. */
const SPITZE = ['betrieb_kostensaetze', 'datanorm_laeufe', 'datanorm_zeilen', 'konto_umstellungen', 'material_einkaufspreise',
  'material_prices', 'rabattsaetze', 'system_laeufe'];

const LESBAR: Record<string, string[]> = {
  Mitarbeiter: [...FUER_ALLE].sort(),
  Verwaltung: [...FUER_ALLE, ...BUERO, 'einkauf_posten', 'termine'].sort(),
  Buchhaltung: [...FUER_ALLE, ...BUERO, ...LOHN_UND_RECHNUNG, 'quote_lines', 'quotes'].sort(),
  // Wie die Leitung, aber ohne Lohn, Zeiten anderer und Rechnungen; Urlaub und
  // Anfangsstände der Zeitkonten für die Planung.
  Projektleiter: [...FUER_ALLE, ...BUERO, 'einkauf_posten', 'quote_lines', 'quotes', 'termine', 'vacations', 'zeitkonto_anfang'].sort(),
  'Geschäftsführung': [...FUER_ALLE, ...BUERO, ...LOHN_UND_RECHNUNG, ...SPITZE, 'einkauf_posten', 'quote_lines', 'quotes', 'termine'].sort(),
  Administrator: [...FUER_ALLE, ...BUERO, ...LOHN_UND_RECHNUNG, ...SPITZE, 'einkauf_posten', 'quote_lines', 'quotes', 'termine'].sort(),
};

/** Tabellen, die Betrieb B nicht über `company_id` tragen, sondern anders zugeordnet sind. */
const OHNE_BETRIEBSSPALTE = new Set(['companies']);

let db: Client;
let tabellen: string[] = [];
const nichtGefuellt: string[] = [];

async function spalten(tabelle: string) {
  const { rows } = await db.query<{ name: string; typ: string; noetig: boolean; udt: string }>(
    `select column_name as name, data_type as typ, udt_name as udt,
            (is_nullable = 'NO' and column_default is null and is_identity = 'NO' and is_generated = 'NEVER') as noetig
       from information_schema.columns
      where table_schema = 'public' and table_name = $1
      order by ordinal_position`, [tabelle]);
  return rows;
}

async function aufzaehlungen(tabelle: string): Promise<Map<string, string>> {
  const { rows } = await db.query<{ def: string }>(
    `select pg_get_constraintdef(c.oid) as def from pg_constraint c
       join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public' and t.relname = $1 and c.contype = 'c'`, [tabelle]);
  const m = new Map<string, string>();
  for (const { def } of rows) {
    for (const t of def.matchAll(/\(\(?(\w+) = ANY \(ARRAY\['([^']*)'/g)) if (!m.has(t[1])) m.set(t[1], t[2]);
  }
  return m;
}

function wertFuer(typ: string, udt: string, i: number): unknown {
  if (udt === 'uuid') return null;
  if (typ === 'ARRAY') return '{}';
  if (['integer', 'bigint', 'smallint', 'numeric', 'double precision', 'real'].includes(typ)) return 1 + i;
  if (typ === 'boolean') return false;
  if (typ === 'date') return '2026-10-05';
  if (typ.startsWith('timestamp')) return '2099-01-01T00:00:00Z';
  if (typ.startsWith('time')) return '08:00';
  if (typ === 'jsonb' || typ === 'json') return '{}';
  return `x${i}`;
}

/** Werte einer Zeile von `betrieb` für `tabelle` — Pflichtspalten nach Typ und Prüfbedingung. */
async function zeile(tabelle: string, betrieb: string, i: number): Promise<{ spalten: string[]; ausdruecke: string[]; parameter: unknown[] }> {
  const sp = await spalten(tabelle);
  const aufz = await aufzaehlungen(tabelle);
  const namen = new Set(sp.map((c) => c.name));
  const werte: Record<string, unknown> = {};
  for (const c of sp) if (c.noetig) werte[c.name] = aufz.get(c.name) ?? wertFuer(c.typ, c.udt, i);
  if (namen.has('company_id')) werte.company_id = betrieb;
  if (namen.has('user_id')) werte.user_id = betrieb === A ? KOLLEGE : PERSON_B;
  const zusatz = ZUSATZ[tabelle]?.(betrieb) ?? {};
  Object.assign(werte, zusatz);
  const spaltenNamen = Object.keys(werte);
  const parameter: unknown[] = [];
  const ausdruecke = spaltenNamen.map((k) => {
    const c = sp.find((x) => x.name === k);
    if (werte[k] === null && c?.udt === 'uuid' && !(k in zusatz)) return 'gen_random_uuid()';
    parameter.push(werte[k]);
    return `$${parameter.length}`;
  });
  return { spalten: spaltenNamen.map((k) => `"${k}"`), ausdruecke, parameter };
}

async function alsLage(anspruch: object, f: () => Promise<void>): Promise<void> {
  await db.query('savepoint lage');
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(anspruch)]);
  await db.query('set local role authenticated');
  try {
    await f();
  } finally {
    await db.query('rollback to savepoint lage');
  }
}

/** Ein Versuch, der abgewiesen werden darf: Fehler und „0 Zeilen“ zählen beide als gesperrt. */
async function zeilenOderFehler(sql: string, parameter: unknown[] = []): Promise<number> {
  await db.query('savepoint versuch');
  try {
    const r = await db.query(sql, parameter);
    await db.query('release savepoint versuch');
    return r.rowCount ?? 0;
  } catch {
    await db.query('rollback to savepoint versuch');
    return 0;
  }
}

/** Was Lage `anspruch` an Zeilen von B in `tabelle` lesen, ändern, löschen, anlegen konnte. */
async function durchgelassen(tabelle: string, anspruch: object): Promise<string[]> {
  const funde: string[] = [];
  const neu = await zeile(tabelle, B, 7);
  await alsLage(anspruch, async () => {
    const gelesen = await zeilenOderFehler(`select 1 from public.${tabelle} where company_id = $1`, [B]);
    if (gelesen > 0) funde.push(`liest ${gelesen}`);
    const geaendert = await zeilenOderFehler(`update public.${tabelle} set company_id = company_id where company_id = $1`, [B]);
    if (geaendert > 0) funde.push(`ändert ${geaendert}`);
    const geloescht = await zeilenOderFehler(`delete from public.${tabelle} where company_id = $1`, [B]);
    if (geloescht > 0) funde.push(`löscht ${geloescht}`);
    const angelegt = await zeilenOderFehler(
      `insert into public.${tabelle} (${neu.spalten.join(', ')}) values (${neu.ausdruecke.join(', ')})`, neu.parameter);
    if (angelegt > 0) funde.push('legt mit fremdem Betrieb an');
  });
  return funde;
}

beforeAll(async () => {
  db = new Client({ connectionString: VERBINDUNG });
  await db.connect();
  await db.query('begin');
  await db.query('set local session_replication_role = replica');
  for (const b of [A, B]) await db.query(`insert into public.companies (id, name) values ($1, $1) on conflict (id) do nothing`, [b]);
  const personen: [string, string, string][] = [
    ...ROLLEN.map((r): [string, string, string] => [PERSON_A[r], A, r]),
    [KOLLEGE, A, 'Mitarbeiter'],
    [PERSON_B, B, 'Geschäftsführung'],
  ];
  for (const [id] of personen) {
    await db.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated') on conflict do nothing`, [id, `${id}@mt.test`]);
  }
  await db.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated') on conflict do nothing`, [SUPPORT, `${SUPPORT}@mt.test`]);
  for (const [id, betrieb, rolle] of personen) {
    await db.query(
      `insert into public.users (id, company_id, name, email, role, active) values ($1, $2, $3, $4, $5, true)
         on conflict (id) do update set company_id = excluded.company_id, role = excluded.role, active = true`,
      [id, betrieb, rolle, `${id}@mt.test`, rolle]);
  }
  await db.query(`insert into public.platform_admins (id, name) values ($1, 'Plattform') on conflict do nothing`, [SUPPORT]);
  const { rows: fr } = await db.query<{ id: string }>(
    `insert into public.support_freigaben (company_id, grund, gilt_bis, stufe, gewaehrt_von)
       values ($1, 'Prüfung', now() + interval '1 day', 'mitarbeiten', $2) returning id`, [A, PERSON_A['Geschäftsführung']]);
  await db.query(
    `insert into public.support_zugriffe (company_id, freigabe_id, admin_uid, bereich) values ($1, $2, $3, 'Betrieb')`,
    [A, fr[0].id, SUPPORT]);

  const { rows } = await db.query<{ t: string }>(
    `select c.table_name as t from information_schema.columns c
       join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public' and c.column_name = 'company_id' and t.table_type = 'BASE TABLE'
      order by 1`);
  tabellen = rows.map((r) => r.t);
  for (const t of tabellen) {
    let gefuellt = 0;
    let fehler = '';
    for (let i = 0; i < 2; i += 1) {
      const z = await zeile(t, B, i);
      await db.query('savepoint z');
      try {
        await db.query(`insert into public.${t} (${z.spalten.join(', ')}) values (${z.ausdruecke.join(', ')})`, z.parameter);
        await db.query('release savepoint z');
        gefuellt += 1;
      } catch (e) {
        await db.query('rollback to savepoint z');
        fehler = (e as Error).message;
      }
    }
    if (gefuellt === 0) nichtGefuellt.push(`${t}: ${fehler}`);
    // Dieselben Zeilen im eigenen Betrieb, dem Kollegen zugeordnet.
    for (let i = 0; i < 2; i += 1) {
      const z = await zeile(t, A, i);
      await db.query('savepoint z');
      try {
        await db.query(`insert into public.${t} (${z.spalten.join(', ')}) values (${z.ausdruecke.join(', ')})`, z.parameter);
        await db.query('release savepoint z');
      } catch {
        await db.query('rollback to savepoint z');
      }
    }
  }
  await db.query('set local session_replication_role = origin');
}, 180_000);

afterAll(async () => {
  await db.query('rollback');
  await db.end();
});

describe('Tabellen: kein Betrieb erreicht die Zeilen eines anderen', () => {
  it('findet die Betriebstabellen und füllt jede für Betrieb B', () => {
    expect(tabellen.length).toBeGreaterThan(50);
    expect(nichtGefuellt).toEqual([]);
  });

  it('keine Rolle von A liest, ändert, löscht Zeilen von B oder legt mit B als Betrieb an', async () => {
    const funde: string[] = [];
    for (const t of tabellen) {
      for (const [lage, anspruch] of LAGEN) {
        for (const f of await durchgelassen(t, anspruch)) funde.push(`${t} — ${lage}: ${f}`);
      }
    }
    expect(funde).toEqual([]);
  }, 600_000);

  it('Gegenprobe: eine offene Regel fände derselbe Vergleich', async () => {
    await db.query('savepoint gegenprobe');
    try {
      await db.query(`create policy mt_offen on public.${tabellen[0]} for select to authenticated using (true)`);
      const funde = await durchgelassen(tabellen[0], LAGEN[0][1]);
      expect(funde).toEqual(expect.arrayContaining([expect.stringMatching(/^liest /)]));
    } finally {
      await db.query('rollback to savepoint gegenprobe');
    }
  });

  it('auch die Betriebe selbst: A sieht den Stammsatz von B nicht', async () => {
    for (const [lage, anspruch] of LAGEN) {
      let gesehen = 0;
      await alsLage(anspruch, async () => {
        gesehen = await zeilenOderFehler(`select 1 from public.companies where id = $1`, [B]);
      });
      expect(gesehen, lage).toBe(0);
    }
    expect(OHNE_BETRIEBSSPALTE.has('companies')).toBe(true);
  });
});

/** Welche Tabellen eine Rolle von A an Zeilen des Kollegen bzw. des Betriebs lesen kann. */
async function lesbarImBetrieb(anspruch: object): Promise<string[]> {
  const lesbar: string[] = [];
  await alsLage(anspruch, async () => {
    for (const t of tabellen) {
      const { rows: sp } = await db.query(`select 1 from information_schema.columns
        where table_schema = 'public' and table_name = $1 and column_name = 'user_id'`, [t]);
      const bedingung = sp.length ? `company_id = $1 and user_id = '${KOLLEGE}'` : 'company_id = $1';
      if (await zeilenOderFehler(`select 1 from public.${t} where ${bedingung}`, [A]) > 0) lesbar.push(t);
    }
  });
  return lesbar;
}

describe('Rollen im eigenen Betrieb', () => {
  it('jede Rolle liest genau die Tabellen, die ihr das Handbuch gibt', async () => {
    const ist: Record<string, string[]> = {};
    for (const [lage, anspruch] of LAGEN.slice(0, ROLLEN.length)) ist[lage] = (await lesbarImBetrieb(anspruch)).sort();
    expect(ist).toEqual(LESBAR);
  }, 300_000);
});

/** Sichten, die angemeldete Konten lesen dürfen und die nicht mit den Rechten des Lesers laufen. */
async function offeneSichten(): Promise<string[]> {
  const { rows } = await db.query<{ sicht: string }>(
    `select c.relname as sicht from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('v', 'm')
        and has_table_privilege('authenticated', c.oid, 'select')
        and not exists (select 1 from unnest(coalesce(c.reloptions, '{}')) o
                         where lower(o) in ('security_invoker=true', 'security_invoker=on', 'security_invoker=1', 'security_invoker=yes'))`);
  return rows.map((r) => r.sicht);
}

describe('Sichten', () => {
  /*
    EINE SICHT LÄUFT IN POSTGRES MIT DEN RECHTEN IHRES EIGENTÜMERS — und der
    ist `postgres`, für den kein Zeilenschutz gilt. Eine Sicht, die
    `authenticated` lesen darf, ohne `security_invoker`, gäbe jede Zeile jedes
    Betriebs heraus.
  */
  it('keine Sicht, die angemeldete Konten lesen dürfen, umgeht den Zeilenschutz', async () => {
    expect(await offeneSichten()).toEqual([]);
  });

  it('Gegenprobe: eine Sicht ohne die Rechte des Lesers fände derselbe Vergleich', async () => {
    await db.query('savepoint sicht');
    try {
      await db.query(`create view public.mt_offen as select id from public.companies`);
      await db.query(`grant select on public.mt_offen to authenticated`);
      expect(await offeneSichten()).toContain('mt_offen');
    } finally {
      await db.query('rollback to savepoint sicht');
    }
  });
});

/*
  WER DARF, ENTSCHEIDET DIE FUNKTION SELBST. Eine Funktion mit den Rechten
  ihres Eigentümers sieht jede Zeile; prüft sie den Aufrufer nicht, gilt der
  Zeilenschutz für sie nicht. Jede, die angemeldete Konten aufrufen dürfen,
  muss deshalb im Rumpf an Anmeldung, Betrieb, Rolle oder Plattform prüfen
  — oder hier mit Grund stehen.
*/
const OHNE_EIGENE_PRUEFUNG: Record<string, string> = {
  'public.fehler_vor_anmeldung_eintragen(p_art text, p_nachricht text, p_stapel text, p_pfad text, p_fassung text, p_geraet text)':
    'nimmt Absturzmeldungen der Anmeldemaske an, also vor jeder Anmeldung; schreibt nur in die eigene Tabelle, '
    + 'gibt nichts zurück und ist gedrosselt (dieselbe Meldung frühestens nach zehn Minuten, höchstens 100 je Stunde)',
};
const PRUEFT = /auth\.uid\(\)|app\.(betrieb|lesebetrieb|supportbetrieb|darf\w*|hat_rolle|ist_\w+|betriebsmitglied|angemeldet|plattform\w*|support\w*)\(|request\.jwt/;

/*
  OHNE ANMELDUNG AUFRUFBAR — nur, was dafür einen Grund hat. Auslöser-
  Funktionen fehlen in der Liste: Postgres lässt sie nur als Auslöser laufen
  („trigger functions can only be called as triggers“), ein Aufruf über die
  Schnittstelle scheitert immer.
*/
const OEFFENTLICH: Record<string, string> = {
  'public.fehler_vor_anmeldung_eintragen': 'die Anmeldemaske meldet ihre Abstürze, bevor jemand angemeldet ist',
};
/*
  Die Helfer der Zeilenschutz-Regeln. Regeln für `public` werten sie auch für
  nicht angemeldete Anfragen aus; gesperrt, endete jede solche Anfrage mit
  einem Rechtefehler statt leer. Sie geben nur über den Aufrufer selbst
  Auskunft — ohne Anmeldung „nein“ (eigene Prüfung unten).
*/
const REGELHELFER = ['app.aktiv', 'app.ist_plattform', 'app.rolle', 'app.support_arbeitet', 'app.support_liest', 'app.support_schreibt'];

async function ohnePruefung(): Promise<string[]> {
  const { rows } = await db.query<{ f: string; rumpf: string }>(
    `select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as f, p.prosrc as rumpf
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
        and has_function_privilege('authenticated', p.oid, 'execute')`);
  expect(rows.length).toBeGreaterThan(20);
  return rows.filter((r) => !PRUEFT.test(r.rumpf) && !(r.f in OHNE_EIGENE_PRUEFUNG)).map((r) => r.f);
}

async function ohneAnmeldungAufrufbar(): Promise<string[]> {
  const { rows } = await db.query<{ f: string }>(
    `select n.nspname || '.' || p.proname as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'app') and p.prosecdef and p.prorettype <> 'trigger'::regtype
        and has_function_privilege('anon', p.oid, 'execute')`);
  return rows.map((r) => r.f).filter((f) => !(f in OEFFENTLICH) && !REGELHELFER.includes(f)).sort();
}

describe('Funktionen mit den Rechten ihres Eigentümers', () => {
  it('haben alle einen festen Suchpfad', async () => {
    const { rows } = await db.query<{ f: string }>(
      `select n.nspname || '.' || p.proname as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'app') and p.prosecdef
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
    expect(rows.map((r) => r.f)).toEqual([]);
  });

  it('prüfen, wenn angemeldete Konten sie aufrufen dürfen, den Aufrufer selbst', async () => {
    expect(await ohnePruefung()).toEqual([]);
  });

  it('sind für nicht angemeldete Aufrufer gesperrt, außer den benannten öffentlichen', async () => {
    expect(await ohneAnmeldungAufrufbar()).toEqual([]);
  });

  it('die Helfer der Regeln sagen ohne Anmeldung „nein“', async () => {
    await alsLage({ role: 'anon' }, async () => {
      await db.query('set local role anon');
      // `app.aktiv()` heißt „nicht gesperrt“, nicht „angemeldet“ — ohne Konto ist
      // niemand gesperrt. Die Regeln fragen es nur zusammen mit der Anmeldung
      // ab (`app.angemeldet()`), und die sagt hier „nein“.
      const { rows } = await db.query(
        `select app.angemeldet() as angemeldet, app.ist_plattform() as plattform, app.rolle() as rolle,
                app.support_arbeitet() as arbeitet, app.support_liest($1) as liest, app.support_schreibt($1) as schreibt`, [A]);
      expect(rows[0]).toEqual({ angemeldet: false, plattform: false, rolle: null, arbeitet: false, liest: false, schreibt: false });
    });
  });

  it('Gegenprobe: eine neue Funktion ohne Prüfung und ohne Sperre fänden dieselben Vergleiche', async () => {
    await db.query('savepoint funktion');
    try {
      // Wie jede neue Funktion: die Grundrechte von Supabase geben sie `anon` und `authenticated`.
      await db.query(`create function public.mt_offen() returns bigint language sql security definer set search_path = ''
                        as 'select count(*) from public.customers'`);
      expect(await ohnePruefung()).toContain('public.mt_offen()');
      expect(await ohneAnmeldungAufrufbar()).toContain('public.mt_offen');
    } finally {
      await db.query('rollback to savepoint funktion');
    }
  });
});

describe('Dateispeicher', () => {
  it('jeder Speicher ist privat; wo Konten hochladen, mit Größen- und Typgrenze', async () => {
    const { rows } = await db.query<{ id: string; public: boolean; file_size_limit: string | null; allowed_mime_types: string[] | null }>(
      `select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id`);
    expect(rows.length).toBeGreaterThan(0);
    for (const b of rows) {
      expect(b.public, b.id).toBe(false);
      // Die Ausleitung schreibt nur der Dienst; jeder andere Speicher nimmt Uploads von Konten an.
      if (b.id === 'ausleitung') continue;
      expect(Number(b.file_size_limit ?? 0), `${b.id}: Größengrenze`).toBeGreaterThan(0);
      expect(b.allowed_mime_types?.length ?? 0, `${b.id}: Dateitypen`).toBeGreaterThan(0);
    }
  });

  it('angemeldete Konten sehen keine Datei eines anderen Betriebs', async () => {
    const { rows: speicher } = await db.query<{ id: string }>(`select id from storage.buckets`);
    await db.query('savepoint dateien');
    try {
      await db.query('set local session_replication_role = replica');
      for (const { id } of speicher) {
        for (const pfad of [`${B}/x.pdf`, `baustellen/${B}/p/x.pdf`, `${B}/s/x.jpg`]) {
          await db.query(`insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)`, [id, pfad, PERSON_B]);
        }
      }
      await db.query('set local session_replication_role = origin');
      for (const [lage, anspruch] of LAGEN) {
        let gesehen = 0;
        await alsLage(anspruch, async () => {
          gesehen = await zeilenOderFehler(`select 1 from storage.objects where name like $1 or name like $2`, [`${B}/%`, `%/${B}/%`]);
        });
        expect(gesehen, lage).toBe(0);
      }
    } finally {
      await db.query('rollback to savepoint dateien');
    }
  });

  it('der Speicher der Ausleitung ist für Konten gar nicht erreichbar', async () => {
    const { rows } = await db.query<{ policyname: string }>(
      `select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
          and (coalesce(qual, '') || coalesce(with_check, '')) like '%ausleitung%'`);
    expect(rows.map((r) => r.policyname)).toEqual([]);
  });
});
