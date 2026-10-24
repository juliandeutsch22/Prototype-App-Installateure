/**
 * DIE SICHERUNG ÜBER 256 MB — gegen den laufenden Stapel (N1, 24.10.2026).
 *
 * Bis 10.10.2026 brach die Ausleitung ab 256 MB ab, weil der ganze Stand im
 * Speicher der Function lag. Seitdem geht er in Teilen hinaus, und der
 * Rücklauf spielt in Blöcken ein — geprüft war das aber nur mit 36 MB
 * (`ausleitungTeile.test.ts`). Ob der Weg über der alten Grenze trägt, war
 * damit eine Annahme. Hier bekommt ein Betrieb rund 288 MB Bestand, und die
 * Prüfung geht den ganzen Weg: ausleiten, nachzählen, den Betrieb löschen,
 * mit dem echten Werkzeug zurückspielen und Zeile für Zeile vergleichen.
 *
 * Gefüllt wird über Kundennotizen, weil sie ohne Bezüge auskommen; was
 * groß ist, entscheidet für die Teile und Blöcke nur die Länge der Zeilen.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { admin, API, ANON, SERVICE, betriebAnlegen, konto, type Konto } from './helfer';
import { TEIL_BYTES } from '@shared/ausleitungPlan';

const lauf = promisify(execFile);
const BETRIEB = 'gross-b';
const KUNDEN = 2400;
/** Je Kunde 120.000 Zeichen Notiz: zusammen 288 MB, deutlich über der alten Grenze. */
const NOTIZ = 3750;
const ALTE_GRENZE = 256 * 1024 * 1024;

let chef: Konto;
let db: Client;
let pfade: string[] = [];
const ordner = mkdtempSync(join(tmpdir(), 'gross-'));

async function holen(pfad: string): Promise<string> {
  const { data, error } = await admin.storage.from('ausleitung').download(pfad);
  if (error) throw new Error(`${pfad}: ${error.message}`);
  return await data!.text();
}

beforeAll(async () => {
  db = new Client({ connectionString:
    process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();
  await betriebAnlegen(BETRIEB, 'Gross GmbH');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'gross-chef');
  await db.query(
    `insert into customers (company_id, name, notes)
     select $1, 'Kunde ' || i, repeat(md5(i::text), $2) from generate_series(1, $3) i`,
    [BETRIEB, NOTIZ, KUNDEN],
  );
}, 300_000);

afterAll(async () => {
  /*
    Der grosse Bestand bleibt nicht liegen — weder in der Datenbank noch im
    Eimer: jeder spätere Lauf schriebe ihn sonst wieder mit, und der lokale
    Stapel liefe voll. (Lokaler Prüfstapel, keine Produktionsdaten.)
  */
  await db.query('delete from customers where company_id = $1', [BETRIEB]);
  if (pfade.length) await admin.storage.from('ausleitung').remove(pfade);
  rmSync(ordner, { recursive: true, force: true });
  await db.end();
});

describe('Ein Stand über 256 MB', () => {
  it('geht vollständig hinaus — in Teilen, keiner über der Teilgrenze', async () => {
    const r = await fetch(`${API}/functions/v1/daten-ausleitung`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${chef.token}` },
    });
    const daten = await r.json();
    expect(r.status, JSON.stringify(daten)).toBe(200);
    expect(daten.bytes).toBeGreaterThan(ALTE_GRENZE);
    pfade = daten.pfade;
    // Ganze Seiten (rund 1 MB) füllen jeden Teil fast: nicht viel mehr Teile als nötig.
    expect(pfade.length).toBeGreaterThanOrEqual(Math.ceil(daten.bytes / TEIL_BYTES));
    expect(pfade.length).toBeLessThanOrEqual(Math.ceil(daten.bytes / (TEIL_BYTES - 2 * 1024 * 1024)));

    let kunden = 0;
    const ids = new Set<string>();
    for (const [i, pfad] of pfade.entries()) {
      const text = await holen(pfad);
      expect(text.length - text.indexOf('\n') - 1).toBeLessThanOrEqual(TEIL_BYTES);
      for (const zeile of text.split('\n')) {
        if (!zeile) continue;
        const z = JSON.parse(zeile) as { sammlung: string; daten: { id: string } };
        if (z.sammlung !== 'customers') continue;
        kunden += 1;
        ids.add(String(z.daten.id));
      }
      writeFileSync(join(ordner, i === 0 ? 'stand.jsonl' : `stand.teil-${i + 1}.jsonl`), text);
    }
    // Nichts fehlt, nichts doppelt — über alle Teile.
    expect(kunden).toBe(KUNDEN);
    expect(ids.size).toBe(KUNDEN);
  }, 900_000);

  it('und kommt mit dem Rücklauf ganz zurück, nachdem der Betrieb gelöscht wurde', async () => {
    const tabellen = (await admin.rpc('auszug_tabellen')).data as string[];
    const vorher = (await db.query(
      'select md5(string_agg(id::text || name || notes, \',\' order by id)) as s from customers where company_id = $1',
      [BETRIEB],
    )).rows[0].s as string;

    // Den Betrieb löschen, wie in `ruecklauf.test.ts` — der Ernstfall.
    let offen = [...tabellen];
    while (offen.length > 0) {
      const gescheitert: string[] = [];
      for (const t of offen) {
        const { error } = await admin.from(t).delete().eq('company_id', BETRIEB);
        if (error) gescheitert.push(t);
      }
      if (gescheitert.length === offen.length) throw new Error(`Aufräumen: ${gescheitert.join(', ')}`);
      offen = gescheitert;
    }
    await admin.auth.admin.deleteUser(chef.uid);
    await admin.from('companies').delete().eq('id', BETRIEB);
    expect((await db.query('select count(*)::int as n from customers where company_id = $1', [BETRIEB])).rows[0].n).toBe(0);

    const dateien = pfade.map((_, i) => join(ordner, i === 0 ? 'stand.jsonl' : `stand.teil-${i + 1}.jsonl`));
    const { stdout } = await lauf('node', ['scripts/ruecklauf.mjs', ...dateien.reverse(), '--schreiben'], {
      env: { ...process.env, RUECKLAUF_URL: API, RUECKLAUF_DIENSTSCHLUESSEL: SERVICE },
      cwd: process.cwd(), maxBuffer: 16 * 1024 * 1024,
    });
    expect(stdout).toContain(`(${pfade.length} Teile)`);
    expect(stdout).toContain('Fertig.');

    const nachher = (await db.query(
      'select count(*)::int as n, md5(string_agg(id::text || name || notes, \',\' order by id)) as s from customers where company_id = $1',
      [BETRIEB],
    )).rows[0];
    expect(nachher).toEqual({ n: KUNDEN, s: vorher });
  }, 900_000);
});
