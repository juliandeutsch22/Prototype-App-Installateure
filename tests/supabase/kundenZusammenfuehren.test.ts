/**
 * Kunden zusammenführen (Durchsicht 15.11.2026, F9) — gegen die Datenbank.
 *
 * VORHER (nachgestellt): eine Dublette mit Belegen ließ sich weder löschen
 * noch umhängen; ausgestellte Rechnungen und unterschriebene Scheine wiesen
 * jede Änderung am Kundenbezug ab. Ohne
 * `20261117031000_kunden_zusammenfuehren.sql` gibt es die Funktionen nicht —
 * jede Prüfung hier außer „bleibt gleich“ ist dann rot.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { kundenZusammenfuehren, kundenZusammenfuehrenVorschau } from '@/lib/db/pg/customers';
import { clientEinreichen } from '@/lib/db/pg/kern';

const A = 'kz-f9';
const B = 'kz-f9-fremd';
const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
let chefin: Konto;
let monteur: Konto;
let verwaltung: Konto;
let fremd: Konto;
let db: Client;

const kurz = () => crypto.randomUUID().slice(0, 6);

beforeAll(async () => {
  await betriebAnlegen(A);
  await betriebAnlegen(B);
  chefin = await konto(A, 'Geschäftsführung', 'kzchef');
  monteur = await konto(A, 'Mitarbeiter', 'kzmont');
  // Verwaltung OHNE Kundenrecht (`kunden_pflegen` ist aus).
  verwaltung = await konto(A, 'Verwaltung', 'kzverw');
  fremd = await konto(B, 'Geschäftsführung', 'kzfremd');
  db = new Client({ connectionString: DB });
  await db.connect();
}, 120_000);

afterAll(async () => {
  clientEinreichen(null);
  await db.end();
});

async function kunde(name: string, x: Record<string, unknown> = {}, betrieb = A): Promise<string> {
  const { data, error } = await admin.from('customers')
    .insert({ company_id: betrieb, name, strasse: 'Hauptstraße 1', plz: '1010', ort: 'Wien', ...x })
    .select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Eine Dublette mit allem, was an einem Kunden hängen kann. */
