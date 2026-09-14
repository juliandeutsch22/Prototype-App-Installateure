/**
 * Läuft die festgehaltene Typkarte noch mit dem Schema mit?
 *
 * `src/lib/db/pg/spaltentypen.ts` ist erzeugt, nicht gepflegt. Eine neue
 * Zeitspalte, die dort fehlt, käme als Zeichenkette bei einer Anzeige an, die
 * eine Zahl erwartet — und das sieht man erst, wenn ein Datum falsch
 * dasteht. Dieser Test vergleicht die Karte mit der echten Datenbank.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { SPALTENTYPEN } from '@/lib/db/pg/spaltentypen';
import { zeileAlsObjekt, objektAlsZeile } from '@/lib/db/pg/felder';

const VERBINDUNG =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

let db: Client;

beforeAll(async () => {
  db = new Client({ connectionString: VERBINDUNG });
  await db.connect();
}, 30_000);
afterAll(async () => { await db?.end(); });

describe('Die Typkarte', () => {
  it('kennt jede Zeit- und Uhrzeitspalte der Datenbank', async () => {
    const { rows } = await db.query<{ tabelle: string; spalte: string; typ: string }>(`
      select table_name as tabelle, column_name as spalte, data_type as typ
        from information_schema.columns
       where table_schema = 'public'
         and data_type in ('timestamp with time zone', 'time without time zone')
       order by 1, 2
    `);

    const erwartet = rows.map((r) =>
      `${r.tabelle}.${r.spalte}=${r.typ.startsWith('timestamp') ? 'zeitpunkt' : 'uhrzeit'}`);
    const festgehalten = Object.entries(SPALTENTYPEN)
      .flatMap(([t, s]) => Object.entries(s).map(([k, v]) => `${t}.${k}=${v}`))
      .sort();

    expect(festgehalten).toEqual(erwartet.sort());
  });

  it('führt keine Spalte, die es nicht gibt', async () => {
    const { rows } = await db.query<{ tabelle: string; spalte: string }>(`
      select table_name as tabelle, column_name as spalte
        from information_schema.columns where table_schema = 'public'
    `);
    const echt = new Set(rows.map((r) => `${r.tabelle}.${r.spalte}`));
    const erfunden = Object.entries(SPALTENTYPEN)
      .flatMap(([t, s]) => Object.keys(s).map((k) => `${t}.${k}`))
      .filter((s) => !echt.has(s));
    expect(erfunden).toEqual([]);
  });
});

describe('Die Umrechnung', () => {
  it('macht aus einem Zeitstempel Millisekunden', () => {
    const o = zeileAlsObjekt<{ createdAt: number }>('customers', {
      created_at: '2026-09-11T22:09:23.036+00:00',
    });
    expect(o.createdAt).toBe(Date.parse('2026-09-11T22:09:23.036Z'));
  });

  it('kürzt eine Uhrzeit auf Stunden und Minuten', () => {
    const o = zeileAlsObjekt<{ startTime: string; endTime: string }>('time_entries', {
      start_time: '07:00:00', end_time: '16:30:00',
    });
    expect(o).toMatchObject({ startTime: '07:00', endTime: '16:30' });
  });

  it('lässt ein Datum in Ruhe', () => {
    const o = zeileAlsObjekt<{ date: string }>('time_entries', { date: '2026-03-02' });
    expect(o.date).toBe('2026-03-02');
  });

  it('lässt einen Freitext in Ruhe, auch wenn er wie ein Zeitstempel aussieht', () => {
    // Der Grund, warum nach der SPALTE umgerechnet wird und nicht nach der
    // Form des Werts.
    const o = zeileAlsObjekt<{ comment: string }>('time_entries', {
      comment: '2026-03-02T10:00:00Z',
    });
    expect(o.comment).toBe('2026-03-02T10:00:00Z');
  });

  it('lässt eine Zahl eine Zahl sein', () => {
    const o = zeileAlsObjekt<{ breakDuration: number; hours: number }>('time_entries', {
      break_duration: 30, hours: 8.5,
    });
    expect(o).toMatchObject({ breakDuration: 30, hours: 8.5 });
  });

  it('schickt Millisekunden als Zeitstempel zurück', () => {
    const ms = Date.parse('2026-04-01T08:00:00.000Z');
    const z = objektAlsZeile('work_sheets', { unterschriebenAm: ms, notizen: 'x' });
    expect(z.unterschrieben_am).toBe('2026-04-01T08:00:00.000Z');
    expect(z.notizen).toBe('x');
  });

  it('lässt eine Uhrzeit beim Schreiben, wie sie ist', () => {
    // Postgres nimmt "07:00" für eine `time`-Spalte an; daraus "07:00:00" zu
    // machen wäre Arbeit ohne Wirkung.
    const z = objektAlsZeile('time_entries', { startTime: '07:00' });
    expect(z.start_time).toBe('07:00');
  });
});
