/**
 * Betriebe deaktivieren und löschen (Nachtest 01.10.2026, Paket D).
 *
 * Die Abnahme aus dem Arbeitsauftrag:
 *   - Gegenproben über die Schnittstelle: nur der globale Administrator, nur
 *     nach dem Deaktivieren, nur nach Ablauf der Frist, nur mit Grund und
 *     eingetippter Kennung;
 *   - Rücklauf-Prüfung: nach dem Löschen ist keine Zeile, keine Datei und
 *     kein Anmeldekonto des Betriebs übrig;
 *   - die übrigen Betriebe sind unverändert;
 *   - die Kennung wird nie wieder vergeben.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { admin, API, ANON, betriebAnlegen, buchung, konto, plattformkonto, type Konto } from './helfer';

const LOESCHEN = 'pd-loeschen';
const BLEIBT = 'pd-bleibt';
const RUHT = 'pd-ruht';
const TEST = 'pd-testbetrieb';
const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
const UNTERSCHRIFT = { name: 'Huber', bild: 'data:image/png;base64,AAA', geraetZeit: 1776000000000 };
const PASSWORT = 'Test-Passwort-2026!';

let plattform: Konto;
let chefin: Konto;
let monteur: Konto;
let chefinBleibt: Konto;
let chefinRuht: Konto;
let ehemaligeRuht: Konto;
let chefinTest: Konto;
let db: Client;
let foto = '';

async function rufe(fn: string, token: string, rumpf: unknown) {
  const antwort = await fetch(`${API}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(rumpf),
  });
  return { status: antwort.status, daten: await antwort.json().catch(() => ({})) as Record<string, unknown> };
}

/** Zeilen je Tabelle mit `company_id` — dieselbe Liste, die das Löschen nimmt. */
async function zeilenJeTabelle(betrieb: string): Promise<Record<string, number>> {
  const { rows } = await db.query<{ t: string }>('select unnest(app.auszug_tabellen()) as t');
  const ergebnis: Record<string, number> = {};
  for (const { t } of rows) {
    const { rows: [z] } = await db.query<{ n: string }>(`select count(*) as n from public."${t}" where company_id = $1`, [betrieb]);
    if (Number(z.n) > 0) ergebnis[t] = Number(z.n);
  }
  return ergebnis;
}

async function anmelden(email: string): Promise<boolean> {
  const c = createClient(API, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORT });
  return !error;
}

async function emailVon(uid: string): Promise<string> {
  const { data } = await admin.auth.admin.getUserById(uid);
  return data.user!.email!;
}

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();

  for (const b of [LOESCHEN, BLEIBT, RUHT, TEST]) await betriebAnlegen(b);
  plattform = await plattformkonto('pd');
  chefin = await konto(LOESCHEN, 'Geschäftsführung', 'pdgf');
  monteur = await konto(LOESCHEN, 'Mitarbeiter', 'pdmont');
  chefinBleibt = await konto(BLEIBT, 'Geschäftsführung', 'pdbleibt');
  chefinRuht = await konto(RUHT, 'Geschäftsführung', 'pdruht');
  ehemaligeRuht = await konto(RUHT, 'Mitarbeiter', 'pdehem', false);
  chefinTest = await konto(TEST, 'Administrator', 'pdtest');
  for (const k of [chefin, monteur, chefinBleibt, chefinRuht, ehemaligeRuht, chefinTest]) {
    await admin.auth.admin.updateUserById(k.uid, { password: PASSWORT });
  }

  // Ein Betrieb mit allem, woran ein Löschen hängen bleiben könnte.
  for (const b of [LOESCHEN, BLEIBT]) {
    const { data: kunde } = await admin.from('customers')
      .insert({ company_id: b, name: `Familie Huber ${b}` }).select('id').single();
    const { error: pf } = await admin.from('projects').insert({
      company_id: b, project_number: 'PR-2026-0001', customer_name: 'Familie Huber',
      customer_id: (kunde as { id: string }).id, address: 'Hauptplatz 1, 8200 Gleisdorf', status: 'Aktiv',
    });
    if (pf) throw new Error(pf.message);
    const { error: mf } = await admin.from('materials')
      .insert({ company_id: b, name: 'Kupferrohr 15', unit: 'm', stock: 20, lagerartikel: true });
    if (mf) throw new Error(mf.message);
  }
  const schein = crypto.randomUUID();
  const seeds = [
    await admin.from('work_sheets').insert({
      id: schein, company_id: LOESCHEN, project_number: 'PR-2026-0001', customer_name: 'Familie Huber',
      datum: heute, status: 'Entwurf', abrechnung: 'Regie', erstellt_von_uid: monteur.uid, erstellt_von_name: 'Max',
    }),
    await admin.from('work_sheet_material').insert({
      company_id: LOESCHEN, work_sheet_id: schein, position: 0, name: 'Kupferrohr 15', menge: 5, einheit: 'm',
    }),
    await admin.from('work_sheets').update({
      status: 'Unterschrieben', unterschrift_monteur: UNTERSCHRIFT, unterschrift_kunde: UNTERSCHRIFT,
    }).eq('id', schein),
    await admin.from('time_entries').insert(buchung(monteur, heute, { project_number: 'PR-2026-0001' })),
    await admin.from('material_orders').insert({
      id: crypto.randomUUID(), company_id: LOESCHEN, material_name: 'Fitting', quantity: 2, transaction_type: 'order',
      user_id: monteur.uid, user_name: 'Max', project_number: 'PR-2026-0001', status: 'Offen',
    }),
    await admin.from('user_prefs').upsert({ user_id: monteur.uid, company_id: LOESCHEN, push_tokens: ['geraet-1'] }),
  ];
  for (const s of seeds) if (s.error) throw new Error(s.error.message);

  foto = `scheine/${LOESCHEN}/${schein}/foto.jpg`;
  const { error: uf } = await admin.storage.from('scheinfotos')
    .upload(foto, new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), { upsert: true });
  if (uf) throw new Error(uf.message);
}, 180_000);

