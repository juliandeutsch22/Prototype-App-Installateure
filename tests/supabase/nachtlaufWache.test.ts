/**
 * Der Wächter über dem Nachtlauf.
 *
 * WAS AUF DEM PRÜFSTAND STEHT. `net.http_post` wartet nicht auf die Antwort.
 * Kommt statt einer 200 etwas anderes zurück — oder gar nichts —, landet das
 * in `net._http_response`, und dort sieht niemand hin. `system_laeufe`, die
 * Tabelle hinter der Überwachungsansicht, bliebe leer: geschrieben wird sie
 * von der Edge Function, und die ist nie angelaufen. In der Ansicht stünde
 * damit nicht „fehlgeschlagen", sondern gar nichts — und das sieht aus wie
 * „noch nie gelaufen", nicht wie „seit drei Wochen kaputt".
 *
 * WIE GEPRÜFT WIRD: die Antwort wird gestellt. `net._http_response` ist eine
 * gewöhnliche Tabelle; eine Zeile darin ist genau das, was `pg_net` nach
 * einem echten Aufruf hinterlässt. Jede Prüfung läuft in einer Transaktion
 * und nimmt sie wieder zurück, damit nichts liegen bleibt.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';

const DB = process.env.SUPABASE_DB_URL
  ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** Weit oberhalb aller echten Anfragenummern, damit nichts kollidiert. */
const ANFRAGE = 987_654_321;
const BETRIEB = 'wache-a';

let db: Client;

beforeAll(async () => {
  db = new Client({ connectionString: DB });
  await db.connect();
  await db.query(
    `insert into public.companies (id, name) values ($1, 'Wache GmbH')
       on conflict (id) do nothing`,
    [BETRIEB],
  );
}, 60_000);

afterAll(async () => {
  await db.query('delete from public.system_laeufe where company_id = $1', [BETRIEB]);
  await db.query('delete from public.companies where id = $1', [BETRIEB]);
  await db.end();
});

/**
 * Einen Merkzettel und — wenn gewünscht — die dazugehörige Antwort stellen,
 * dann den Wächter laufen lassen. Alles in einer Transaktion.
 */
async function wacheMit(
  antwort: { status?: number; inhalt?: string; fehler?: string } | null,
  alter = '0 minutes',
): Promise<{ lauf: Record<string, unknown> | undefined; zettel: number }> {
  await db.query('begin');
  await db.query(
    `insert into app.anstoss_wache (anfrage, art, angestossen)
       values ($1, 'ausleitung', now() - $2::interval)`,
    [ANFRAGE, alter],
  );
  if (antwort) {
    await db.query(
      `insert into net._http_response (id, status_code, content, error_msg, created)
         values ($1, $2, $3, $4, now())`,
      [ANFRAGE, antwort.status ?? null, antwort.inhalt ?? null, antwort.fehler ?? null],
    );
  }
  await db.query('select app.ausleitung_nachsehen()');

  const lauf = await db.query(
    `select erfolg, meldung, zuletzt_erfolg from public.system_laeufe
       where company_id = $1 and art = 'ausleitung'`,
    [BETRIEB],
  );
  const zettel = await db.query(
    'select count(*)::int as n from app.anstoss_wache where anfrage = $1',
    [ANFRAGE],
  );
  await db.query('rollback');
  return { lauf: lauf.rows[0], zettel: zettel.rows[0].n };
}

