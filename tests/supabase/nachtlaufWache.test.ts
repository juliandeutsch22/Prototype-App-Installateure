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

/**
 * Einen Tresoreintrag setzen, gleich ob es ihn schon gibt — innerhalb der
 * laufenden Transaktion, die ihn mit dem Rollback wieder verwirft.
 */
async function tresorSetzen(name: string, wert: string): Promise<void> {
  const { rows } = await db.query('select id from vault.secrets where name = $1', [name]);
  if (rows.length > 0) await db.query('select vault.update_secret($1::uuid, $2)', [rows[0].id, wert]);
  else await db.query('select vault.create_secret($1, $2)', [wert, name]);
}

async function zettelMitBetrieb(): Promise<Array<{ anfrage: string; betrieb: string | null }>> {
  const { rows } = await db.query(
    `select anfrage::text, betrieb from app.anstoss_wache
      where art = 'ausleitung' and generation = app.anstoss_generation()`,
  );
  return rows;
}

/*
  K3 (Durchsicht 15.11.2026): EIN ANSTOSS JE BETRIEB, AUS EINER WARTESCHLANGE.
  Vorher ging um 01:30 ein einziger Anstoß hinaus, und die Function nahm alle
  Betriebe in einer Schleife — die hinteren wurden nie gesichert, die Wache
  meldete bei allen „Keine Antwort“.

  GEGENPROBE (Erwartung): mit dem alten `ausleitung_anstossen` gibt es genau
  einen Merkzettel ohne Betrieb — „je Betrieb“, „höchstens sechs“,
  „nachfüllen“ und „ruhend“ sind rot; die alte Wache meldet einen Fehlschlag
  bei JEDEM Betrieb — „nur bei diesem“ ist rot.
*/
describe('Der Anstoss: je Betrieb, aus einer Warteschlange', () => {
  it('reiht jeden Betrieb ein, der nicht ruht, und stößt höchstens sechs zugleich an', async () => {
    await db.query('begin');
    try {
      await tresorSetzen('ausleitung_url', 'http://beispiel.test/ziel');
      await tresorSetzen('ausleitung_schluessel', 'sb_secret_probe');
      const offenVorher = (await zettelMitBetrieb()).length;
      await db.query('select app.ausleitung_anstossen()');
      const zettel = await zettelMitBetrieb();
      expect(zettel.length).toBeLessThanOrEqual(6);
      expect(zettel.length).toBeGreaterThan(offenVorher);
      const neu = zettel.filter((z) => z.betrieb !== null);
      expect(neu.length).toBe(zettel.length - offenVorher);

      // Der Rumpf nennt den Betrieb — sonst wüsste die Function nicht, welchen.
      const { rows: rumpf } = await db.query(
        `select convert_from(body, 'UTF8')::jsonb as b from net.http_request_queue
          where id = any($1::bigint[])`, [neu.map((z) => z.anfrage)],
      );
      expect(rumpf.map((r) => r.b.betrieb).sort()).toEqual(neu.map((z) => z.betrieb).sort());

      // Alle übrigen warten: eingereiht + angestoßen = alle Betriebe, die nicht ruhen.
      const { rows: [zahl] } = await db.query(
        `select (select count(*) from public.companies c where not app.betrieb_ruht(c.id))::int as alle,
                (select count(*) from app.ausleitung_warteschlange)::int as warten`,
      );
      expect(zahl.warten + neu.length).toBe(zahl.alle);
    } finally {
      await db.query('rollback');
    }
  }, 60_000);

  it('ein ruhender Betrieb wird nicht eingereiht', async () => {
    await db.query('begin');
    try {
      await tresorSetzen('ausleitung_url', 'http://beispiel.test/ziel');
      await tresorSetzen('ausleitung_schluessel', 'sb_secret_probe');
      await db.query(
        `insert into public.betrieb_zustand (betrieb_kennung, name, deaktiviert_am, deaktiviert_grund)
           values ($1, 'Wache GmbH', now(), 'Prüfung K3')
         on conflict (betrieb_kennung) do update set deaktiviert_am = now(), deaktiviert_grund = 'Prüfung K3'`,
        [BETRIEB],
      );
      await db.query('select app.ausleitung_anstossen()');
      const { rows } = await db.query(
        `select (select count(*) from app.ausleitung_warteschlange where betrieb = $1)::int
              + (select count(*) from app.anstoss_wache where betrieb = $1)::int as n`, [BETRIEB],
      );
      expect(rows[0].n).toBe(0);
    } finally {
      await db.query('rollback');
    }
  }, 60_000);

  it('ein beantworteter Anstoß macht den Platz frei — der nächste Betrieb geht hinaus', async () => {
    await db.query('begin');
    try {
      await tresorSetzen('ausleitung_url', 'http://beispiel.test/ziel');
      await tresorSetzen('ausleitung_schluessel', 'sb_secret_probe');
      await db.query('select app.ausleitung_anstossen()');
      const vorher = await zettelMitBetrieb();
      const { rows: [{ n: wartenVorher }] } = await db.query(
        'select count(*)::int as n from app.ausleitung_warteschlange',
      );
      if (wartenVorher === 0) return; // Zu wenige Betriebe im Prüfstapel, um nachzufüllen.
      const fertig = vorher.find((z) => z.betrieb !== null)!;
      await db.query(
        `insert into net._http_response (id, status_code, content, created)
           values ($1::bigint, 200, '{}', now())`, [fertig.anfrage],
      );
      await db.query('select app.ausleitung_weiter()');
      const nachher = await zettelMitBetrieb();
      expect(nachher.length).toBe(vorher.length);
      expect(nachher.some((z) => z.anfrage === fertig.anfrage)).toBe(false);
      const { rows: [{ n: wartenNachher }] } = await db.query(
        'select count(*)::int as n from app.ausleitung_warteschlange',
      );
      expect(wartenNachher).toBe(wartenVorher - 1);
    } finally {
      await db.query('rollback');
    }
  }, 60_000);

  it('wer von gestern noch wartet, kommt zuerst dran', async () => {
    await db.query('begin');
    try {
      await tresorSetzen('ausleitung_url', 'http://beispiel.test/ziel');
      await tresorSetzen('ausleitung_schluessel', 'sb_secret_probe');
      await db.query(
        `insert into app.ausleitung_warteschlange (betrieb, eingereiht) values ($1, now() - interval '1 day')`,
        [BETRIEB],
      );
      await db.query('select app.ausleitung_anstossen()');
      const zettel = await zettelMitBetrieb();
      expect(zettel.some((z) => z.betrieb === BETRIEB)).toBe(true);
    } finally {
      await db.query('rollback');
    }
  }, 60_000);

  it('ohne Tresoreintrag wird nichts eingereiht', async () => {
    await db.query('begin');
    try {
      await db.query(`delete from vault.secrets where name in ('ausleitung_url','ausleitung_schluessel')`);
      await db.query('select app.ausleitung_anstossen()');
      const { rows } = await db.query('select count(*)::int as n from app.ausleitung_warteschlange');
      expect(rows[0].n).toBe(0);
    } finally {
      await db.query('rollback');
    }
  }, 60_000);
});

