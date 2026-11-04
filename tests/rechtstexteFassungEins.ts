/**
 * Fassung 1 der Rechtstexte wieder anlegen — mit GENAU dem Befehl aus der
 * Migration `20261104130000_rechtstexte.sql`, nicht mit einer Abschrift.
 *
 * Die Datenbankprüfungen leeren vor jedem Lauf alle Tabellen
 * (`tests/supabase/aufraeumen.ts`), auch die mitgelieferte Fassung 1. Wer
 * danach Impressum oder Datenschutz braucht, legt sie hiermit an; der Befehl
 * fügt nur ein, was fehlt.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Client } from 'pg';

const MIGRATION = resolve(process.cwd(), 'supabase/migrations/20261104130000_rechtstexte.sql');

export function fassungEinsBefehl(): string {
  const sql = readFileSync(MIGRATION, 'utf8');
  const ab = sql.indexOf('insert into public.rechtstexte (art, nummer, inhalt, veroeffentlicht_am)');
  if (ab < 0) throw new Error('Der Befehl für Fassung 1 steht nicht mehr in der Migration');
  return sql.slice(ab);
}

export async function fassungEinsAnlegen(db: Client): Promise<void> {
  await db.query(fassungEinsBefehl());
}