async function dublette(nameGeht = `Meier ${kurz()} GmbH`) {
  const bleibt = await kunde(`Maier ${kurz()} GmbH`, { kundennummer: `K1-${kurz()}`, notes: 'Schlüssel beim Hausmeister' });
  const geht = await kunde(nameGeht, {
    kundennummer: `K2-${kurz()}`, email: 'office@meier.at', vat_id: 'ATU12345678', notes: 'Zahlt pünktlich',
    strasse: 'Nebengasse 2', plz: '1020',
  });
  const nr = `B-${kurz()}`;
  const { data: p } = await admin.from('projects')
    .insert({ company_id: A, project_number: nr, customer_id: geht, customer_name: nameGeht, status: 'Aktiv' })
    .select('id').single();
  const ohneBezug = `B-${kurz()}`;
  await admin.from('projects').insert({ company_id: A, project_number: ohneBezug, customer_name: ` ${nameGeht.toLowerCase()}`, status: 'Aktiv' });
  const { data: q } = await admin.from('quotes').insert({
    company_id: A, quote_number: `AN-${kurz()}`, customer_id: geht, customer_name: nameGeht,
    quote_date: '2026-11-01', valid_until: '2026-12-01', status: 'Versendet', vat_rate: 0.2,
  }).select('id').single();
  const { data: r, error: re } = await admin.from('invoices').insert({
    company_id: A, invoice_number: `RE-${kurz()}`, project_number: nr, customer_id: geht, customer_name: nameGeht,
    address: 'Nebengasse 2, 1020 Wien', customer_vat_id: 'ATU12345678', invoice_date: '2026-11-02', due_date: '2026-11-16',
    total_netto: 100, total_vat: 20, total_brutto: 120, payment_status: 'Offen',
  }).select('id').single();
  if (re) throw new Error(re.message);
  const schein = crypto.randomUUID();
  const { error: se } = await admin.from('work_sheets').insert({
    id: schein, company_id: A, project_number: nr, customer_id: geht, customer_name: nameGeht, datum: '2026-11-03',
    status: 'Entwurf', abrechnung: 'Regie', erstellt_von_uid: chefin.uid, erstellt_von_name: 'Chefin',
    unterschrift_monteur: { name: 'M', geraetZeit: 1, bild: 'x' }, unterschrift_kunde: { name: 'K', geraetZeit: 2, bild: 'y' },
  });
  if (se) throw new Error(se.message);
  // Unterschreiben wie im Betrieb: der Auslöser hält die Prüfsumme fest.
  await admin.from('work_sheets').update({ status: 'Unterschrieben' }).eq('id', schein);
  const { data: w } = await admin.from('wartungen').insert({
    company_id: A, customer_id: geht, customer_name: nameGeht, anlage: 'Therme', intervall_monate: 12, faellig_am: '2027-01-01',
  }).select('id').single();
  const { data: t } = await admin.from('termine').insert({
    company_id: A, art: 'Besichtigung', datum: '2099-11-12', customer_id: geht,
  }).select('id').single();
  const { data: e, error: ee } = await admin.from('auftragseingaenge').insert({
    company_id: A, nummer: `E-${kurz()}`, quelle: 'telefon', anliegen: 'Heizung kalt', customer_id: geht,
  }).select('id').single();
  if (ee) throw new Error(ee.message);
  const { data: l } = await admin.from('liegenschaften').insert({ company_id: A, bezeichnung: `WHA ${kurz()}` }).select('id').single();
  // Dieselbe Beteiligung bei beiden — sie wird zusammengelegt; die zweite (andere Rolle) wandert.
  await admin.from('liegenschaft_beteiligte').insert([
    { company_id: A, liegenschaft_id: l!.id, rolle: 'eigentuemer', customer_id: bleibt },
    { company_id: A, liegenschaft_id: l!.id, rolle: 'eigentuemer', customer_id: geht },
    { company_id: A, liegenschaft_id: l!.id, rolle: 'rechnungsempfaenger', customer_id: geht },
  ]);
  await admin.from('uid_pruefungen').insert({
    company_id: A, customer_id: geht, uid: 'ATU12345678', gueltig: true, abgefragt_am: new Date().toISOString(), durch: chefin.uid,
  });
  // Ein Eintrag im Verlauf der Dublette — geschrieben von einem Menschen, nicht vom Dienst.
  await chefin.client.from('customers').update({ contact_name: 'Hr. Meier' }).eq('id', geht);
  return { bleibt, geht, nameGeht, projekt: p!.id as string, ohneBezug, angebot: q!.id as string, rechnung: r!.id as string, schein, wartung: w!.id as string, termin: t!.id as string, eingang: e!.id as string };
}

async function vorschauAls(k: Konto, bleibt: string, geht: string) {
  clientEinreichen(k.client);
  return kundenZusammenfuehrenVorschau(bleibt, geht);
}

describe('Bleibt gleich: ausgestellte Belege sind außerhalb des Zusammenführens eingefroren', () => {
  it('der Kundenbezug einer ausgestellten Rechnung lässt sich nicht ändern', async () => {
    const d = await dublette();
    const { error } = await chefin.client.from('invoices').update({ customer_id: d.bleibt }).eq('id', d.rechnung);
    expect(error?.message).toMatch(/lässt sich nicht mehr ändern/);
  });

  it('auch nicht mit gesetzter Einstellung aus der Sitzung eines Browsers — PostgREST reicht sie nicht durch', async () => {
    const d = await dublette();
    // Der direkte Weg über SQL mit der Rolle eines angemeldeten Kontos, ohne die Funktion.
    await db.query('begin');
    try {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: chefin.uid, role: 'authenticated', app_metadata: { company_id: A } })]);
      await db.query('set local role authenticated');
      await expect(db.query('update public.invoices set customer_id = $1 where id = $2', [d.bleibt, d.rechnung]))
        .rejects.toThrow(/lässt sich nicht mehr ändern/);
    } finally {
      await db.query('rollback');
    }
  });
});

