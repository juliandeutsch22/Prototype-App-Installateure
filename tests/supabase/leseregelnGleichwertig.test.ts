/**
 * DER UMBAU DES ZEILENSCHUTZES ÄNDERT NICHTS AN DER BEDEUTUNG
 * (`20261009200000_zeilenschutz_einmal_je_abfrage.sql`).
 *
 * Die Migration schreibt 120 Regeln so um, dass Postgres die Prüfung von
 * Betrieb, Anmeldung und Rolle einmal je Abfrage rechnet statt je Zeile.
 * Diese Prüfung belegt, dass jede umgeschriebene Regel für jede Zeile in
 * jeder Lage dasselbe sagt wie vorher:
 *
 *   für jede Regel (alte und neue Fassung, eingefroren in
 *     `leseregeln-umbau.json`, USING und WITH CHECK),
 *   für jede Zeile der Testbetriebe in ihrer Tabelle,
 *   für jede Lage: nicht angemeldet; jede Rolle im eigenen Betrieb, mit und
 *     ohne zweiten Faktor; deaktiviert; ruhender Betrieb; Pflicht zum
 *     zweiten Faktor ohne ihn; Mitglied eines fremden Betriebs; Support mit
 *     Einblick „ansehen“ und „mitarbeiten“, Einblick in einen ruhenden
 *     Betrieb, Plattform ohne Einblick und ohne zweiten Faktor; ein Token,
 *     dessen Rolle nicht mehr zur Belegschaft passt;
 *
 * werden beide Ausdrücke ausgewertet: `coalesce(alt, false)` muss gleich
 * `coalesce(neu, false)` sein. NULL und falsch heißen für eine Regel beide
 * „kein Zugriff“.
 *
 * WIE. Als `postgres` (ohne Zeilenschutz, damit jede Zeile gesehen wird) mit
 * den Ansprüchen der Lage in `request.jwt.claims` — genau daraus lesen
 * `auth.uid()`, `app.betrieb()` und alle Helfer. Verschachtelte Regeln
 * (Unterabfragen auf andere Tabellen) gelten dabei für beide Fassungen
 * gleich nicht; ihre eigenen Regeln prüft derselbe Lauf.
 *
 * DIE TESTDATEN füllt die Prüfung selbst: je Tabelle mit Regel Zeilen in
 * vier Betrieben, die Pflichtspalten nach Typ und Prüfbedingung, Auslöser und
 * Fremdschlüssel beim Einfügen ausgesetzt (nur hier, in der Testdatenbank —
 * es geht um die Regeln, nicht um die Eingabeprüfungen). Verbindungen, an
 * denen Zweige einer Regel hängen (Projektleitung einer Baustelle, Teilnehmer
 * eines Termins, eigener Einsatz), werden gezielt gesetzt.
 *
 * GEGENPROBE: zwei absichtlich falsche Umschreibungen (Supportzweig
 * vergessen; Betrieb ohne Anmeldeprüfung) findet derselbe Vergleich.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const VERBINDUNG =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

interface Paar {
  tabelle: string;
  regel: string;
  art: string;
  alt_using: string | null;
  alt_check: string | null;
  neu_using: string | null;
  neu_check: string | null;
}
const PAARE: Paar[] = JSON.parse(readFileSync(join(__dirname, 'leseregeln-umbau.json'), 'utf8'));

const A = 'lr-eigen';
const B = 'lr-fremd';
const R = 'lr-ruht';
const Z = 'lr-pflicht';
const BETRIEBE = [A, B, R, Z];

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const P = {
  monteur: uid(9101), verwaltung: uid(9102), buch: uid(9103), pl: uid(9104), gf: uid(9105),
  admin: uid(9106), inaktiv: uid(9107), fremd: uid(9108), fremdBuch: uid(9109),
  ruhendGf: uid(9110), pflichtGf: uid(9111),
  plattAnsehen: uid(9120), plattMitarbeiten: uid(9121), plattRuht: uid(9122), plattOhne: uid(9123),
};
const PERSONEN: [string, string, string, boolean][] = [
  [P.monteur, A, 'Mitarbeiter', true], [P.verwaltung, A, 'Verwaltung', true], [P.buch, A, 'Buchhaltung', true],
  [P.pl, A, 'Projektleiter', true], [P.gf, A, 'Geschäftsführung', true], [P.admin, A, 'Administrator', true],
  [P.inaktiv, A, 'Mitarbeiter', false], [P.fremd, B, 'Mitarbeiter', true], [P.fremdBuch, B, 'Buchhaltung', true],
  [P.ruhendGf, R, 'Geschäftsführung', true], [P.pflichtGf, Z, 'Geschäftsführung', true],
];
const PLATTFORM = [P.plattAnsehen, P.plattMitarbeiten, P.plattRuht, P.plattOhne];

/** Wer in einem Betrieb Zeilen „besitzt“ — je Betrieb ein Monteur und eine zweite Person. */
const BESITZER: Record<string, string[]> = {
  // Die zweite Zeile in A gehört der deaktivierten Person: so zeigt sich, ob sie ihre eigene noch sähe.
  [A]: [P.monteur, P.inaktiv], [B]: [P.fremd, P.fremdBuch], [R]: [P.ruhendGf, P.ruhendGf], [Z]: [P.pflichtGf, P.pflichtGf],
};

