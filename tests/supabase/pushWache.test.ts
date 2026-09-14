/**
 * Die Überwachung der Push-Meldungen.
 *
 * WAS AUF DEM PRÜFSTAND STEHT. `app.push_anstossen` warf die Nummer seiner
 * Anfrage weg. Damit galt der Anstoss als getan, sobald er in der
 * Warteschlange lag — was danach zurückkam, landete in `net._http_response`,
 * und dort sah niemand hin.
 *
 * DER FALL, DER WEHTUT, ist nicht die einzelne verlorene Meldung, sondern der
 * systematische Ausfall: ein Schlüssel stimmt nicht mehr, die Adresse zeigt
 * ins Leere, die Function ist nicht ausgeliefert. Dann geht KEINE Meldung
 * mehr hinaus — und niemand merkt es, denn eine Push-Meldung, die nicht
 * kommt, sieht aus wie eine, die es nicht zu senden gab.
 *
 * WIE GEPRÜFT WIRD: die Antwort wird gestellt. `net._http_response` ist eine
 * gewöhnliche Tabelle; eine Zeile darin ist genau das, was `pg_net` nach
 * einem echten Aufruf hinterlässt. Jede Prüfung läuft in einer Transaktion
 * und nimmt sie wieder zurück.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';

const DB = process.env.SUPABASE_DB_URL
  ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** Weit oberhalb aller echten Anfragenummern, damit nichts kollidiert. */
const ERSTE = 987_650_000;
const BETRIEB = 'pushwache-a';

let db: Client;

beforeAll(async () => {
  db = new Client({ connectionString: DB });
  await db.connect();
  await db.query(
    `insert into public.companies (id, name) values ($1, 'Pushwache GmbH')
       on conflict (id) do nothing`,
    [BETRIEB],
  );
}, 60_000);

afterAll(async () => {
  await db.query('delete from public.system_laeufe where company_id = $1', [BETRIEB]);
  await db.query('delete from public.companies where id = $1', [BETRIEB]);
  await db.end();
});

interface Anstoss {
  status?: number;
  fehler?: string;
  /** Ohne Antwort — so sieht ein Aufruf aus, der nie zurückkam. */
  ohneAntwort?: boolean;
  alter?: string;
}

/** Mehrere Anstösse samt Antworten stellen und den Wächter laufen lassen. */
async function wacheMit(anstoesse: Anstoss[]) {
  await db.query('begin');
  /*
    FREMDE MERKZETTEL AUS DEM WEG — innerhalb der Transaktion, also ohne
    bleibenden Schaden.

    Der Wächter beurteilt ABSICHTLICH alles, was offen liegt; im Betrieb ist
    das genau richtig. Im Prüflauf hinterlassen die anderen Dateien aber
    echte Push-Anstösse (jede angelegte Materialanforderung löst einen aus),
    und die zählten hier mit. Die Prüfung war dadurch von der Reihenfolge der
    Dateien abhängig — und das ist keine.
  */
  await db.query(`delete from app.anstoss_wache where art = 'push'`);
  let nummer = ERSTE;
  for (const a of anstoesse) {
    nummer += 1;
    await db.query(
      `insert into app.anstoss_wache (anfrage, art, angestossen)
         values ($1, 'push', now() - $2::interval)`,
      [nummer, a.alter ?? '5 minutes'],
    );
    if (!a.ohneAntwort) {
      await db.query(
        `insert into net._http_response (id, status_code, content, error_msg, created)
           values ($1, $2, null, $3, now())`,
        [nummer, a.status ?? 200, a.fehler ?? null],
      );
    }
  }
  await db.query('select app.push_nachsehen()');

  const lauf = await db.query(
    `select erfolg, meldung, kennzahl, kennzahl_einheit from public.system_laeufe
       where company_id = $1 and art = 'push'`,
    [BETRIEB],
  );
  const offen = await db.query(
    `select count(*)::int as n from app.anstoss_wache where art = 'push'`,
  );
  await db.query('rollback');
  return { lauf: lauf.rows[0], offeneZettel: offen.rows[0].n as number };
}

describe('Der Wächter über dem Push-Versand', () => {
  it('schweigt, solange alles durchgeht', async () => {
    const { lauf } = await wacheMit([{ status: 200 }, { status: 200 }, { status: 200 }]);
    expect(lauf.erfolg).toBe(true);
    expect(Number(lauf.kennzahl)).toBe(0);
    expect(lauf.meldung).toBeNull();
  }, 60_000);

  it('zählt, was nicht durchkam, und nennt die Antwort des Servers', async () => {
    const { lauf } = await wacheMit([
      { status: 200 },
      { status: 401, fehler: 'Keine Anmeldung.' },
      { status: 401, fehler: 'Keine Anmeldung.' },
    ]);
    expect(lauf.erfolg).toBe(false);
    expect(Number(lauf.kennzahl)).toBe(2);
    // Ohne die Antwort des Servers sucht jemand eine Stunde an der falschen
    // Stelle. „401" sagt: der Schlüssel, nicht das Netz.
    expect(String(lauf.meldung)).toContain('401');
  }, 60_000);

  it('räumt jeden beurteilten Merkzettel weg', async () => {
    // Sonst wüchse die Tabelle mit jeder Meldung, und der nächste Lauf
    // beurteilte dieselben Anstösse noch einmal.
    const { offeneZettel } = await wacheMit([{ status: 200 }, { status: 500 }]);
    expect(offeneZettel).toBe(0);
  }, 60_000);

  it('lässt eine junge Anfrage ohne Antwort in Ruhe', async () => {
    /*
      DER NORMALFALL KURZ NACH DEM ANSTOSS. Der Versand läuft ja gerade. Wer
      hier schon einen Fehlschlag schriebe, meldete bei jedem Lauf einen —
      und die Meldung wäre nach zwei Tagen wertlos.
    */
    const { lauf, offeneZettel } = await wacheMit([{ ohneAntwort: true, alter: '2 minutes' }]);
    expect(lauf).toBeUndefined();
    expect(offeneZettel).toBe(1);
  }, 60_000);

  it('gibt eine alte Anfrage ohne Antwort verloren', async () => {
    // Der Aufruf gibt nach zwanzig Sekunden auf; wer nach einer Stunde nichts
    // gesagt hat, sagt nichts mehr.
    const { lauf, offeneZettel } = await wacheMit([{ ohneAntwort: true, alter: '3 hours' }]);
    expect(lauf.erfolg).toBe(false);
    expect(Number(lauf.kennzahl)).toBe(1);
    expect(offeneZettel).toBe(0);
  }, 60_000);

  it('schreibt ohne Versuche gar nichts', async () => {
    /*
      EIN RUHIGER TAG IST KEIN BEFUND. Stünde hier trotzdem ein Eintrag,
      hiesse „null Meldungen, null Fehlschläge" in der Übersicht dasselbe wie
      „es funktioniert" — eine Behauptung über etwas, das gar nicht geprüft
      wurde. Der letzte echte Stand muss stehen bleiben.
    */
    const { lauf } = await wacheMit([]);
    expect(lauf).toBeUndefined();
  }, 60_000);
});
