/**
 * NACHRICHTEN (M10/B09, E64) — gegen die echte Datenbank.
 *
 * Festgehalten wird:
 * - Direktgespräch: von beiden Seiten dasselbe; mit sich selbst, mit einem
 *   deaktivierten oder fremden Konto abgewiesen;
 * - Senden ist idempotent: dieselbe Kennung mit demselben Inhalt
 *   „angekommen“, mit anderem ein Konflikt; eine Zeile;
 * - VERTRAULICHKEIT: Geschäftsführung, Administration, Buchhaltung,
 *   Projektleitung, Verwaltung, ein Kollege, der Support mit Einblick
 *   „mitarbeiten“ und ein fremder Betrieb lesen von einem privaten Gespräch
 *   nichts — keine Tabelle, keine Funktion, keine Datei, kein Melden;
 *   Gegenprobe: die beiden Teilnehmer lesen es;
 * - kein Konto schreibt direkt in die Tabellen;
 * - Anhänge: nur in den Eimer der Art, nur unter dem eigenen Pfad, nicht
 *   über einen gesendeten; Löschen löscht Text und Datei (über die Edge
 *   Function);
 * - Bearbeiten und Löschen nur der eigenen Nachricht;
 * - Runde: später Hinzugekommene lesen ab dem Beitritt; wer geht, liest
 *   nichts mehr; wer als Letzter geht, nimmt die Runde mit;
 * - Baustellen-Thread: liest, wer die Baustelle sieht; Team und Leitung
 *   folgen, Erwähnte auch; ein fremder Monteur liest nichts;
 * - Push: genau einmal je Nachricht, ohne Absender, ohne Stumme (außer
 *   erwähnt), den Text nur mit gewählter Vorschau;
 * - Melden: die Führung liest genau die Kopie, nicht das Gespräch; die
 *   Datei bleibt, solange die Meldung besteht;
 * - die eigene Zahl im Menü; das Live-Ereignis nur an den Betroffenen;
 * - Datenauskunft ohne Inhalt, Auszug und Sicherung ohne private Zeilen,
 *   Löschung einer Person (D2), Aufbewahrung (D3), Selbstexport;
 * - Modul aus bzw. Direktnachrichten aus: nichts Neues, Lesen und Löschen
 *   bleiben.
 *
 * Gegenprobe: ohne `20261108400000_nachrichten.sql` gibt es weder Tabellen
 * noch Funktionen — jede Prüfung hier ist rot.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  admin, API, SERVICE, betriebAnlegen, deaktivieren, einblickBeginnen, konto, plattformkonto, type Konto,
} from './helfer';

const VERBINDUNG = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const A = 'nachrichten-a';
const B = 'nachrichten-b';
const TABELLEN = ['nachrichten_kanaele', 'nachrichten_teilnehmer', 'nachrichten', 'nachricht_anhaenge', 'nachricht_meldungen'];

let db: Client;
let chefin: Konto;
let administration: Konto;
let buch: Konto;
let pl: Konto;
let verwaltung: Konto;
let monteur: Konto;
let kollege: Konto;
let dritter: Konto;
let fremd: Konto;
let support: Konto;
let projekt = '';

type Zeile = Record<string, unknown>;
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
const senden = (wer: Konto, kanal: string, text: string, x: Zeile = {}) =>
  rpc<{ id: string; neu: boolean }>(wer, 'nachricht_senden', { p_id: crypto.randomUUID(), p_kanal: kanal, p_text: text, ...x });

async function hochladen(wer: Konto, eimer: string, kanal: string, nachricht: string, anhang: string, inhalt = 'Bild') {
  return wer.client.storage.from(eimer).upload(
    `nachrichten/${wer.betrieb}/${kanal}/${nachricht}/${anhang}`,
    new Blob([inhalt], { type: 'image/png' }), { contentType: 'image/png', upsert: true });
}

async function module(betrieb: string, festlegung: Zeile) {
  expect((await admin.from('companies').update({ modules: festlegung }).eq('id', betrieb)).error).toBeNull();
}

async function aufraeumenLassen(): Promise<number> {
  const r = await fetch(`${API}/functions/v1/nachrichten-aufraeumen`, {
    method: 'POST', headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE, 'Content-Type': 'application/json' }, body: '{}',
  });
  const d = await r.json() as { entfernt?: number; error?: string };
  expect(r.status, d.error).toBe(200);
  return d.entfernt ?? 0;
}

async function objektDa(eimer: string, pfad: string): Promise<boolean> {
  const { rows } = await db.query('select 1 from storage.objects where bucket_id = $1 and name = $2', [eimer, pfad]);
  return rows.length > 0;
}

beforeAll(async () => {
  db = new Client({ connectionString: VERBINDUNG });
  await db.connect();
  await betriebAnlegen(A, 'Nachrichten GmbH');
  await betriebAnlegen(B, 'Fremd GmbH');
  await module(A, { 'nachrichten.direktnachrichten': true });
  await module(B, {});
  [chefin, administration, buch, pl, verwaltung, monteur, kollege, dritter, fremd] = await Promise.all([
    konto(A, 'Geschäftsführung', 'na-chefin'),
    konto(A, 'Administrator', 'na-admin'),
    konto(A, 'Buchhaltung', 'na-buch'),
    konto(A, 'Projektleiter', 'na-pl'),
    konto(A, 'Verwaltung', 'na-verwaltung'),
    konto(A, 'Mitarbeiter', 'na-monteur'),
    konto(A, 'Mitarbeiter', 'na-kollege'),
    konto(A, 'Mitarbeiter', 'na-dritter'),
    konto(B, 'Geschäftsführung', 'na-fremd'),
  ]);
  support = await plattformkonto('na-support');
  const { data, error } = await admin.from('projects').insert({
    company_id: A, project_number: `N-${crypto.randomUUID().slice(0, 6)}`, customer_name: 'Familie Huber',
    status: 'Aktiv', assigned_employees: [monteur.uid], project_managers: [pl.uid],
  }).select('id').single();
  if (error) throw new Error(error.message);
  projekt = data!.id as string;
}, 120_000);

afterAll(async () => {
  await db?.end();
});

describe('Direktgespräch', () => {
  it('ist von beiden Seiten dasselbe', async () => {
    const hin = await rpc<string>(monteur, 'nachrichten_kanal_direkt', { p_mit: kollege.uid });
    const her = await rpc<string>(kollege, 'nachrichten_kanal_direkt', { p_mit: monteur.uid });
    expect(her).toBe(hin);
  });

  it('nicht mit sich selbst, nicht mit einem fremden Konto', async () => {
    expect((await fehler(monteur, 'nachrichten_kanal_direkt', { p_mit: monteur.uid })).code).toBe('22023');
    expect((await fehler(monteur, 'nachrichten_kanal_direkt', { p_mit: fremd.uid })).code).toBe('P0002');
  });
});

describe('Senden', () => {
  it('ist idempotent — dieselbe Kennung, derselbe Inhalt: angekommen; anderer Inhalt: Konflikt', async () => {
    const kanal = await rpc<string>(monteur, 'nachrichten_kanal_direkt', { p_mit: kollege.uid });
    const id = crypto.randomUUID();
    const erst = await rpc<{ neu: boolean }>(monteur, 'nachricht_senden', { p_id: id, p_kanal: kanal, p_text: 'Bin um 7 dort' });
    const zweit = await rpc<{ neu: boolean }>(monteur, 'nachricht_senden', { p_id: id, p_kanal: kanal, p_text: 'Bin um 7 dort' });
    expect([erst.neu, zweit.neu]).toEqual([true, false]);
    expect((await fehler(monteur, 'nachricht_senden', { p_id: id, p_kanal: kanal, p_text: 'Anders' })).code).toBe('23505');
    expect((await fehler(kollege, 'nachricht_senden', { p_id: id, p_kanal: kanal, p_text: 'Bin um 7 dort' })).code).toBe('23505');
    const { rows } = await db.query('select count(*)::int as n from public.nachrichten where id = $1', [id]);
    expect(rows[0].n).toBe(1);
  });

  it('ohne Text und ohne Anhang nicht; über 20 000 Zeichen nicht', async () => {
    const kanal = await rpc<string>(monteur, 'nachrichten_kanal_direkt', { p_mit: kollege.uid });
    expect((await fehler(monteur, 'nachricht_senden', { p_id: crypto.randomUUID(), p_kanal: kanal, p_text: '  \n ' })).code).toBe('22023');
    expect((await fehler(monteur, 'nachricht_senden', { p_id: crypto.randomUUID(), p_kanal: kanal, p_text: 'x'.repeat(20001) })).code).toBe('22001');
  });

  it('kein Konto schreibt direkt in die Tabellen', async () => {
    const kanal = await rpc<string>(monteur, 'nachrichten_kanal_direkt', { p_mit: kollege.uid });
    const versuch = await monteur.client.from('nachrichten').insert({
      id: crypto.randomUUID(), kanal_id: kanal, company_id: A, von_uid: monteur.uid, von_name: 'x', text: 'direkt', sende_hash: 'x',
    });
    expect(versuch.error).not.toBeNull();
    const t = await monteur.client.from('nachrichten_teilnehmer').update({ ungelesen: 99 }, { count: 'exact' }).eq('kanal_id', kanal);
    expect(t.error ?? t.count === 0).toBeTruthy();
    const k = await monteur.client.from('nachrichten_kanaele').insert({ company_id: A, art: 'runde' });
    expect(k.error).not.toBeNull();
  });
});

describe('Vertraulichkeit eines privaten Gesprächs', () => {
  let kanal = '';
  let nachricht = '';
  let anhang = '';
  const GEHEIM = `Vertraulich-${crypto.randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    kanal = await rpc<string>(monteur, 'nachrichten_kanal_direkt', { p_mit: kollege.uid });
    nachricht = crypto.randomUUID();
    anhang = crypto.randomUUID();
    const up = await hochladen(monteur, 'nachrichten-privat', kanal, nachricht, anhang);
    expect(up.error).toBeNull();
    await rpc(monteur, 'nachricht_senden', {
      p_id: nachricht, p_kanal: kanal, p_text: GEHEIM, p_anhaenge: [{ id: anhang, name: 'foto.png' }],
    });
    const { data: freigabe, error } = await chefin.client.from('support_freigaben').insert({
      company_id: A, gewaehrt_von: chefin.uid, grund: 'Nachrichten prüfen', stufe: 'mitarbeiten',
      gilt_bis: new Date(Date.now() + 3_600_000).toISOString(),
    }).select('id').single();
    if (error) throw new Error(error.message);
    await einblickBeginnen(support, A, freigabe!.id);
  }, 60_000);

  afterAll(async () => {
    await admin.from('support_zugriffe').delete().eq('company_id', A);
    await admin.from('support_freigaben').delete().eq('company_id', A);
  });

  const PFAD = () => `nachrichten/${A}/${kanal}/${nachricht}/${anhang}`;

  it('Gegenprobe: die beiden Teilnehmer lesen Text und Datei', async () => {
    for (const wer of [monteur, kollege]) {
      const verlauf = await rpc<Zeile[]>(wer, 'nachrichten_verlauf', { p_kanal: kanal });
      expect(verlauf.map((n) => n.text)).toContain(GEHEIM);
      const datei = await wer.client.storage.from('nachrichten-privat').download(PFAD());
      expect(datei.error).toBeNull();
    }
    const postfach = await rpc<Zeile[]>(kollege, 'nachrichten_postfach', {});
    expect(postfach.map((z) => z.kanal)).toContain(kanal);
  });

  it('Führung, Büro, Kollege, Support und fremder Betrieb lesen nichts davon', async () => {
    const aussen: [string, Konto][] = [
      ['Geschäftsführung', chefin], ['Administration', administration], ['Buchhaltung', buch],
      ['Projektleitung', pl], ['Verwaltung', verwaltung], ['Kollege', dritter],
      ['Support mit Einblick „mitarbeiten“', support], ['fremder Betrieb', fremd],
    ];
    for (const [lage, wer] of aussen) {
      for (const t of TABELLEN) {
        const abfrage = wer.client.from(t).select('*');
        const { data } = await (t === 'nachricht_meldungen' ? abfrage : abfrage.eq(t === 'nachrichten_kanaele' ? 'id' : 'kanal_id', kanal));
        expect((data ?? []).length, `${lage} liest ${t}`).toBe(0);
      }
      for (const [f, p] of [
        ['nachrichten_verlauf', { p_kanal: kanal }],
        ['nachrichten_kanal', { p_kanal: kanal }],
        ['nachricht_melden', { p_nachricht: nachricht, p_grund: 'x' }],
        ['nachricht_senden', { p_id: crypto.randomUUID(), p_kanal: kanal, p_text: 'mitlesen?' }],
      ] as [string, Zeile][]) {
        const { data, error } = await wer.client.rpc(f, p);
        expect(error, `${lage}: ${f}`).not.toBeNull();
        expect(JSON.stringify(data ?? '')).not.toContain(GEHEIM);
      }
      const postfach = await wer.client.rpc('nachrichten_postfach', { p_suche: GEHEIM });
      expect(JSON.stringify(postfach.data ?? [])).not.toContain(kanal);
      const datei = await wer.client.storage.from('nachrichten-privat').download(PFAD());
      expect(datei.error, `${lage} lädt die Datei`).not.toBeNull();
      const link = await wer.client.storage.from('nachrichten-privat').createSignedUrl(PFAD(), 60);
      expect(link.error, `${lage} signiert die Datei`).not.toBeNull();
    }
  });

  it('die Suche findet im eigenen Gespräch, sonst nirgends', async () => {
    const eigene = await rpc<Zeile[]>(kollege, 'nachrichten_postfach', { p_suche: GEHEIM });
    expect(eigene.map((z) => z.kanal)).toEqual([kanal]);
  });
});

describe('Anhänge', () => {
  it('nur in den Eimer der Art, nur unter dem eigenen Gespräch, nicht über einen gesendeten', async () => {
    const kanal = await rpc<string>(monteur, 'nachrichten_kanal_direkt', { p_mit: kollege.uid });
    const n = crypto.randomUUID();
    expect((await hochladen(monteur, 'nachrichten', kanal, n, crypto.randomUUID())).error, 'falscher Eimer').not.toBeNull();
    expect((await hochladen(dritter, 'nachrichten-privat', kanal, n, crypto.randomUUID())).error, 'fremdes Gespräch').not.toBeNull();
    const fremderPfad = await dritter.client.storage.from('nachrichten-privat').upload(
      `nachrichten/${B}/${kanal}/${n}/${crypto.randomUUID()}`, new Blob(['x'], { type: 'image/png' }), { contentType: 'image/png' });
    expect(fremderPfad.error, 'fremder Betrieb im Pfad').not.toBeNull();

    const a = crypto.randomUUID();
    expect((await hochladen(monteur, 'nachrichten-privat', kanal, n, a)).error).toBeNull();
    // Ein zweites Hochladen (Ausgangsfach) schreibt dieselbe Datei an dieselbe Stelle.
    expect((await hochladen(monteur, 'nachrichten-privat', kanal, n, a)).error).toBeNull();
    await rpc(monteur, 'nachricht_senden', { p_id: n, p_kanal: kanal, p_text: null, p_anhaenge: [{ id: a, name: 'plan.png' }] });
    expect((await hochladen(monteur, 'nachrichten-privat', kanal, n, a, 'überschrieben')).error, 'gesendeter Anhang').not.toBeNull();
  });

  it('ein nicht hochgeladener Anhang lässt die Nachricht nicht durch', async () => {
    const kanal = await rpc<string>(monteur, 'nachrichten_kanal_direkt', { p_mit: kollege.uid });
    const e = await fehler(monteur, 'nachricht_senden', {
      p_id: crypto.randomUUID(), p_kanal: kanal, p_text: 'mit Bild', p_anhaenge: [{ id: crypto.randomUUID(), name: 'x.png' }],
    });
    expect(e.code).toBe('23503');
  });

  it('Löschen löscht Text und Datei; eine fremde Nachricht löscht man nicht', async () => {
    const kanal = await rpc<string>(monteur, 'nachrichten_kanal_direkt', { p_mit: kollege.uid });
    const n = crypto.randomUUID();
    const a = crypto.randomUUID();
    expect((await hochladen(monteur, 'nachrichten-privat', kanal, n, a)).error).toBeNull();
    await rpc(monteur, 'nachricht_senden', { p_id: n, p_kanal: kanal, p_text: 'gleich weg', p_anhaenge: [{ id: a, name: 'x.png' }] });
    expect((await fehler(kollege, 'nachricht_loeschen', { p_id: n })).code).toBe('42501');
    await rpc(monteur, 'nachricht_loeschen', { p_id: n });
    const { rows } = await db.query('select text, geloescht_am from public.nachrichten where id = $1', [n]);
    expect(rows[0].text).toBeNull();
    expect(rows[0].geloescht_am).not.toBeNull();
    const pfad = `nachrichten/${A}/${kanal}/${n}/${a}`;
    // Ab sofort unerreichbar, auch bevor die Datei weg ist.
    expect((await kollege.client.storage.from('nachrichten-privat').download(pfad)).error).not.toBeNull();
    await aufraeumenLassen();
    expect(await objektDa('nachrichten-privat', pfad)).toBe(false);
    const verlauf = await rpc<Zeile[]>(kollege, 'nachrichten_verlauf', { p_kanal: kanal });
    expect(verlauf.find((z) => z.id === n)).toMatchObject({ text: null, anhaenge: [] });
  });

  it('Bearbeiten nur die eigene; angezeigt als bearbeitet', async () => {
    const kanal = await rpc<string>(monteur, 'nachrichten_kanal_direkt', { p_mit: kollege.uid });
    const { id } = await senden(monteur, kanal, 'Tippfeler');
    expect((await fehler(kollege, 'nachricht_bearbeiten', { p_id: id, p_text: 'fremd' })).code).toBe('42501');
    await rpc(monteur, 'nachricht_bearbeiten', { p_id: id, p_text: 'Tippfehler' });
    const verlauf = await rpc<Zeile[]>(kollege, 'nachrichten_verlauf', { p_kanal: kanal });
    const z = verlauf.find((x) => x.id === id)!;
    expect(z.text).toBe('Tippfehler');
    expect(z.bearbeitet_am).not.toBeNull();
  });
});

describe('Runde', () => {
  it('später Hinzugekommene lesen ab dem Beitritt; wer geht, liest nichts mehr; der Letzte nimmt sie mit', async () => {
    const runde = await rpc<string>(monteur, 'nachrichten_kanal_runde', { p_name: 'Bad Huber', p_teilnehmer: [kollege.uid] });
    await senden(monteur, runde, 'Vor dem Beitritt');
    await rpc(kollege, 'nachrichten_hinzufuegen', { p_kanal: runde, p_personen: [dritter.uid] });
    await senden(kollege, runde, 'Nach dem Beitritt');
    const sieht = await rpc<Zeile[]>(dritter, 'nachrichten_verlauf', { p_kanal: runde });
    expect(sieht.map((z) => z.text)).toEqual(['Nach dem Beitritt']);

    await rpc(dritter, 'nachrichten_verlassen', { p_kanal: runde });
    expect((await fehler(dritter, 'nachrichten_verlauf', { p_kanal: runde })).code).toBe('42501');
    await rpc(kollege, 'nachrichten_verlassen', { p_kanal: runde });
    await rpc(monteur, 'nachrichten_verlassen', { p_kanal: runde });
    const { rows } = await db.query('select count(*)::int as n from public.nachrichten_kanaele where id = $1', [runde]);
    expect(rows[0].n).toBe(0);
  });

  it('braucht eine weitere Person; erwähnt wird, wer drin ist', async () => {
    expect((await fehler(monteur, 'nachrichten_kanal_runde', { p_name: null, p_teilnehmer: [monteur.uid] })).code).toBe('22023');
    const runde = await rpc<string>(monteur, 'nachrichten_kanal_runde', { p_name: null, p_teilnehmer: [kollege.uid] });
    const { id } = await senden(monteur, runde, '@ alle', { p_erwaehnt: [kollege.uid, dritter.uid] });
    const { rows } = await db.query('select erwaehnt from public.nachrichten where id = $1', [id]);
    expect(rows[0].erwaehnt).toEqual([kollege.uid]);
  });
});

describe('Ein deaktiviertes Konto', () => {
  it('schließt das Direktgespräch: niemand schreibt hinein, das Bisherige bleibt lesbar', async () => {
    const weg = await konto(A, 'Mitarbeiter', 'na-weg');
    const kanal = await rpc<string>(monteur, 'nachrichten_kanal_direkt', { p_mit: weg.uid });
    await senden(weg, kanal, 'Mein letzter Tag');
    await deaktivieren(weg.uid);
    expect((await fehler(monteur, 'nachricht_senden', { p_id: crypto.randomUUID(), p_kanal: kanal, p_text: 'Hallo?' })).code).toBe('55000');
    expect((await fehler(weg, 'nachricht_senden', { p_id: crypto.randomUUID(), p_kanal: kanal, p_text: 'noch da' })).code).toBe('42501');
    const verlauf = await rpc<Zeile[]>(monteur, 'nachrichten_verlauf', { p_kanal: kanal });
    expect(verlauf.map((z) => z.text)).toContain('Mein letzter Tag');
    const kopf = await rpc<Zeile>(monteur, 'nachrichten_kanal', { p_kanal: kanal });
    expect(String(kopf.sperre)).toContain('deaktiviert');
  });
});

describe('Baustellen-Thread', () => {
  let kanal = '';

  beforeAll(async () => {
    kanal = await rpc<string>(monteur, 'nachrichten_kanal_baustelle', { p_projekt: projekt });
  });

  it('ist für jeden derselbe; liest, wer die Baustelle sieht — ein fremder Monteur nicht', async () => {
    expect(await rpc<string>(verwaltung, 'nachrichten_kanal_baustelle', { p_projekt: projekt })).toBe(kanal);
    await senden(monteur, kanal, 'Wasser ist abgedreht');
    expect((await rpc<Zeile[]>(verwaltung, 'nachrichten_verlauf', { p_kanal: kanal })).map((z) => z.text)).toContain('Wasser ist abgedreht');
    expect((await fehler(kollege, 'nachrichten_verlauf', { p_kanal: kanal })).code).toBe('42501');
    expect((await fehler(kollege, 'nachrichten_kanal_baustelle', { p_projekt: projekt })).code).toBe('42501');
    expect((await fehler(fremd, 'nachrichten_verlauf', { p_kanal: kanal })).code).toBe('42501');
  });

  it('Team und Leitung folgen, Erwähnte auch; wer nur liest, folgt nicht', async () => {
    await senden(monteur, kanal, 'Bitte Material nachliefern', { p_erwaehnt: [verwaltung.uid, kollege.uid] });
    const { rows } = await db.query<{ user_id: string; ungelesen: number }>(
      'select user_id, ungelesen from public.nachrichten_teilnehmer where kanal_id = $1 and verlassen_am is null', [kanal]);
    const wer = new Set(rows.map((r) => r.user_id));
    expect(wer.has(monteur.uid) && wer.has(pl.uid) && wer.has(verwaltung.uid)).toBe(true);
    // Ein Monteur, der die Baustelle nicht sieht, wird nicht erwähnt.
    expect(wer.has(kollege.uid)).toBe(false);
    expect(wer.has(chefin.uid)).toBe(false);
    const stand = await rpc<Zeile>(chefin, 'nachrichten_baustelle_stand', { p_projekt: projekt });
    expect(stand).toMatchObject({ kanal, folgt: false });
  });

  it('eine eigene private Nachricht lässt sich übernehmen — die private bleibt privat', async () => {
    const privat = await rpc<string>(monteur, 'nachrichten_kanal_direkt', { p_mit: kollege.uid });
    const { id: aus } = await senden(monteur, privat, 'Zählerstand 4711');
    const { id: fremdeAus } = await senden(kollege, privat, 'Von mir');
    const neu = crypto.randomUUID();
    await rpc(monteur, 'nachricht_senden', { p_id: neu, p_kanal: kanal, p_text: 'Zählerstand 4711', p_aus: aus });
    expect((await fehler(monteur, 'nachricht_senden', { p_id: crypto.randomUUID(), p_kanal: kanal, p_text: 'Von mir', p_aus: fremdeAus })).code).toBe('42501');
    const verlauf = await rpc<Zeile[]>(monteur, 'nachrichten_verlauf', { p_kanal: privat });
    expect(verlauf.find((z) => z.id === aus)!.uebernommen).toBe(true);
    const { rows } = await db.query('select privat from public.nachrichten where id = $1', [neu]);
    expect(rows[0].privat).toBe(false);
  });
});

describe('Push', () => {
  it('genau einmal; ohne Absender; Stumme nur, wenn erwähnt; Text nur mit gewählter Vorschau', async () => {
    const runde = await rpc<string>(monteur, 'nachrichten_kanal_runde', { p_name: 'Push', p_teilnehmer: [kollege.uid, dritter.uid] });
    await rpc(dritter, 'nachrichten_stumm', { p_kanal: runde, p_stumm: true });
    const { id } = await senden(monteur, runde, 'Treffpunkt Lager 6:45');
    const erst = await admin.rpc('push_nachricht', { p_nachricht: id });
    expect(erst.error).toBeNull();
    const e = erst.data as { empfaenger: { uid: string }[]; text: string | null; von: string };
    expect(e.empfaenger.map((x) => x.uid)).toEqual([kollege.uid]);
    expect(e.text).toBeNull();
    expect((await admin.rpc('push_nachricht', { p_nachricht: id })).data).toBeNull();

    await admin.from('user_prefs').upsert({ user_id: kollege.uid, company_id: A, nachricht_vorschau: true }, { onConflict: 'user_id' });
    const { id: zwei } = await senden(monteur, runde, 'Mit Vorschau', { p_erwaehnt: [dritter.uid] });
    const z = (await admin.rpc('push_nachricht', { p_nachricht: zwei })).data as { empfaenger: { uid: string; vorschau: boolean; erwaehnt: boolean }[]; text: string };
    expect(z.text).toBe('Mit Vorschau');
    expect(z.empfaenger.map((x) => x.uid).sort()).toEqual([kollege.uid, dritter.uid].sort());
    expect(z.empfaenger.find((x) => x.uid === dritter.uid)).toMatchObject({ vorschau: false, erwaehnt: true });
  });

  it('kein Konto ruft die Push-Funktion auf', async () => {
    expect((await monteur.client.rpc('push_nachricht', { p_nachricht: crypto.randomUUID() })).error).not.toBeNull();
  });
});

describe('Melden (D5)', () => {
  it('die Führung liest genau die Kopie, nicht das Gespräch; die Datei bleibt, solange die Meldung besteht', async () => {
    const kanal = await rpc<string>(monteur, 'nachrichten_kanal_direkt', { p_mit: kollege.uid });
    const n = crypto.randomUUID();
    const a = crypto.randomUUID();
    expect((await hochladen(monteur, 'nachrichten-privat', kanal, n, a)).error).toBeNull();
    await rpc(monteur, 'nachricht_senden', { p_id: n, p_kanal: kanal, p_text: 'Beleidigung', p_anhaenge: [{ id: a, name: 'x.png' }] });
    const { id: andere } = await senden(monteur, kanal, 'Nicht gemeldet');

    expect((await fehler(monteur, 'nachricht_melden', { p_nachricht: n, p_grund: 'eigene' })).code).toBe('22023');
    expect((await fehler(verwaltung, 'nachricht_meldungen', {})).code).toBe('42501');
    const meldung = await rpc<string>(kollege, 'nachricht_melden', { p_nachricht: n, p_grund: 'Nicht in Ordnung' });
    expect((await fehler(kollege, 'nachricht_melden', { p_nachricht: n, p_grund: 'nochmal' })).code).toBe('23505');

    const liste = await rpc<Zeile[]>(chefin, 'nachricht_meldungen', {});
    const m = liste.find((x) => x.id === meldung)!;
    expect(m).toMatchObject({ text_kopie: 'Beleidigung', von_uid: monteur.uid, gemeldet_von: kollege.uid, grund: 'Nicht in Ordnung', status: 'offen' });
    expect(JSON.stringify(liste)).not.toContain('Nicht gemeldet');
    expect((await fehler(chefin, 'nachrichten_verlauf', { p_kanal: kanal })).code).toBe('42501');
    const pfad = `nachrichten/${A}/${kanal}/${n}/${a}`;
    expect((await chefin.client.storage.from('nachrichten-privat').download(pfad)).error).toBeNull();
    expect(await rpc<number>(chefin, 'nachricht_meldungen_offen')).toBeGreaterThanOrEqual(1);

    // Der Absender löscht — die Kopie bleibt, die Datei auch.
    await rpc(monteur, 'nachricht_loeschen', { p_id: n });
    await aufraeumenLassen();
    expect(await objektDa('nachrichten-privat', pfad)).toBe(true);
    expect((await chefin.client.storage.from('nachrichten-privat').download(pfad)).error).toBeNull();

    expect((await fehler(chefin, 'nachricht_meldung_loeschen', { p_meldung: meldung })).code).toBe('55000');
    await rpc(chefin, 'nachricht_meldung_erledigen', { p_meldung: meldung, p_vermerk: 'Gespräch geführt' });
    await rpc(chefin, 'nachricht_meldung_loeschen', { p_meldung: meldung });
    await aufraeumenLassen();
    expect(await objektDa('nachrichten-privat', pfad)).toBe(false);
    void andere;
  });
});

describe('Die eigene Zahl und das Live-Ereignis', () => {
  it('die Zahl im Menü ist die eigene, Lesen setzt sie auf null', async () => {
    const kanal = await rpc<string>(verwaltung, 'nachrichten_kanal_direkt', { p_mit: buch.uid });
    await rpc(buch, 'nachrichten_gelesen', { p_kanal: kanal });
    const vorher = (await buch.client.rpc('offene_posten', { p_heute: '2026-11-08' }).single()).data as Zeile;
    const absenderVorher = (await verwaltung.client.rpc('offene_posten', { p_heute: '2026-11-08' }).single()).data as Zeile;
    await senden(verwaltung, kanal, 'Rechnung 12 ist bezahlt');
    const nachher = (await buch.client.rpc('offene_posten', { p_heute: '2026-11-08' }).single()).data as Zeile;
    expect(Number(nachher.nachrichten)).toBe(Number(vorher.nachrichten) + 1);
    await rpc(buch, 'nachrichten_gelesen', { p_kanal: kanal });
    const gelesen = (await buch.client.rpc('offene_posten', { p_heute: '2026-11-08' }).single()).data as Zeile;
    expect(Number(gelesen.nachrichten)).toBe(Number(vorher.nachrichten));
    const absender = (await verwaltung.client.rpc('offene_posten', { p_heute: '2026-11-08' }).single()).data as Zeile;
    // Die eigene Nachricht zählt beim Absender nicht.
    expect(Number(absender.nachrichten)).toBe(Number(absenderVorher.nachrichten));
  });

  it('das Live-Ereignis geht an den Betroffenen, nie an die Führung', async () => {
    const ereignisse: Zeile[] = [];
    let kanalAbo: RealtimeChannel | null = null;
    await new Promise<void>((bereit, scheitert) => {
      kanalAbo = chefin.client.channel(`na-${crypto.randomUUID()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'nachrichten_teilnehmer' }, (e) => {
          ereignisse.push((e.new ?? e.old) as Zeile);
        })
        .subscribe((s) => {
          if (s === 'SUBSCRIBED') bereit();
          if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') scheitert(new Error(s));
        });
    });
    try {
      // Köder: eine Nachricht an die Chefin selbst — erst wenn die ankommt, hört das Abo.
      const eigen = await rpc<string>(verwaltung, 'nachrichten_kanal_direkt', { p_mit: chefin.uid });
      let gehoert = false;
      for (let i = 0; i < 20 && !gehoert; i += 1) {
        await senden(verwaltung, eigen, `Köder ${i}`);
        for (let j = 0; j < 20 && !gehoert; j += 1) {
          gehoert = ereignisse.some((x) => x.user_id === chefin.uid);
          if (!gehoert) await warte(50);
        }
      }
      expect(gehoert, 'das Abo hört').toBe(true);
      ereignisse.length = 0;

      const privat = await rpc<string>(monteur, 'nachrichten_kanal_direkt', { p_mit: kollege.uid });
      await senden(monteur, privat, 'Nur für dich');
      await warte(1500);
      expect(ereignisse.filter((x) => x.user_id !== chefin.uid)).toEqual([]);
    } finally {
      if (kanalAbo) await chefin.client.removeChannel(kanalAbo);
    }
  }, 60_000);
});

describe('Datenauskunft, Auszug, Sicherung', () => {
  const GEHEIM = `Privat-${crypto.randomUUID().slice(0, 8)}`;
  const OFFEN = `Baustelle-${crypto.randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    const kanal = await rpc<string>(monteur, 'nachrichten_kanal_direkt', { p_mit: kollege.uid });
    await senden(monteur, kanal, GEHEIM);
    const thread = await rpc<string>(monteur, 'nachrichten_kanal_baustelle', { p_projekt: projekt });
    await senden(monteur, thread, OFFEN);
  });

  it('die Auskunft der Führung nennt Anzahl und Zeitraum, keinen Text, keinen Gesprächspartner', async () => {
    const auskunft = await rpc<Zeile>(chefin, 'person_auskunft', { p_art: 'mitarbeiter', p_id: monteur.uid });
    const daten = auskunft.daten as Zeile;
    const n = daten.nachrichten as Zeile;
    expect(Number(n.gesendet)).toBeGreaterThan(0);
    expect(String(n.hinweis)).toContain('Meine Nachrichten exportieren');
    const text = JSON.stringify(auskunft);
    expect(text).not.toContain(GEHEIM);
    expect(text).not.toContain(OFFEN);
    expect(text).not.toContain(kollege.uid);
  });

  it('der Auszug nimmt Baustellen-Threads mit, private Gespräche nicht', async () => {
    const { data, error } = await chefin.client.rpc('betrieb_auszug');
    expect(error).toBeNull();
    const text = JSON.stringify((data as { data: Zeile }).data);
    expect(text).toContain(OFFEN);
    expect(text).not.toContain(GEHEIM);
    const d = (data as { data: Record<string, Zeile[]> }).data;
    for (const t of TABELLEN.filter((x) => x !== 'nachricht_meldungen')) {
      expect((d[t] ?? []).filter((z) => z.privat === true), t).toEqual([]);
    }
    expect((d.nachrichten_kanaele ?? []).some((z) => z.art === 'baustelle')).toBe(true);
  });

  it('die Sicherung ebenso', async () => {
    const { rows } = await db.query<{ z: Zeile }>('select z from app.auszug_snapshot_zeilen($1) z', [A]);
    const text = JSON.stringify(rows);
    expect(text).toContain(OFFEN);
    expect(text).not.toContain(GEHEIM);
  });

  it('Gegenprobe: ohne die Regel stünde der private Text darin', async () => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.nachrichten where company_id = $1 and text = $2 and privat`, [A, GEHEIM]);
    expect(rows[0].n).toBe(1);
  });

  it('der Selbstexport gibt der Person ihre Gespräche mit Inhalt — nur ihr', async () => {
    const meins = JSON.stringify(await rpc(monteur, 'nachrichten_selbstexport'));
    expect(meins).toContain(GEHEIM);
    expect(meins).toContain(OFFEN);
    const fremdes = JSON.stringify(await rpc(chefin, 'nachrichten_selbstexport'));
    expect(fremdes).not.toContain(GEHEIM);
  });

  it('die Sicherung außer Haus nimmt die Dateien der Threads mit, die privaten nie', async () => {
    const { rows } = await db.query<{ eimer: string; gesichert: boolean }>('select * from app.datei_eimer()');
    const g = Object.fromEntries(rows.map((r) => [r.eimer, r.gesichert]));
    expect(g).toMatchObject({ nachrichten: true, 'nachrichten-privat': false });
  });
});

describe('Löschung einer Person (D2)', () => {
  it('Text und Anhänge gehen, der Platzhalter bleibt; ein leeres privates Gespräch geht ganz', async () => {
    const geht = await konto(A, 'Mitarbeiter', 'na-geht');
    const paar = await rpc<string>(geht, 'nachrichten_kanal_direkt', { p_mit: monteur.uid });
    const n = crypto.randomUUID();
    const a = crypto.randomUUID();
    expect((await hochladen(geht, 'nachrichten-privat', paar, n, a)).error).toBeNull();
    await rpc(geht, 'nachricht_senden', { p_id: n, p_kanal: paar, p_text: 'Persönliches', p_anhaenge: [{ id: a, name: 'x.png' }] });
    const allein = await rpc<string>(geht, 'nachrichten_kanal_runde', { p_name: 'Zu zweit', p_teilnehmer: [kollege.uid] });
    await senden(geht, allein, 'Hallo');
    await rpc(kollege, 'nachrichten_verlassen', { p_kanal: allein });

    await deaktivieren(geht.uid);
    const pruefung = await rpc<Zeile>(chefin, 'person_loeschen', { p_art: 'mitarbeiter', p_id: geht.uid, p_nur_pruefen: true });
    expect(Number((pruefung.sofort as Zeile).nachrichten)).toBe(2);
    await rpc(chefin, 'person_loeschen', { p_art: 'mitarbeiter', p_id: geht.uid, p_nur_pruefen: false });

    const { rows } = await db.query('select text, von_uid, von_name from public.nachrichten where id = $1', [n]);
    expect(rows[0]).toEqual({ text: null, von_uid: null, von_name: 'Gelöschtes Konto' });
    const verlauf = await rpc<Zeile[]>(monteur, 'nachrichten_verlauf', { p_kanal: paar });
    expect(verlauf.find((z) => z.id === n)).toMatchObject({ text: null, von_name: 'Gelöschtes Konto', anhaenge: [] });
    const { rows: weg } = await db.query('select count(*)::int as n from public.nachrichten_kanaele where id = $1', [allein]);
    expect(weg[0].n).toBe(0);
    await aufraeumenLassen();
    expect(await objektDa('nachrichten-privat', `nachrichten/${A}/${paar}/${n}/${a}`)).toBe(false);
  });
});

describe('Aufbewahrung (D3)', () => {
  it('setzt nur die Führung; der Nachtlauf löscht private Gespräche über der Frist, nie Baustellen-Threads', async () => {
    expect((await fehler(verwaltung, 'nachrichten_aufbewahrung_setzen', { p_monate: 6 })).code).toBe('42501');
    expect((await fehler(chefin, 'nachrichten_aufbewahrung_setzen', { p_monate: 3 })).code).toBe('22023');
    await verwaltung.client.from('companies').update({ nachrichten_aufbewahrung_monate: 6 }).eq('id', A);
    const { rows: stand } = await db.query('select nachrichten_aufbewahrung_monate as m from public.companies where id = $1', [A]);
    expect(stand[0].m, 'die Verwaltung setzt die Frist nicht').toBeNull();
    await rpc(chefin, 'nachrichten_aufbewahrung_setzen', { p_monate: 6 });

    const alt = await rpc<string>(monteur, 'nachrichten_kanal_runde', { p_name: 'Alt', p_teilnehmer: [kollege.uid] });
    await senden(monteur, alt, 'Lange her');
    const jung = await rpc<string>(monteur, 'nachrichten_kanal_runde', { p_name: 'Jung', p_teilnehmer: [kollege.uid] });
    await senden(monteur, jung, 'Gerade eben');
    const thread = await rpc<string>(monteur, 'nachrichten_kanal_baustelle', { p_projekt: projekt });
    await db.query(`update public.nachrichten_kanaele set letzte_nachricht_am = now() - interval '7 months' where id = any($1)`, [[alt, thread]]);

    await db.query('select app.nachrichten_nachtlauf()');
    const { rows } = await db.query<{ id: string }>('select id from public.nachrichten_kanaele where id = any($1)', [[alt, jung, thread]]);
    expect(rows.map((r) => r.id).sort()).toEqual([jung, thread].sort());
    await rpc(chefin, 'nachrichten_aufbewahrung_setzen', { p_monate: null });
  });
});

describe('Posteingang: der Reiter „Ungelesen“ (E65)', () => {
  it('zeigt nur Gespräche mit eigener ungelesener Zahl — gelesen fällt heraus; Unbekanntes wird abgelehnt', async () => {
    const kanal = await rpc<string>(monteur, 'nachrichten_kanal_direkt', { p_mit: dritter.uid });
    await senden(monteur, kanal, 'Ungelesen-Probe');
    const vorher = await rpc<Zeile[]>(dritter, 'nachrichten_postfach', { p_art: 'ungelesen' });
    expect(vorher.map((z) => z.kanal)).toContain(kanal);
    expect(vorher.every((z) => Number(z.ungelesen) > 0)).toBe(true);
    // Der Absender hat nichts Ungelesenes in diesem Gespräch.
    expect((await rpc<Zeile[]>(monteur, 'nachrichten_postfach', { p_art: 'ungelesen' })).map((z) => z.kanal)).not.toContain(kanal);
    await rpc(dritter, 'nachrichten_gelesen', { p_kanal: kanal });
    expect((await rpc<Zeile[]>(dritter, 'nachrichten_postfach', { p_art: 'ungelesen' })).map((z) => z.kanal)).not.toContain(kanal);
    // Die anderen Reiter bleiben, wie sie waren.
    expect((await rpc<Zeile[]>(dritter, 'nachrichten_postfach', { p_art: 'privat' })).map((z) => z.kanal)).toContain(kanal);
    expect((await rpc<Zeile[]>(dritter, 'nachrichten_postfach', { p_art: 'baustelle' })).map((z) => z.kanal)).not.toContain(kanal);
    expect((await fehler(dritter, 'nachrichten_postfach', { p_art: 'alles' })).code).toBe('22023');
  });
});

describe('Modul aus, Direktnachrichten aus', () => {
  it('ab Werk: Threads und Direktnachrichten an (E65); ausdrücklich aus bleibt aus', async () => {
    const { rows } = await db.query<{ kennung: string; standard: boolean }>(
      `select kennung, standard from app.modul_register() where kennung like 'nachrichten%' order by 1`);
    expect(rows).toEqual([{ kennung: 'nachrichten', standard: true }, { kennung: 'nachrichten.direktnachrichten', standard: true }]);
    await module(B, { 'nachrichten.direktnachrichten': false });
    expect((await fehler(fremd, 'nachrichten_kanal_direkt', { p_mit: fremd.uid })).code).toBe('55000');
    await module(B, {});
  });

  it('nichts Neues; Lesen, Löschen und Melden bleiben', async () => {
    const kanal = await rpc<string>(monteur, 'nachrichten_kanal_direkt', { p_mit: kollege.uid });
    const { id } = await senden(monteur, kanal, 'Vor dem Ausschalten');
    const { id: zumMelden } = await senden(kollege, kanal, 'Zum Melden');
    const thread = await rpc<string>(monteur, 'nachrichten_kanal_baustelle', { p_projekt: projekt });

    await module(A, { 'nachrichten.direktnachrichten': false });
    expect((await fehler(monteur, 'nachricht_senden', { p_id: crypto.randomUUID(), p_kanal: kanal, p_text: 'aus' })).code).toBe('55000');
    expect((await fehler(monteur, 'nachrichten_kanal_runde', { p_name: null, p_teilnehmer: [kollege.uid] })).code).toBe('55000');
    await senden(monteur, thread, 'Thread geht weiter');

    await module(A, { nachrichten: false, 'nachrichten.direktnachrichten': true });
    expect((await fehler(monteur, 'nachricht_senden', { p_id: crypto.randomUUID(), p_kanal: thread, p_text: 'aus' })).code).toBe('55000');
    expect((await rpc<Zeile[]>(monteur, 'nachrichten_verlauf', { p_kanal: kanal })).map((z) => z.text)).toContain('Vor dem Ausschalten');
    await rpc(monteur, 'nachricht_loeschen', { p_id: id });
    await rpc(monteur, 'nachricht_melden', { p_nachricht: zumMelden, p_grund: null });
    await module(A, { 'nachrichten.direktnachrichten': true });
  });
});

/*
  DIE ZAHL BLEIBT EHRLICH (Durchsicht 10.11.2026, `20261110100000_nachrichten_zahl.sql`).

  1. Wer die Baustelle nicht mehr sieht, hat dort auch nichts Ungelesenes
     mehr — Menü und Startseite zählen, was der Posteingang zeigt.
  2. Löschen nimmt nur eine Nachricht weg, die bei dieser Person gezählt
     wurde: nicht bei einem später Hinzugekommenen, nicht bei jemandem, der
     wieder folgt.
  3. Stumm schalten macht nicht zum Folgenden.

  Gegenprobe: ohne die Migration (und ohne die Umstellung von
  `ungeleseneZahl`) sind alle drei rot.
*/
describe('Die Zahl bleibt ehrlich', () => {
  async function zahlImMenue(wer: Konto): Promise<number> {
    const { data, error } = await wer.client.rpc('offene_posten', { p_heute: '2026-11-10' }).single();
    if (error) throw new Error(error.message);
    return Number((data as Zeile).nachrichten);
  }
  async function ungelesen(kanal: string, uid: string): Promise<number | null> {
    const { rows } = await db.query<{ ungelesen: number }>(
      'select ungelesen from public.nachrichten_teilnehmer where kanal_id = $1 and user_id = $2', [kanal, uid]);
    return rows[0]?.ungelesen ?? null;
  }
  async function neueBaustelle(team: string[]): Promise<string> {
    const { data, error } = await admin.from('projects').insert({
      company_id: A, project_number: `Z-${crypto.randomUUID().slice(0, 6)}`, customer_name: 'Familie Zahl',
      status: 'Aktiv', assigned_employees: team, project_managers: [pl.uid],
    }).select('id').single();
    if (error) throw new Error(error.message);
    return data!.id as string;
  }

  it('aus dem Team genommen: Menü, Startseite und Posteingang zeigen dasselbe — wieder im Team, ist die Zahl wieder da', async () => {
    const { ungeleseneZahl } = await import('@/lib/db/pg/nachrichten');
    const weg = await konto(A, 'Mitarbeiter', 'na-zahl-weg');
    const baustelle = await neueBaustelle([weg.uid]);
    const kanal = await rpc<string>(pl, 'nachrichten_kanal_baustelle', { p_projekt: baustelle });
    for (const t of ['Eins', 'Zwei', 'Drei']) await senden(pl, kanal, t);
    // Gleich bleibt: ein privates Gespräch zählt, solange man drin ist.
    const privat = await rpc<string>(monteur, 'nachrichten_kanal_direkt', { p_mit: weg.uid });
    await senden(monteur, privat, 'Privat');
    expect(await zahlImMenue(weg)).toBe(4);
    expect(await ungeleseneZahl(weg.uid, weg.client)).toBe(4);

    expect((await admin.from('projects').update({ assigned_employees: [] }).eq('id', baustelle)).error).toBeNull();
    expect((await rpc<Zeile[]>(weg, 'nachrichten_postfach', {})).map((z) => z.kanal)).not.toContain(kanal);
    expect((await fehler(weg, 'nachrichten_gelesen', { p_kanal: kanal })).code).toBe('42501');
    expect(await zahlImMenue(weg)).toBe(1);
    expect(await ungeleseneZahl(weg.uid, weg.client)).toBe(1);

    // Nichts ist verloren: wer die Baustelle wieder sieht, hat sein Ungelesenes wieder.
    expect((await admin.from('projects').update({ assigned_employees: [weg.uid] }).eq('id', baustelle)).error).toBeNull();
    expect(await zahlImMenue(weg)).toBe(4);
    expect(await ungeleseneZahl(weg.uid, weg.client)).toBe(4);
  });

  it('Runde: eine alte Nachricht zu löschen nimmt dem später Hinzugekommenen nichts weg', async () => {
    const runde = await rpc<string>(monteur, 'nachrichten_kanal_runde', { p_name: 'Zahl', p_teilnehmer: [kollege.uid] });
    const { id: alt } = await senden(monteur, runde, 'Vor dem Beitritt');
    await rpc(kollege, 'nachrichten_hinzufuegen', { p_kanal: runde, p_personen: [dritter.uid] });
    await senden(kollege, runde, 'Nach dem Beitritt');
    const { id: neu } = await senden(monteur, runde, 'Noch eine');
    expect(await ungelesen(runde, dritter.uid)).toBe(2);
    expect(await ungelesen(runde, kollege.uid)).toBe(1);

    // Gleich bleibt: was gezählt wurde, geht beim Löschen weg.
    await rpc(monteur, 'nachricht_loeschen', { p_id: neu });
    expect(await ungelesen(runde, dritter.uid)).toBe(1);
    expect(await ungelesen(runde, kollege.uid)).toBe(0);

    await rpc(monteur, 'nachricht_loeschen', { p_id: alt });
    expect(await ungelesen(runde, dritter.uid)).toBe(1);
    expect(await ungelesen(runde, kollege.uid)).toBe(0);
  });

  it('Baustelle: wer wieder folgt oder als Entfolgter erwähnt wird, verliert beim Löschen nichts Gezähltes', async () => {
    const baustelle = await neueBaustelle([]);
    const kanal = await rpc<string>(pl, 'nachrichten_kanal_baustelle', { p_projekt: baustelle });
    const [wieder, erwaehnt] = await Promise.all([konto(A, 'Verwaltung', 'na-wieder'), konto(A, 'Verwaltung', 'na-erwaehnt')]);
    await rpc(wieder, 'nachrichten_folgen', { p_kanal: kanal, p_folgen: true });
    await rpc(erwaehnt, 'nachrichten_folgen', { p_kanal: kanal, p_folgen: true });
    await rpc(erwaehnt, 'nachrichten_folgen', { p_kanal: kanal, p_folgen: false });
    const { id: alt } = await senden(pl, kanal, 'Vorher');
    expect(await ungelesen(kanal, wieder.uid)).toBe(1);

    await rpc(wieder, 'nachrichten_folgen', { p_kanal: kanal, p_folgen: false });
    await rpc(wieder, 'nachrichten_folgen', { p_kanal: kanal, p_folgen: true });
    const { id: jung } = await senden(pl, kanal, 'Nachher', { p_erwaehnt: [erwaehnt.uid] });
    expect(await ungelesen(kanal, wieder.uid)).toBe(1);
    expect(await ungelesen(kanal, erwaehnt.uid)).toBe(1);

    await rpc(pl, 'nachricht_loeschen', { p_id: alt });
    expect(await ungelesen(kanal, wieder.uid)).toBe(1);
    expect(await ungelesen(kanal, erwaehnt.uid)).toBe(1);
    // Gleich bleibt: die gezählte Nachricht geht beim Löschen weg.
    await rpc(pl, 'nachricht_loeschen', { p_id: jung });
    expect(await ungelesen(kanal, wieder.uid)).toBe(0);
    expect(await ungelesen(kanal, erwaehnt.uid)).toBe(0);
  });

  it('gleich bleibt: wer schon folgt, behält seinen Beitritt — Folgen und Erwähnen setzen ihn nicht neu', async () => {
    const baustelle = await neueBaustelle([]);
    const kanal = await rpc<string>(pl, 'nachrichten_kanal_baustelle', { p_projekt: baustelle });
    const dabei = await konto(A, 'Verwaltung', 'na-dabei');
    await rpc(dabei, 'nachrichten_folgen', { p_kanal: kanal, p_folgen: true });
    const beitritt = async () => (await db.query<{ b: string }>(
      'select beigetreten_am::text as b from public.nachrichten_teilnehmer where kanal_id = $1 and user_id = $2',
      [kanal, dabei.uid])).rows[0].b;
    const vorher = await beitritt();
    await rpc(dabei, 'nachrichten_folgen', { p_kanal: kanal, p_folgen: true });
    await senden(pl, kanal, 'Hallo', { p_erwaehnt: [dabei.uid] });
    expect(await beitritt()).toBe(vorher);
  });

  it('Stumm schalten im Thread, dem man nicht folgt, macht nicht zum Folgenden; eine verlassene Teilnahme bleibt verlassen', async () => {
    const baustelle = await neueBaustelle([]);
    const kanal = await rpc<string>(pl, 'nachrichten_kanal_baustelle', { p_projekt: baustelle });
    const leser = await konto(A, 'Verwaltung', 'na-stumm-leser');
    await rpc(leser, 'nachrichten_stumm', { p_kanal: kanal, p_stumm: true });
    expect(await ungelesen(kanal, leser.uid)).toBeNull();
    expect(await rpc<Zeile>(leser, 'nachrichten_kanal', { p_kanal: kanal })).toMatchObject({ folgt: false });

    await rpc(leser, 'nachrichten_folgen', { p_kanal: kanal, p_folgen: true });
    await rpc(leser, 'nachrichten_folgen', { p_kanal: kanal, p_folgen: false });
    await rpc(leser, 'nachrichten_stumm', { p_kanal: kanal, p_stumm: true });
    const { rows } = await db.query<{ verlassen: boolean; stumm: boolean }>(
      'select verlassen_am is not null as verlassen, stumm from public.nachrichten_teilnehmer where kanal_id = $1 and user_id = $2',
      [kanal, leser.uid]);
    expect(rows[0]).toEqual({ verlassen: true, stumm: true });
    expect(await rpc<Zeile>(leser, 'nachrichten_kanal', { p_kanal: kanal })).toMatchObject({ folgt: false });

    // Gleich bleibt: wer folgt, schaltet stumm und wieder laut.
    await rpc(leser, 'nachrichten_folgen', { p_kanal: kanal, p_folgen: true });
    await rpc(leser, 'nachrichten_stumm', { p_kanal: kanal, p_stumm: false });
    expect(await rpc<Zeile>(leser, 'nachrichten_kanal', { p_kanal: kanal })).toMatchObject({ folgt: true, stumm: false });
    await rpc(leser, 'nachrichten_stumm', { p_kanal: kanal, p_stumm: true });
    expect(await rpc<Zeile>(leser, 'nachrichten_kanal', { p_kanal: kanal })).toMatchObject({ folgt: true, stumm: true });
  });
});
