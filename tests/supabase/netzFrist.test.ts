import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LESENDE_FUNKTIONEN, zugriffsart } from '@/lib/netzFrist';

/*
  DIE LISTE DER LESENDEN FUNKTIONEN GEGEN DIE DATENBANK (netzFrist.ts).

  Eine Funktion aus der Liste bekommt eine Stillstandsfrist und kann bei
  schlechtem Netz abgebrochen und wiederholt werden. Das darf nur, was nicht
  schreiben KANN — in Postgres eine Funktion, die als `stable` oder
  `immutable` steht (in ihr ist jedes INSERT, UPDATE oder DELETE ein Fehler).
  Und umgekehrt: jede solche Funktion, die die App aufruft, gehört hinein,
  sonst bliebe eine neue Abfrage still ohne Frist — genau der Fehler vom
  01.11.2026.
*/

const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
let db: Client;

beforeAll(async () => {
  db = new Client({ connectionString: DB });
  await db.connect();
});
afterAll(async () => { await db.end(); });

/**
 * Alle Namen, die die App womöglich als Datenbankfunktion aufruft: jede
 * Zeichenkette in `src`, die wie ein Funktionsname aussieht.
 *
 * NICHT NUR `.rpc('…')`. Viele Aufrufe gehen über eine Hülle — `aufruf(f, p)`
 * in den Nachrichten, `rpcOhneErgebnis(name, …)` auf der Plattform —, und
 * an deren `.rpc(f, …)` steht kein Name. So blieb `nachrichten_ungelesen`
 * (09.11.2026) ohne Frist, und mit ihr die Startseite. Was davon wirklich
 * eine Funktion ist, entscheidet die Datenbank (`bestaendigkeit` fragt nur
 * nach Funktionen in `public`); eine Zeichenkette, die zufällig so heißt,
 * kostet höchstens einen Eintrag einer Funktion, die ohnehin nur liest.
 * Kommentare (`…` in Backticks) zählen nicht: dort steht auch, was die App
 * gar nicht aufruft.
 */
function aufgerufen(): Set<string> {
  const namen = new Set<string>();
  const gehe = (ordner: string) => {
    for (const e of readdirSync(ordner, { withFileTypes: true })) {
      const pfad = join(ordner, e.name);
      if (e.isDirectory()) gehe(pfad);
      else if (/\.tsx?$/.test(e.name)) {
        for (const m of readFileSync(pfad, 'utf8').matchAll(/(['"])([a-z][a-z_0-9]*)\1/g)) namen.add(m[2]);
      }
    }
  };
  gehe('src');
  return namen;
}

async function bestaendigkeit(namen: string[]): Promise<Map<string, string>> {
  const { rows } = await db.query<{ proname: string; provolatile: string }>(
    `select p.proname, p.provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = any($1)`,
    [namen],
  );
  const karte = new Map<string, string>();
  for (const r of rows) {
    // Bei Überladungen zählt die unsicherste Fassung.
    if (karte.get(r.proname) !== 'v') karte.set(r.proname, r.provolatile);
  }
  return karte;
}

describe('lesende Datenbankfunktionen mit Stillstandsfrist', () => {
  it('jede Funktion der Liste steht in der Datenbank als stable oder immutable — sie kann nichts schreiben', async () => {
    const karte = await bestaendigkeit([...LESENDE_FUNKTIONEN]);
    for (const name of LESENDE_FUNKTIONEN) {
      expect(karte.has(name), `${name} gibt es nicht`).toBe(true);
      expect(['s', 'i'], `${name} ist volatile`).toContain(karte.get(name));
    }
  });

  it('der Suchlauf findet auch Aufrufe über eine Hülle (aufruf, rpcOhneErgebnis)', () => {
    const namen = aufgerufen();
    expect(namen.has('nachrichten_ungelesen')).toBe(true);
    expect(namen.has('plattform_geloeschte_betriebe')).toBe(true);
    // Und weiterhin die direkten Aufrufe.
    expect(namen.has('baustellen_stunden')).toBe(true);
  });

  it('jede stable-Funktion, die die App aufruft, steht in der Liste', async () => {
    const namen = [...aufgerufen()];
    const karte = await bestaendigkeit(namen);
    const fehlen = namen.filter((n) => ['s', 'i'].includes(karte.get(n) ?? '') && !LESENDE_FUNKTIONEN.has(n));
    expect(fehlen).toEqual([]);
  });

  it('gleich geblieben: eine schreibende (volatile) Funktion bekommt keine Frist', async () => {
    const namen = [...aufgerufen()];
    const karte = await bestaendigkeit(namen);
    const schreibend = namen.filter((n) => karte.get(n) === 'v');
    expect(schreibend.length).toBeGreaterThan(10);
    for (const n of schreibend) {
      expect(zugriffsart(`http://127.0.0.1:54321/rest/v1/rpc/${n}`, 'POST'), n).toBeNull();
    }
  });
});
