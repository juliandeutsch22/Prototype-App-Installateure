/**
 * Krank nur über die Krankmeldung, und Betriebsurlaub für später Eingetretene
 * — gegen die echte Datenbank.
 *
 * Zwei Regeln, die in der Datenbank stehen und nicht nur in der Maske:
 *
 *   - Einen Krank-Tag schreibt nur die Krankmeldung, und einen Tag einer
 *     Meldung ändert nur sie. Sonst räumte das Löschen der Meldung später
 *     einen Tag weg, der inzwischen etwas anderes ist.
 *   - Wer nach dem Anlegen eines Betriebsurlaubs dazukommt (oder wieder
 *     aktiv wird), bekommt ihn nachgebucht — ab seinem Starttag.
 *
 * Die Tage liegen im Oktober und im Dezember 2026.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { admin, betriebAnlegen, buchung, konto, type Konto } from './helfer';

const BETRIEB = 'krank-nach';
const VERBINDUNG =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

let chef: Konto;
let buch: Konto;
let monteur: Konto;
let db: Client;

async function eintraege(uid: string, von: string, bis: string) {
  const { data } = await admin.from('time_entries')
    .select('id, date, status, krankmeldung_id, vacation_id')
    .eq('user_id', uid).gte('date', von).lte('date', bis).order('date');
  return data ?? [];
}

const krank = (k: Konto, a: { user?: string; von: string; bis: string }) =>
  k.client.rpc('krankmeldung_speichern', {
    p_id: null, p_user: a.user ?? null, p_von: a.von, p_bis: a.bis, p_notiz: null,
  });

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Krank und Nachbuchen');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'kngf');
  buch = await konto(BETRIEB, 'Buchhaltung', 'knbu');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'knmon');
  db = new Client({ connectionString: VERBINDUNG });
  await db.connect();
}, 180_000);

afterAll(async () => {
  await db.end();
});

describe('Krank nur über die Krankmeldung', () => {
  it('lässt „Krank" nicht direkt buchen — weder den Monteur noch das Büro', async () => {
    for (const k of [monteur, buch]) {
      const { error } = await k.client.from('time_entries').insert(buchung(monteur, '2026-10-01', {
        status: 'Krank', start_time: null, end_time: null, break_duration: 0,
      }));
      expect(error?.message).toMatch(/über eine Krankmeldung erfasst/);
    }
    expect(await eintraege(monteur.uid, '2026-10-01', '2026-10-01')).toEqual([]);
  });

  it('lässt einen gewöhnlichen Eintrag nicht zu „Krank" umbauen', async () => {
    await admin.from('time_entries').insert(buchung(monteur, '2026-10-02'));
    const [e] = await eintraege(monteur.uid, '2026-10-02', '2026-10-02');
    const { error } = await monteur.client.from('time_entries')
      .update({ status: 'Krank', start_time: null, end_time: null }).eq('id', e.id);
    expect(error?.message).toMatch(/über eine Krankmeldung erfasst/);
  });

  it('ändert und löscht einen Tag einer Krankmeldung nur über die Meldung', async () => {
    const { data, error } = await krank(monteur, { von: '2026-10-05', bis: '2026-10-07' });
    expect(error).toBeNull();
    const tage = await eintraege(monteur.uid, '2026-10-05', '2026-10-07');
    expect(tage.map((t) => t.status)).toEqual(['Krank', 'Krank', 'Krank']);

    for (const k of [monteur, buch]) {
      const geaendert = await k.client.from('time_entries')
        .update({ status: 'Anwesend', start_time: '07:00', end_time: '16:00' }).eq('id', tage[1].id);
      expect(geaendert.error?.message).toMatch(/gehört zu einer Krankmeldung/);
      const geloescht = await k.client.from('time_entries').delete().eq('id', tage[1].id);
      expect(geloescht.error?.message).toMatch(/gehört zu einer Krankmeldung/);
    }
    expect(await eintraege(monteur.uid, '2026-10-05', '2026-10-07')).toHaveLength(3);

    // Über die Meldung geht es: „wieder gesund ab Mittwoch".
    const ende = await monteur.client.rpc('krankmeldung_speichern', {
      p_id: (data as { id: string }).id, p_user: null, p_von: '2026-10-05', p_bis: '2026-10-06', p_notiz: null,
    });
    expect(ende.error).toBeNull();
    expect(await eintraege(monteur.uid, '2026-10-05', '2026-10-07')).toHaveLength(2);
  });

  it('niemand hängt einen eigenen Eintrag an eine fremde Meldung — der würde mit ihr gelöscht', async () => {
    const { data: m } = await admin.from('krankmeldungen').select('id').eq('user_id', monteur.uid).single();
    const { error } = await monteur.client.from('time_entries').insert(buchung(monteur, '2026-10-08', {
      krankmeldung_id: m!.id,
    }));
    expect(error?.message).toMatch(/über eine Krankmeldung erfasst/);
  });

  it('gewöhnliche Einträge bleiben, wie sie waren: anlegen, ändern, löschen', async () => {
    const { error } = await monteur.client.from('time_entries').insert(buchung(monteur, '2026-10-13'));
    expect(error).toBeNull();
    const [e] = await eintraege(monteur.uid, '2026-10-13', '2026-10-13');
    expect((await monteur.client.from('time_entries').update({ comment: 'Heizung' }).eq('id', e.id)).error)
      .toBeNull();
    expect((await monteur.client.from('time_entries').delete().eq('id', e.id)).error).toBeNull();
  });
});

describe('Übernahme alter Krank-Tage', () => {
  it('fasst zusammenhängende Tage zu Meldungen — und hängt Tage in einer Meldung an sie', async () => {
    const alt = await konto(BETRIEB, 'Mitarbeiter', 'knalt');
    // Altbestand, wie ihn der frühere Weg hinterliess: Krank ohne Meldung.
    // Mo–Mi, dann Fr allein, dann Mo allein.
    const leer = { status: 'Krank', start_time: null, end_time: null, break_duration: 0 };
    await admin.from('time_entries').insert(
      ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-23', '2026-10-26']
        .map((d) => buchung(alt, d, leer)),
    );
    // Und eine Meldung, die einen von Hand gebuchten Tag übersprungen hat.
    await admin.from('time_entries').insert(buchung(alt, '2026-11-04', leer));
    const { data: vorhanden } = await buch.client.rpc('krankmeldung_speichern', {
      p_id: null, p_user: alt.uid, p_von: '2026-11-03', p_bis: '2026-11-05', p_notiz: null,
    });

    // Die Migration noch einmal — sie ist darauf gebaut, dass das geht.
    await db.query(readFileSync(
      join(__dirname, '../../supabase/migrations/20260924140000_krank_nur_ueber_meldung.sql'), 'utf8'));

    const { data: meldungen } = await admin.from('krankmeldungen')
      .select('id, von, bis, gemeldet_von_name').eq('user_id', alt.uid).order('von');
    expect(meldungen!.map((m) => [m.von, m.bis])).toEqual([
      ['2026-10-19', '2026-10-21'], ['2026-10-23', '2026-10-23'], ['2026-10-26', '2026-10-26'],
      ['2026-11-03', '2026-11-05'],
    ]);
    expect(meldungen![0].gemeldet_von_name).toBe('Übernahme aus der Zeiterfassung');

    const tage = await eintraege(alt.uid, '2026-10-19', '2026-11-05');
    expect(tage.every((t) => t.krankmeldung_id !== null)).toBe(true);
    const nov = tage.filter((t) => t.date.startsWith('2026-11'));
    expect(new Set(nov.map((t) => t.krankmeldung_id))).toEqual(new Set([(vorhanden as { id: string }).id]));

    // Der Push-Auslöser ist nach der Übernahme wieder an.
    const { rows } = await db.query(
      `select tgenabled from pg_trigger where tgname = 'krankmeldungen_push'`);
    expect(rows[0].tgenabled).toBe('O');
  });
});

describe('Betriebsurlaub für später Eingetretene', () => {
  const WEIHNACHTEN = { von: '2026-12-28', bis: '2026-12-31' };

  /** Ein neuer Mitarbeiter — so, wie ihn die App anlegt: die Geschäftsführung schreibt das Profil. */
  async function neu(marke: string, felder: Record<string, unknown> = {}): Promise<string> {
    const { data, error } = await admin.auth.admin.createUser({
      email: `${marke}-${crypto.randomUUID().slice(0, 8)}@${BETRIEB}.test`,
      password: 'Passwort-123456', email_confirm: true,
    });
    if (error) throw error;
    const uid = data.user!.id;
    const { error: e } = await chef.client.from('users').upsert({
      id: uid, company_id: BETRIEB, name: marke, email: `${marke}@x.test`, role: 'Mitarbeiter',
      active: true, work_days: [1, 2, 3, 4, 5], ...felder,
    });
    if (e) throw new Error(e.message);
    return uid;
  }

  const gebucht = async (uid: string) =>
    (await eintraege(uid, WEIHNACHTEN.von, WEIHNACHTEN.bis))
      .filter((t) => t.status === 'Urlaub').map((t) => t.date);

  beforeAll(async () => {
    const { error } = await buch.client.rpc('betriebsurlaub_anlegen', {
      p_von: WEIHNACHTEN.von, p_bis: WEIHNACHTEN.bis, p_bezeichnung: 'Weihnachten',
      p_abbuchen: true, p_name: 'Büro',
    });
    if (error) throw new Error(error.message);
  });

  it('bucht einem neuen Mitarbeiter den kommenden Betriebsurlaub nach', async () => {
    const uid = await neu('neu-ab-jetzt');
    expect(await gebucht(uid)).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31']);
    const { data: v } = await admin.from('vacations')
      .select('tage, status, von, bis, notiz').eq('user_id', uid).single();
    expect(v).toMatchObject({ tage: 4, status: 'Genehmigt', von: '2026-12-28', notiz: 'Weihnachten' });
  });

  it('ab dem Starttag — was davor liegt, gehört nicht zu ihm', async () => {
    const mitten = await neu('neu-mitten', { app_start_date: '2026-12-30' });
    expect(await gebucht(mitten)).toEqual(['2026-12-30', '2026-12-31']);
    const danach = await neu('neu-danach', { app_start_date: '2027-01-04' });
    expect(await gebucht(danach)).toEqual([]);
  });

  it('beim Reaktivieren — und ein zweites Mal bucht nichts doppelt', async () => {
    const uid = await neu('neu-inaktiv', { active: false });
    expect(await gebucht(uid)).toEqual([]);
    await chef.client.from('users').update({ active: true }).eq('id', uid);
    expect(await gebucht(uid)).toHaveLength(4);
    await chef.client.from('users').update({ active: false }).eq('id', uid);
    await chef.client.from('users').update({ active: true }).eq('id', uid);
    await chef.client.from('users').update({ app_start_date: '2026-10-01' }).eq('id', uid);
    const { count } = await admin.from('vacations').select('id', { count: 'exact', head: true })
      .eq('user_id', uid);
    expect(count).toBe(1);
    expect(await gebucht(uid)).toHaveLength(4);
  });

  it('nicht beim Rücklauf aus der Sicherung — der bringt die gebuchten Urlaube selbst mit', async () => {
    const r = await konto(BETRIEB, 'Mitarbeiter', 'knruecklauf');
    expect(await gebucht(r.uid)).toEqual([]);
  });

  it('beim Anlegen des Betriebsurlaubs zählt der Starttag jedes Einzelnen', async () => {
    const spaet = await neu('neu-spaet', { app_start_date: '2027-02-03' });
    const { data, error } = await buch.client.rpc('betriebsurlaub_anlegen', {
      p_von: '2027-02-01', p_bis: '2027-02-05', p_bezeichnung: 'Semesterferien',
      p_abbuchen: true, p_name: 'Büro',
    });
    expect(error).toBeNull();
    const tage = (await eintraege(spaet, '2027-02-01', '2027-02-05')).map((t) => t.date);
    expect(tage).toEqual(['2027-02-03', '2027-02-04', '2027-02-05']);
    expect(data).toMatchObject({ uebersprungen: 0 });
    // Der Monteur, ohne Starttag, bekommt die ganze Woche.
    expect((await eintraege(monteur.uid, '2027-02-01', '2027-02-05'))
      .filter((t) => t.status === 'Urlaub')).toHaveLength(5);
  });
});