describe('Vorschau (F9)', () => {
  it('zählt je Bereich, was wandert — mit den Altbelegen über den Namen', async () => {
    const d = await dublette();
    const v = await vorschauAls(chefin, d.bleibt, d.geht);
    expect(v.zahlen).toEqual(expect.objectContaining({
      baustellen: 1, angebote: 1, rechnungen: 1, scheine: 1, wartungen: 1, termine: 1, eingaenge: 1,
      beteiligungen: 2, beteiligungenDoppelt: 1, uidPruefungen: 1,
    }));
    expect(v.zahlen.verlauf).toBeGreaterThanOrEqual(1);
    expect(v.ueberNamen.baustellen).toBe(1);
    expect(v.nameEindeutig).toBe(true);
    expect(v.stand).toMatch(/^[0-9a-f]{32}$/);
  });

  it('nur wer Kunden pflegt — und nur im eigenen Betrieb', async () => {
    const d = await dublette();
    await expect(vorschauAls(monteur, d.bleibt, d.geht)).rejects.toThrow(/wer Kunden pflegt|nicht/);
    await expect(vorschauAls(verwaltung, d.bleibt, d.geht)).rejects.toThrow(/wer Kunden pflegt/);
    const anderswo = await kunde('Fremd GmbH', {}, B);
    await expect(vorschauAls(chefin, d.bleibt, anderswo)).rejects.toThrow(/gibt es in diesem Betrieb nicht/);
    await expect(vorschauAls(fremd, d.bleibt, d.geht)).rejects.toThrow(/gibt es in diesem Betrieb nicht/);
    await expect(vorschauAls(chefin, d.bleibt, d.bleibt)).rejects.toThrow(/mit sich selbst/);
  });
});

