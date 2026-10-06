/**
 * Jugendschutz in der Zeiterfassung (Testbericht Runde 3, M2 und M1) —
 * `20261006300000_jugendschutz.sql`.
 *
 *   1  Wer eine Buchung angelegt hat, setzt die Datenbank (`angelegt_von`).
 *   2  Vom Büro gebucht, für eine Person unter 18, und der Tag hat mehr als
 *      8 Std. oder die Zeit liegt zwischen 20 und 6 Uhr: ändern oder löschen
 *      kann sie nur das Büro.
 *   3  Der Bestand: der Anleger wird nachgetragen, wo er eindeutig ist —
 *      ohne die Prüfungen an den Buchungen auszulösen.
 *   4  Berufsschule mit Unterrichtszeit je Schultag.
 *   5  Die Datenauskunft zählt, was jemand für andere angelegt hat.
 *
 * Gegenproben jeweils daneben: selbst gebucht, innerhalb der Grenzen,
 * erwachsen, ohne Geburtsdatum, ab dem 18. Geburtstag, und das Büro selbst.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { admin, betriebAnlegen, buchung, konto, type Konto } from './helfer';

const BETRIEB = 'jugendschutz-m2';
const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

let chefin: Konto;
let buero: Konto;
let lena: Konto;
let anna: Konto;
let otto: Konto;
let db: Client;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'jsgf');
  buero = await konto(BETRIEB, 'Buchhaltung', 'jsbuero');
  lena = await konto(BETRIEB, 'Mitarbeiter', 'jslena');
  anna = await konto(BETRIEB, 'Mitarbeiter', 'jsanna');
  otto = await konto(BETRIEB, 'Mitarbeiter', 'jsotto');
  // Lena ist Lehrling und unter 18 (bis 14.03.2028), Anna erwachsen, Otto ohne Geburtsdatum.
  const lehre = await admin.from('users')
    .update({ einstufung: 'lehrling', lehrbeginn: '2025-09-01', lehrzeit_monate: 36 }).eq('id', lena.uid);
  if (lehre.error) throw new Error(lehre.error.message);
  const geb = await admin.from('geburtsdaten').insert([
    { user_id: lena.uid, company_id: BETRIEB, geburtsdatum: '2010-03-15' },
    { user_id: anna.uid, company_id: BETRIEB, geburtsdatum: '1990-01-01' },
  ]);
  if (geb.error) throw new Error(geb.error.message);
  db = new Client({ connectionString: DB });
  await db.connect();
}, 120_000);

afterAll(async () => {
  await db?.end();
});

async function zeile(id: string) {
  const { data, error } = await admin.from('time_entries')
    .select('id, angelegt_von, comment, updated_at, unterricht_min').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; angelegt_von: string | null; comment: string | null; updated_at: string; unterricht_min: number | null } | null;
}

/** Das Büro bucht für jemanden — wie die Mitarbeiterübersicht, mit Vermerk. */
async function vomBuero(fuer: Konto, datum: string, von: string, bis: string, pause = 0): Promise<string> {
  const z = buchung(fuer, datum, {
    start_time: von, end_time: bis, break_duration: pause,
    last_edited_by: 'Brigitte Büro', last_edited_by_uid: buero.uid,
  });
  const { error } = await buero.client.from('time_entries').insert(z);
  if (error) throw new Error(error.message);
  return z.id;
}

async function selbst(k: Konto, datum: string, von: string, bis: string, pause = 0): Promise<string> {
  const z = buchung(k, datum, { start_time: von, end_time: bis, break_duration: pause });
  const { error } = await k.client.from('time_entries').insert(z);
  if (error) throw new Error(error.message);
  return z.id;
}

const aendern = (k: Konto, id: string) =>
  k.client.from('time_entries').update({ comment: 'geändert' }).eq('id', id);
const loeschen = (k: Konto, id: string) =>
  k.client.from('time_entries').delete().eq('id', id);

describe('1 — wer angelegt hat, setzt die Datenbank', () => {
  it('der Lehrling bucht selbst: er ist der Anleger, was immer die App schickt', async () => {
    const z = buchung(lena, '2027-03-01', { angelegt_von: buero.uid });
    expect((await lena.client.from('time_entries').insert(z)).error).toBeNull();
    expect((await zeile(z.id))!.angelegt_von).toBe(lena.uid);
  });

  it('das Büro bucht für den Lehrling: Anleger ist das Büro, auch nach einer Änderung durch ihn', async () => {
    const id = await vomBuero(lena, '2027-03-02', '07:00', '15:00', 30);
    expect((await zeile(id))!.angelegt_von).toBe(buero.uid);
    const umschreiben = await lena.client.from('time_entries')
      .update({ comment: 'selbst', angelegt_von: lena.uid }).eq('id', id);
    expect(umschreiben.error).toBeNull();
    expect(await zeile(id)).toMatchObject({ angelegt_von: buero.uid, comment: 'selbst' });
  });
});

