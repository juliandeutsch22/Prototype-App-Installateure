/**
 * Was der Anstoss aus der Datenbank mitschickt — Kopfzeile für Kopfzeile.
 *
 * WARUM DAS EINE EIGENE PRÜFUNG IST. Der Nachtlauf und der Push-Auslöser
 * rufen ihre Edge Function über `pg_net`. Vor den Functions steht ein Tor,
 * das den Schlüssel prüft — und es prüft ihn UNTERSCHIEDLICH, je nachdem, wo
 * er steht:
 *
 *   alter JWT-Schlüssel, nur `Authorization`   → kommt durch
 *   neuer `sb_secret_…`, nur `Authorization`   → 401, „Invalid JWT format"
 *   neuer `sb_secret_…`, dazu `apikey`         → kommt durch
 *
 * (Alles am laufenden Stapel nachgemessen.) Supabase löst die alten
 * Schlüssel bis Ende 2026 ab. Wer dann den Tresoreintrag tauscht, hätte ohne
 * die `apikey`-Zeile einen Nachtlauf, der ab der ersten Nacht still
 * scheitert — `pg_net` wartet nicht auf die Antwort, es fiele niemandem auf.
 *
 * GEPRÜFT WIRD OHNE NETZ: `net.http_post` legt den Auftrag in
 * `net.http_request_queue`, und innerhalb der Transaktion steht er dort noch,
 * bevor der Hintergrunddienst ihn abholt. Das ist genauer als ein echter
 * Aufruf — es zeigt die Kopfzeilen selbst und nicht bloss ihre Wirkung.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';

const DB = process.env.SUPABASE_DB_URL
  ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

let db: Client;

/**
 * Einen Tresoreintrag setzen, gleich ob es ihn schon gibt.
 *
 * `vault.create_secret` ist NICHT idempotent — ein zweiter Aufruf mit
 * demselben Namen scheitert am eindeutigen Schlüssel. Andere Prüfungen legen
 * `push_url` und `push_schluessel` bereits an; wer das hier übersieht, hat
 * eine Prüfung, die allein läuft und im Verbund stirbt.
 */
async function tresorSetzen(name: string, wert: string): Promise<void> {
  const { rows } = await db.query('select id from vault.secrets where name = $1', [name]);
  if (rows.length > 0) {
    await db.query('select vault.update_secret($1::uuid, $2)', [rows[0].id, wert]);
  } else {
    await db.query('select vault.create_secret($1, $2)', [wert, name]);
  }
}

/**
 * Den Anstoss in einer Transaktion auslösen und die Kopfzeilen ablesen.
 *
 * Die Tresoreinträge werden hier gesetzt und mit der Transaktion wieder
 * verworfen — so hinterlässt die Prüfung keinen Schlüssel und stört die
 * übrigen Läufe nicht.
 */
async function kopfzeilenVon(
  aufruf: string,
  urlName: string,
  schluesselName: string,
): Promise<Record<string, string>> {
  await db.query('begin');
  try {
    await tresorSetzen(urlName, 'http://beispiel.test/ziel');
    await tresorSetzen(schluesselName, 'sb_secret_probe');
    await db.query(aufruf);
    const { rows } = await db.query(
      'select headers from net.http_request_queue order by id desc limit 1',
    );
    expect(rows).toHaveLength(1);
    return rows[0].headers as Record<string, string>;
  } finally {
    await db.query('rollback');
  }
}

beforeAll(async () => {
  db = new Client({ connectionString: DB });
  await db.connect();
}, 60_000);

afterAll(async () => { await db.end(); });

describe('Der Anstoss schickt den Schlüssel in beiden Kopfzeilen', () => {
  it('die Ausleitung', async () => {
    const kopf = await kopfzeilenVon(
      'select app.ausleitung_anstossen()', 'ausleitung_url', 'ausleitung_schluessel',
    );
    expect(kopf.apikey).toBe('sb_secret_probe');
    expect(kopf.Authorization).toBe('Bearer sb_secret_probe');
  }, 60_000);

  it('die Push-Meldung', async () => {
    const kopf = await kopfzeilenVon(
      `select app.push_anstossen('{"art":"neu"}'::jsonb)`, 'push_url', 'push_schluessel',
    );
    expect(kopf.apikey).toBe('sb_secret_probe');
    expect(kopf.Authorization).toBe('Bearer sb_secret_probe');
  }, 60_000);

  /*
    OHNE TRESOREINTRAG WIRD NICHTS ANGESTOSSEN. Sonst ginge bei einem
    unfertig eingerichteten Projekt jede Nacht ein Aufruf ohne Schlüssel
    hinaus — und die Antwort darauf sähe aus wie ein Rechteproblem.
  */
  it('und ohne Tresoreintrag gar nichts', async () => {
    await db.query('begin');
    try {
      // Die Einträge verschwinden nur in dieser Transaktion.
      await db.query(
        `delete from vault.secrets where name in ('ausleitung_url','ausleitung_schluessel')`,
      );
      const vorher = await db.query('select count(*)::int as n from net.http_request_queue');
      await db.query('select app.ausleitung_anstossen()');
      const nachher = await db.query('select count(*)::int as n from net.http_request_queue');
      expect(nachher.rows[0].n).toBe(vorher.rows[0].n);
    } finally {
      await db.query('rollback');
    }
  }, 60_000);
});