describe('Die Wache meldet je Betrieb', () => {
  const ANDERER = 'wache-b';

  it('ein Fehlschlag gehört nur dem Betrieb auf dem Merkzettel', async () => {
    await db.query('begin');
    try {
      await db.query(
        `insert into public.companies (id, name) values ($1, 'Wache B GmbH') on conflict (id) do nothing`, [ANDERER],
      );
      await db.query(
        `insert into app.anstoss_wache (anfrage, art, betrieb) values ($1, 'ausleitung', $2)`, [ANFRAGE, BETRIEB],
      );
      await db.query(
        `insert into net._http_response (id, status_code, content, created)
           values ($1, 546, '{"code":"WORKER_LIMIT"}', now())`, [ANFRAGE],
      );
      await db.query('select app.ausleitung_weiter()');
      const { rows } = await db.query(
        `select company_id, erfolg, meldung from public.system_laeufe
          where art = 'ausleitung' and company_id = any($1::text[])`, [[BETRIEB, ANDERER]],
      );
      expect(rows.map((r) => r.company_id)).toEqual([BETRIEB]);
      expect(rows[0].erfolg).toBe(false);
      expect(rows[0].meldung).toContain('546');
    } finally {
      await db.query('rollback');
    }
  }, 60_000);

  it('ein Merkzettel zu einem gelöschten Betrieb hält die Wache nicht auf', async () => {
    await db.query('begin');
    try {
      await db.query(
        `insert into app.anstoss_wache (anfrage, art, betrieb) values ($1, 'ausleitung', 'gibt-es-nicht-k3')`, [ANFRAGE],
      );
      await db.query(
        `insert into net._http_response (id, status_code, content, created) values ($1, 404, 'weg', now())`, [ANFRAGE],
      );
      await db.query('select app.ausleitung_weiter()');
      const { rows } = await db.query('select count(*)::int as n from app.anstoss_wache where anfrage = $1', [ANFRAGE]);
      expect(rows[0].n).toBe(0);
    } finally {
      await db.query('rollback');
    }
  }, 60_000);

  it('die Wache läuft minütlich', async () => {
    const { rows } = await db.query(`select schedule, command from cron.job where jobname = 'ausleitung-wache'`);
    expect(rows[0]).toEqual({ schedule: '* * * * *', command: 'select app.ausleitung_weiter()' });
  }, 30_000);
});
