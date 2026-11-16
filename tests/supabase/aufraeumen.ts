/**
 * Vor jedem Lauf: leere Datenbank — bis auf den Messbestand.
 *
 * WARUM DAS NOETIG IST. Die Prüfungen hier legen Betriebe, Konten und Belege
 * an. Blieben die liegen, liefe der zweite Lauf gegen eine Rechnungsnummer,
 * die es schon gibt, und gegen einen Nummernzähler, der nicht mehr bei null
 * steht. Genau das ist zuerst passiert — grün beim ersten Mal, rot beim
 * zweiten. Ein Test, der nur auf einer frischen Datenbank durchgeht, ist eine
 * Falle: irgendwann glaubt ihm jemand nicht mehr und schaltet ihn ab.
 *
 * Aufgeräumt wird hier und nicht in den Tests selbst, damit keine Prüfung
 * beim Aufräumen einer anderen zusehen muss.
 *
 * DER MESSBESTAND BLEIBT (Durchsicht 15.11.2026). Der Betrieb
 * `ui-testbestand` (`scripts/ui-umbau/testbestand.mjs`, gewachsen: 30.000
 * Scheine, zehn Jahre Buchungen) braucht Minuten zum Anlegen und ist die
 * Grundlage der Messungen gegen den Stapel. Vorher ging er mit jedem Lauf
 * dieser Prüfungen verloren, und die Reihenfolge „erst prüfen, dann neu
 * anlegen, dann messen“ musste man kennen. Jetzt bleiben seine Zeilen (alles
 * mit seiner Kennung) und seine Konten (`…@ui-testbestand.test`); alles
 * andere geht wie bisher. Die Prüfungen legen ihre Betriebe selbst an und
 * fragen nach ihnen — ein ruhender Betrieb daneben stört sie nicht (geprüft
 * mit dem ganzen Lauf neben dem gewachsenen Bestand).
 */
import { Client } from 'pg';

const VERBINDUNG =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** Was über den Lauf hinweg stehen bleibt: der Betrieb des Messbestands und seine Konten. */
export const MESSBESTAND = { betrieb: 'ui-testbestand', kontoEndung: '@ui-testbestand.test' } as const;

interface Tabelle {
  name: string;
  /** Die Spalte mit der Kennung des Betriebs, `null` = kein Betrieb. */
  betriebsspalte: string | null;
  /** Spalten mit einem Fremdschlüssel auf `auth.users`. */
  kontospalten: string[];
}

async function tabellen(db: Client): Promise<Tabelle[]> {
  const { rows } = await db.query<{ name: string; spalten: string[]; konto: string[] | null }>(`
    select c.relname as name,
      array(select a.attname::text from pg_attribute a
            where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as spalten,
      array(select a.attname::text from pg_constraint k
              join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
            where k.conrelid = c.oid and k.contype = 'f' and k.confrelid = 'auth.users'::regclass) as konto
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
    order by c.relname`);
  return rows.map((r) => ({
    name: r.name,
    betriebsspalte: r.name === 'companies' ? 'id'
      : r.spalten.includes('company_id') ? 'company_id'
        : r.spalten.includes('betrieb_kennung') ? 'betrieb_kennung'
          : null,
    kontospalten: r.konto ?? [],
  }));
}

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

/**
 * Leert die Datenbank bis auf `behalten` — auf der übergebenen Verbindung und
 * OHNE eigene Transaktion: wer ruft, entscheidet über `commit` oder
 * `rollback` (die Prüfung dieses Aufräumens läuft so in einer Transaktion,
 * die sie verwirft).
 *
 * Gibt es den Betrieb nicht, ist es dasselbe `truncate` wie immer — schnell,
 * ohne Auslöser. Gibt es ihn, wird gelöscht, was nicht zu ihm gehört, und
 * zwar mit den Rechten des Eigentümers der Datenbank (lokal `supabase_admin`,
 * siehe `verbinden`): ohne Auslöser und ohne Prüfung der Fremdschlüssel, in
 * einem Durchgang. Ohne Auslöser, weil die Schutzregeln gerade das verbieten,
 * was hier gewollt ist — Belege löschen, abgeschlossene Monate ändern — und
 * das Änderungsjournal beim Löschen neue Zeilen schriebe. Ohne Prüfung der
 * Fremdschlüssel, weil sie neben dem Messbestand fast die ganze Zeit kostet:
 * gemessen nach einem ganzen Lauf 78 s (jede gelöschte Zeile sucht in seinen
 * großen Tabellen nach Verweisen), so unter 10 s. Gelöscht wird ohnehin alles
 * außer dem Messbestand, und der zeigt auf nichts Fremdes. Die Konten danach
 * wieder mit Prüfung — ihre Anhänge in `auth` gehen so mit.
 *
 * OHNE DIESE RECHTE bleibt es beim Leeren wie bisher, samt Messbestand — mit
 * einem Hinweis, wie er erhalten bleibt (`SUPABASE_DB_ADMIN_URL`).
 */