function mitglied(sub: string, betrieb: string, rolle: string, aal = 'aal1') {
  return { sub, role: 'authenticated', aal, app_metadata: { company_id: betrieb, role: rolle, active: true } };
}
function plattform(sub: string, aal = 'aal2') {
  return { sub, role: 'authenticated', aal, app_metadata: { plattform_admin: true } };
}
const LAGEN: Record<string, object> = {
  'nicht angemeldet': { role: 'anon' },
  Monteur: mitglied(P.monteur, A, 'Mitarbeiter'),
  Verwaltung: mitglied(P.verwaltung, A, 'Verwaltung'),
  Buchhaltung: mitglied(P.buch, A, 'Buchhaltung'),
  'Buchhaltung aal2': mitglied(P.buch, A, 'Buchhaltung', 'aal2'),
  Projektleiter: mitglied(P.pl, A, 'Projektleiter'),
  Geschäftsführung: mitglied(P.gf, A, 'Geschäftsführung'),
  'Geschäftsführung aal2': mitglied(P.gf, A, 'Geschäftsführung', 'aal2'),
  Administrator: mitglied(P.admin, A, 'Administrator'),
  deaktiviert: mitglied(P.inaktiv, A, 'Mitarbeiter'),
  'fremder Betrieb': mitglied(P.fremd, B, 'Mitarbeiter'),
  'fremde Buchhaltung': mitglied(P.fremdBuch, B, 'Buchhaltung'),
  'ruhender Betrieb': mitglied(P.ruhendGf, R, 'Geschäftsführung', 'aal2'),
  'Pflicht zum zweiten Faktor, ohne': mitglied(P.pflichtGf, Z, 'Geschäftsführung'),
  'Pflicht zum zweiten Faktor, mit': mitglied(P.pflichtGf, Z, 'Geschäftsführung', 'aal2'),
  // Das Token sagt Administrator, die Belegschaft Mitarbeiter: es gilt die Belegschaft.
  'altes Token': mitglied(P.monteur, A, 'Administrator'),
  // Ein Token mit Betrieb, aber ohne Eintrag in der Belegschaft: nicht aktiv.
  'ohne Belegschaft': mitglied(uid(9199), A, 'Geschäftsführung'),
  'Support ansehen': plattform(P.plattAnsehen),
  'Support mitarbeiten': plattform(P.plattMitarbeiten),
  'Support, Betrieb ruht': plattform(P.plattRuht),
  'Plattform ohne Einblick': plattform(P.plattOhne),
  'Plattform ohne zweiten Faktor': plattform(P.plattAnsehen, 'aal1'),
};

let db: Client;
const nichtGefuellt: string[] = [];

async function spalten(tabelle: string) {
  const { rows } = await db.query<{ name: string; typ: string; noetig: boolean; udt: string }>(
    `select column_name as name, data_type as typ, udt_name as udt,
            (is_nullable = 'NO' and column_default is null and is_identity = 'NO') as noetig
       from information_schema.columns
      where table_schema = 'public' and table_name = $1
      order by ordinal_position`, [tabelle]);
  return rows;
}

