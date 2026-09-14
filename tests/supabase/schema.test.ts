/**
 * DER WÄCHTER.
 *
 * Nicht die Regeln selbst, sondern die Frage, ob überhaupt eine da ist. Eine
 * Tabelle ohne Zeilenschutz fällt niemandem auf: sie funktioniert tadellos,
 * nur eben für alle. Das ist der Fehler, der einen Mandantenbetrieb beendet,
 * und er entsteht nicht durch Nachlässigkeit, sondern dadurch, dass in einem
 * halben Jahr jemand eine Tabelle hinzufügt und die drei Zeilen vergisst.
 *
 * Dieselbe Idee wie `tests/unit/abfragegrenzen.test.ts` auf der Firestore-
 * Seite: der Test kennt keine Liste von Tabellen, er fragt die Datenbank.
 * Eine neue Tabelle ist damit automatisch geprüft — oder sie fällt durch.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from 'pg';

const VERBINDUNG = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

let db: Client;

beforeAll(async () => {
  db = new Client({ connectionString: VERBINDUNG });
  await db.connect();
}, 30_000);

async function zeilen<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const r = await db.query(sql);
  return r.rows as T[];
}

describe('Zeilenschutz', () => {
  it('ist auf JEDER Tabelle in public eingeschaltet', async () => {
    const ohne = await zeilen<{ tablename: string }>(`
      select tablename from pg_tables
       where schemaname = 'public' and rowsecurity = false
       order by tablename
    `);
    expect(ohne.map((r) => r.tablename)).toEqual([]);
  });

  it('gibt der Rolle `anon` auf KEINER Tabelle ein Recht', async () => {
    /*
      DIE ROLLE HINTER DEM ÖFFENTLICHEN SCHLÜSSEL.

      Der Schlüssel steht im ausgelieferten JavaScript; jede Anfrage ohne
      Anmeldetoken kommt als `anon` an. Supabase vergibt im Schema `public`
      per Vorgabe SELECT, INSERT, UPDATE und DELETE an `anon` — zwischen
      einem Fremden ohne Konto und den Löhnen dieses Betriebs stand damit
      genau eine Sache: der Zeilenschutz.

      Kein Loch, solange alle siebzig Richtlinien stimmen. Der Punkt ist die
      REICHWEITE eines künftigen Fehlers: fällt eine Richtlinie einmal zu
      weit aus, liest es mit `anon`-Rechten das halbe Internet und ohne sie
      bestenfalls ein angemeldeter Mitarbeiter eines anderen Betriebs.

      Dieser Test ist zugleich die Stelle, an der die Lücke auffällt, die
      `20260914090000_anon_zumachen.sql` nicht schliessen kann: eine von Hand
      in der Dashboard-Maske angelegte Tabelle entsteht als `supabase_admin`
      und bekommt die alte Vorgabe. Sie würde hier rot.
    */
    const mitRecht = await zeilen<{ table_name: string; privilege_type: string }>(`
      select table_name, privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'anon'
       order by 1, 2
    `);
    expect(mitRecht.map((r) => `${r.table_name}:${r.privilege_type}`)).toEqual([]);
  });

  it('prüft in JEDER Richtlinie auf einer Betriebstabelle auch wirklich den Betrieb', async () => {
    // Eingeschalteter Zeilenschutz ohne Betriebsprüfung wäre eine Tür mit
    // Schloss und ohne Riegel: die Richtlinie greift, erlaubt aber allen alles.
    //
    // Gefragt wird nach JEDER Richtlinie, nicht nach der Tabelle. Der erste
    // Anlauf fragte „hat diese Tabelle irgendeine Richtlinie mit app.darf" —
    // und liess damit durchgehen, dass neben einer richtigen eine zweite,
    // offene stand. Genau so entsteht das Leck: nicht dadurch, dass die
    // Prüfung fehlt, sondern dadurch, dass eine daneben sie aushebelt.
    const offen = await zeilen<{ tabelle: string; richtlinie: string }>(`
      select p.tablename as tabelle, p.policyname as richtlinie
        from pg_policies p
       where p.schemaname = 'public'
         and exists (
           select 1 from information_schema.columns col
            where col.table_schema = 'public' and col.table_name = p.tablename
              and col.column_name = 'company_id')
         and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) not like '%app.darf%'
       order by 1, 2
    `);
    expect(offen.map((r) => `${r.tabelle}.${r.richtlinie}`)).toEqual([]);
  });

  it('lässt die Monatsbilanz mit den Rechten des Fragenden laufen', async () => {
    // Eine Sicht erbt den Zeilenschutz ihrer Tabellen NICHT von selbst. Ohne
    // security_invoker liefe sie mit den Rechten dessen, der sie angelegt hat
    // — und wäre ein Fenster in alle Betriebe.
    const [sicht] = await zeilen<{ optionen: string[] | null }>(`
      select c.reloptions as optionen
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'monthly_stats'
    `);
    expect(sicht.optionen ?? []).toContain('security_invoker=on');
  });

  it('lässt den Betrieb einer Zeile nirgends nachträglich wechseln', async () => {
    // Ohne diesen Riegel könnte ein Betrieb seine eigene Zeile einem anderen
    // unterschieben — die Richtlinie prüft beim Ändern ja nur, dass sie ihm
    // gehört, nicht dass sie ihm weiterhin gehört.
    const ohneRiegel = await zeilen<{ tabelle: string }>(`
      select c.relname as tabelle
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and exists (
           select 1 from information_schema.columns col
            where col.table_schema = 'public' and col.table_name = c.relname
              and col.column_name = 'company_id')
         and exists (
           select 1 from pg_policies p
            where p.schemaname = 'public' and p.tablename = c.relname
              and p.cmd in ('UPDATE', 'ALL'))
         and not exists (
           select 1 from pg_trigger t
            where t.tgrelid = c.oid and not t.tgisinternal
              and pg_get_triggerdef(t.oid) like '%betrieb_unveraenderlich%')
       order by 1
    `);
    expect(ohneRiegel.map((r) => r.tabelle)).toEqual([]);
  });
});

