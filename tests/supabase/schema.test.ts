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

// Ganze, klammergenaue Leserichtlinien statt einer Tabellen-Ausnahmeliste.
// Allein „angemeldet“ oder eine passende Bedingung neben OR true reicht nicht.
const GEPUFFERTE_LESERECHTE = [
  '((company_id = ( SELECT app.betrieb() AS betrieb)) AND ( SELECT app.angemeldet() AS angemeldet))',
  '((company_id = ( SELECT app.betrieb() AS betrieb)) AND ( SELECT app.angemeldet() AS angemeldet) AND ((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT app.ist_buch_oder_spitze() AS ist_buch_oder_spitze)))',
  '(((company_id = ( SELECT app.betrieb() AS betrieb)) AND ( SELECT app.angemeldet() AS angemeldet)) OR (( SELECT app.ist_plattform() AS ist_plattform) AND app.support_liest(company_id)))',
  "((((company_id = ( SELECT app.betrieb() AS betrieb)) AND ( SELECT app.angemeldet() AS angemeldet)) OR (( SELECT app.ist_plattform() AS ist_plattform) AND app.support_liest(company_id))) AND ((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT app.hat_rolle(ARRAY['Verwaltung'::text, 'Buchhaltung'::text]) AS hat_rolle) OR ( SELECT app.ist_fuehrung() AS ist_fuehrung)))",
].map((s) => s.replace(/\s+/g, ''));
const GEPUFFERT_GESCHUETZT = `(p.cmd = 'SELECT' and p.with_check is null
  and regexp_replace(coalesce(p.qual, ''), '\\s+', '', 'g') = any($1::text[]))`;

beforeAll(async () => {
  db = new Client({ connectionString: VERBINDUNG });
  await db.connect();
}, 30_000);