describe('Zusammenführen (F9)', () => {
  it('hängt alles um, lässt den Text der Belege stehen, übernimmt die gewählten Felder und löscht die Dublette', async () => {
    const d = await dublette();
    const { data: scheinVorher } = await admin.from('work_sheets').select('inhalt_hash, customer_name').eq('id', d.schein).single();
    expect(scheinVorher!.inhalt_hash).toMatch(/^[0-9a-f]{64}$/);
    const { data: kGeht } = await admin.from('customers').select('kundennummer').eq('id', d.geht).single();
    const v = await vorschauAls(chefin, d.bleibt, d.geht);
    const r = await kundenZusammenfuehren(d.bleibt, d.geht, { kundennummer: 'geht', email: 'geht', notes: 'beide' }, v.stand);
    expect(r.art).toBe('zusammengefuehrt');

    const { data: k } = await admin.from('customers').select('*').eq('id', d.bleibt).single();
    expect(k.kundennummer).toBe(kGeht!.kundennummer);
    expect(k.email).toBe('office@meier.at');
    expect(k.notes).toBe('Schlüssel beim Hausmeister\n\nZahlt pünktlich');
    // Nicht gewählt: Name und Anschrift des bleibenden Kunden.
    expect(k.strasse).toBe('Hauptstraße 1');
    expect((await admin.from('customers').select('id').eq('id', d.geht)).data).toEqual([]);

    // Die Rechnung: Bezug gewandert, Text unverändert (§ 11 UStG).
    const { data: re } = await admin.from('invoices').select('customer_id, customer_name, address, customer_vat_id').eq('id', d.rechnung).single();
    expect(re).toEqual({ customer_id: d.bleibt, customer_name: d.nameGeht, address: 'Nebengasse 2, 1020 Wien', customer_vat_id: 'ATU12345678' });
    // Der unterschriebene Schein: Bezug gewandert, Name und Prüfsumme wie unterschrieben.
    const { data: s } = await admin.from('work_sheets').select('customer_id, customer_name, inhalt_hash').eq('id', d.schein).single();
    expect(s).toEqual({ customer_id: d.bleibt, customer_name: scheinVorher!.customer_name, inhalt_hash: scheinVorher!.inhalt_hash });
    // Das versendete Angebot behält seinen Namen.
    const { data: q } = await admin.from('quotes').select('customer_id, customer_name').eq('id', d.angebot).single();
    expect(q).toEqual({ customer_id: d.bleibt, customer_name: d.nameGeht });
    // Baustelle und Wartung tragen den Namen des bleibenden Kunden — wie beim Umbenennen.
    const { data: p } = await admin.from('projects').select('customer_id, customer_name').eq('id', d.projekt).single();
    expect(p).toEqual({ customer_id: d.bleibt, customer_name: k.name });
    const { data: ob } = await admin.from('projects').select('customer_id').eq('project_number', d.ohneBezug).single();
    expect(ob!.customer_id).toBe(d.bleibt);
    const { data: w } = await admin.from('wartungen').select('customer_id, customer_name').eq('id', d.wartung).single();
    expect(w).toEqual({ customer_id: d.bleibt, customer_name: k.name });
    // Termin und Eingang: Bezug und angezeigter Name folgen; der Eingang gilt nicht als bearbeitet.
    const { data: t } = await admin.from('termine').select('customer_id, ort_name').eq('id', d.termin).single();
    expect(t).toEqual({ customer_id: d.bleibt, ort_name: k.name });
    const { data: e } = await admin.from('auftragseingaenge').select('customer_id, kunde_name, bearbeitet_von_uid').eq('id', d.eingang).single();
    expect(e).toEqual({ customer_id: d.bleibt, kunde_name: k.name, bearbeitet_von_uid: null });
    // Beteiligungen: die doppelte zusammengelegt, die andere gewandert.
    const { data: lb } = await admin.from('liegenschaft_beteiligte').select('rolle').eq('customer_id', d.bleibt).order('rolle');
    expect(lb!.map((z) => z.rolle)).toEqual(['eigentuemer', 'rechnungsempfaenger']);
    expect((await admin.from('uid_pruefungen').select('id').eq('customer_id', d.bleibt)).data).toHaveLength(1);

    // Das Journal: der Verlauf der Dublette wanderte mit, der Vorgang steht am bleibenden Kunden.
    const { data: j } = await admin.from('aenderungsjournal').select('objektart, objekt_id, aenderungen, von_uid').eq('kunde_id', d.bleibt);
    expect(j!.some((z) => z.objekt_id === d.geht && z.aenderungen.contact_name)).toBe(true);
    const vorgang = j!.find((z) => z.aenderungen.zusammengefuehrt);
    expect(vorgang).toEqual(expect.objectContaining({ objektart: 'kunde', objekt_id: d.bleibt, von_uid: chefin.uid }));
    expect(vorgang!.aenderungen.zusammengefuehrt.alt).toEqual(expect.objectContaining({ id: d.geht, name: d.nameGeht }));
  });

  it('die Datenauskunft des bleibenden Kunden enthält danach, was an der Dublette hing', async () => {
    const d = await dublette();
    const v = await vorschauAls(chefin, d.bleibt, d.geht);
    await kundenZusammenfuehren(d.bleibt, d.geht, {}, v.stand);
    const { data, error } = await chefin.client.rpc('person_auskunft', { p_art: 'kunde', p_id: d.bleibt });
    expect(error).toBeNull();
    expect(data.daten.rechnungen.map((x: { id: string }) => x.id)).toContain(d.rechnung);
    expect(data.daten.baustellen.map((x: { id: string }) => x.id)).toContain(d.projekt);
    expect(data.daten.aenderungsjournal.some((x: { aenderungen: Record<string, unknown> }) => x.aenderungen.zusammengefuehrt)).toBe(true);
  });

  it('nach dem Zusammenführen ist die Rechnung wieder eingefroren — die Tür gilt nur während des Laufs', async () => {
    const d = await dublette();
    const v = await vorschauAls(chefin, d.bleibt, d.geht);
    await kundenZusammenfuehren(d.bleibt, d.geht, {}, v.stand);
    const anderer = await kunde(`Dritter ${kurz()}`);
    const { error } = await chefin.client.from('invoices').update({ customer_id: anderer }).eq('id', d.rechnung);
    expect(error?.message).toMatch(/lässt sich nicht mehr ändern/);
  });

  it('hat sich seit der Vorschau etwas geändert, wird nichts zusammengeführt', async () => {
    const d = await dublette();
    const v = await vorschauAls(chefin, d.bleibt, d.geht);
    await admin.from('projects').insert({ company_id: A, project_number: `B-${kurz()}`, customer_id: d.geht, customer_name: d.nameGeht, status: 'Aktiv' });
    const r = await kundenZusammenfuehren(d.bleibt, d.geht, {}, v.stand);
    expect(r.art).toBe('veraltet');
    if (r.art === 'veraltet') expect(r.vorschau.zahlen.baustellen).toBe(2);
    expect((await admin.from('customers').select('id').eq('id', d.geht)).data).toHaveLength(1);
    const { data: re } = await admin.from('invoices').select('customer_id').eq('id', d.rechnung).single();
    expect(re!.customer_id).toBe(d.geht);
  });

  it('ein unbekanntes Feld weist ab, bevor etwas geschieht', async () => {
    const d = await dublette();
    const v = await vorschauAls(chefin, d.bleibt, d.geht);
    await expect(kundenZusammenfuehren(d.bleibt, d.geht, { iban: 'geht' } as never, v.stand)).rejects.toThrow(/„iban“ kennt das Zusammenführen nicht/);
    await expect(kundenZusammenfuehren(d.bleibt, d.geht, { name: 'beide' }, v.stand)).rejects.toThrow(/kennt das Zusammenführen nicht/);
    expect((await admin.from('customers').select('id').eq('id', d.geht)).data).toHaveLength(1);
  });

  it('eine Privatperson mit UID weist die Datenbank ab — und führt dann gar nichts zusammen', async () => {
    const d = await dublette();
    await admin.from('customers').update({ kundenart: 'privat' }).eq('id', d.bleibt);
    const v = await vorschauAls(chefin, d.bleibt, d.geht);
    await expect(kundenZusammenfuehren(d.bleibt, d.geht, { vat_id: 'geht' }, v.stand)).rejects.toThrow(/Privatperson hat keine UID/);
    const { data: re } = await admin.from('invoices').select('customer_id').eq('id', d.rechnung).single();
    expect(re!.customer_id).toBe(d.geht);
  });

  it('trägt ein dritter Kunde den Namen der Dublette, bleiben ihre Altbelege ohne Bezug, wie sie sind', async () => {
    const name = `Gleich ${kurz()}`;
    const d = await dublette(name);
    await kunde(name);
    const v = await vorschauAls(chefin, d.bleibt, d.geht);
    expect(v.nameEindeutig).toBe(false);
    await kundenZusammenfuehren(d.bleibt, d.geht, {}, v.stand);
    const { data: ob } = await admin.from('projects').select('customer_id').eq('project_number', d.ohneBezug).single();
    expect(ob!.customer_id).toBeNull();
  });

  it('nur wer Kunden pflegt', async () => {
    const d = await dublette();
    const v = await vorschauAls(chefin, d.bleibt, d.geht);
    clientEinreichen(verwaltung.client);
    await expect(kundenZusammenfuehren(d.bleibt, d.geht, {}, v.stand)).rejects.toThrow(/wer Kunden pflegt/);
    clientEinreichen(chefin.client);
  });
});

