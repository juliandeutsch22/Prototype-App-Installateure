/**
 * REAKTIONEN AUF NACHRICHTEN (E77) — gegen die echte Datenbank.
 *
 * Festgehalten wird:
 * - sechs feste Zeichen; je Person mehrere, je Zeichen eine; zweimal ist
 *   kein Fehler; zurücknehmen nimmt nur die eigene;
 * - der Verlauf zählt je Zeichen, markiert die eigene und nennt, wer — die
 *   eigene Person zuerst, in fester Reihenfolge der Zeichen;
 * - VERTRAULICHKEIT wie bei den Nachrichten: wer das Gespräch nicht lesen
 *   darf (Führung im privaten Gespräch, ein fremder Monteur am Thread, ein
 *   fremder Betrieb, der Support mit Einblick), reagiert nicht und liest
 *   nichts; kein Konto liest oder schreibt die Tabelle direkt;
 * - in der Runde erst ab dem Beitritt;
 * - gelöscht ist gelöscht: die Reaktionen gehen mit, neue gibt es nicht;
 * - Modul aus: nichts Neues, zurücknehmen bleibt;
 * - Live: die Teilnahme bekommt `reaktion_am`; Zahl der Ungelesenen und
 *   Reihenfolge im Postfach bleiben;
 * - Datenauskunft nur als Anzahl, Selbstexport mit Inhalt, Auszug ohne
 *   private Reaktionen, Löschung einer Person nimmt ihre mit.
 *
 * Gegenprobe: ohne `20261111100000_nachrichten_reaktionen.sql` gibt es
 * weder Tabelle noch Funktion — jede Prüfung hier ist rot.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import {
  admin, betriebAnlegen, deaktivieren, einblickBeginnen, konto, plattformkonto, type Konto,
} from './helfer';

const VERBINDUNG = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const A = 'reaktionen-a';
const B = 'reaktionen-b';

let db: Client;
let chefin: Konto;
let pl: Konto;
let monteur: Konto;
let kollege: Konto;
let dritter: Konto;
let fremd: Konto;
let support: Konto;
let projekt = '';

type Zeile = Record<string, unknown>;
interface Reaktion { zeichen: string; anzahl: number; meine: boolean; personen: { uid: string; name: string }[] }

async function rpc<T = unknown>(wer: Konto, f: string, p: Zeile = {}): Promise<T> {
  const { data, error } = await wer.client.rpc(f, p);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data as T;
}
async function fehler(wer: Konto, f: string, p: Zeile = {}): Promise<{ code?: string; message: string }> {
  const { error } = await wer.client.rpc(f, p);
  expect(error, `${f} hätte abgewiesen werden müssen`).not.toBeNull();
  return error!;
}
async function senden(wer: Konto, kanal: string, text: string): Promise<string> {
  const id = crypto.randomUUID();
  await rpc(wer, 'nachricht_senden', { p_id: id, p_kanal: kanal, p_text: text });
  return id;
}
const reagieren = (wer: Konto, nachricht: string, zeichen: string, an = true) =>
  rpc(wer, 'nachricht_reagieren', { p_nachricht: nachricht, p_zeichen: zeichen, p_an: an });
async function reaktionen(wer: Konto, kanal: string, nachricht: string): Promise<Reaktion[]> {
  const verlauf = await rpc<Zeile[]>(wer, 'nachrichten_verlauf', { p_kanal: kanal });
  return (verlauf.find((z) => z.id === nachricht)?.reaktionen ?? []) as Reaktion[];
}
async function module(betrieb: string, festlegung: Zeile) {
  expect((await admin.from('companies').update({ modules: festlegung }).eq('id', betrieb)).error).toBeNull();
}

beforeAll(async () => {
  db = new Client({ connectionString: VERBINDUNG });
  await db.connect();
  await betriebAnlegen(A, 'Reaktionen GmbH');
  await betriebAnlegen(B, 'Fremd GmbH');
  await module(A, { 'nachrichten.direktnachrichten': true });
  [chefin, pl, monteur, kollege, dritter, fremd] = await Promise.all([
    konto(A, 'Geschäftsführung', 're-chefin'),
    konto(A, 'Projektleiter', 're-pl'),
    konto(A, 'Mitarbeiter', 're-monteur'),
    konto(A, 'Mitarbeiter', 're-kollege'),
    konto(A, 'Mitarbeiter', 're-dritter'),
    konto(B, 'Geschäftsführung', 're-fremd'),
  ]);
  support = await plattformkonto('re-support');
  const { data, error } = await admin.from('projects').insert({
    company_id: A, project_number: `R-${crypto.randomUUID().slice(0, 6)}`, customer_name: 'Familie Huber',
    status: 'Aktiv', assigned_employees: [monteur.uid], project_managers: [pl.uid],
  }).select('id').single();
  if (error) throw new Error(error.message);
  projekt = data!.id as string;
}, 120_000);

afterAll(async () => {
  await admin.from('support_zugriffe').delete().eq('company_id', A);
  await admin.from('support_freigaben').delete().eq('company_id', A);
  await db?.end();
});

describe('Reagieren im Direktgespräch', () => {
  let kanal = '';
  let n = '';
  beforeAll(async () => {
    kanal = await rpc<string>(monteur, 'nachrichten_kanal_direkt', { p_mit: kollege.uid });
    n = await senden(monteur, kanal, 'Bin um halb zwei dort');
  });

  it('mehrere Zeichen je Person, je Zeichen eins; zweimal ist kein Fehler', async () => {
    await reagieren(kollege, n, '👍');
    await reagieren(kollege, n, '👍');
    await reagieren(kollege, n, '🙏');
    await reagieren(monteur, n, '👍');
    const { rows } = await db.query('select count(*)::int as n from public.nachricht_reaktionen where nachricht_id = $1', [n]);
    expect(rows[0].n).toBe(3);
  });

  it('der Verlauf zählt je Zeichen in fester Reihenfolge, markiert die eigene, nennt die eigene Person zuerst', async () => {
    const sicht = await reaktionen(kollege, kanal, n);
    expect(sicht.map((r) => [r.zeichen, r.anzahl, r.meine])).toEqual([['👍', 2, true], ['🙏', 1, true]]);
    expect(sicht[0].personen.map((p) => p.uid)).toEqual([kollege.uid, monteur.uid]);
    const andere = await reaktionen(monteur, kanal, n);
    expect(andere[0].personen[0].uid).toBe(monteur.uid);
    expect(andere.find((r) => r.zeichen === '🙏')!.meine).toBe(false);
  });

  it('zurücknehmen nimmt nur die eigene', async () => {
    await reagieren(kollege, n, '👍', false);
    const sicht = await reaktionen(monteur, kanal, n);
    expect(sicht.map((r) => [r.zeichen, r.anzahl])).toEqual([['👍', 1], ['🙏', 1]]);
    expect(sicht[0].personen.map((p) => p.uid)).toEqual([monteur.uid]);
  });

  it('nur die sechs festen Zeichen', async () => {
    for (const z of ['🎉', 'x', '', '👍👍']) {
      expect((await fehler(kollege, 'nachricht_reagieren', { p_nachricht: n, p_zeichen: z, p_an: true })).code, z).toBe('22023');
    }
    expect((await fehler(kollege, 'nachricht_reagieren', { p_nachricht: n, p_zeichen: null, p_an: true })).code).toBe('22023');
  });

  it('Live: die Teilnahme bekommt die Zeitmarke, Ungelesene und Postfach-Reihenfolge bleiben', async () => {
    const vorher = await db.query('select user_id, ungelesen, zuletzt, reaktion_am from public.nachrichten_teilnehmer where kanal_id = $1 order by user_id', [kanal]);
    await reagieren(kollege, n, '😮');
    const nachher = await db.query('select user_id, ungelesen, zuletzt, reaktion_am from public.nachrichten_teilnehmer where kanal_id = $1 order by user_id', [kanal]);
    for (let i = 0; i < vorher.rows.length; i++) {
      expect(nachher.rows[i].ungelesen).toBe(vorher.rows[i].ungelesen);
      expect(nachher.rows[i].zuletzt).toEqual(vorher.rows[i].zuletzt);
      expect(new Date(nachher.rows[i].reaktion_am).getTime()).toBeGreaterThan(new Date(vorher.rows[i].reaktion_am ?? 0).getTime());
    }
    // Gegenprobe: zweimal dasselbe ändert nichts — kein Ereignis ohne Änderung.
    const stand = (await db.query('select reaktion_am from public.nachrichten_teilnehmer where kanal_id = $1 order by user_id', [kanal])).rows;
    await reagieren(kollege, n, '😮');
    expect((await db.query('select reaktion_am from public.nachrichten_teilnehmer where kanal_id = $1 order by user_id', [kanal])).rows).toEqual(stand);
  });

  it('VERTRAULICH: Führung, ein Kollege außerhalb, ein fremder Betrieb reagieren nicht und lesen nichts', async () => {
    for (const wer of [chefin, dritter, fremd]) {
      expect((await fehler(wer, 'nachricht_reagieren', { p_nachricht: n, p_zeichen: '👍', p_an: true })).code).toBe('42501');
      expect((await fehler(wer, 'nachrichten_verlauf', { p_kanal: kanal })).code).toBe('42501');
    }
  });

  it('kein Konto liest oder schreibt die Tabelle direkt', async () => {
    const lesen = await kollege.client.from('nachricht_reaktionen').select('*').eq('nachricht_id', n);
    expect(lesen.error ?? (lesen.data ?? []).length === 0).toBeTruthy();
    const schreiben = await kollege.client.from('nachricht_reaktionen').insert({
      nachricht_id: n, user_id: kollege.uid, zeichen: '❤️', kanal_id: kanal, company_id: A,
    });
    expect(schreiben.error).not.toBeNull();
    const weg = await kollege.client.from('nachricht_reaktionen').delete({ count: 'exact' }).eq('nachricht_id', n);
    expect(weg.error ?? weg.count === 0).toBeTruthy();
  });

  it('der Support mit Einblick reagiert nicht', async () => {
    const { data: freigabe, error } = await chefin.client.from('support_freigaben').insert({
      company_id: A, gewaehrt_von: chefin.uid, grund: 'Reaktionen prüfen', stufe: 'mitarbeiten',
      gilt_bis: new Date(Date.now() + 3_600_000).toISOString(),
    }).select('id').single();
    if (error) throw new Error(error.message);
    await einblickBeginnen(support, A, freigabe!.id);
    expect((await fehler(support, 'nachricht_reagieren', { p_nachricht: n, p_zeichen: '👍', p_an: true })).code).toBe('42501');
  });
});

describe('Baustellen-Thread und Runde', () => {
  it('am Thread reagiert, wer die Baustelle sieht — ein fremder Monteur nicht', async () => {
    const thread = await rpc<string>(monteur, 'nachrichten_kanal_baustelle', { p_projekt: projekt });
    const n = await senden(monteur, thread, 'Steigleitung gedrückt');
    await reagieren(pl, n, '👍');
    await reagieren(chefin, n, '❤️');
    expect((await fehler(kollege, 'nachricht_reagieren', { p_nachricht: n, p_zeichen: '👍', p_an: true })).code).toBe('42501');
    expect((await reaktionen(monteur, thread, n)).map((r) => r.zeichen)).toEqual(['👍', '❤️']);
  });

  it('in der Runde erst ab dem Beitritt', async () => {
    const runde = await rpc<string>(monteur, 'nachrichten_kanal_runde', { p_name: 'Bad Huber', p_teilnehmer: [kollege.uid] });
    const alt = await senden(monteur, runde, 'vor dem Beitritt');
    await rpc(monteur, 'nachrichten_hinzufuegen', { p_kanal: runde, p_personen: [dritter.uid] });
    const neu = await senden(monteur, runde, 'nach dem Beitritt');
    expect((await fehler(dritter, 'nachricht_reagieren', { p_nachricht: alt, p_zeichen: '👍', p_an: true })).code).toBe('42501');
    await reagieren(dritter, neu, '👍');
    expect((await reaktionen(kollege, runde, neu))[0]).toMatchObject({ zeichen: '👍', anzahl: 1, meine: false });
  });
});

describe('Gelöscht ist gelöscht', () => {
  it('mit der Nachricht gehen ihre Reaktionen; neue gibt es nicht', async () => {
    const kanal = await rpc<string>(monteur, 'nachrichten_kanal_direkt', { p_mit: kollege.uid });
    const n = await senden(monteur, kanal, 'gleich weg');
    await reagieren(kollege, n, '😆');
    await rpc(monteur, 'nachricht_loeschen', { p_id: n });
    const { rows } = await db.query('select count(*)::int as n from public.nachricht_reaktionen where nachricht_id = $1', [n]);
    expect(rows[0].n).toBe(0);
    expect(await reaktionen(kollege, kanal, n)).toEqual([]);
    expect((await fehler(kollege, 'nachricht_reagieren', { p_nachricht: n, p_zeichen: '👍', p_an: true })).code).toBe('55000');
  });

  it('Gegenprobe: eine bearbeitete Nachricht behält ihre Reaktionen', async () => {
    const kanal = await rpc<string>(monteur, 'nachrichten_kanal_direkt', { p_mit: kollege.uid });
    const n = await senden(monteur, kanal, 'Tippfehlr');
    await reagieren(kollege, n, '😆');
    await rpc(monteur, 'nachricht_bearbeiten', { p_id: n, p_text: 'Tippfehler' });
    expect((await reaktionen(kollege, kanal, n)).map((r) => r.zeichen)).toEqual(['😆']);
  });
});

describe('Modul aus', () => {
  it('Direktnachrichten aus: nichts Neues, zurücknehmen bleibt', async () => {
    const kanal = await rpc<string>(monteur, 'nachrichten_kanal_direkt', { p_mit: kollege.uid });
    const n = await senden(monteur, kanal, 'vor dem Ausschalten');
    await reagieren(kollege, n, '👍');
    await module(A, { 'nachrichten.direktnachrichten': false });
    try {
      expect((await fehler(kollege, 'nachricht_reagieren', { p_nachricht: n, p_zeichen: '❤️', p_an: true })).code).toBe('55000');
      await reagieren(kollege, n, '👍', false);
      expect(await reaktionen(kollege, kanal, n)).toEqual([]);
    } finally {
      await module(A, { 'nachrichten.direktnachrichten': true });
    }
  });
});

describe('Personenbezug', () => {
  let privat = '';
  let offen = '';
  beforeAll(async () => {
    const kanal = await rpc<string>(monteur, 'nachrichten_kanal_direkt', { p_mit: kollege.uid });
    privat = await senden(kollege, kanal, 'privat');
    await reagieren(monteur, privat, '🙏');
    const thread = await rpc<string>(monteur, 'nachrichten_kanal_baustelle', { p_projekt: projekt });
    offen = await senden(pl, thread, 'offen');
    await reagieren(monteur, offen, '👍');
  });

  it('die Datenauskunft der Führung nennt nur die Anzahl', async () => {
    const auskunft = await rpc<Zeile>(chefin, 'person_auskunft', { p_art: 'mitarbeiter', p_id: monteur.uid });
    const r = (auskunft.daten as Zeile).nachricht_reaktionen as Zeile;
    expect(Number(r.gesetzt)).toBeGreaterThanOrEqual(2);
    expect(String(r.hinweis)).toContain('Meine Nachrichten exportieren');
    const text = JSON.stringify(r);
    expect(text).not.toContain('🙏');
    expect(text).not.toContain(privat);
  });

  it('der Selbstexport nennt die Reaktionen mit Zeichen und Person', async () => {
    const export_ = JSON.stringify(await rpc(kollege, 'nachrichten_selbstexport'));
    expect(export_).toContain('"zeichen":"🙏"');
  });

  it('der Auszug nimmt die Reaktionen am Thread mit, die privaten nicht', async () => {
    const { data, error } = await chefin.client.rpc('betrieb_auszug');
    expect(error).toBeNull();
    const zeilen = ((data as { data: Record<string, Zeile[]> }).data.nachricht_reaktionen ?? []);
    expect(zeilen.some((z) => z.nachricht_id === offen)).toBe(true);
    expect(zeilen.some((z) => z.nachricht_id === privat)).toBe(false);
    expect(zeilen.filter((z) => z.privat === true)).toEqual([]);
  });

  it('die Löschung einer Person nimmt ihre Reaktionen mit', async () => {
    const geht = await konto(A, 'Mitarbeiter', 're-geht');
    const kanal = await rpc<string>(monteur, 'nachrichten_kanal_direkt', { p_mit: geht.uid });
    const n = await senden(monteur, kanal, 'Servus');
    await reagieren(geht, n, '❤️');
    await deaktivieren(geht.uid);
    const pruefung = await rpc<Zeile>(chefin, 'person_loeschen', { p_art: 'mitarbeiter', p_id: geht.uid, p_nur_pruefen: true });
    expect(Number((pruefung.sofort as Zeile).nachricht_reaktionen)).toBe(1);
    await rpc(chefin, 'person_loeschen', { p_art: 'mitarbeiter', p_id: geht.uid, p_nur_pruefen: false });
    const { rows } = await db.query('select count(*)::int as n from public.nachricht_reaktionen where user_id = $1', [geht.uid]);
    expect(rows[0].n).toBe(0);
  });
});