async function zeilen<T = Record<string, unknown>>(sql: string, werte?: unknown[]): Promise<T[]> {
  const r = await db.query(sql, werte);
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
         -- Vier Namen gelten, und alle vier nehmen die company_id DER ZEILE
         -- entgegen: app.darf (der Regelfall), app.betriebsmitglied (die
         -- strengere Haelfte davon, ohne den Supportzweig -- sie steht dort,
         -- wo eine Regel auf app.darf zurueckfragen wuerde und sich im Kreis
         -- drehte), app.support_liest (der Supportzweig allein, gebunden
         -- an eine gueltige Freigabe DIESES Betriebs) und app.freigabe_gilt
         -- (der erste Protokolleintrag eines Einblicks, B4: die genannte
         -- Freigabe muss gelten UND diesem Betrieb gehoeren).
         --
         -- Was hier NICHT stehen darf, ist app.ist_plattform(): das prueft
         -- das Konto und nicht die Zeile -- und waere damit genau die offene
         -- Richtlinie, die dieser Test sucht.
         and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) not like '%app.darf%'
         and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) not like '%app.betriebsmitglied%'
         and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) not like '%app.support_liest%'
         and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) not like '%app.freigabe_gilt%'
         and not ${GEPUFFERT_GESCHUETZT}
       order by 1, 2
    `, [GEPUFFERTE_LESERECHTE]);
    expect(offen.map((r) => `${r.tabelle}.${r.richtlinie}`)).toEqual([]);
  });

  it('erkennt gepufferte Betriebsrechte, aber weder OR true noch eine bloße Anmeldung', async () => {
    await db.query('begin');
    try {
      const betrieb = 'company_id = (select app.betrieb()) and (select app.angemeldet())';
      for (const [ausdruck, geschuetzt] of [[betrieb, true],
        [`(${betrieb}) or true`, false],
        ['company_id is not null and (select app.angemeldet())', false]] as const) {
        await db.query(`create policy schema_cache_probe on public.materials
          for select to authenticated using (${ausdruck})`);
        const [p] = await zeilen<{ geschuetzt: boolean }>(`select ${GEPUFFERT_GESCHUETZT} as geschuetzt
          from pg_policies p where p.schemaname = 'public'
            and p.tablename = 'materials' and p.policyname = 'schema_cache_probe'`, [GEPUFFERTE_LESERECHTE]);
        expect(p.geschuetzt).toBe(geschuetzt);
        await db.query('drop policy schema_cache_probe on public.materials');
      }
    } finally {
      await db.query('rollback');
    }
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

  it('lässt einen Supportzugang nirgends schreiben', async () => {
    /*
      DIESELBE BAUART WIE DER BETRIEBSRIEGEL DARÜBER, und aus demselben Grund:
      die meisten Schreibregeln verlangen ohnehin eine Rolle, und ein
      Plattformkonto hat keine. „Die meisten" ist aber keine Zusage. EINE
      Regel, die zum Schreiben nur `app.darf` prüft, machte aus dem Lesezugang
      einen Schreibzugang — unbemerkt, weil nichts scheitert.

      Zwei Tabellen stehen absichtlich nicht in der Liste: das Protokoll
      entsteht gerade durch den Supportzugang, und die Freigaben muss der
      Notzugang schreiben können. Beide sind einzeln geregelt und in
      `supportzugang.test.ts` einzeln geprüft.

      ZWEI RIEGEL SIND ERLAUBT, und der Unterschied ist die Stufe.
      `support_schreibt_nicht` lässt eine Freigabe der Stufe „mitarbeiten"
      durch; `support_niemals` tut das nicht und liegt deshalb auf den drei
      Tabellen, die ein Supportzugang nicht einmal LESEN darf —
      Zeitbuchungen, Urlaube, Scheinfotos. Blind ändern zu können, was man
      nicht sehen darf, wäre die schlechteste aller Kombinationen. Gefragt
      ist hier, dass ÜBERHAUPT einer der beiden daliegt: eine Tabelle ganz
      ohne Riegel ist die Lücke, um die es geht.
    */
    const { rows: ohneRiegel } = await db.query<{ tabelle: string }>(`
      select c.relname as tabelle
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind = 'r'
         and c.relname not in ('support_zugriffe', 'support_freigaben')
         and exists (
           select 1 from information_schema.columns col
            where col.table_schema = 'public' and col.table_name = c.relname
              and col.column_name = 'company_id')
         and not exists (
           select 1 from pg_trigger t
            where t.tgrelid = c.oid and not t.tgisinternal
              and t.tgfoid in (
                'app.support_schreibt_nicht'::regproc,
                'app.support_niemals'::regproc))
       order by 1
    `);
    expect(ohneRiegel.map((r) => r.tabelle)).toEqual([]);
  });
});

describe('Interne Hilfsfunktionen', () => {
  it('sind für angemeldete und anonyme Konten nicht ausführbar', async () => {
    /*
      PRÜFLAUF 25.09.2026 (P3-21). Das Schema `app` steht nicht auf der
      Schnittstelle — aber per Vorgabe durfte `authenticated` JEDE Funktion
      darin ausführen, auch die, die in `auth.users` schreiben oder mit dem
      Dienstschlüssel nach aussen rufen. „Nicht erreichbar" ist eine
      Eigenschaft der Konfiguration; das Ausführungsrecht ist die Grenze, die
      auch dann noch hält, wenn die sich ändert.
    */
    const intern = [
      'app.ansprueche_setzen(uuid, jsonb, text[])',
      'app.konto_sperren(uuid, boolean)',
      'app.sitzungen_beenden(uuid)',
      'app.ausleitung_anstossen()',
      'app.ausleitung_nachsehen()',
      'app.push_anstossen(jsonb)',
      'app.anstoss_kopfzeilen(text)',
      // Personen nur aus dem eigenen Betrieb (C2): sonst eine Auskunft, wer wo arbeitet.
      'app.personen_im_betrieb(text, uuid[])',
      'app.personen_pruefen()',
      // Nachtlauf (C10) und Gedächtnis der alten Baustellennummern (C8).
      'app.pruefsummen_nachtragen()',
      'app.alte_nummer_merken()',
      // Rückwirkende eigene Krankmeldung (A4).
      'app.krank_rueckwirkend_pruefen()',
      // Einlass der alten Spalten für Kostensätze und Einkaufspreise (B1).
      'app.kostensaetze_einlass()',
      'app.einkaufspreis_einlass()',
      'app.zeitkonto_einlass_anlegen()',
      'app.zeitkonto_einlass_ueberstunden()',
      'app.zeitkonto_einlass_urlaub()',
      // Welcher Einblick gerade gilt (B3) — nur für die Supportfunktionen.
      'app.einblick_aktuell()',
      // Ende der Aufbewahrung (B8) — nur die Löschung rechnet damit.
      'app.aufbewahrt_bis(date)',
      // Betriebe deaktivieren und löschen (Nachtest 01.10.2026, Paket D).
      'app.betrieb_ruht(text)',
      'app.zustand_zeile(text)',
      'app.grund_pflicht(text)',
      'app.plattform_pflicht()',
      'app.plattform_konto_pflicht(uuid)',
      'app.loeschung_pruefen(text, text)',
      'app.kennung_nicht_gesperrt()',
      'app.protokoll_unveraenderlich()',
      // Kontingent eines Sonderurlaubs-Anlasses — nur `freistellung_entscheiden` (Runde 3, G17).
      'app.anlass_kontingent(text, text)',
      // Auslöser der IBAN-Prüfung und der Zwei-Faktor-Pflicht (Runde 3, H3 und H1).
      'app.bankverbindung_pruefen()',
      'app.zwei_faktor_pflicht_pruefen()',
    ];
    const offen: string[] = [];
    for (const f of intern) {
      for (const rolle of ['authenticated', 'anon']) {
        const [r] = await zeilen<{ darf: boolean }>(
          `select has_function_privilege('${rolle}', '${f}', 'execute') as darf`,
        );
        if (r.darf) offen.push(`${rolle}: ${f}`);
      }
    }
    expect(offen).toEqual([]);
  });

  it('die Regelhelfer bleiben es — jede Richtlinie ruft sie mit den Rechten des Fragenden', async () => {
    for (const f of ['app.darf(text)', 'app.betriebsmitglied(text)', 'app.ist_fuehrung()',
                     'app.rolle()', 'app.aktiv()', 'app.ist_plattform()']) {
      const [r] = await zeilen<{ darf: boolean }>(
        `select has_function_privilege('authenticated', '${f}', 'execute') as darf`,
      );
      expect({ f, darf: r.darf }).toEqual({ f, darf: true });
    }
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
              -- app.darf oder das strengere app.betriebsmitglied (ohne
              -- Supportzugang, etwa bei Zeiten mit Krankenständen).
              and (coalesce(p.qual, '') like '%app.darf%'
                   or coalesce(p.qual, '') like '%app.betriebsmitglied%'
                   or ${GEPUFFERT_GESCHUETZT}))
       order by 1
    `, [GEPUFFERTE_LESERECHTE]);
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
         and table_name in ('platform_admins', 'betriebsanlagen', 'betrieb_zustand', 'betrieb_protokoll')
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
         and tablename in ('platform_admins', 'betriebsanlagen', 'betrieb_zustand', 'betrieb_protokoll')
    `);
    expect(richtlinien).toEqual([]);

    const geschuetzt = await zeilen<{ tablename: string }>(`
      select tablename from pg_tables
       where schemaname = 'public'
         and tablename in ('platform_admins', 'betriebsanlagen', 'betrieb_zustand', 'betrieb_protokoll')
         and rowsecurity = true
       order by 1
    `);
    expect(geschuetzt.map((r) => r.tablename).sort()).toEqual(['betrieb_protokoll', 'betrieb_zustand', 'betriebsanlagen', 'platform_admins']);
  });
});

describe('Vollständigkeit gegenüber Firestore', () => {
  it('hat für jede Sammlung eine Entsprechung', async () => {
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
      // followUps entfiel am 30.09.2026 — nur die KI-Erfassung schrieb dorthin.
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
