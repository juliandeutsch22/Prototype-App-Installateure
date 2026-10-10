/**
 * DIE SICHERUNG IN TEILEN — gegen den laufenden Stapel (10.10.2026).
 *
 * Bis hierher ging der Stand eines Betriebs in einem Stück hinaus und musste
 * dafür ganz im Speicher der Function liegen; ab 256 MB brach die Ausleitung
 * ab. Ein unterschriebener Schein trägt rund 140 KB an Unterschriften — ein
 * Betrieb mit ein paar tausend Scheinen läge darüber, und zwar still: die
 * Sicherung schlüge jede Nacht fehl.
 *
 * Hier bekommt ein Betrieb rund 36 MB Bestand, also mehr als ein Teil
 * (`TEIL_BYTES`), und die Prüfung geht den ganzen Weg: Teile schreiben,
 * nachzählen, einen zweiten Lauf am selben Tag, und zurückspielen mit dem
 * echten Werkzeug — aus beiden Teilen und, als Gegenprobe, aus einem.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { admin, API, ANON, SERVICE, betriebAnlegen, konto, type Konto } from './helfer';
import {
  ausleitungsPfad, ausleitungsPraefix, TEIL_BYTES, teilPfad,
} from '@shared/ausleitungPlan';

const lauf = promisify(execFile);
const BETRIEB = 'teile-b';
const KUNDEN = 300;
/** Je Kunde rund 120.000 Zeichen Notiz: zusammen rund 36 MB, also zwei Teile. */
const NOTIZ = 3750;

let chef: Konto;
let db: Client;

async function ausleiten() {
  const r = await fetch(`${API}/functions/v1/daten-ausleitung`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${chef.token}` },
  });
  return { status: r.status, daten: await r.json() };
}

async function holen(pfad: string): Promise<string> {
  const { data, error } = await admin.storage.from('ausleitung').download(pfad);
  if (error) throw new Error(`${pfad}: ${error.message}`);
  return await data!.text();
}

const zeilen = (text: string) =>
  text.split('\n').filter(Boolean).map((z) => JSON.parse(z) as { sammlung: string; daten: Record<string, unknown> });

beforeAll(async () => {
  db = new Client({ connectionString:
    process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();
  await betriebAnlegen(BETRIEB, 'Teile GmbH');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'teile-chef');
  await db.query(
    `insert into customers (company_id, name, notes)
     select $1, 'Kunde ' || i, repeat(md5(i::text), $2) from generate_series(1, $3) i`,
    [BETRIEB, NOTIZ, KUNDEN],
  );
}, 180_000);

afterAll(async () => {
  /*
    Der grosse Bestand bleibt nicht liegen: jeder Nachtlauf einer späteren
    Prüfung schriebe ihn sonst wieder mit. (Lokaler Prüfstapel, keine
    Produktionsdaten.)
  */
  await db.query('delete from customers where company_id = $1', [BETRIEB]);
  await db.end();
});

let erster: { pfade: string[]; zeilen: number; texte: string[] };

describe('Ein Stand über der Teilgrenze', () => {
  it('geht in zwei Teilen hinaus — der erste unter dem bisherigen Namen, keiner über der Grenze', async () => {
    const { status, daten } = await ausleiten();
    expect(status, JSON.stringify(daten)).toBe(200);
    expect(daten.pfad).toBe(ausleitungsPfad(BETRIEB, new Date()));
    expect(daten.pfade).toHaveLength(2);
    expect(daten.pfade[0]).toBe(daten.pfad);

    const texte = await Promise.all((daten.pfade as string[]).map(holen));
    const koepfe = texte.map((t) => zeilen(t)[0]);
    const laufName = String(koepfe[0].daten.lauf);
    expect(koepfe).toEqual([
      { sammlung: '_teil', daten: { lauf: laufName, nr: 1, teile: 2 } },
      { sammlung: '_teil', daten: { lauf: laufName, nr: 2 } },
    ]);
    expect(daten.pfade[1]).toBe(teilPfad(daten.pfad, laufName, 2));

    for (const t of texte) expect(t.length - t.indexOf('\n') - 1).toBeLessThanOrEqual(TEIL_BYTES);

    // Nichts fehlt, nichts doppelt — über beide Teile.
    const daten_ = texte.flatMap((t) => zeilen(t).filter((z) => z.sammlung !== '_teil'));
    expect(daten.zeilen).toBe(daten_.length);
    const kunden = daten_.filter((z) => z.sammlung === 'customers');
    expect(kunden).toHaveLength(KUNDEN);
    expect(new Set(kunden.map((k) => k.daten.id)).size).toBe(KUNDEN);
    expect(daten_[0].sammlung).toBe('companies');
    erster = { pfade: daten.pfade, zeilen: daten.zeilen, texte };
  }, 300_000);

  it('ein zweiter Lauf am selben Tag ersetzt den ersten, ohne Teile des ersten liegen zu lassen', async () => {
    const { status, daten } = await ausleiten();
    expect(status).toBe(200);
    expect(daten.pfade).toHaveLength(2);
    expect(daten.pfade[1]).not.toBe(erster.pfade[1]);

    const { data } = await admin.storage.from('ausleitung')
      .list(ausleitungsPraefix(BETRIEB).replace(/\/$/, ''), { limit: 1000 });
    const heute = (data ?? []).map((d) => `${ausleitungsPraefix(BETRIEB)}${d.name}`).sort();
    expect(heute).toEqual([...daten.pfade].sort());

    // Der erste Teil gehört jetzt zum zweiten Lauf.
    const kopf = zeilen(await holen(daten.pfad))[0];
    expect(kopf.daten.teile).toBe(2);
    expect(daten.pfade[1]).toBe(teilPfad(daten.pfad, String(kopf.daten.lauf), 2));
  }, 300_000);
});

describe('Der Rücklauf setzt die Teile zusammen', () => {
  const ordner = mkdtempSync(join(tmpdir(), 'teile-'));
  const dateien = () => erster.texte.map((t, i) => {
    const datei = join(ordner, i === 0 ? 'stand.jsonl' : `stand.teil-${i + 1}.jsonl`);
    writeFileSync(datei, t);
    return datei;
  });
  const rufen = (args: string[]) => lauf('node', ['scripts/ruecklauf.mjs', ...args], {
    env: { ...process.env, RUECKLAUF_URL: API, RUECKLAUF_DIENSTSCHLUESSEL: SERVICE },
    cwd: process.cwd(), maxBuffer: 16 * 1024 * 1024,
  });

  it('Gegenprobe: mit nur einem der Teile weist er ab, bevor er etwas schreibt', async () => {
    const [eins] = dateien();
    const fehler = await rufen([eins, '--schreiben']).then(() => null, (e: { stderr: string }) => e.stderr);
    expect(fehler).toContain('Es fehlen Teil 2 von 2.');
  });

  it('mit beiden Teilen — in beliebiger Reihenfolge — kommt der ganze Betrieb zurück', async () => {
    const [eins, zwei] = dateien();
    const tabellen = (await admin.rpc('auszug_tabellen')).data as string[];

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

    const { stdout } = await rufen([zwei, eins, '--schreiben']);
    expect(stdout).toContain('(2 Teile)');
    expect(stdout).toContain('Fertig.');

    const { rows } = await db.query(
      'select count(*)::int as n, count(distinct id)::int as k, min(length(notes))::int as l from customers where company_id = $1',
      [BETRIEB],
    );
    expect(rows[0]).toEqual({ n: KUNDEN, k: KUNDEN, l: NOTIZ * 32 });
  }, 300_000);
});