afterAll(async () => {
  await db?.end();
});

describe('Deaktivieren', () => {
  it('Gegenprobe: nur die Plattform, nur mit Grund', async () => {
    const fremd = await chefin.client.rpc('plattform_betrieb_deaktivieren', { p_kennung: RUHT, p_grund: 'x' });
    expect(fremd.error?.code).toBe('42501');
    const ohneGrund = await plattform.client.rpc('plattform_betrieb_deaktivieren', { p_kennung: RUHT, p_grund: ' ' });
    expect(ohneGrund.error?.code).toBe('22023');
  });

  it('sperrt alle Konten, beendet Sitzungen und schliesst jede Regel — die Daten bleiben', async () => {
    const { data: vorher } = await chefinRuht.client.from('users').select('id').eq('company_id', RUHT);
    expect((vorher ?? []).length).toBeGreaterThan(0);

    const { error } = await plattform.client.rpc('plattform_betrieb_deaktivieren', {
      p_kennung: RUHT, p_grund: 'Kündigung zum 31.10.',
    });
    expect(error).toBeNull();

    // Das noch gültige Token sieht nichts mehr.
    const { data: nachher } = await chefinRuht.client.from('users').select('id').eq('company_id', RUHT);
    expect(nachher ?? []).toEqual([]);
    // Anmelden geht nicht.
    expect(await anmelden(await emailVon(chefinRuht.uid))).toBe(false);
    // Die Daten sind da.
    const { count } = await admin.from('users').select('id', { count: 'exact', head: true }).eq('company_id', RUHT);
    expect(count).toBe(2);
    // Der andere Betrieb arbeitet weiter.
    const { data: bleibt } = await chefinBleibt.client.from('customers').select('id');
    expect((bleibt ?? []).length).toBe(1);
  });

  it('erscheint in der Liste der Plattform und im Protokoll', async () => {
    const { data } = await plattform.client.rpc('plattform_betriebe');
    const z = (data as Array<{ kennung: string; deaktiviert_am: string | null; deaktiviert_grund: string | null }>)
      .find((b) => b.kennung === RUHT)!;
    expect(z.deaktiviert_am).not.toBeNull();
    expect(z.deaktiviert_grund).toBe('Kündigung zum 31.10.');
    const { data: prot } = await plattform.client.rpc('plattform_betrieb_protokoll', { p_kennung: RUHT });
    expect((prot as Array<{ aktion: string }>).map((p) => p.aktion)).toContain('deaktiviert');
  });

  it('wieder aktivieren entsperrt, wer in der Belegschaft aktiv ist — nicht mehr', async () => {
    const { error } = await plattform.client.rpc('plattform_betrieb_aktivieren', {
      p_kennung: RUHT, p_grund: 'Zahlung eingegangen',
    });
    expect(error).toBeNull();
    expect(await anmelden(await emailVon(chefinRuht.uid))).toBe(true);
    expect(await anmelden(await emailVon(ehemaligeRuht.uid))).toBe(false);
  });

  it('das Protokoll wird nur ergänzt, nie geändert', async () => {
    await expect(db.query(`update public.betrieb_protokoll set grund = 'anders' where betrieb_kennung = $1`, [RUHT]))
      .rejects.toThrow(/nur ergänzt/);
    await expect(db.query('delete from public.betrieb_protokoll where betrieb_kennung = $1', [RUHT]))
      .rejects.toThrow(/nur ergänzt/);
  });
});

