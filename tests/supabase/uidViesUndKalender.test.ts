/**
 * UID bei VIES prüfen und den Einsatzplan als Kalender abonnieren — gegen
 * den laufenden Stapel (Entscheidung vom 02.10.2026; offene Punkte E2/E3).
 *
 * VIES SELBST WIRD HIER NICHT GERUFEN. Das ist ein fremder Dienst mit
 * eigener Verfügbarkeit; eine Prüfung, die an seiner Laune hängt, wäre an
 * manchen Tagen rot, ohne dass sich etwas geändert hat. Geprüft wird alles
 * davor (wer darf, welche UID, welche Fehler) über die Serverfunktion und
 * alles danach (was festgehalten wird, wer es liest) über die beiden
 * Datenbankfunktionen. Wie die Antwort von VIES gelesen wird, prüft
 * `tests/unit/viesUndKalender.test.ts` an den echten Antwortformen.
 *
 * Das Kalender-Abo läuft hier vollständig durch: Link anlegen, abrufen wie
 * ein Kalender (ohne Anmeldung), ersetzen, beenden, und jeder Weg, auf dem
 * er von selbst aufhört.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { admin, API, ANON, betriebAnlegen, deaktivieren, konto, type Konto } from './helfer';

const PRUEFEN = `${API}/functions/v1/uid-pruefen`;
const KALENDER = `${API}/functions/v1/kalender`;
const BETRIEB = 'vieskal-a';
const FREMD = 'vieskal-b';

let db: Client;
let chefin: Konto;
let buch: Konto;
let monteur: Konto;
let kollege: Konto;
let fremdeChefin: Konto;
let kundeMitUid = '';
let kundeOhneUid = '';
let kundeSchweiz = '';
let fremderKunde = '';

async function kunde(betrieb: string, name: string, vatId: string | null): Promise<string> {
  const { data, error } = await admin.from('customers')
    .insert({ company_id: betrieb, name, vat_id: vatId, kundenart: vatId ? 'unternehmen' : null })
    .select('id').single();
  if (error) throw new Error(error.message);
  return String(data.id);
}

async function pruefen(token: string | null, rumpf: unknown) {
  const kopf: Record<string, string> = { apikey: ANON, 'Content-Type': 'application/json' };
  if (token) kopf.Authorization = `Bearer ${token}`;
  const a = await fetch(PRUEFEN, { method: 'POST', headers: kopf, body: JSON.stringify(rumpf) });
  return { status: a.status, daten: await a.json().catch(() => ({})) };
}

/** Wie ein Kalender: GET, ohne Anmeldung, ohne Schlüssel im Kopf. */
async function abrufen(schluessel: string) {
  const a = await fetch(`${KALENDER}?t=${encodeURIComponent(schluessel)}`);
  return { status: a.status, typ: a.headers.get('content-type') ?? '', text: await a.text() };
}

const schalter = async (an: boolean) => {
  const { error, count } = await chefin.client.from('companies')
    .update({ kalender_abo_erlaubt: an }, { count: 'exact' }).eq('id', BETRIEB);
  if (error) throw new Error(error.message);
  expect(count).toBe(1);
};

