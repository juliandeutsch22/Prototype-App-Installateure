/**
 * DER MONTEUR ERFÄHRT EINE PLANÄNDERUNG (B6, E85).
 *
 * Geprüft wird die Kette in der Datenbank: die Änderung merkt sich den Plan
 * der Person, wie er VORHER war (nur heute und morgen, nicht die eigene
 * Eintragung, nicht abgeschaltet); nach zwei Minuten Ruhe geht genau ein
 * Anstoß an `push-melden` — nicht, wenn der Plan am Ende derselbe ist, nicht
 * ohne Einsatzplanung, nicht an ein inaktives Konto. `push_einsatz` liefert
 * den Plan, wie er jetzt ist, und nur dem Dienst.
 *
 * Der Versand wird OHNE NETZ geprüft (wie in anstossKopfzeilen.test.ts): in
 * einer Transaktion liegt der Anstoß in `net.http_request_queue`, und die
 * Transaktion wird verworfen. Der Zeitplan (jede Minute) überspringt dabei
 * die gesperrten Zeilen — er kommt der Prüfung nicht dazwischen.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Client } from 'pg';
import { admin, API, SERVICE, betriebAnlegen, konto, type Konto } from './helfer';

const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const BETRIEB = 'einsatzmeldung-a';
const BAU = 'B-MELD-1';

let db: Client;
let planer: Konto;
let monteur: Konto;
let kollegin: Konto;
let heute: string;
let morgen: string;
let spaeter: string;

const tagPlus = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function vorgaben(k: Konto) {
  const { data } = await admin.from('user_prefs').select('einsatz_meldung_ab, einsatz_meldung_vorher').eq('user_id', k.uid).single();
  return data as { einsatz_meldung_ab: string | null; einsatz_meldung_vorher: string | null };
}

/** Was ein Aufbau über den Dienst vorgemerkt hat, gehört nicht zur Prüfung. */
async function vormerkungLeeren() {
  await admin.from('user_prefs').update({ einsatz_meldung_ab: null, einsatz_meldung_vorher: null }).eq('company_id', BETRIEB);
}

async function einplanen(wer: Konto, fuer: Konto, datum: string, felder: Record<string, unknown> = {}) {
  const { error } = await wer.client.from('assignments').insert({
    company_id: BETRIEB, date: datum, project_number: BAU, user_id: fuer.uid, user_name: 'x', as_helper: false, created_by: wer.uid, ...felder,
  });
  if (error) throw new Error(error.message);
}

/**
 * Den Versand in einer Transaktion: die Wartezeit zurückdrehen, senden,
 * ablesen, verwerfen. Gibt die Zahl und die Anstöße zurück.
 */
async function senden(wartend: Konto[]): Promise<{ anzahl: number; anstoesse: { quelle: string; art: string; zeile: { user_id: string } }[]; danach: unknown[] }> {
  await db.query('begin');
  try {
    for (const [name, wert] of [['push_url', 'http://beispiel.test/push'], ['push_schluessel', 'eyJhbGciOi.eyJyb2xlIjo.x']]) {
      const { rows } = await db.query('select id from vault.secrets where name = $1', [name]);
      if (rows.length > 0) await db.query('select vault.update_secret($1::uuid, $2)', [rows[0].id, wert]);
      else await db.query('select vault.create_secret($1, $2)', [wert, name]);
    }
    await db.query(
      `update public.user_prefs set einsatz_meldung_ab = now() - interval '3 minutes'
        where user_id = any($1::uuid[]) and einsatz_meldung_ab is not null`,
      [wartend.map((k) => k.uid)],
    );
    const vorher = (await db.query('select coalesce(max(id), 0) as id from net.http_request_queue')).rows[0].id;
    const { rows } = await db.query('select app.einsatz_meldungen_senden() as anzahl');
    const q = await db.query('select body from net.http_request_queue where id > $1 order by id', [vorher]);
    const danach = (await db.query(
      'select einsatz_meldung_ab, einsatz_meldung_vorher from public.user_prefs where user_id = any($1::uuid[])',
      [wartend.map((k) => k.uid)],
    )).rows;
    const anstoesse = q.rows
      .map((r) => JSON.parse(Buffer.from(r.body).toString('utf8')))
      .filter((b) => b.quelle === 'einsatz' && wartend.some((k) => k.uid === b.zeile?.user_id));
    return { anzahl: rows[0].anzahl, anstoesse, danach };
  } finally {
    await db.query('rollback');
  }
}

