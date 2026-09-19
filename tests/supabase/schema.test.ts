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

describe('Indizes', () => {
  /*
    DIE FRAGE, DIE MIT FIRESTORE NICHT VERSCHWUNDEN IST.

    Bis zum 19.09.2026 stellte sie `tests/unit/indexabgleich.test.ts`: hat jede
    Abfrage den zusammengesetzten Index, den sie in Produktion braucht? Dort
    war sie dringend, weil eine Abfrage ohne Index in Firestore HART
    SCHEITERT — „The query requires an index", und die Ansicht steht leer da.
    Genau so ist einmal die Kundenakte ausgefallen.

    POSTGRES SCHEITERT NICHT, ES WIRD LANGSAM. Das ist die unangenehmere
    Sorte: bei zwanzig Testzeilen fällt nichts auf, und der sequenzielle Scan
    zeigt sich erst beim Kunden mit vier Jahren Historie. Ein Test kann das
    nicht messen — was er prüfen kann, ist die Voraussetzung.

    JEDE ABFRAGE DIESER APP FILTERT AUF `company_id`; das ist die
    Mandantentrennung und keine Wahl. Eine Stammtabelle ohne Index, der mit
    dieser Spalte ANFÄNGT, liest bei jeder einzelnen Abfrage die Zeilen aller
    Betriebe. Geprüft wird deshalb die ERSTE Spalte und nicht bloss das
    Vorkommen: ein Index auf `(status, company_id)` hilft dieser Abfrage
    nicht.

    KINDTABELLEN SIND DIE AUSNAHME, UND ZWAR EINE ECHTE. Die Zeilen einer
    Rechnung, die Stunden eines Scheins, die Positionen einer Rüstliste werden
    über ihren ELTERNSCHLÜSSEL geholt, nie über den Betrieb allein; für sie
    wäre ein führendes `company_id` der falsche Index. Sie tragen `company_id`
    trotzdem, weil der Zeilenschutz es braucht.

    Beim ersten Lauf hat genau das die strengere Fassung dieser Prüfung
    gemeldet — acht Tabellen, alle mit dem richtigen Index auf dem
    Elternschlüssel. Die Regel wurde also nicht aufgeweicht, sondern
    richtiggestellt: verlangt wird ein Index, der mit `company_id` ODER mit
    einem Fremdschlüssel beginnt. Ohne beides liest die Tabelle sequenziell.
  */
  it('hat auf jeder Betriebstabelle einen Index für den Weg, auf dem sie gelesen wird', async () => {
    const ohne = await zeilen<{ tabelle: string }>(`
      with betriebstabellen as (
        select c.table_name as tabelle
          from information_schema.columns c
          join pg_tables t
            on t.schemaname = 'public' and t.tablename = c.table_name
         where c.table_schema = 'public' and c.column_name = 'company_id'
      ),
      fremdschluessel as (
        select con.conrelid as tabelle_oid, unnest(con.conkey) as spalte
          from pg_constraint con
         where con.contype = 'f'
      ),
      brauchbar as (
        select t.relname as tabelle
          from pg_index i
          join pg_class  ix on ix.oid = i.indexrelid
          join pg_class  t  on t.oid  = i.indrelid
          join pg_namespace n on n.oid = t.relnamespace
          join pg_attribute a
            on a.attrelid = t.oid and a.attnum = i.indkey[0]
         where n.nspname = 'public'
           and (
             a.attname = 'company_id'
             or exists (
               select 1 from fremdschluessel f
                where f.tabelle_oid = t.oid and f.spalte = a.attnum
             )
           )
      )
      select b.tabelle from betriebstabellen b
       where b.tabelle not in (select tabelle from brauchbar)
       order by 1
    `);
    expect(ohne.map((r) => r.tabelle)).toEqual([]);
  });

  it('findet überhaupt Betriebstabellen — sonst prüft die Zeile darüber nichts', async () => {
    // Der Wächter über den Wächter: eine Abfrage, die nichts findet, meldet
    // fröhlich grün. Die Zahl darf wachsen, aber nicht auf null fallen.
    const alle = await zeilen<{ n: string }>(`
      select count(*)::text as n
        from information_schema.columns
       where table_schema = 'public' and column_name = 'company_id'
    `);
    expect(Number(alle[0].n)).toBeGreaterThanOrEqual(15);
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
