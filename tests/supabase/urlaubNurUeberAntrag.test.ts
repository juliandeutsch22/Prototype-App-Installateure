/**
 * Urlaub nur über den Antrag — gegen die echte Datenbank.
 *
 * Gefunden im Prüflauf vom 24.09.2026: der Monteur konnte einen Tag aus
 * seinem genehmigten Urlaub löschen und mit seinem eigenen Schlüssel einen
 * Urlaubstag anlegen, den nie jemand genehmigt hat. Danach zeigten
 * Urlaubsseite und Mitarbeiterübersicht verschiedenen Resturlaub. Geprüft
 * wird hier, dass beides nicht mehr geht, dass das Büro trotzdem Urlaub
 * eintragen kann (als genehmigten Antrag), und dass ein genehmigter Antrag
 * die Tage trägt, die wirklich gebucht sind.
 *
 * Die Tage liegen im Februar und März 2027 (1. Februar ist ein Montag).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { admin, betriebAnlegen, buchung, konto, type Konto } from './helfer';

const BETRIEB = 'urlaub-antrag';
const FREMD = 'urlaub-antrag-fremd';
const VERBINDUNG =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

let chef: Konto;
let buch: Konto;
let monteur: Konto;
let fremd: Konto;
let db: Client;

async function eintraege(uid: string, von: string, bis: string) {
  const { data } = await admin.from('time_entries')
    .select('id, date, status, vacation_id')
    .eq('user_id', uid).gte('date', von).lte('date', bis).order('date');
  return data ?? [];
}

const eintragen = (k: Konto, a: { user: string; von: string; bis: string; notiz?: string }) =>
  k.client.rpc('urlaub_eintragen', {
    p_user: a.user, p_von: a.von, p_bis: a.bis, p_notiz: a.notiz ?? null, p_name: 'Büro',
  });

const leer = { start_time: null, end_time: null, break_duration: 0 };

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Urlaub über Antrag');
  await betriebAnlegen(FREMD);
  chef = await konto(BETRIEB, 'Geschäftsführung', 'uagf');
  buch = await konto(BETRIEB, 'Buchhaltung', 'uabu');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'uamon');
  fremd = await konto(FREMD, 'Mitarbeiter', 'uafremd');
  db = new Client({ connectionString: VERBINDUNG });
  await db.connect();
}, 180_000);

afterAll(async () => {
  await db.end();
});

describe('Der Wächter', () => {
  it('lässt Urlaub nicht direkt buchen — weder den Monteur noch das Büro', async () => {
    for (const k of [monteur, buch]) {
      const { error } = await k.client.from('time_entries')
        .insert(buchung(monteur, '2027-02-01', { status: 'Urlaub', ...leer }));
      expect(error?.message).toMatch(/beantragt und genehmigt/);
    }
    expect(await eintraege(monteur.uid, '2027-02-01', '2027-02-01')).toEqual([]);
  });

  it('lässt einen gewöhnlichen Eintrag nicht zu Urlaub umbauen', async () => {
    await admin.from('time_entries').insert(buchung(monteur, '2027-02-02'));
    const [e] = await eintraege(monteur.uid, '2027-02-02', '2027-02-02');
    const { error } = await monteur.client.from('time_entries')
      .update({ status: 'Urlaub', ...leer }).eq('id', e.id);
    expect(error?.message).toMatch(/beantragt und genehmigt/);
  });

  it('ändert und löscht einen genehmigten Urlaubstag nur über den Antrag', async () => {
    const { error } = await eintragen(buch, { user: monteur.uid, von: '2027-02-08', bis: '2027-02-09' });
    expect(error).toBeNull();
    const tage = await eintraege(monteur.uid, '2027-02-08', '2027-02-09');
    expect(tage.map((t) => t.status)).toEqual(['Urlaub', 'Urlaub']);

    for (const k of [monteur, buch]) {
      const loeschen = await k.client.from('time_entries').delete().eq('id', tage[0].id);
      expect(loeschen.error?.message).toMatch(/nur über den Antrag/);
      const aendern = await k.client.from('time_entries')
        .update({ status: 'Anwesend', start_time: '07:00', end_time: '16:00' }).eq('id', tage[1].id);
      expect(aendern.error?.message).toMatch(/nur über den Antrag/);
    }
    expect((await eintraege(monteur.uid, '2027-02-08', '2027-02-09')).length).toBe(2);

    // Zurücknehmen geht — und nimmt die Tage mit.
    const { data: antrag } = await admin.from('vacations').select('id')
      .eq('user_id', monteur.uid).eq('von', '2027-02-08').single();
    const { error: zurueck } = await chef.client.rpc('urlaub_entscheiden', {
      p_antrag: antrag!.id, p_entscheidung: 'Storniert', p_grund: 'doch nicht', p_entscheider_name: 'Chef',
    });
    expect(zurueck).toBeNull();
    expect(await eintraege(monteur.uid, '2027-02-08', '2027-02-09')).toEqual([]);
  });

  it('lässt Zeitausgleich direkt nur das Büro buchen — und nur das Büro wieder herausnehmen', async () => {
    const za = buchung(monteur, '2027-02-15', { status: 'Zeitausgleich', ...leer });
    const selbst = await monteur.client.from('time_entries').insert(za);
    expect(selbst.error?.message).toMatch(/Zeitausgleich beantragt man/);

    const vomBuero = await buch.client.from('time_entries').insert(za);
    expect(vomBuero.error).toBeNull();
    const weg = await monteur.client.from('time_entries').delete().eq('id', za.id);
    expect(weg.error?.message).toMatch(/ändert das Büro/);
    expect((await eintraege(monteur.uid, '2027-02-15', '2027-02-15')).length).toBe(1);
  });

  it('lässt gewöhnliche Buchungen in Ruhe', async () => {
    const b = buchung(monteur, '2027-02-16');
    expect((await monteur.client.from('time_entries').insert(b)).error).toBeNull();
    expect((await monteur.client.from('time_entries').update({ end_time: '15:00' }).eq('id', b.id)).error).toBeNull();
    expect((await monteur.client.from('time_entries').delete().eq('id', b.id)).error).toBeNull();
  });
});

describe('Das Büro trägt Urlaub ein', () => {
  it('als genehmigten Antrag, mit den freien Arbeitstagen', async () => {
    // Mittwoch ist schon gebucht; das Wochenende ist kein Arbeitstag.
    await admin.from('time_entries').insert(buchung(monteur, '2027-02-24'));
    const { data, error } = await eintragen(chef, {
      user: monteur.uid, von: '2027-02-22', bis: '2027-02-28', notiz: 'Skiurlaub',
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ tage: 4, uebersprungen: 1 });

    const { data: v } = await admin.from('vacations').select('*').eq('id', (data as { id: string }).id).single();
    expect(v).toMatchObject({
      status: 'Genehmigt', art: 'Urlaub', tage: 4, notiz: 'Skiurlaub',
      entschieden_von_uid: chef.uid, entschieden_von_name: 'Büro',
    });
    const tage = await eintraege(monteur.uid, '2027-02-22', '2027-02-28');
    expect(tage.map((t) => [t.date, t.status])).toEqual([
      ['2027-02-22', 'Urlaub'], ['2027-02-23', 'Urlaub'], ['2027-02-24', 'Anwesend'],
      ['2027-02-25', 'Urlaub'], ['2027-02-26', 'Urlaub'],
    ]);
    expect(tage.filter((t) => t.status === 'Urlaub').every((t) => t.vacation_id === v!.id)).toBe(true);
  });

  it('sagt es, wenn kein Tag mehr frei ist', async () => {
    const { error } = await eintragen(buch, { user: monteur.uid, von: '2027-02-24', bis: '2027-02-24' });
    expect(error?.message).toMatch(/kein Arbeitstag mehr frei/);
  });

  it('nur Buchhaltung, Geschäftsführung und Administration — und nur im eigenen Betrieb', async () => {
    const selbst = await eintragen(monteur, { user: monteur.uid, von: '2027-03-01', bis: '2027-03-01' });
    expect(selbst.error?.message).toMatch(/alle anderen beantragen ihn/);
    const fremdePerson = await eintragen(chef, { user: fremd.uid, von: '2027-03-01', bis: '2027-03-01' });
    expect(fremdePerson.error?.message).toMatch(/gibt es im Betrieb nicht/);
    expect(await eintraege(monteur.uid, '2027-03-01', '2027-03-01')).toEqual([]);
  });

  it('prüft den Zeitraum', async () => {
    expect((await eintragen(chef, { user: monteur.uid, von: '2027-03-05', bis: '2027-03-01' })).error?.message)
      .toMatch(/Ende liegt vor dem Beginn/);
    expect((await eintragen(chef, { user: monteur.uid, von: '2027-03-01', bis: '2027-07-01' })).error?.message)
      .toMatch(/Tippfehler/);
  });
});

describe('Genehmigen trägt die gebuchten Tage', () => {
  async function antrag(von: string, bis: string, tage: number) {
    const { data, error } = await monteur.client.from('vacations').insert({
      company_id: BETRIEB, user_id: monteur.uid, user_name: 'Monteur', von, bis, tage,
      status: 'Beantragt', art: 'Urlaub',
    }).select('id').single();
    if (error) throw new Error(error.message);
    return data!.id as string;
  }

  it('zählt einen übersprungenen Tag nicht als Urlaub', async () => {
    await admin.from('time_entries').insert(buchung(monteur, '2027-03-09'));
    const id = await antrag('2027-03-08', '2027-03-10', 3);
    const { error } = await chef.client.rpc('urlaub_entscheiden', {
      p_antrag: id, p_entscheidung: 'Genehmigt', p_grund: '', p_entscheider_name: 'Chef',
    });
    expect(error).toBeNull();
    const { data } = await admin.from('vacations').select('tage, status').eq('id', id).single();
    expect(data).toEqual({ tage: 2, status: 'Genehmigt' });
  });

  it('genehmigt nichts, wenn jeder Tag schon gebucht ist', async () => {
    const id = await antrag('2027-03-09', '2027-03-09', 1);
    const { error } = await chef.client.rpc('urlaub_entscheiden', {
      p_antrag: id, p_entscheidung: 'Genehmigt', p_grund: '', p_entscheider_name: 'Chef',
    });
    expect(error?.message).toMatch(/nichts zu genehmigen/);
    const { data } = await admin.from('vacations').select('status').eq('id', id).single();
    expect(data!.status).toBe('Beantragt');
  });
});

describe('Übernahme des Altbestands', () => {
  it('hängt alte Urlaubstage an einen Antrag und gleicht die Tage an', async () => {
    const alt = await konto(BETRIEB, 'Mitarbeiter', 'uaalt');
    const u = { status: 'Urlaub', ...leer };
    // Mo–Mi und Fr ohne Antrag …
    await admin.from('time_entries').insert(
      ['2027-04-05', '2027-04-06', '2027-04-07', '2027-04-09'].map((d) => buchung(alt, d, u)));
    // … und ein genehmigter Antrag über 5 Tage, von dem nur 2 gebucht sind,
    // einer davon ohne Bezug.
    const { data: v } = await admin.from('vacations').insert({
      company_id: BETRIEB, user_id: alt.uid, user_name: 'Alt', von: '2027-04-19', bis: '2027-04-23',
      tage: 5, status: 'Genehmigt', art: 'Urlaub',
    }).select('id').single();
    await admin.from('time_entries').insert([
      buchung(alt, '2027-04-19', { ...u, vacation_id: v!.id }),
      buchung(alt, '2027-04-20', u),
    ]);

    // Die Migration noch einmal — sie ist darauf gebaut, dass das geht.
    await db.query(readFileSync(
      join(__dirname, '../../supabase/migrations/20260924190000_urlaub_nur_ueber_antrag.sql'), 'utf8'));

    const tage = await eintraege(alt.uid, '2027-04-01', '2027-04-30');
    expect(tage.every((t) => t.vacation_id !== null)).toBe(true);
    const { data: antraege } = await admin.from('vacations')
      .select('von, bis, tage, status, entschieden_von_name').eq('user_id', alt.uid).order('von');
    expect(antraege!.map((a) => [a.von, a.bis, Number(a.tage), a.status])).toEqual([
      ['2027-04-05', '2027-04-07', 3, 'Genehmigt'],
      ['2027-04-09', '2027-04-09', 1, 'Genehmigt'],
      ['2027-04-19', '2027-04-23', 2, 'Genehmigt'],
    ]);
    expect(antraege![0].entschieden_von_name).toBe('Übernahme aus der Zeiterfassung');

    const { rows } = await db.query(
      `select tgenabled from pg_trigger where tgname = 'vacations_entscheidung'`);
    expect(rows[0].tgenabled).toBe('O');
  });
});