beforeAll(async () => {
  db = new Client({ connectionString: DB });
  await db.connect();
  heute = (await db.query(`select (now() at time zone 'Europe/Vienna')::date::text as d`)).rows[0].d;
  morgen = tagPlus(heute, 1);
  spaeter = tagPlus(heute, 2);
  await betriebAnlegen(BETRIEB);
  planer = await konto(BETRIEB, 'Projektleiter', 'melplan');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'melmon');
  kollegin = await konto(BETRIEB, 'Mitarbeiter', 'melkol');
  await admin.from('projects').insert({ company_id: BETRIEB, project_number: BAU, customer_name: 'Familie Huber', status: 'Aktiv' });
}, 120_000);

beforeEach(async () => {
  await admin.from('assignments').delete().eq('company_id', BETRIEB);
  await admin.from('companies').update({ modules: {} }).eq('id', BETRIEB);
  await admin.from('users').update({ active: true }).eq('company_id', BETRIEB);
  for (const k of [planer, monteur, kollegin]) {
    await admin.from('user_prefs').upsert({
      user_id: k.uid, company_id: BETRIEB, notify_einsaetze: true, einsatz_meldung_ab: null, einsatz_meldung_vorher: null,
    });
  }
});

afterAll(async () => {
  await admin.from('assignments').delete().eq('company_id', BETRIEB);
  await db.end();
});

describe('Die Änderung wird vorgemerkt', () => {
  it('heute: vorgemerkt mit dem Plan von vorher', async () => {
    const leer = (await db.query(`select app.einsatz_planstand($1, $2::date) as p`, [monteur.uid, heute])).rows[0].p;
    await einplanen(planer, monteur, heute);
    const v = await vorgaben(monteur);
    expect(v.einsatz_meldung_ab).not.toBeNull();
    expect(v.einsatz_meldung_vorher).toBe(leer);
  });

  it('morgen ebenso', async () => {
    await einplanen(planer, monteur, morgen);
    expect((await vorgaben(monteur)).einsatz_meldung_ab).not.toBeNull();
  });

  it('Gegenprobe: übermorgen meldet sich nicht — es steht im Plan', async () => {
    await einplanen(planer, monteur, spaeter);
    expect(await vorgaben(monteur)).toEqual({ einsatz_meldung_ab: null, einsatz_meldung_vorher: null });
  });

  it('wer sich selbst einträgt, bekommt keine Meldung darüber', async () => {
    await einplanen(planer, planer, heute);
    expect((await vorgaben(planer)).einsatz_meldung_ab).toBeNull();
  });

  it('abgeschaltet: nichts vorgemerkt', async () => {
    await admin.from('user_prefs').update({ notify_einsaetze: false }).eq('user_id', monteur.uid);
    await einplanen(planer, monteur, heute);
    expect((await vorgaben(monteur)).einsatz_meldung_ab).toBeNull();
  });

  it('auch Ändern und Löschen merken vor, und eine zweite Änderung lässt den Stand von vorher stehen', async () => {
    await admin.from('assignments').insert({ company_id: BETRIEB, date: heute, project_number: BAU, user_id: monteur.uid, user_name: 'x', as_helper: false });
    await vormerkungLeeren();
    const vorher = (await db.query(`select app.einsatz_planstand($1, $2::date) as p`, [monteur.uid, heute])).rows[0].p;
    await planer.client.from('assignments').update({ comment: 'Neu' }).eq('company_id', BETRIEB).eq('user_id', monteur.uid);
    expect((await vorgaben(monteur)).einsatz_meldung_vorher).toBe(vorher);
    await planer.client.from('assignments').delete().eq('company_id', BETRIEB).eq('user_id', monteur.uid);
    expect((await vorgaben(monteur)).einsatz_meldung_vorher).toBe(vorher);
  });
});

