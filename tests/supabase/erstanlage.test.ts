/**
 * Die Erstanlage — gegen die echte Datenbank, mit dem echten Skript.
 *
 * WARUM DAS GEPRÜFT WIRD. Dieses Skript läuft im Leben eines Projekts genau
 * einmal, und zwar an dem Tag, an dem noch niemand da ist, der einen Fehler
 * bemerken könnte. Es durchbricht ausserdem bewusst den Ring, der sonst jeden
 * Zugriff ordnet. Beides zusammen heisst: ein Fehler darin fällt spät auf und
 * hat weite Folgen.
 *
 * ZWEI DINGE STEHEN HIER FEST:
 *
 *   Der Betrieb entsteht über DIESELBE Datenbankfunktion wie über die Edge
 *   Function. Zwei Wege wären zwei Fassungen derselben Vorgabewerte —
 *   Stundensätze, Steuersatz, Zahlungsziel —, und sie liefen auseinander.
 *
 *   Ein Plattformverwalter gehört zu KEINEM Betrieb. Gäbe es für dieselbe
 *   Kennung beides, entschiede die Reihenfolge zweier Trigger über
 *   Leserechte an fremden Kundendaten.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { API, SERVICE } from './helfer';

const ausfuehren = promisify(execFile);
const DB = process.env.SUPABASE_DB_URL
  ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** Eigene Kennungen, damit die Prüfung neben den anderen läuft. */
const marke = Math.random().toString(36).slice(2, 8);
const KENNUNG = `erstanlage-${marke}`;
const ADMIN = `chef-${marke}@beispiel.test`;
const PLATTFORM = `plattform-${marke}@beispiel.test`;

let db: Client;

/** Das Skript mit der Umgebung eines echten Aufrufs. */
function skript(zusatz: Record<string, string> = {}) {
  return ausfuehren('node', ['scripts/bootstrap-postgres.mjs'], {
    env: {
      ...process.env,
      SUPABASE_URL: API,
      SUPABASE_SERVICE_KEY: SERVICE,
      ADMIN_EMAIL: ADMIN,
      ADMIN_NAME: 'Erste Geschäftsführung',
      COMPANY_NAME: 'Erstanlage GmbH',
      COMPANY_ID: KENNUNG,
      PLATTFORM_EMAIL: PLATTFORM,
      PLATTFORM_NAME: 'Erste Plattformverwaltung',
      ...zusatz,
    },
  });
}

beforeAll(async () => {
  db = new Client({ connectionString: DB });
  await db.connect();
}, 60_000);

afterAll(async () => {
  /*
    AUFRÄUMEN BRAUCHT EINEN SCHLÜSSEL ZUM SCHLOSS. Einen Administrator
    entfernt sonst nur ein Administrator, und diese Verbindung ist niemand —
    sie trägt kein Token. `session_replication_role` legt die Trigger für
    diese eine Sitzung still; das ist genau der Fall, für den es das gibt.
  */
  await db.query('set session_replication_role = replica');
  await db.query('delete from public.users where company_id = $1', [KENNUNG]);
  await db.query('delete from public.betriebsanlagen where betrieb_kennung = $1', [KENNUNG]);
  await db.query('delete from public.companies where id = $1', [KENNUNG]);
  await db.query('delete from public.platform_admins where id in '
    + '(select id from auth.users where email = $1)', [PLATTFORM]);
  await db.query('delete from auth.users where email in ($1, $2)', [ADMIN, PLATTFORM]);
  await db.query('reset session_replication_role');
  await db.end();
});

describe('Die Erstanlage bricht den Ring genau einmal', () => {
  it('legt Betrieb, Zugang und Plattformverwaltung an', async () => {
    const { stdout } = await skript();
    expect(stdout).toContain('Betrieb angelegt');
    expect(stdout).toContain('In die Plattformverwaltung eingetragen');

    const betrieb = await db.query(
      'select name, rates from public.companies where id = $1', [KENNUNG],
    );
    expect(betrieb.rows).toHaveLength(1);
    /*
      Die Vorgabewerte kommen aus der Datenbankfunktion, nicht aus dem
      Skript. Stünde hier eine Null, rechnete die erste Rechnung mit null —
      und niemand suchte den Fehler in einem leeren Feld.
    */
    expect(betrieb.rows[0].rates.fach).toBe(65);
    expect(betrieb.rows[0].rates.vatRate).toBe(0.2);

    const zugang = await db.query(
      'select role, active, email from public.users where company_id = $1', [KENNUNG],
    );
    expect(zugang.rows).toHaveLength(1);
    expect(zugang.rows[0].role).toBe('Administrator');
    expect(zugang.rows[0].active).toBe(true);
    expect(zugang.rows[0].email).toBe(ADMIN);

    const anlage = await db.query(
      'select erster_admin_uid from public.betriebsanlagen where betrieb_kennung = $1',
      [KENNUNG],
    );
    expect(anlage.rows).toHaveLength(1);

    const verwaltung = await db.query(
      `select p.id from public.platform_admins p
         join auth.users u on u.id = p.id where u.email = $1`, [PLATTFORM],
    );
    expect(verwaltung.rows).toHaveLength(1);
  }, 120_000);

  it('und der Plattformverwalter ist KEIN Mitglied des Betriebs', async () => {
    const { rows } = await db.query(
      `select count(*)::int as n from public.users u
         join auth.users a on a.id = u.id where a.email = $1`, [PLATTFORM],
    );
    expect(rows[0].n).toBe(0);
  }, 60_000);

  it('ein zweiter Lauf ändert nichts', async () => {
    const { stdout } = await skript();
    expect(stdout).toContain('besteht bereits');
    expect(stdout).toContain('Steht bereits in der Plattformverwaltung');

    const zugang = await db.query(
      'select count(*)::int as n from public.users where company_id = $1', [KENNUNG],
    );
    expect(zugang.rows[0].n).toBe(1);
  }, 120_000);

  /*
    DIE ABLEHNUNG IST DER EIGENTLICHE SCHUTZ. Die Datenbank wiese das
    Zwitterkonto ohnehin ab — aber erst, nachdem das Skript schon ein Konto
    angelegt hätte. Vorher zu scheitern spart den Rest.
  */
  it('weist dieselbe Adresse für beide Rollen ab, bevor etwas entsteht', async () => {
    await expect(skript({ PLATTFORM_EMAIL: ADMIN })).rejects.toMatchObject({ code: 1 });
    try {
      await skript({ PLATTFORM_EMAIL: ADMIN });
    } catch (fehler) {
      expect(String((fehler as { stderr?: string }).stderr))
        .toContain('gehört zu keinem Betrieb');
    }
  }, 120_000);

  it('und scheitert mit klarer Meldung ohne Schlüssel', async () => {
    try {
      await skript({ SUPABASE_SERVICE_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_SECRET_KEY: '' });
      throw new Error('Das hätte scheitern müssen.');
    } catch (fehler) {
      expect(String((fehler as { stderr?: string }).stderr)).toContain('SUPABASE_SERVICE_KEY fehlt');
    }
  }, 60_000);
});