/** Erster erlaubter Wert, wo eine Prüfbedingung `spalte = ANY (ARRAY['a', …])` verlangt. */
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
  if (udt === 'uuid') return null; // gen_random_uuid() in SQL
  if (typ === 'ARRAY') return '{}';
  if (['integer', 'bigint', 'smallint', 'numeric', 'double precision', 'real'].includes(typ)) return 1 + i;
  if (typ === 'boolean') return false;
  if (typ === 'date') return '2026-10-05';
  if (typ.startsWith('timestamp')) return '2099-01-01T00:00:00Z';
  if (typ.startsWith('time')) return '08:00';
  if (typ === 'jsonb' || typ === 'json') return '{}';
  return `x${i}`;
}

/** Feste Werte, an denen Zweige der Regeln hängen oder Prüfbedingungen, die keine Aufzählung sind. */
function sonderwerte(tabelle: string, betrieb: string, besitzer: string, i: number): Record<string, unknown> {
  const s: Record<string, unknown> = {};
  if (tabelle === 'projects') s.project_managers = `{${P.pl}}`;
  if (tabelle === 'termine') { s.teilnehmer = i === 0 ? `{${P.monteur}}` : '{}'; s.project_number = `B-${betrieb}`; s.datum = '2026-10-05'; }
  if (tabelle === 'assignments') { s.project_number = `B-${betrieb}`; s.date = '2026-10-05'; }
  if (tabelle === 'work_sheets') { s.erstellt_von_uid = besitzer; s.status = i === 0 ? 'Entwurf' : 'Unterschrieben'; }
  if (tabelle === 'betriebsurlaube' || tabelle === 'krankmeldungen' || tabelle === 'vacations' || tabelle === 'freistellungen') { s.von = '2026-10-05'; s.bis = '2026-10-06'; }
  if (tabelle === 'freistellungen') s.art = 'pflegefreistellung';
  if (tabelle === 'buchungskonten') { s.zweck = 'bank'; s.konto = '2800'; }
  if (tabelle === 'materials') { s.lagerartikel = true; }
  if (tabelle === 'einkauf_posten') { s.menge = 1; s.material_name = 'Rohr'; }
  // Der Plan gehört zur ersten Baustelle des Betriebs, der Pfad nennt Betrieb und Baustelle.
  if (tabelle === 'project_documents') { const pr = uid(9400 + BETRIEBE.indexOf(betrieb)); s.project_id = pr; s.pfad = `baustellen/${betrieb}/${pr}/x${i}.pdf`; s.bytes = 1; s.dateiname = 'x.pdf'; }
  // Stunden, Material und Fotos hängen am Entwurf des Betriebs (dem ersten Schein).
  if (['work_sheet_hours', 'work_sheet_material', 'work_sheet_photos'].includes(tabelle)) s.work_sheet_id = uid(9500 + 10 * BETRIEBE.indexOf(betrieb));
  if (tabelle === 'arbeitszeit_begruendungen') s.text = 'Grund';
  if (tabelle === 'betriebsurlaube') s.bezeichnung = 'Sommer';
  if (tabelle === 'basiszinssaetze') { s.ab = i === 0 ? '2026-01-01' : '2026-07-01'; s.satz = 1; }
  if (tabelle === 'fehlerprotokoll') { s.art = 'fehler'; s.nachricht = 'x'; }
  if (tabelle === 'invoices') { s.project_id = uid(9400 + BETRIEBE.indexOf(betrieb)); s.invoice_number = `RE-${betrieb}-${i}`; }
  if (tabelle === 'support_freigaben') { s.gilt_bis = '2099-01-01T00:00:00Z'; }
  if (tabelle === 'urlaubsanspruch_anpassungen') { s.grund = 'Unbezahlter Urlaub'; s.urlaubsjahr = 2026; }
  return s;
}

