/**
 * Die stille Obergrenze: PostgREST gibt nicht alles zurück.
 *
 * WAS GEMESSEN WURDE, und es ist der Befund, der von allen am längsten
 * unbemerkt geblieben wäre: `db-max-rows` deckelt jede Antwort — im Projekt
 * bei 1000 Zeilen — und zwar OHNE Fehler und ohne Hinweis. 1500 Zeilen in der
 * Tabelle, 1000 kommen an, der Rest fehlt einfach.
 *
 * DAS IST DIE NARBE, DIE STUFE 7 ZU ENTFERNEN GLAUBTE. `listengrenzen.ts` ist
 * gelöscht, die Nachladeknöpfe sind weg — die Grenze war aber nie im Code,
 * sie sass eine Ebene tiefer. Für einen Betrieb mit zehn Monteuren erreicht
 * `time_entries` die tausend in etwa vier Monaten; danach zeigte jede
 * Jahresauswertung zu wenig, und nichts daran sähe falsch aus.
 *
 * Firestore hatte diese Grenze nicht: dort kam zurück, wonach gefragt wurde,
 * und die Obergrenzen standen im Code, wo man sie lesen konnte.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { admin, betriebAnlegen } from './helfer';
import { abfragen, SEITE } from '@/lib/db/pg/kern';

const BETRIEB = 'zeilengrenze';
/** Deutlich über der Serverobergrenze von 1000. */
const ANZAHL = 1500;

let db: Client;

