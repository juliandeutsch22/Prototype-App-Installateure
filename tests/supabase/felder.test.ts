/**
 * Der Wächter über die Feldumrechnung.
 *
 * Die Umrechnung zwischen `camelCase` und `snake_case` ist mechanisch. Das
 * ist gut, solange sie für JEDE echte Spalte gilt — und genau das lässt sich
 * nicht behaupten, sondern nur prüfen. Eine Spalte, die den Hin- und Rückweg
 * nicht übersteht, verschluckt sonst still ihren Wert: die App schickt
 * `xyAbc`, die Datenbank bekommt `xy_abc`, und was zurückkommt, heisst wieder
 * anders.
 *
 * Der Test kennt keine Liste von Spalten — er fragt die Datenbank. Eine neue
 * Spalte ist damit automatisch geprüft.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { alsFeld, alsSpalte } from '@/lib/db/pg/felder';

const VERBINDUNG =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

let db: Client;
let spalten: Array<{ tabelle: string; spalte: string }>;

beforeAll(async () => {
  db = new Client({ connectionString: VERBINDUNG });
  await db.connect();
  const { rows } = await db.query<{ tabelle: string; spalte: string }>(`
    select table_name as tabelle, column_name as spalte
      from information_schema.columns
     where table_schema = 'public'
     order by 1, 2
  `);
  spalten = rows;
}, 30_000);

afterAll(async () => { await db?.end(); });

describe('Feldumrechnung', () => {
  it('jede Spalte übersteht Hin- und Rückweg unverändert', () => {
    const kaputt = spalten
      .filter(({ spalte }) => alsSpalte(alsFeld(spalte)) !== spalte)
      .map(({ tabelle, spalte }) => `${tabelle}.${spalte} → ${alsFeld(spalte)} → ${alsSpalte(alsFeld(spalte))}`);
    expect(kaputt).toEqual([]);
  });

  it('keine zwei Spalten einer Tabelle landen auf demselben Feld', () => {
    // Der stille Datenverlust: zwei Spalten, ein Feld — eine überschreibt die
    // andere, und niemand sieht es.
    const doppelt: string[] = [];
    const jeTabelle = new Map<string, Map<string, string>>();
    for (const { tabelle, spalte } of spalten) {
      const feld = alsFeld(spalte);
      const karte = jeTabelle.get(tabelle) ?? new Map<string, string>();
      const schon = karte.get(feld);
      if (schon) doppelt.push(`${tabelle}: ${schon} und ${spalte} → ${feld}`);
      karte.set(feld, spalte);
      jeTabelle.set(tabelle, karte);
    }
    expect(doppelt).toEqual([]);
  });

  it('rechnet die Fälle um, auf die es ankommt', () => {
    // Ein paar Fixpunkte von Hand, damit der Test nicht nur sich selbst prüft.
    expect(alsFeld('company_id')).toBe('companyId');
    expect(alsFeld('break_duration')).toBe('breakDuration');
    expect(alsFeld('is_night_work')).toBe('isNightWork');
    expect(alsFeld('erstellt_von_uid')).toBe('erstelltVonUid');
    expect(alsFeld('datum')).toBe('datum');
    expect(alsSpalte('projectNumber')).toBe('project_number');
    expect(alsSpalte('verkaufspreis')).toBe('verkaufspreis');
  });
});