const heute = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });
const tagPlus = (n: number) => {
  const d = new Date(`${heute()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  await admin.from('companies').update({ vat_id: 'ATU12345678', kalender_abo_erlaubt: false }).eq('id', BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'vkchefin');
  buch = await konto(BETRIEB, 'Buchhaltung', 'vkbuch');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'vkmonteur');
  kollege = await konto(BETRIEB, 'Mitarbeiter', 'vkkollege');
  fremdeChefin = await konto(FREMD, 'Geschäftsführung', 'vkfremd');
  kundeMitUid = await kunde(BETRIEB, 'Muster Bau GmbH', 'ATU87654321');
  kundeOhneUid = await kunde(BETRIEB, 'Familie Huber', null);
  kundeSchweiz = await kunde(BETRIEB, 'Zürcher AG', 'CHE123456789');
  fremderKunde = await kunde(FREMD, 'Fremd GmbH', 'DE123456789');

  const bau = await admin.from('projects').insert({
    company_id: BETRIEB, project_number: 'VK-1', customer_name: 'Familie Huber', status: 'Aktiv',
    address: 'Hauptstraße 1, 1010 Wien', contact_name: 'Frau Huber', contact_phone: '+43 1 234',
  });
  if (bau.error) throw new Error(bau.error.message);
  const einsaetze = [
    { date: tagPlus(1), project_number: 'VK-1', user_id: monteur.uid, zeit_von: '07:30', zeit_bis: '12:00', comment: 'Schlüssel beim Hausmeister' },
    { date: tagPlus(2), project_number: 'VK-1', user_id: monteur.uid, as_helper: true },
    // Gegenproben: ein Kollege, und ein Einsatz außerhalb des Zeitraums.
    { date: tagPlus(1), project_number: 'VK-KOLLEGE', user_id: kollege.uid },
    { date: tagPlus(-90), project_number: 'VK-ALT', user_id: monteur.uid },
  ];
  for (const e of einsaetze) {
    const { error } = await admin.from('assignments').insert({ company_id: BETRIEB, user_name: 'x', ...e });
    if (error) throw new Error(error.message);
  }
}, 180_000);

afterAll(async () => {
  await db.query('delete from public.betrieb_zustand where betrieb_kennung = $1', [BETRIEB]);
  await db.end();
});

describe('UID bei VIES prüfen — was vor der Abfrage geprüft wird', () => {
  it('ohne Anmeldung nichts', async () => {
    expect((await pruefen(null, { kunde: kundeMitUid })).status).toBe(401);
  });

  it('ohne Kunden in der Anfrage nichts', async () => {
    const { status, daten } = await pruefen(buch.token, { kunde: 'abc' });
    expect(status).toBe(400);
    expect(daten.error).toMatch(/Welcher Kunde/);
  });

  it('ein Monteur prüft nicht — die Buchhaltung kommt bis zur Abfrage (Gegenprobe über den Kunden ohne UID)', async () => {
    const m = await pruefen(monteur.token, { kunde: kundeMitUid });
    expect(m.status).toBe(403);
    expect(m.daten.error).toMatch(/Büro/);
    const b = await pruefen(buch.token, { kunde: kundeOhneUid });
    expect(b.status).toBe(400);
    expect(b.daten.error).toMatch(/keine UID-Nummer hinterlegt/);
  });

  it('ein Kunde eines anderen Betriebs ist unbekannt', async () => {
    const { status, daten } = await pruefen(chefin.token, { kunde: fremderKunde });
    expect(status).toBe(404);
    expect(daten.error).toMatch(/gibt es im eigenen Betrieb nicht/);
  });

  it('eine Schweizer UID lässt sich bei VIES nicht prüfen — gesagt, nicht gefragt', async () => {
    const { status, daten } = await pruefen(buch.token, { kunde: kundeSchweiz });
    expect(status).toBe(400);
    expect(daten.error).toMatch(/nur UID-Nummern aus der EU/);
    const { count } = await admin.from('uid_pruefungen').select('*', { count: 'exact', head: true }).eq('customer_id', kundeSchweiz);
    expect(count).toBe(0);
  });

  it('die beiden Datenbankfunktionen führt nur der Dienstschlüssel aus', async () => {
    const a = await buch.client.rpc('uid_pruefung_vorbereiten', { p_aufrufer: buch.uid, p_kunde: kundeMitUid });
    expect(a.error).not.toBeNull();
    const b = await buch.client.rpc('uid_pruefung_festhalten', {
      p_aufrufer: buch.uid, p_kunde: kundeMitUid, p_uid: 'ATU87654321', p_gueltig: true, p_name: null,
      p_adresse: null, p_abfrage_id: null, p_eigene_uid: null, p_abgefragt_am: new Date().toISOString(),
    });
    expect(b.error).not.toBeNull();
    const v = await admin.rpc('uid_pruefung_vorbereiten', { p_aufrufer: buch.uid, p_kunde: kundeMitUid });
    expect(v.data).toEqual([{ uid: 'ATU87654321', eigene_uid: 'ATU12345678' }]);
  });
});

describe('UID bei VIES prüfen — was festgehalten wird', () => {
  const festhalten = (uid: string, rest: Record<string, unknown> = {}) => admin.rpc('uid_pruefung_festhalten', {
    p_aufrufer: buch.uid, p_kunde: kundeMitUid, p_uid: uid, p_gueltig: true,
    p_name: 'MUSTER BAU GMBH', p_adresse: 'Ringstraße 1\nAT-1010 Wien', p_abfrage_id: 'WAPIAAAAZ1',
    p_eigene_uid: 'ATU12345678', p_abgefragt_am: '2026-10-02T10:15:00Z', ...rest,
  });

  it('Ergebnis, Zeitpunkt laut VIES, Abfrage-ID und wer gefragt hat', async () => {
    const { data, error } = await festhalten('atu 8765 4321');
    expect(error).toBeNull();
    expect(data).toMatchObject({
      uid: 'ATU87654321', gueltig: true, abfrage_id: 'WAPIAAAAZ1', eigene_uid: 'ATU12345678',
      durch: buch.uid, company_id: BETRIEB,
    });
    expect(new Date(data.abgefragt_am).toISOString()).toBe('2026-10-02T10:15:00.000Z');
  });

  // Runde 3, G21: der Grund für eine fehlende Abfrage-ID bleibt an der Abfrage stehen.
  it('hält den Grund fest, wenn VIES keine Abfrage-ID vergeben hat', async () => {
    const grund = 'VIES erkennt die eigene UID-Nummer aus den Firmendaten nicht an.';
    const ohne = await festhalten('ATU87654321', { p_abfrage_id: null, p_eigene_uid: null, p_ohne_id_grund: grund });
    expect(ohne.error).toBeNull();
    expect(ohne.data).toMatchObject({ abfrage_id: null, ohne_id_grund: grund });
    // Gegenprobe: mit Abfrage-ID gibt es keinen Grund, auch wenn einer mitkommt.
    const mit = await festhalten('ATU87654321', { p_ohne_id_grund: grund });
    expect(mit.data).toMatchObject({ abfrage_id: 'WAPIAAAAZ1', ohne_id_grund: null });
    // Eine Edge Function vom alten Stand ruft ohne Grund — das geht weiter.
    const alt = await festhalten('ATU87654321', { p_abfrage_id: null });
    expect(alt.error).toBeNull();
    expect(alt.data).toMatchObject({ ohne_id_grund: null });
  });

  it('wurde die UID inzwischen geändert, gibt es keinen Nachweis für die alte', async () => {
    const vorher = (await admin.from('uid_pruefungen').select('id').eq('customer_id', kundeMitUid)).data!.length;
    const { error } = await festhalten('DE123456789');
    expect(error?.code).toBe('40001');
    expect((await admin.from('uid_pruefungen').select('id').eq('customer_id', kundeMitUid)).data!.length).toBe(vorher);
  });

  it('lesen dürfen, die den Kunden lesen — der Monteur und ein anderer Betrieb nicht', async () => {
    expect((await buch.client.from('uid_pruefungen').select('id').eq('customer_id', kundeMitUid)).data!.length).toBeGreaterThan(0);
    expect((await chefin.client.from('uid_pruefungen').select('id').eq('customer_id', kundeMitUid)).data!.length).toBeGreaterThan(0);
    expect((await monteur.client.from('uid_pruefungen').select('id').eq('customer_id', kundeMitUid)).data).toEqual([]);
    expect((await fremdeChefin.client.from('uid_pruefungen').select('id').eq('customer_id', kundeMitUid)).data).toEqual([]);
  });

  it('niemand schreibt von außen hinein', async () => {
    const { error } = await chefin.client.from('uid_pruefungen').insert({
      company_id: BETRIEB, customer_id: kundeMitUid, uid: 'ATU87654321', gueltig: true,
      abgefragt_am: new Date().toISOString(), durch: chefin.uid,
    });
    expect(error).not.toBeNull();
  });

  it('steht in der Datenauskunft des Kunden und bei der Person als Bearbeiter', async () => {
    const k = await chefin.client.rpc('person_auskunft', { p_art: 'kunde', p_id: kundeMitUid });
    expect(k.error).toBeNull();
    expect(k.data.daten.uid_pruefungen[0]).toMatchObject({ uid: 'ATU87654321', gueltig: true });
    expect(k.data.daten.uid_pruefungen[0].durch).toBeUndefined();
    const p = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: buch.uid });
    expect(p.data.als_bearbeiter.uids_geprueft).toBeGreaterThanOrEqual(1);
  });
});

describe('Kalender-Abo', () => {
  it('gibt es nur, wenn der Betrieb es eingeschaltet hat (Gegenprobe: eingeschaltet)', async () => {
    const aus = await monteur.client.rpc('kalender_abo_anlegen');
    expect(aus.error?.message).toMatch(/nicht eingeschaltet/);
    await schalter(true);
    const an = await monteur.client.rpc('kalender_abo_anlegen');
    expect(an.error).toBeNull();
    expect(an.data).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('der Kalender holt die eigenen Einsätze ohne Anmeldung — mit Uhrzeit, Ort und Notiz', async () => {
    const { data: schluessel } = await monteur.client.rpc('kalender_abo_anlegen');
    const { status, typ, text } = await abrufen(schluessel);
    expect(status).toBe(200);
    expect(typ).toMatch(/text\/calendar/);
    expect(text).toContain('BEGIN:VCALENDAR');
    expect(text).toContain(`DTSTART;TZID=Europe/Vienna:${tagPlus(1).replace(/-/g, '')}T073000`);
    expect(text).toContain(`DTEND;TZID=Europe/Vienna:${tagPlus(1).replace(/-/g, '')}T120000`);
    expect(text).toContain(`DTSTART;VALUE=DATE:${tagPlus(2).replace(/-/g, '')}`);
    expect(text).toContain('SUMMARY:Familie Huber · VK-1 · Helfer');
    expect(text).toContain('LOCATION:Hauptstraße 1\\, 1010 Wien');
    expect(text.replace(/\r\n /g, '')).toContain('Schlüssel beim Hausmeister');
    // Gegenprobe: nicht der Kollege, nicht der alte Einsatz.
    expect(text).not.toContain('VK-KOLLEGE');
    expect(text).not.toContain('VK-ALT');
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it('gespeichert ist nur der Hashwert, und jede Person sieht nur ihr eigenes Abo', async () => {
    const { data: schluessel } = await monteur.client.rpc('kalender_abo_anlegen');
    await abrufen(schluessel);
    const { data: zeilen } = await admin.from('kalender_abos').select('*').eq('user_id', monteur.uid);
    expect(zeilen).toHaveLength(1);
    expect(zeilen![0].schluessel_hash).toBe(createHash('sha256').update(schluessel).digest('hex'));
    expect(JSON.stringify(zeilen)).not.toContain(schluessel);
    expect(zeilen![0].zuletzt_abgerufen).not.toBeNull();
    expect((await monteur.client.from('kalender_abos').select('angelegt_am')).data).toHaveLength(1);
    expect((await chefin.client.from('kalender_abos').select('angelegt_am')).data).toEqual([]);
  });

  it('ein neuer Link ersetzt den alten', async () => {
    const { data: alt } = await monteur.client.rpc('kalender_abo_anlegen');
    const { data: neu } = await monteur.client.rpc('kalender_abo_anlegen');
    expect((await abrufen(alt)).status).toBe(404);
    expect((await abrufen(neu)).status).toBe(200);
  });

  it('„Abo beenden“ beendet es', async () => {
    const { data: schluessel } = await monteur.client.rpc('kalender_abo_anlegen');
    expect((await monteur.client.rpc('kalender_abo_beenden')).error).toBeNull();
    expect((await abrufen(schluessel)).status).toBe(404);
  });

  it('ein unbekannter oder unförmiger Link bekommt dieselbe Antwort, und nur GET', async () => {
    const unbekannt = await abrufen('A'.repeat(43));
    const unfoermig = await abrufen('abc');
    expect(unbekannt.status).toBe(404);
    expect(unfoermig.status).toBe(404);
    expect(unbekannt.text).toBe(unfoermig.text);
    expect((await fetch(`${KALENDER}?t=${'A'.repeat(43)}`, { method: 'POST' })).status).toBe(405);
  });

  it('den Abruf führt nur der Dienstschlüssel aus', async () => {
    const anonym = createClient(API, ANON, { auth: { persistSession: false } });
    expect((await anonym.rpc('kalender_abruf', { p_schluessel_hash: 'x' })).error).not.toBeNull();
    expect((await monteur.client.rpc('kalender_abruf', { p_schluessel_hash: 'x' })).error).not.toBeNull();
  });

  it('wer deaktiviert wird, verliert das Abo sofort', async () => {
    const weg = await konto(BETRIEB, 'Mitarbeiter', 'vkweg');
    const { data: schluessel } = await weg.client.rpc('kalender_abo_anlegen');
    expect((await abrufen(schluessel)).status).toBe(200);
    await deaktivieren(weg.uid);
    expect((await abrufen(schluessel)).status).toBe(404);
    expect((await admin.from('kalender_abos').select('id').eq('user_id', weg.uid)).data).toEqual([]);
  });

  it('ruht der Betrieb, antwortet kein Abo (Gegenprobe: wieder aktiv)', async () => {
    const { data: schluessel } = await kollege.client.rpc('kalender_abo_anlegen');
    await db.query(
      `insert into public.betrieb_zustand (betrieb_kennung, name, deaktiviert_am, deaktiviert_grund)
       values ($1, $1, now(), 'Prüfung') on conflict (betrieb_kennung) do update set deaktiviert_am = now()`,
      [BETRIEB],
    );
    expect((await abrufen(schluessel)).status).toBe(404);
    await db.query('update public.betrieb_zustand set deaktiviert_am = null where betrieb_kennung = $1', [BETRIEB]);
    expect((await abrufen(schluessel)).status).toBe(200);
  });

  it('der Hashwert steht nicht im Auszug des Betriebs', async () => {
    const { data, error } = await chefin.client.rpc('betrieb_auszug');
    expect(error).toBeNull();
    const zeilen = data.data.kalender_abos as Record<string, unknown>[];
    expect(zeilen.length).toBeGreaterThan(0);
    expect(zeilen.every((z) => !('schluessel_hash' in z))).toBe(true);
  });

  it('steht in der Datenauskunft der Person', async () => {
    const { data } = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: kollege.uid });
    expect(data.daten.kalenderabo).toEqual([expect.objectContaining({ angelegt_am: expect.any(String) })]);
    expect(JSON.stringify(data.daten.kalenderabo)).not.toContain('hash');
  });

  it('schaltet der Betrieb es aus, enden alle Abos — auch nach dem Wiedereinschalten', async () => {
    const { data: schluessel } = await kollege.client.rpc('kalender_abo_anlegen');
    await schalter(false);
    expect((await abrufen(schluessel)).status).toBe(404);
    expect((await admin.from('kalender_abos').select('id').eq('company_id', BETRIEB)).data).toEqual([]);
    await schalter(true);
    expect((await abrufen(schluessel)).status).toBe(404);
  });

  it('nur die Spitze stellt den Schalter um', async () => {
    const { count } = await buch.client.from('companies')
      .update({ kalender_abo_erlaubt: false }, { count: 'exact' }).eq('id', BETRIEB);
    expect(count).toBe(0);
  });
});