export async function leeren(db: Client, behalten: { betrieb: string; kontoEndung: string } = MESSBESTAND): Promise<void> {
  const alle = await tabellen(db);
  const { rowCount } = await db.query('select 1 from public.companies where id = $1', [behalten.betrieb]);
  const { rows: [ich] } = await db.query<{ hoch: boolean }>('select rolsuper as hoch from pg_roles where rolname = current_user');
  if (!rowCount || !ich?.hoch) {
    if (rowCount) {
      console.warn(`Aufräumen: ohne Zugang als Eigentümer der Datenbank geht der Messbestand „${behalten.betrieb}“ mit — SUPABASE_DB_ADMIN_URL setzen, um ihn zu behalten.`);
    }
    if (alle.length) {
      // CASCADE, weil die Tabellen einander per Fremdschlüssel halten. Die
      // Reihenfolge von Hand zu treffen wäre eine Liste, die beim nächsten
      // Schema veraltet.
      await db.query(`truncate table ${alle.map((t) => `public.${q(t.name)}`).join(', ')} cascade`);
    }
    // Die Konten liegen ausserhalb von public.
    await db.query('delete from auth.users');
    return;
  }

  const konten = `(select u.id from auth.users u where u.email like '%' || $1)`;
  await db.query('set local session_replication_role = replica');
  for (const t of alle) {
    /*
      Nach Betrieb, sonst nach Konto; was an keinem von beiden hängt
      (Basiszins, Rechtstexte, Fehler vor der Anmeldung), sind Bezugsgrößen
      für alle — die Prüfungen setzen sie selbst und erwarten sie leer.
    */
    const [bedingung, werte]: [string, unknown[]] = t.betriebsspalte
      ? [`${q(t.betriebsspalte)} is distinct from $1`, [behalten.betrieb]]
      : t.kontospalten.length
        ? [t.kontospalten.map((sp) => `(${q(sp)} is not null and ${q(sp)} not in ${konten})`).join(' or '), [behalten.kontoEndung]]
        : ['true', []];
    await db.query(`delete from public.${q(t.name)} where ${bedingung}`, werte);
  }
  await db.query('set local session_replication_role = origin');
  await db.query(`delete from auth.users where email is null or email not like '%' || $1`, [behalten.kontoEndung]);
}

/**
 * Verbindet zum lokalen Stapel — wenn möglich als Eigentümer der Datenbank
 * (`supabase_admin`, im lokalen Stapel der Supabase-CLI mit demselben
 * Passwort wie `postgres`; anders mit `SUPABASE_DB_ADMIN_URL`). Geht das
 * nicht, als der gewohnte Nutzer: dann räumt `leeren` auf dem langsameren
 * Weg, mit demselben Ergebnis.
 */
export async function verbinden(): Promise<Client> {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(VERBINDUNG).hostname)) {
    throw new Error('Der Datenbank-Testreset ist ausschließlich für einen lokalen Teststack erlaubt.');
  }
  const eigentuemer = process.env.SUPABASE_DB_ADMIN_URL ?? (() => {
    const u = new URL(VERBINDUNG);
    u.username = 'supabase_admin';
    return u.toString();
  })();
  if (['localhost', '127.0.0.1', '[::1]'].includes(new URL(eigentuemer).hostname)) {
    const hoch = new Client({ connectionString: eigentuemer });
    try {
      await hoch.connect();
      return hoch;
    } catch {
      await hoch.end().catch(() => undefined);
    }
  }
  const db = new Client({ connectionString: VERBINDUNG });
  await db.connect();
  return db;
}

export async function setup(): Promise<void> {
  const db = await verbinden();
  try {
    await db.query('begin');
    try {
      await leeren(db);
      await db.query('commit');
    } catch (e) {
      await db.query('rollback');
      throw e;
    }
  } finally {
    await db.end();
  }
}