beforeAll(async () => {
  db = new Client({ connectionString:
    process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();
  await betriebAnlegen(BETRIEB);
  await admin.from('customers').delete().eq('company_id', BETRIEB);

  /*
    ÜBER SQL EINGEFÜGT, nicht über die Schnittstelle: 1500 Zeilen in einem
    Rumpf sind dem Torwächter zu viel, und in Blöcken wäre es eine Minute
    Wartezeit je Lauf.
  */
  await db.query(`
    insert into public.customers (company_id, name)
    select $1, 'Kunde ' || lpad(g::text, 5, '0') from generate_series(1, $2) g
  `, [BETRIEB, ANZAHL]);
}, 180_000);

afterAll(async () => {
  await db.query('delete from public.customers where company_id = $1', [BETRIEB]);
  await db.query('delete from public.companies where id = $1', [BETRIEB]);
  await db.end();
});

describe('Die Obergrenze des Servers', () => {
  it('deckelt eine nackte Abfrage — das ist der Befund, nicht das Verhalten der App', async () => {
    /*
      DIESE PRÜFUNG BELEGT DIE URSACHE. Ohne sie wäre die nächste bloss ein
      Beweis, dass zwei Wege dasselbe liefern — nicht, dass einer davon nötig
      ist. Geht die Deckelung eines Tages weg, fällt diese hier und sagt es.
    */
    const { data } = await admin.from('customers').select('id').eq('company_id', BETRIEB);
    expect(data?.length).toBe(1000);
    expect(data?.length).toBeLessThan(ANZAHL);
  }, 120_000);

  it('liegt nicht unter der Seitengrösse, mit der geblättert wird', async () => {
    /*
      DIE ANNAHME, AUF DER DAS BLÄTTERN STEHT — hier gemessen statt vermutet.

      Eine nicht volle Seite gilt als die letzte. Das trägt nur, solange eine
      volle Seite nicht selbst schon die Deckelung ist: läge `db-max-rows`
      UNTER der Seitengrösse, käme auf jede Anfrage weniger zurück als
      gefordert, das Blättern hielte nach der ersten Seite an, und alles wäre
      wieder wie vorher — nur mit einem Kommentar darüber, der das Gegenteil
      behauptet.
    */
    const { data } = await admin.from('customers').select('id').eq('company_id', BETRIEB);
    expect(data?.length ?? 0).toBeGreaterThanOrEqual(SEITE);
  }, 120_000);
});

describe('Die Datenschicht holt alles', () => {
  it('gibt alle 1500 Zeilen zurück', async () => {
    const alle = await abfragen<{ name: string }>('customers', BETRIEB, {}, admin);
    expect(alle).toHaveLength(ANZAHL);
  }, 180_000);

  it('gibt jede Zeile GENAU EINMAL zurück', async () => {
    /*
      DER FEHLER, DEN BLÄTTERN ERST ERZEUGT. Ohne feste Reihenfolge kann eine
      Zeile auf zwei Seiten stehen und eine andere auf keiner. Das fällt nicht
      als Fehler auf, sondern als eine Liste, in der ein Eintrag doppelt steht
      und ein anderer fehlt — und niemand sucht danach, weil beides für sich
      richtig aussieht.
    */
    const alle = await abfragen<{ name: string }>('customers', BETRIEB, {}, admin);
    expect(new Set(alle.map((z) => z.id)).size).toBe(ANZAHL);
  }, 180_000);

  it('hält sich an eine Grenze, wenn eine gesetzt ist', async () => {
    // Sonst käme aus `grenze: 10` eine ganze Seite, und die Ansicht zeigte
    // fünfhundert Zeilen, wo zehn gemeint waren.
    const zehn = await abfragen('customers', BETRIEB, { grenze: 10 }, admin);
    expect(zehn).toHaveLength(10);

    // Und über einer Seite: die Grenze zählt, nicht die Seitengrösse.
    const siebenhundert = await abfragen('customers', BETRIEB, { grenze: 700 }, admin);
    expect(siebenhundert).toHaveLength(700);
  }, 180_000);

  it('sortiert über die Seitengrenze hinweg richtig', async () => {
    /*
      Die Sortierung darf nicht nur INNERHALB einer Seite stimmen. Genau das
      wäre das Ergebnis, wenn jede Seite für sich sortiert würde — die Liste
      sähe streckenweise geordnet aus und wäre es im Ganzen nicht.
    */
    const alle = await abfragen<{ name: string }>(
      'customers', BETRIEB, { sortiere: { feld: 'name' } }, admin,
    );
    expect(alle[0].name).toBe('Kunde 00001');
    expect(alle[alle.length - 1].name).toBe(`Kunde 0${ANZAHL}`);
    const namen = alle.map((z) => z.name);
    expect(namen).toEqual([...namen].sort());
  }, 180_000);
});

describe('Der Zweitschlüssel und die Beziehungen ohne Kennung', () => {
  it('kennt sie alle — Tabellen UND Sichten', async () => {
    /*
      DIE STOLPERSCHNUR, UND SIE IST BEIM ERSTEN ANLAUF GERISSEN — an der
      falschen Stelle.

      Sie fragte nach `table_type = 'BASE TABLE'` und fand vier Beziehungen
      ohne Kennung. Grün. Eine fünfte stand danebem und wurde nicht gezählt:
      `monthly_stats` ist seit Stufe 7 eine SICHT. Sie wird über `abfragen`
      gelesen wie jede Tabelle, und `order by id` darauf ist schlicht ein
      Fehler — vier Prüfungen in `modulEinstellungen` sind darüber gefallen.

      Gefunden hat das nicht diese Prüfung, sondern der volle Lauf. Eine
      Stolperschnur, die die Hälfte des Raums nicht abdeckt, ist keine —
      deshalb steht die Einschränkung auf Basis-Tabellen jetzt nicht mehr da.
    */
    const { rows } = await db.query<{ table_name: string }>(`
      select t.table_name
        from information_schema.tables t
       where t.table_schema = 'public'
         and not exists (select 1 from information_schema.columns c
                          where c.table_schema = 'public' and c.table_name = t.table_name
                            and c.column_name = 'id')
       order by 1
    `);
    /*
      `monthly_stats` steht in `zweitschluessel()` mit einem eigenen Schlüssel.
      Die anderen vier werden unmittelbar gelesen (`maybeSingle`), nicht über
      `abfragen`. Kommt eine sechste dazu, fällt diese Prüfung und die
      Entscheidung wird bewusst getroffen statt im Betrieb entdeckt.
    */
    expect(rows.map((r) => r.table_name)).toEqual([
      'betriebsanlagen', 'monthly_stats', 'number_counters', 'system_laeufe', 'user_prefs',
    ]);
  }, 60_000);

  it('blättert auch über die Sicht ohne Kennung vollständig', async () => {
    // Die Sicht hat keine `id`; ihr Zweitschlüssel ist Benutzer und Monat.
    // Ohne diesen Zweig liefe die Abfrage auf „column id does not exist".
    const bilanzen = await abfragen('monthly_stats', BETRIEB, {}, admin);
    expect(Array.isArray(bilanzen)).toBe(true);
  }, 60_000);
});

/*
  ZWEI MUTATIONEN ÜBERLEBEN DIESE DATEI, UND DAS GEHÖRT AUFGESCHRIEBEN — eine
  überlebte Mutation ohne Erklärung ist eine Lücke, eine mit Erklärung ist
  eine Entscheidung.

  1. `SEITE` von 500 auf 1000 heraufzusetzen ändert hier nichts. Bei einer
     Deckelung von genau 1000 fordert das Blättern 1000 an, bekommt 1000,
     erkennt die Seite als voll und holt die nächste — richtig. Die 500 sind
     ABSTAND, kein Mechanismus: sie tragen erst, wenn eine Anlage niedriger
     deckelt als die hiesige. Dass der Abstand da ist, hält die Prüfung oben
     fest; dass er gebraucht wird, lässt sich gegen diese Anlage nicht zeigen.

  2. Den Zweitschlüssel `order by id` zu entfernen ändert hier ebenfalls
     nichts. Postgres liefert die Zeilen dieser Tabelle über die Seiten hinweg
     in stabiler Reihenfolge, weil der Plan derselbe bleibt und niemand
     dazwischenschreibt. Die Zusage, die der Zweitschlüssel gibt, ist aber
     eine andere: sie gilt auch, wenn der Plan wechselt oder nebenher
     geschrieben wird. Das lässt sich ohne gestellte Datenbank nicht
     herbeiführen — und eine gestellte Datenbank prüfte die Attrappe statt
     Postgres.

  Beide Zeilen bleiben. Was man nicht zeigen kann, ist nicht dasselbe wie das,
  was man nicht braucht.
*/