async function fuellen(tabelle: string): Promise<void> {
  const sp = await spalten(tabelle);
  const aufz = await aufzaehlungen(tabelle);
  const namen = new Set(sp.map((c) => c.name));
  let gefuellt = 0;
  let letzterFehler = '';
  for (const betrieb of (namen.has('company_id') ? BETRIEBE : ['-'])) {
    for (let i = 0; i < 2; i += 1) {
      const besitzer = BESITZER[betrieb]?.[i] ?? P.monteur;
      const werte: Record<string, unknown> = {};
      for (const c of sp) {
        if (!c.noetig) continue;
        werte[c.name] = aufz.get(c.name) ?? wertFuer(c.typ, c.udt, i);
      }
      if (namen.has('company_id')) werte.company_id = betrieb;
      if (namen.has('user_id')) werte.user_id = besitzer;
      if (namen.has('admin_uid')) werte.admin_uid = P.plattAnsehen;
      for (const [k, v] of Object.entries(sonderwerte(tabelle, betrieb, besitzer, i))) if (namen.has(k)) werte[k] = v;
      if (tabelle === 'projects') werte.id = uid(9400 + BETRIEBE.indexOf(betrieb) + 10 * i);
      if (tabelle === 'work_sheets') { werte.id = uid(9500 + 10 * BETRIEBE.indexOf(betrieb) + i); werte.project_number = `B-${betrieb}`; }
      if (tabelle === 'projects') werte.project_number = i === 0 ? `B-${betrieb}` : `B2-${betrieb}`;
      const spaltenNamen = Object.keys(werte);
      const parameter: unknown[] = [];
      const ausdruecke = spaltenNamen.map((k) => {
        const c = sp.find((x) => x.name === k);
        if (werte[k] === null && c?.udt === 'uuid') return 'gen_random_uuid()';
        parameter.push(werte[k]);
        return `$${parameter.length}`;
      });
      await db.query('savepoint z');
      try {
        await db.query(
          `insert into public.${tabelle} (${spaltenNamen.map((k) => `"${k}"`).join(', ')}) values (${ausdruecke.join(', ')})`,
          parameter,
        );
        await db.query('release savepoint z');
        gefuellt += 1;
      } catch (e) {
        await db.query('rollback to savepoint z');
        letzterFehler = (e as Error).message;
      }
    }
  }
  if (gefuellt === 0) nichtGefuellt.push(`${tabelle}: ${letzterFehler}`);
}