describe('Nach zwei Minuten Ruhe: eine Meldung', () => {
  it('eine Meldung je Person, auch nach mehreren Änderungen — danach ist nichts mehr vorgemerkt', async () => {
    await einplanen(planer, monteur, heute);
    await einplanen(planer, monteur, morgen, { project_number: 'B-MELD-2' });
    await einplanen(planer, kollegin, heute);
    const r = await senden([monteur, kollegin]);
    expect(r.anstoesse).toHaveLength(2);
    expect(r.anstoesse.map((a) => a.zeile.user_id).sort()).toEqual([monteur.uid, kollegin.uid].sort());
    expect(r.anstoesse[0]).toMatchObject({ quelle: 'einsatz', art: 'plan' });
    expect(r.danach).toEqual([
      { einsatz_meldung_ab: null, einsatz_meldung_vorher: null },
      { einsatz_meldung_ab: null, einsatz_meldung_vorher: null },
    ]);
  });

  it('Gegenprobe: unter zwei Minuten wartet sie noch', async () => {
    await einplanen(planer, monteur, heute);
    await db.query('begin');
    try {
      await db.query('select app.einsatz_meldungen_senden()');
      const { rows } = await db.query('select einsatz_meldung_ab from public.user_prefs where user_id = $1', [monteur.uid]);
      expect(rows[0].einsatz_meldung_ab).not.toBeNull();
    } finally {
      await db.query('rollback');
    }
  });

  it('löscht und schreibt „Speichern“ dieselbe Mannschaft neu, kommt nichts', async () => {
    await admin.from('assignments').insert({ company_id: BETRIEB, date: heute, project_number: BAU, user_id: monteur.uid, user_name: 'x', as_helper: false });
    await vormerkungLeeren();
    await planer.client.from('assignments').delete().eq('company_id', BETRIEB).eq('user_id', monteur.uid);
    await einplanen(planer, monteur, heute);
    expect((await vorgaben(monteur)).einsatz_meldung_ab).not.toBeNull();
    const r = await senden([monteur]);
    expect(r.anstoesse).toEqual([]);
    // Aufgeräumt wird trotzdem — sonst stünde die Zeile ewig in der Warteschlange.
    expect(r.danach).toEqual([{ einsatz_meldung_ab: null, einsatz_meldung_vorher: null }]);
  });

  it('ohne Einsatzplanung im Betrieb geht nichts hinaus', async () => {
    await einplanen(planer, monteur, heute);
    await admin.from('companies').update({ modules: { einsatzplanung: false } }).eq('id', BETRIEB);
    expect((await senden([monteur])).anstoesse).toEqual([]);
  });

  it('an ein inaktives Konto geht nichts hinaus', async () => {
    await einplanen(planer, monteur, heute);
    await admin.from('users').update({ active: false }).eq('id', monteur.uid);
    expect((await senden([monteur])).anstoesse).toEqual([]);
  });
});

describe('push_einsatz', () => {
  it('liefert den Plan für heute und morgen, wie er jetzt ist — mit Kunde und Uhrzeit', async () => {
    await einplanen(planer, monteur, heute, { zeit_von: '07:30' });
    await einplanen(planer, monteur, spaeter);
    const { data, error } = await admin.rpc('push_einsatz', { p_user: monteur.uid });
    expect(error).toBeNull();
    expect(data).toEqual({
      uid: monteur.uid,
      heute: [{ nr: BAU, kunde: 'Familie Huber', von: '07:30' }],
      morgen: [],
    });
  });

  it('nur für den Dienst — auch nicht für die Person selbst', async () => {
    const { error } = await monteur.client.rpc('push_einsatz', { p_user: monteur.uid });
    expect(error).not.toBeNull();
    const { error: e2 } = await planer.client.rpc('push_einsatz', { p_user: monteur.uid });
    expect(e2).not.toBeNull();
  });
});

/*
  DIE GANZE KETTE BIS VOR GOOGLE, wie in push.test.ts: der Anstoß aus der
  Datenbank trägt nur die Person; `push-melden` holt den Plan, prüft die
  Vorgabe und zählt die Geräte. Ein Anstoß ohne Gerät oder mit abgeschalteter
  Meldung erreicht niemanden.
*/
describe('push-melden für den Einsatzplan', () => {
  const anstossen = async (uid: string) => {
    const r = await fetch(`${API}/functions/v1/push-melden`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ quelle: 'einsatz', art: 'plan', zeile: { user_id: uid, company_id: BETRIEB } }),
    });
    return r.json() as Promise<{ geplant?: { art: string; empfaenger: number; geraete: number }[]; grund?: string }>;
  };

  it('an die Person, mit ihrem Gerät', async () => {
    await admin.from('user_prefs').update({ push_tokens: [`geraet-${monteur.uid}`] }).eq('user_id', monteur.uid);
    expect((await anstossen(monteur.uid)).geplant).toEqual([{ art: 'notifyEinsaetze', empfaenger: 1, geraete: 1 }]);
  }, 120_000);

  it('abgeschaltet: kein Gerät gezählt', async () => {
    await admin.from('user_prefs').update({ push_tokens: [`geraet-${monteur.uid}`], notify_einsaetze: false }).eq('user_id', monteur.uid);
    expect((await anstossen(monteur.uid)).geplant).toEqual([{ art: 'notifyEinsaetze', empfaenger: 1, geraete: 0 }]);
  }, 120_000);

  it('ohne Person oder mit fremder Art: nichts', async () => {
    const r = await fetch(`${API}/functions/v1/push-melden`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ quelle: 'einsatz', art: 'neu', zeile: { user_id: monteur.uid } }),
    });
    expect((await r.json()).grund).toMatch(/kein Ereignis/);
  }, 120_000);
});