describe('Löschen', () => {
  it('Gegenprobe: nicht aus „aktiv“', async () => {
    const r = await plattform.client.rpc('plattform_loeschung_planen', { p_kennung: LOESCHEN, p_grund: 'Antrag' });
    expect(r.error?.message).toMatch(/zuerst deaktivieren/);
  });

  it('Gegenprobe: nicht ohne Übergabe', async () => {
    expect((await plattform.client.rpc('plattform_betrieb_deaktivieren', {
      p_kennung: LOESCHEN, p_grund: 'Kündigung, Löschung beantragt am 01.10.',
    })).error).toBeNull();
    const r = await plattform.client.rpc('plattform_loeschung_planen', { p_kennung: LOESCHEN, p_grund: 'Antrag' });
    expect(r.error?.message).toMatch(/Export/);
  });

  it('die Übergabe: alle Tabellen und das Dateiverzeichnis, mit Datum im Protokoll', async () => {
    const fremd = await rufe('daten-ausleitung', chefinBleibt.token, { betrieb: LOESCHEN, grund: 'x' });
    expect(fremd.daten.companyId).not.toBe(LOESCHEN);

    const ohneGrund = await rufe('daten-ausleitung', plattform.token, { betrieb: LOESCHEN, grund: '' });
    expect(ohneGrund.status).toBe(400);

    const r = await rufe('daten-ausleitung', plattform.token, { betrieb: LOESCHEN, grund: 'Übergabe vor Löschung' });
    expect(r.status).toBe(200);
    expect(r.daten.dateien).toBe(1);
    expect(Number(r.daten.zeilen)).toBeGreaterThan(5);
    expect(String(r.daten.datenLink)).toMatch(/^http/);
    const daten = await (await fetch(String(r.daten.datenLink))).text();
    expect(daten).toContain('work_sheets');
    expect(daten).not.toContain('geraet-1');

    const { data } = await plattform.client.rpc('plattform_betriebe');
    expect((data as Array<{ kennung: string; export_am: string | null }>).find((b) => b.kennung === LOESCHEN)!.export_am)
      .not.toBeNull();
  });

  it('Gegenprobe: die Übergabe nur für einen deaktivierten Betrieb', async () => {
    const r = await rufe('daten-ausleitung', plattform.token, { betrieb: BLEIBT, grund: 'Neugier' });
    expect(r.status).toBe(409);
  });

  it('Frist: geplant, aber noch nicht um — nicht löschbar', async () => {
    const { error } = await plattform.client.rpc('plattform_loeschung_planen', {
      p_kennung: LOESCHEN, p_grund: 'Antrag vom 01.10.', p_tage: 30,
    });
    expect(error).toBeNull();
    const r = await rufe('betrieb-loeschen', plattform.token, { kennung: LOESCHEN, bestaetigung: LOESCHEN, grund: 'Antrag' });
    expect(r.status).toBe(409);
    expect(String(r.daten.error)).toMatch(/Frist läuft noch/);
  });

  it('Gegenprobe: nur die Plattform, nur mit eingetippter Kennung und Grund', async () => {
    // Die Frist für den Test abkürzen — dieselbe Zeile, die sonst die Zeit erreicht.
    await db.query(`update public.betrieb_zustand set loeschung_geplant_fuer = now() - interval '1 minute' where betrieb_kennung = $1`, [LOESCHEN]);

    const fremd = await rufe('betrieb-loeschen', chefinBleibt.token, { kennung: LOESCHEN, bestaetigung: LOESCHEN, grund: 'Antrag' });
    expect(fremd.status).toBe(403);
    const falsch = await rufe('betrieb-loeschen', plattform.token, { kennung: LOESCHEN, bestaetigung: 'pd-loesche', grund: 'Antrag' });
    expect(falsch.status).toBe(409);
    expect(String(falsch.daten.error)).toMatch(/Kennung genau so eintippen/);
    const ohneGrund = await rufe('betrieb-loeschen', plattform.token, { kennung: LOESCHEN, bestaetigung: LOESCHEN, grund: '' });
    expect(ohneGrund.status).toBe(409);
    // Nichts ist weg.
    expect(Object.keys(await zeilenJeTabelle(LOESCHEN)).length).toBeGreaterThan(5);
  });

  it('löscht Zeilen, Dateien und Anmeldekonten — und nichts vom anderen Betrieb', async () => {
    const bleibtVorher = await zeilenJeTabelle(BLEIBT);

    const r = await rufe('betrieb-loeschen', plattform.token, {
      kennung: LOESCHEN, bestaetigung: LOESCHEN, grund: 'Löschung laut Antrag vom 01.10.',
    });
    expect(r.status, JSON.stringify(r.daten)).toBe(200);
    expect(Number(r.daten.zeilen)).toBeGreaterThan(5);
    expect(r.daten.konten).toBe(2);
    expect(r.daten.kontenOffen).toEqual([]);

    // Rücklauf-Prüfung: keine Zeile, keine Firma, keine Datei, kein Konto.
    expect(await zeilenJeTabelle(LOESCHEN)).toEqual({});
    const { rows: firma } = await db.query('select 1 from public.companies where id = $1', [LOESCHEN]);
    expect(firma).toEqual([]);
    const { rows: dateien } = await db.query(
      `select name from storage.objects where (storage.foldername(name))[2] = $1`, [LOESCHEN]);
    expect(dateien).toEqual([]);
    for (const uid of [chefin.uid, monteur.uid]) {
      const { data } = await admin.auth.admin.getUserById(uid);
      expect(data.user).toBeNull();
    }

    // Der andere Betrieb: unverändert.
    expect(await zeilenJeTabelle(BLEIBT)).toEqual(bleibtVorher);
    const { data: bleibt } = await chefinBleibt.client.from('customers').select('id');
    expect((bleibt ?? []).length).toBe(1);
  });

  it('das Löschprotokoll bleibt, ohne Inhalte', async () => {
    const { data } = await plattform.client.rpc('plattform_geloeschte_betriebe');
    expect((data as Array<{ kennung: string }>).map((b) => b.kennung)).toContain(LOESCHEN);
    const { data: prot } = await plattform.client.rpc('plattform_betrieb_protokoll', { p_kennung: LOESCHEN });
    const aktionen = (prot as Array<{ aktion: string; angaben: Record<string, unknown> }>);
    expect(aktionen.map((p) => p.aktion)).toEqual(
      expect.arrayContaining(['deaktiviert', 'export', 'loeschung_geplant', 'geloescht']));
    expect(JSON.stringify(aktionen)).not.toContain('Familie Huber');
  });

  it('die Kennung wird nie wieder vergeben', async () => {
    const { error } = await admin.from('companies').insert({ id: LOESCHEN, name: 'Neu' });
    expect(error?.message).toMatch(/vergeben/);
  });
});