describe('2 — vom Büro gebucht, über der Grenze: nur das Büro', () => {
  it('Tag über 8 Std.: der Lehrling ändert und löscht nicht', async () => {
    const id = await vomBuero(lena, '2027-03-03', '07:00', '17:00', 30);
    const a = await aendern(lena, id);
    expect(a.error?.code).toBe('42501');
    expect(a.error?.message).toMatch(/über der Grenze für Jugendliche \(mehr als 8 Std\.\)\. Ändern oder löschen kann sie nur das Büro/);
    const l = await loeschen(lena, id);
    expect(l.error?.code).toBe('42501');
    expect(await zeile(id)).toMatchObject({ comment: null });
  });

  it('Nachtruhe 20 bis 6 Uhr: ebenso', async () => {
    const id = await vomBuero(lena, '2027-03-04', '05:00', '09:00');
    const a = await aendern(lena, id);
    expect(a.error?.message).toMatch(/Nachtruhe für Jugendliche \(20 bis 6 Uhr\)/);
    expect((await loeschen(lena, id)).error?.code).toBe('42501');
    expect(await zeile(id)).not.toBeNull();
  });

  it('es zählt die Summe des Tages — die eigene Buchung daneben bleibt frei', async () => {
    const buerozeit = await vomBuero(lena, '2027-03-05', '07:00', '12:00');
    // Fünf Stunden am Vormittag: noch frei.
    expect((await aendern(lena, buerozeit)).error).toBeNull();
    const eigene = await selbst(lena, '2027-03-05', '12:30', '17:00');
    // Mit der eigenen Buchung neuneinhalb Stunden: die des Büros ist jetzt beim Büro.
    expect((await aendern(lena, buerozeit)).error?.code).toBe('42501');
    expect((await aendern(lena, eigene)).error).toBeNull();
  });

  it('das Büro ändert und löscht weiter', async () => {
    const id = await vomBuero(lena, '2027-03-10', '07:00', '17:00', 30);
    expect((await aendern(buero, id)).error).toBeNull();
    expect((await loeschen(buero, id)).error).toBeNull();
    expect(await zeile(id)).toBeNull();
  });

  it('Gegenprobe: innerhalb der Grenzen ändert und löscht der Lehrling', async () => {
    const id = await vomBuero(lena, '2027-03-08', '07:00', '15:00', 30);
    expect((await aendern(lena, id)).error).toBeNull();
    expect((await loeschen(lena, id)).error).toBeNull();
    expect(await zeile(id)).toBeNull();
  });

  it('Gegenprobe: selbst gebucht über der Grenze — bleibt seine', async () => {
    const id = await selbst(lena, '2027-03-09', '05:00', '16:00');
    expect((await aendern(lena, id)).error).toBeNull();
    expect((await loeschen(lena, id)).error).toBeNull();
  });

  it('Gegenprobe: erwachsen und ohne Geburtsdatum — nicht gesperrt', async () => {
    const fuerAnna = await vomBuero(anna, '2027-03-03', '05:00', '17:00');
    expect((await aendern(anna, fuerAnna)).error).toBeNull();
    const fuerOtto = await vomBuero(otto, '2027-03-03', '05:00', '17:00');
    expect((await aendern(otto, fuerOtto)).error).toBeNull();
    expect((await loeschen(otto, fuerOtto)).error).toBeNull();
  });

  it('ab dem 18. Geburtstag nicht mehr — am Tag davor schon', async () => {
    const amGeburtstag = await vomBuero(lena, '2028-03-15', '07:00', '17:00');
    expect((await aendern(lena, amGeburtstag)).error).toBeNull();
    const davor = await vomBuero(lena, '2028-03-14', '07:00', '17:00');
    expect((await aendern(lena, davor)).error?.code).toBe('42501');
  });
});