beforeAll(async () => {
  db = new Client({ connectionString: VERBINDUNG });
  await db.connect();
  await db.query('begin');
  await db.query(`set local session_replication_role = replica`);
  for (const b of BETRIEBE) {
    await db.query(`insert into public.companies (id, name) values ($1, $1) on conflict (id) do nothing`, [b]);
  }
  await db.query(`update public.companies set zwei_faktor_pflicht = true where id = $1`, [Z]);
  await db.query(
    `insert into public.betrieb_zustand (betrieb_kennung, name, deaktiviert_am) values ($1, $1, now())
       on conflict do nothing`, [R]);
  for (const id of [...PERSONEN.map((p) => p[0]), ...PLATTFORM]) {
    await db.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated') on conflict do nothing`,
      [id, `${id}@lr.test`]);
  }
  for (const [id, betrieb, rolle, aktiv] of PERSONEN) {
    await db.query(
      `insert into public.users (id, company_id, name, email, role, active) values ($1, $2, $3, $4, $5, $6)
         on conflict (id) do update set role = excluded.role, active = excluded.active, company_id = excluded.company_id`,
      [id, betrieb, rolle, `${id}@lr.test`, rolle, aktiv]);
  }
  for (const id of PLATTFORM) {
    await db.query(`insert into public.platform_admins (id, name) values ($1, 'Plattform') on conflict do nothing`, [id]);
  }
  // Einblicke: A „ansehen“, A „mitarbeiten“, der ruhende Betrieb. Die vierte Plattform hat keinen.
  const einblicke: [string, string, string][] = [[P.plattAnsehen, A, 'ansehen'], [P.plattMitarbeiten, A, 'mitarbeiten'], [P.plattRuht, R, 'ansehen']];
  for (const [admin, betrieb, stufe] of einblicke) {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.support_freigaben (company_id, grund, gilt_bis, stufe, gewaehrt_von)
         values ($1, 'Prüfung', now() + interval '1 day', $2, $3) returning id`,
      [betrieb, stufe, betrieb === A ? P.gf : P.ruhendGf]);
    await db.query(
      `insert into public.support_zugriffe (company_id, freigabe_id, admin_uid, bereich) values ($1, $2, $3, 'Betrieb')`,
      [betrieb, rows[0].id, admin]);
  }
  const tabellen = [...new Set(PAARE.map((p) => p.tabelle))].filter((t) => !['companies', 'users', 'support_freigaben', 'support_zugriffe', 'platform_admins'].includes(t));
  for (const t of tabellen) await fuellen(t);
  await db.query('set local session_replication_role = origin');
}, 120_000);

afterAll(async () => {
  // Nichts bleibt: die Testdaten lebten nur in dieser Transaktion.
  await db.query('rollback');
  await db.end();
});

/** Zeilen, deren Urteil sich zwischen alt und neu unterscheidet — je Lage. */
async function abweichungen(tabelle: string, alt: string, neu: string): Promise<{ lage: string; zeilen: number; geprueft: number }[]> {
  const sp = new Set((await spalten(tabelle)).map((c) => c.name));
  const nurTest = sp.has('company_id')
    ? `where company_id = any($1)`
    : tabelle === 'companies' ? `where id = any($1)` : `where $1::text[] is not null`;
  const aus: { lage: string; zeilen: number; geprueft: number }[] = [];
  for (const [lage, anspruch] of Object.entries(LAGEN)) {
    await db.query('savepoint l');
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(anspruch)]);
    const { rows } = await db.query<{ anders: string; alle: string }>(
      `select count(*) filter (where coalesce((${alt}), false) <> coalesce((${neu}), false)) as anders,
              count(*) as alle
         from public.${tabelle} ${nurTest}`, [BETRIEBE]);
    await db.query('rollback to savepoint l');
    aus.push({ lage, zeilen: Number(rows[0].anders), geprueft: Number(rows[0].alle) });
  }
  return aus;
}

describe('Zeilenschutz einmal je Abfrage — dieselbe Bedeutung', () => {
  it('füllt jede Tabelle mit Regel', () => {
    expect(nichtGefuellt).toEqual([]);
  });

  it('jede umgeschriebene Regel urteilt über jede Zeile in jeder Lage wie vorher', async () => {
    const fehler: string[] = [];
    let auswertungen = 0;
    for (const p of PAARE) {
      for (const [alt, neu, teil] of [[p.alt_using, p.neu_using, 'using'], [p.alt_check, p.neu_check, 'check']] as const) {
        if (alt === null && neu === null) continue;
        if (alt === null || neu === null) { fehler.push(`${p.tabelle}.${p.regel} ${teil}: eine Fassung fehlt`); continue; }
        for (const a of await abweichungen(p.tabelle, alt, neu)) {
          auswertungen += a.geprueft;
          if (a.zeilen > 0) fehler.push(`${p.tabelle}.${p.regel} ${teil} — ${a.lage}: ${a.zeilen} Zeilen`);
        }
      }
    }
    expect(fehler).toEqual([]);
    // Es wurde wirklich etwas verglichen: 121 Regeln × 22 Lagen über die Testzeilen.
    expect(auswertungen).toBeGreaterThan(10_000);
  }, 600_000);

  /*
    AUSSAGEKRAFT. „Gleich“ bewiese wenig, wenn eine Regel in keiner Lage je
    eine Zeile erlaubte — dann wären alt und neu nur gemeinsam falsch. Jede
    der 121 Regeln gewährt in mindestens einer Lage Zugriff auf eine Testzeile.
  */
  it('jede Regel gewährt in mindestens einer Lage Zugriff — der Vergleich prüft auch das Ja', async () => {
    const nieJa: string[] = [];
    for (const p of PAARE) {
      const ausdruck = p.alt_using ?? p.alt_check!;
      const sp = new Set((await spalten(p.tabelle)).map((c) => c.name));
      const nurTest = sp.has('company_id') ? `where company_id = any($1)` : p.tabelle === 'companies' ? `where id = any($1)` : `where $1::text[] is not null`;
      let ja = 0;
      for (const anspruch of Object.values(LAGEN)) {
        await db.query('savepoint j');
        await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(anspruch)]);
        const { rows } = await db.query<{ n: string }>(
          `select count(*) filter (where coalesce((${ausdruck}), false)) as n from public.${p.tabelle} ${nurTest}`, [BETRIEBE]);
        await db.query('rollback to savepoint j');
        ja += Number(rows[0].n);
      }
      if (ja === 0) nieJa.push(`${p.tabelle}.${p.regel}`);
    }
    expect(nieJa).toEqual([]);
  }, 600_000);

  it('die Lagen unterscheiden sich wirklich — sonst bewiese der Vergleich nichts', async () => {
    // Zeitbuchungen lesen: wie viele Zeilen sieht jede Lage? Monteur nur die eigene,
    // Buchhaltung alle des Betriebs, Support mit Einblick alle, fremder Betrieb keine aus A.
    const regel = PAARE.find((p) => p.regel === 'time_entries_lesen')!;
    const gesehen: Record<string, number> = {};
    for (const [lage, anspruch] of Object.entries(LAGEN)) {
      await db.query('savepoint s');
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(anspruch)]);
      const { rows } = await db.query<{ n: string }>(
        `select count(*) as n from public.time_entries where company_id = $1 and (${regel.neu_using})`, [A]);
      await db.query('rollback to savepoint s');
      gesehen[lage] = Number(rows[0].n);
    }
    expect(gesehen.Monteur).toBe(1);
    expect(gesehen.Buchhaltung).toBe(2);
    expect(gesehen['Support ansehen']).toBe(0); // Zeitbuchungen sind für den Support verschlossen
    expect(gesehen['fremder Betrieb']).toBe(0);
    expect(gesehen.deaktiviert).toBe(0);
    expect(gesehen['nicht angemeldet']).toBe(0);
    expect(gesehen['ohne Belegschaft']).toBe(0);
    expect(gesehen['altes Token']).toBe(1);
  });

  it('Gegenprobe: findet eine Umschreibung ohne Supportzweig', async () => {
    const regel = PAARE.find((p) => p.regel === 'termine_lesen')!;
    const falsch = regel.neu_using!.replace(' OR (company_id = ( SELECT app.supportbetrieb() AS supportbetrieb))', '');
    expect(falsch).not.toBe(regel.neu_using);
    const a = await abweichungen('termine', regel.alt_using!, falsch);
    expect(a.find((x) => x.lage === 'Support mitarbeiten')!.zeilen).toBeGreaterThan(0);
  });

  it('Gegenprobe: findet einen Betriebsvergleich ohne Anmeldeprüfung', async () => {
    const regel = PAARE.find((p) => p.regel === 'time_entries_lesen')!;
    const falsch = regel.neu_using!.replace('( SELECT app.lesebetrieb() AS lesebetrieb)', '( SELECT app.betrieb() AS betrieb)');
    expect(falsch).not.toBe(regel.neu_using);
    const a = await abweichungen('time_entries', regel.alt_using!, falsch);
    const getroffen = a.filter((x) => x.zeilen > 0).map((x) => x.lage);
    expect(getroffen).toEqual(expect.arrayContaining(['deaktiviert', 'ruhender Betrieb', 'Pflicht zum zweiten Faktor, ohne']));
  });
});

/*
  KÜNFTIGE REGELN. Eine Regel, die den Betrieb wieder je Zeile prüft, käme
  durch jede andere Prüfung grün durch — und machte die App mit den Jahren
  wieder langsam. Darum hier ausdrücklich.
*/
describe('Wächter für neue Regeln', () => {
  it('keine Regel in public ruft app.darf, app.betriebsmitglied oder app.support_liest je Zeile auf', async () => {
    const { rows } = await db.query<{ regel: string }>(
      `select tablename || '.' || policyname as regel from pg_policies
        where schemaname = 'public'
          and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'app\\.(darf|betriebsmitglied|support_liest)\\('`);
    expect(rows.map((r) => r.regel)).toEqual([]);
  });

  it('Rolle, Anmeldung und auth.uid() stehen in jeder Regel als (select …)', async () => {
    const { rows } = await db.query<{ regel: string; text: string }>(
      `select tablename || '.' || policyname as regel, coalesce(qual, '') || ' ' || coalesce(with_check, '') as text
         from pg_policies where schemaname = 'public'`);
    const ohneZeile = /(app\.(ist_fuehrung|ist_buch_oder_spitze|ist_spitze|ist_plattform|rolle|hat_rolle|darf_einkauf_sehen|darf_katalog_einspielen|darf_kunden_pflegen|darf_rechnungen_lesen|lesebetrieb|supportbetrieb)|auth\.uid)\(/g;
    const nackt: string[] = [];
    for (const { regel, text } of rows) {
      for (const m of text.matchAll(ohneZeile)) {
        if (!text.slice(0, m.index).endsWith('( SELECT ')) nackt.push(`${regel}: ${m[1]}`);
      }
    }
    expect(nackt).toEqual([]);
  });
});