describe('Der Wächter sieht nach, was aus dem Anstoss wurde', () => {
  it('eine 401 wird zum Fehlschlag in der Überwachung', async () => {
    const { lauf, zettel } = await wacheMit({
      status: 401, inhalt: '{"error":"Keine Anmeldung."}',
    });
    expect(lauf?.erfolg).toBe(false);
    expect(lauf?.meldung).toContain('401');
    // Genau der Fall, der bei der Einrichtung dreimal von Hand gefunden wurde.
    expect(lauf?.meldung).toContain('Keine Anmeldung.');
    expect(zettel).toBe(0);
  }, 60_000);

  it('und auch das Tor, das vor der Function abweist', async () => {
    const { lauf } = await wacheMit({
      status: 401, inhalt: '{"code":"UNAUTHORIZED_INVALID_JWT_FORMAT"}',
    });
    expect(lauf?.erfolg).toBe(false);
    expect(lauf?.meldung).toContain('UNAUTHORIZED_INVALID_JWT_FORMAT');
  }, 60_000);

  it('eine 200 lässt die Überwachung in Ruhe', async () => {
    /*
      Sie wäre sonst falsch: bei einer 200 hat die Function selbst
      geschrieben, was sie je Betrieb erreicht hat. Der Wächter darf das
      nicht mit einem Sammelurteil überschreiben.
    */
    const { lauf, zettel } = await wacheMit({ status: 200, inhalt: '{"mandanten":0}' });
    expect(lauf).toBeUndefined();
    expect(zettel).toBe(0);
  }, 60_000);

  it('kurz nach dem Anstoss wartet er ab', async () => {
    // Die Function liest gerade. Ein Fehlschlag hier wäre eine Falschmeldung.
    const { lauf, zettel } = await wacheMit(null, '1 minute');
    expect(lauf).toBeUndefined();
    expect(zettel).toBe(1);
  }, 60_000);

  it('nach einer Stunde ohne Antwort ist es ein Fehlschlag', async () => {
    const { lauf, zettel } = await wacheMit(null, '2 hours');
    expect(lauf?.erfolg).toBe(false);
    expect(lauf?.meldung).toContain('Keine Antwort');
    expect(zettel).toBe(0);
  }, 60_000);

  it('eine Verbindung, die gar nicht zustande kam, wird benannt', async () => {
    const { lauf } = await wacheMit({ fehler: "Couldn't connect to server" });
    expect(lauf?.erfolg).toBe(false);
    expect(lauf?.meldung).toContain("Couldn't connect to server");
  }, 60_000);

  /*
    DER ERFOLGSZEITPUNKT DARF NICHT MITWANDERN. Ein gescheiterter Lauf, der
    `zuletzt_erfolg` mitzieht, sieht taggleich frisch aus — und drei Wochen
    später fällt auf, dass seither nichts gesichert wurde.
  */
  it('und der letzte Erfolg bleibt stehen, wo er stand', async () => {
    await db.query('begin');
    await db.query(
      `insert into public.system_laeufe (company_id, art, zuletzt_erfolg, erfolg, updated_at)
         values ($1, 'ausleitung', now() - interval '3 days', true, now())
       on conflict (company_id, art) do update set
         zuletzt_erfolg = excluded.zuletzt_erfolg, erfolg = true`,
      [BETRIEB],
    );
    await db.query(
      `insert into app.anstoss_wache (anfrage, art) values ($1, 'ausleitung')`, [ANFRAGE],
    );
    await db.query(
      `insert into net._http_response (id, status_code, content, created)
         values ($1, 500, 'kaputt', now())`, [ANFRAGE],
    );
    await db.query('select app.ausleitung_nachsehen()');
    const { rows } = await db.query(
      `select erfolg, zuletzt_erfolg < now() - interval '2 days' as erfolg_alt
         from public.system_laeufe where company_id = $1 and art = 'ausleitung'`,
      [BETRIEB],
    );
    await db.query('rollback');

    expect(rows[0].erfolg).toBe(false);
    expect(rows[0].erfolg_alt).toBe(true);
  }, 60_000);
});

describe('Der Anstoss legt den Merkzettel an', () => {
  it('ohne ihn hätte der Wächter nichts nachzusehen', async () => {
    await db.query('begin');
    try {
      const vorher = await db.query('select count(*)::int as n from app.anstoss_wache');
      await db.query(
        `select vault.create_secret('http://beispiel.test/ziel', 'ausleitung_url')`,
      ).catch(() => undefined);
      await db.query(
        `select vault.create_secret('sb_secret_probe', 'ausleitung_schluessel')`,
      ).catch(() => undefined);
      await db.query('select app.ausleitung_anstossen()');
      const nachher = await db.query(
        `select count(*)::int as n from app.anstoss_wache where art = 'ausleitung'`,
      );
      expect(nachher.rows[0].n).toBe(vorher.rows[0].n + 1);
    } finally {
      await db.query('rollback');
    }
  }, 60_000);
});
