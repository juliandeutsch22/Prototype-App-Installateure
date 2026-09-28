/**
 * Fehlende Prüfsummen werden nachgetragen (offene Punkte C10).
 *
 * Scheitert die Rechnung beim Unterschreiben, bleibt `inhalt_hash` leer —
 * der Auslöser fängt den Fehler ab, damit der Monteur abschliessen kann.
 * Vorher blieb das Feld dann für immer leer. Der nächtliche Lauf
 * `app.pruefsummen_nachtragen()` holt es nach.
 *
 * Den Zustand „unterschrieben, Prüfsumme leer" gibt es von aussen nicht
 * (genau das sichert der Riegel). Er wird deshalb hier hergestellt, indem
 * die beiden zuständigen Auslöser für EINE Anweisung ausgesetzt werden —
 * in einer Transaktion, danach sind sie wieder an.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as scheine from '@/lib/db/pg/workSheets';
import { clientEinreichen } from '@/lib/db/pg/kern';
import type { WorkSheetUnterschrift } from '@/types';

const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const BETRIEB = 'hash-nach';

let db: Client;
let anton: Konto;

beforeAll(async () => {
  db = new Client({ connectionString: DB });
  await db.connect();
  await betriebAnlegen(BETRIEB);
  anton = await konto(BETRIEB, 'Mitarbeiter', 'anton');
  clientEinreichen(anton.client);
}, 120_000);

afterAll(async () => {
  clientEinreichen(null);
  await db.end();
});

const strich = (name: string): WorkSheetUnterschrift => ({
  name, bild: 'data:image/png;base64,iVBORw0KGgo=', geraetZeit: 1776000000000,
});

async function entwurf(): Promise<string> {
  return scheine.createWorkSheet(BETRIEB, {
    projectNumber: 'B-300', customerName: 'Maier', datum: '2026-04-15',
    status: 'Entwurf', abrechnung: 'Regie',
    zeiten: [{ datum: '2026-04-15', mitarbeiter: 'Anton', minuten: 90 }],
    material: [], erstelltVonUid: anton.uid, erstelltVonName: 'Anton',
  } as Parameters<typeof scheine.createWorkSheet>[1]);
}

async function hash(id: string): Promise<string | null> {
  const { data } = await admin.from('work_sheets').select('inhalt_hash').eq('id', id).single();
  return (data!.inhalt_hash as string | null) ?? null;
}

/** Stellt „unterschrieben, Prüfsumme leer" her — den Zustand nach einem Fehlschlag. */
async function hashVerlieren(id: string): Promise<void> {
  await db.query('begin');
  await db.query('alter table public.work_sheets disable trigger work_sheets_zustand');
  await db.query('alter table public.work_sheets disable trigger work_sheets_pruefsumme');
  await db.query('update public.work_sheets set inhalt_hash = null where id = $1', [id]);
  await db.query('alter table public.work_sheets enable trigger work_sheets_pruefsumme');
  await db.query('alter table public.work_sheets enable trigger work_sheets_zustand');
  await db.query('commit');
}

describe('Der nächtliche Nachtrag der Prüfsumme', () => {
  it('trägt die fehlende Prüfsumme nach — genau die, die beim Unterschreiben entstanden wäre', async () => {
    const id = await entwurf();
    await scheine.signWorkSheet(id, strich('Anton'), strich('Maier'));
    const richtig = await hash(id);
    expect(richtig).not.toBeNull();

    await hashVerlieren(id);
    expect(await hash(id)).toBeNull();

    const { rows } = await db.query<{ n: number }>('select app.pruefsummen_nachtragen() as n');
    expect(rows[0].n).toBeGreaterThanOrEqual(1);
    expect(await hash(id)).toBe(richtig);
  });

  it('Gegenprobe: ein Entwurf bleibt ohne, eine vorhandene bleibt, wie sie ist', async () => {
    const offen = await entwurf();
    const fertig = await entwurf();
    await scheine.signWorkSheet(fertig, strich('Anton'), strich('Maier'));
    const vorher = await hash(fertig);

    await db.query('select app.pruefsummen_nachtragen()');

    expect(await hash(offen)).toBeNull();
    expect(await hash(fertig)).toBe(vorher);
  });

  it('ist für angemeldete Konten nicht aufrufbar', async () => {
    const { rows } = await db.query<{ darf: boolean }>(
      "select has_function_privilege('authenticated', 'app.pruefsummen_nachtragen()', 'execute') as darf",
    );
    expect(rows[0].darf).toBe(false);
  });
});