describe('Der Wächter über den Kundenbezug (F9) — gegen das Schema', () => {
  it('jede Tabelle mit Verweis auf customers (oder customer_id/kunde_id) steht in app.kundenbezug_tabellen()', async () => {
    const { rows } = await db.query<{ t: string }>(`
      select distinct t from (
        select con.conrelid::regclass::text as t from pg_constraint con
         where con.contype = 'f' and con.confrelid = 'public.customers'::regclass
        union
        select c.table_name from information_schema.columns c
          join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
         where c.table_schema = 'public' and tb.table_type = 'BASE TABLE' and c.column_name in ('customer_id', 'kunde_id')
      ) x order by 1`);
    const { rows: liste } = await db.query<{ t: string[] }>('select app.kundenbezug_tabellen() as t');
    expect(rows.map((r) => r.t.replace(/^public\./, '')).sort()).toEqual([...liste[0].t].sort());
    const { rows: unbekannt } = await db.query<{ u: string | null }>('select app.kundenbezug_unbekannt() as u');
    expect(unbekannt[0].u).toBeNull();
  });

  it('Gegenprobe: eine neue Tabelle mit Kundenbezug macht das Zusammenführen unmöglich, statt sie zu leeren', async () => {
    await db.query('begin');
    try {
      await db.query(`create table public.kundenkontakte_probe (
        id uuid primary key default gen_random_uuid(),
        customer_id uuid references public.customers (id) on delete cascade)`);
      const { rows } = await db.query<{ u: string | null }>('select app.kundenbezug_unbekannt() as u');
      expect(rows[0].u).toMatch(/kundenkontakte_probe/);
    } finally {
      await db.query('rollback');
    }
  });

  it('die Hilfsfunktionen sind intern; nur die Tür ist für Angemeldete ausführbar (Auslöser mit den Rechten des Schreibenden)', async () => {
    const recht = async (f: string) => (await db.query<{ d: boolean }>(`select has_function_privilege('authenticated', '${f}', 'execute') as d`)).rows[0].d;
    expect(await recht('app.kundenbezug_tabellen()')).toBe(false);
    expect(await recht('app.kundenbezug_unbekannt()')).toBe(false);
    expect(await recht('app.kunden_zusammenfuehren_lage(uuid, uuid)')).toBe(false);
    expect(await recht('app.kunden_zusammenfuehren_pruefen(uuid, uuid)')).toBe(false);
    expect(await recht('app.kunde_wandert(uuid, uuid)')).toBe(true);
    expect((await db.query<{ d: boolean }>(`select has_function_privilege('anon', 'public.kunden_zusammenfuehren(uuid, uuid, jsonb, text)', 'execute') as d`)).rows[0].d).toBe(false);
  });
});
