/**
 * Vor jedem Lauf: leere Datenbank.
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
 */
import { Client } from 'pg';

const VERBINDUNG =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export async function setup(): Promise<void> {
  const db = new Client({ connectionString: VERBINDUNG });
  await db.connect();
  try {
    const { rows } = await db.query<{ tabelle: string }>(`
      select tablename as tabelle from pg_tables where schemaname = 'public'
    `);
    if (rows.length > 0) {
      // CASCADE, weil die Tabellen einander per Fremdschlüssel halten. Die
      // Reihenfolge von Hand zu treffen wäre eine Liste, die beim nächsten
      // Schema veraltet.
      await db.query(
        `truncate table ${rows.map((r) => `public."${r.tabelle}"`).join(', ')} cascade`,
      );
    }
    // Die Konten liegen ausserhalb von public.
    await db.query('delete from auth.users');
  } finally {
    await db.end();
  }
}