/*
  DER BESTAND, WIE ER BEIM EINSPIELEN LIEGT. Angelegt am Dienstschlüssel
  vorbei (wie vor der Migration: ohne Anleger), dann nachgetragen mit
  derselben Funktion wie beim Einspielen.
*/
describe('3 — der Anleger im Bestand', () => {
  it('wird nachgetragen, wo er eindeutig ist — ohne die Buchung anzufassen', async () => {
    const eindeutig = buchung(lena, '2027-04-05', { last_edited_by_uid: buero.uid });
    const spaeterGeaendert = buchung(lena, '2027-04-06', { last_edited_by_uid: buero.uid, updated_at: '2027-01-01T08:00:00Z' });
    const vonIhrSelbst = buchung(lena, '2027-04-07', { last_edited_by_uid: lena.uid });
    const ohneVermerk = buchung(lena, '2027-04-08');
    // Einzeln: in einem Zug füllte die Schnittstelle fehlende Spalten mit null statt mit dem Vorgabewert.
    for (const z of [eindeutig, spaeterGeaendert, vonIhrSelbst, ohneVermerk]) {
      const { error } = await admin.from('time_entries').insert(z);
      expect(error).toBeNull();
      expect((await zeile(z.id))!.angelegt_von).toBeNull();
    }
    const vorher = (await zeile(eindeutig.id))!.updated_at;

    const { rows: [{ n }] } = await db.query<{ n: number }>('select app.angelegt_von_nachtragen() as n');
    expect(n).toBeGreaterThanOrEqual(1);

    expect(await zeile(eindeutig.id)).toMatchObject({ angelegt_von: buero.uid, updated_at: vorher });
    expect((await zeile(spaeterGeaendert.id))!.angelegt_von).toBeNull();
    expect((await zeile(vonIhrSelbst.id))!.angelegt_von).toBeNull();
    expect((await zeile(ohneVermerk.id))!.angelegt_von).toBeNull();
  });

  it('die Prüfungen an den Buchungen laufen danach wieder', async () => {
    const { rows } = await db.query<{ tgenabled: string }>(
      `select tgenabled from pg_trigger
        where tgrelid = 'public.time_entries'::regclass and not tgisinternal`,
    );
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.every((r) => r.tgenabled === 'O')).toBe(true);
  });
});

describe('4 — Berufsschule mit Unterrichtszeit (M1)', () => {
  it('das Büro trägt die Unterrichtszeit je Schultag mit ein', async () => {
    const { error } = await buero.client.rpc('berufsschule_eintragen', {
      p_user: lena.uid, p_von: '2027-05-03', p_bis: '2027-05-04', p_notiz: null, p_unterricht_min: 420,
    });
    expect(error).toBeNull();
    const { data } = await admin.from('time_entries').select('date, unterricht_min')
      .eq('user_id', lena.uid).eq('status', 'Berufsschule').in('date', ['2027-05-03', '2027-05-04']).order('date');
    expect(data).toEqual([{ date: '2027-05-03', unterricht_min: 420 }, { date: '2027-05-04', unterricht_min: 420 }]);
  });

  it('bleibt gleich: ohne Unterrichtszeit (wie eine ältere App ruft) bleibt sie leer', async () => {
    const { error } = await buero.client.rpc('berufsschule_eintragen', {
      p_user: lena.uid, p_von: '2027-05-05', p_bis: '2027-05-05', p_notiz: null,
    });
    expect(error).toBeNull();
    const { data } = await admin.from('time_entries').select('unterricht_min')
      .eq('user_id', lena.uid).eq('date', '2027-05-05').single();
    expect(data).toEqual({ unterricht_min: null });
  });

  it('Gegenprobe: keine Unterrichtszeit von null Minuten, keine an einem Arbeitstag', async () => {
    const null_ = await buero.client.rpc('berufsschule_eintragen', {
      p_user: lena.uid, p_von: '2027-05-06', p_bis: '2027-05-06', p_notiz: null, p_unterricht_min: 0,
    });
    expect(null_.error?.message).toMatch(/Unterrichtszeit/);
    const arbeit = buchung(anna, '2027-05-06', { unterricht_min: 60 });
    const { error } = await admin.from('time_entries').insert(arbeit);
    expect(error?.message).toMatch(/time_entries_unterricht/);
  });
});

describe('5 — Datenauskunft', () => {
  it('zählt beim Büro, was es für andere angelegt hat', async () => {
    const { data, error } = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: buero.uid });
    expect(error).toBeNull();
    expect((data as { als_bearbeiter: Record<string, number> }).als_bearbeiter.zeitbuchungen_angelegt)
      .toBeGreaterThanOrEqual(5);
  });
});