describe('Live-Abonnements', () => {
  it('veröffentlicht keine Tabelle ohne Leserichtlinie', async () => {
    // Der gefährlichste Einzelfehler dieses Umzugs: Abfrage und Meldeweg sind
    // zwei Wege. Eine veröffentlichte Tabelle ohne Leserichtlinie schickt
    // jede Änderung an jeden Empfänger, ohne dass je eine Abfrage etwas
    // Falsches zurückgäbe.
    const blind = await zeilen<{ tablename: string }>(`
      select pt.tablename
        from pg_publication_tables pt
       where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public'
         and not exists (
           select 1 from pg_policies p
            where p.schemaname = 'public' and p.tablename = pt.tablename
              and p.cmd in ('SELECT', 'ALL')
              and coalesce(p.qual, '') like '%app.darf%')
       order by 1
    `);
    expect(blind.map((r) => r.tablename)).toEqual([]);
  });

  it('schickt bei jeder veröffentlichten Tabelle den ganzen Datensatz mit', async () => {
    // Ohne REPLICA IDENTITY FULL trägt eine Meldung nur die geänderten Felder
    // und den Schlüssel — company_id fehlt, und der Empfänger kann gar nicht
    // prüfen, ob ihn das etwas angeht.
    const knapp = await zeilen<{ tablename: string }>(`
      select pt.tablename
        from pg_publication_tables pt
        join pg_class c on c.relname = pt.tablename
        join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
       where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public'
         and c.relreplident <> 'f'
       order by 1
    `);
    expect(knapp.map((r) => r.tablename)).toEqual([]);
  });
});

describe('Die Plattform steht ausserhalb', () => {
  it('trägt kein company_id', async () => {
    const mitBetrieb = await zeilen<{ table_name: string }>(`
      select table_name from information_schema.columns
       where table_schema = 'public'
         and table_name in ('platform_admins', 'betriebsanlagen')
         and column_name = 'company_id'
    `);
    expect(mitBetrieb).toEqual([]);
  });

  it('hat Zeilenschutz an und KEINE einzige Richtlinie', async () => {
    // Was nicht erlaubt ist, ist verboten. Gelesen und geschrieben wird
    // ausschliesslich serverseitig mit dem Dienstschlüssel.
    const richtlinien = await zeilen(`
      select policyname from pg_policies
       where schemaname = 'public'
         and tablename in ('platform_admins', 'betriebsanlagen')
    `);
    expect(richtlinien).toEqual([]);

    const geschuetzt = await zeilen<{ tablename: string }>(`
      select tablename from pg_tables
       where schemaname = 'public'
         and tablename in ('platform_admins', 'betriebsanlagen')
         and rowsecurity = true
       order by 1
    `);
    expect(geschuetzt.map((r) => r.tablename)).toEqual(['betriebsanlagen', 'platform_admins']);
  });
});

describe('Vollständigkeit gegenüber Firestore', () => {
  it('hat für jede der zwanzig Sammlungen eine Entsprechung', async () => {
    // Die Vorgabe lautet: keine bestehende Funktion darf fehlen. Diese Liste
    // ist die Landkarte dorthin — jede Firestore-Sammlung und die Tabelle,
    // die ihre Arbeit übernimmt.
    const erwartet: Record<string, string> = {
      companies: 'companies',
      users: 'users',
      userPrefs: 'user_prefs',
      customers: 'customers',
      projects: 'projects',
      materials: 'materials',
      materialOrders: 'material_orders',
      einsatzMaterial: 'einsatz_material',
      timeEntries: 'time_entries',
      vacations: 'vacations',
      assignments: 'assignments',
      workSheets: 'work_sheets',
      quotes: 'quotes',
      invoices: 'invoices',
      wartungen: 'wartungen',
      followUps: 'follow_ups',
      counters: 'number_counters',
      systemLaeufe: 'system_laeufe',
      // monthlyStats und monthlyStatsMeta werden eine Sicht, keine Tabelle —
      // sie sind in Firestore nur da, weil dort nicht summiert werden kann.
      monthlyStats: 'monthly_stats',
      monthlyStatsMeta: 'monthly_stats',
    };

    const vorhanden = new Set(
      (await zeilen<{ tablename: string }>(
        `select tablename from pg_tables where schemaname = 'public'
         union all
         select viewname from pg_views where schemaname = 'public'
         union all
         select matviewname from pg_matviews where schemaname = 'public'`,
      )).map((r) => r.tablename),
    );

    const fehlend = Object.entries(erwartet)
      .filter(([, tabelle]) => !vorhanden.has(tabelle))
      .map(([sammlung, tabelle]) => `${sammlung} -> ${tabelle}`);

    expect(fehlend).toEqual([]);
  });
});