describe('Testbetrieb', () => {
  it('löschbar ohne Übergabe und ohne Frist — aber nicht ohne Deaktivieren', async () => {
    expect((await plattform.client.rpc('plattform_testbetrieb', {
      p_kennung: TEST, p_testbetrieb: true, p_grund: 'Vorführbetrieb',
    })).error).toBeNull();
    const zuFrueh = await plattform.client.rpc('plattform_loeschung_planen', { p_kennung: TEST, p_grund: 'Aufräumen' });
    expect(zuFrueh.error?.message).toMatch(/zuerst deaktivieren/);

    expect((await plattform.client.rpc('plattform_betrieb_deaktivieren', { p_kennung: TEST, p_grund: 'Aufräumen' })).error)
      .toBeNull();
    expect((await plattform.client.rpc('plattform_loeschung_planen', { p_kennung: TEST, p_grund: 'Aufräumen' })).error)
      .toBeNull();
    const r = await rufe('betrieb-loeschen', plattform.token, { kennung: TEST, bestaetigung: TEST, grund: 'Aufräumen' });
    expect(r.status, JSON.stringify(r.daten)).toBe(200);
    expect(await zeilenJeTabelle(TEST)).toEqual({});
    const { data } = await admin.auth.admin.getUserById(chefinTest.uid);
    expect(data.user).toBeNull();
  });

  it('Gegenprobe: ein gewöhnlicher Betrieb hat mindestens sieben Tage Frist', async () => {
    expect((await plattform.client.rpc('plattform_betrieb_deaktivieren', { p_kennung: RUHT, p_grund: 'Kündigung' })).error)
      .toBeNull();
    await db.query(`update public.betrieb_zustand set export_am = now() where betrieb_kennung = $1`, [RUHT]);
    const r = await plattform.client.rpc('plattform_loeschung_planen', { p_kennung: RUHT, p_grund: 'Antrag', p_tage: 1 });
    expect(r.error?.message).toMatch(/zwischen 7 und 365/);
    // Aufräumen: wieder aktiv, damit andere Prüfungen den Betrieb so vorfinden.
    expect((await plattform.client.rpc('plattform_betrieb_aktivieren', { p_kennung: RUHT, p_grund: 'Test zu Ende' })).error)
      .toBeNull();
  });
});
