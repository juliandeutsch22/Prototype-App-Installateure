/**
 * ANGEBOTSANNAHME PER LINK (M02a, A06) — gegen die echte Datenbank.
 *
 * Festgehalten wird:
 * - Erzeugen nur mit Abrechnungsart und Vorsatz, nur von der Führung im
 *   eigenen Betrieb, nur für einen Entwurf oder ein versendetes Angebot; ein
 *   Entwurf ist danach versendet; ein neuer Link widerruft den alten;
 * - der Abruf zählt das Öffnen; unbekannt, abgelaufen, widerrufen,
 *   gegenstandslos, geändert, Modul aus und ruhender Betrieb antworten gleich;
 * - die Annahme über den Link legt dieselbe Baustelle an wie die interne,
 *   ersetzt dieselben Fassungen und schreibt dasselbe Journal — im Namen
 *   „Kunde über Link: <Name>“; ein zweiter Aufruf ändert nichts; zwei
 *   gleichzeitige ergeben eine Baustelle;
 * - die Ablehnung wirkt wie „Als abgelehnt markieren“;
 * - die interne Annahme ist unverändert (Erhaltung), ebenso der Zähler;
 * - `app.modul_aktiv` entscheidet wie `aktiveSchalter`;
 * - Datenauskunft und Löschung eines Kunden.
 *
 * Gegenprobe: ohne `20261106400000_angebot_annahme_link.sql` gibt es weder
 * die Funktionen noch die Tabelle — jede Prüfung hier ist rot, außer denen
 * zur Erhaltung, die mit und ohne Änderung grün sein müssen.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { admin, betriebAnlegen, einblickBeginnen, konto, plattformkonto, SERVICE, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import * as links from '@/lib/db/pg/angebotLinks';
import { MODULE, aktiveSchalter } from '@/lib/module';

const A = 'angebotlink-a';
const B = 'angebotlink-b';
let chefin: Konto;
let admins: Konto;
let pl: Konto;
let buch: Konto;
let verwaltung: Konto;
let monteur: Konto;
let fremd: Konto;
let plattform: Konto;
let kunde = '';
let lauf = 0;
let db: Client;

/** Ein winziges, gültiges PNG — die Form, die `SignaturePad` liefert. */
const BILD = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const ZEILEN = [
  { label: 'Montage', qty: 8, unit: 'h', unit_price: 70, netto: 560, ist_arbeitszeit: true },
  { art: 'titel', label: 'Material', qty: 0, unit: '', unit_price: 0, netto: 0 },
  { label: 'Therme', qty: 1, unit: 'Stk', unit_price: 2400, netto: 2160, rabatt_prozent: 10 },
];

async function angebot(extra: Record<string, unknown> = {}, wer: Konto = chefin): Promise<string> {
  lauf += 1;
  const { data, error } = await wer.client.rpc('angebot_speichern', {
    p_id: null,
    p_kopf: {
      quote_number: `AN-LK-${Date.now()}-${lauf}`, customer_id: kunde, customer_name: 'Familie Link',
      address: 'Linkgasse 1, 1010 Wien', quote_date: '2026-11-06', valid_until: '2099-12-31', vat_rate: 0.2,
      status: 'Versendet', kalkulierte_stunden: 8, notes: 'Therme tauschen.', subtotal_netto: 2720, total_netto: 2720,
      total_vat: 544, total_brutto: 3264, ...extra,
    },
    p_positionen: ZEILEN,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

const erzeugen = (wer: Konto, id: string, abrechnung: string | null = 'Pauschal', praefix: string | null = 'LK', bis: string | null = null) =>
  wer.client.rpc('angebot_link_erzeugen', { p_angebot: id, p_abrechnung: abrechnung, p_praefix: praefix, p_gueltig_bis: bis });

async function neuerLink(id: string, abrechnung = 'Pauschal', praefix = 'LK', wer: Konto = chefin): Promise<{ id: string; schluessel: string }> {
  const { data, error } = await erzeugen(wer, id, abrechnung, praefix);
  if (error) throw new Error(error.message);
  return data as { id: string; schluessel: string };
}

const abruf = (s: string) => admin.rpc('angebot_link_abruf', { p_hash: sha(s) });
const annehmen = (s: string, name = 'Maria Kundin', bild: string = BILD, bestaetigt = true) =>
  admin.rpc('angebot_link_annehmen', { p_hash: sha(s), p_name: name, p_unterschrift: bild, p_bestaetigt: bestaetigt });
const ablehnen = (s: string, name = 'Maria Kundin', grund: string | null = 'Zu teuer') =>
  admin.rpc('angebot_link_ablehnen', { p_hash: sha(s), p_name: name, p_grund: grund });

async function quote(id: string) {
  return (await admin.from('quotes').select('*').eq('id', id).single()).data as Record<string, unknown>;
}
async function linkZeile(id: string) {
  return (await admin.from('angebot_links').select('*').eq('id', id).single()).data as Record<string, unknown>;
}

const heuteWien = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });
const tagPlus = (n: number) => {
  const d = new Date(`${heuteWien()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();
  await betriebAnlegen(A, 'Link Installationen GmbH');
  await betriebAnlegen(B);
  await admin.from('companies').update({ address_line: 'Werkstraße 1, 1010 Wien', iban: 'AT611904300234573201' }).eq('id', A);
  chefin = await konto(A, 'Geschäftsführung', 'lk-chefin');
  admins = await konto(A, 'Administrator', 'lk-admin');
  pl = await konto(A, 'Projektleiter', 'lk-pl');
  buch = await konto(A, 'Buchhaltung', 'lk-buch');
  verwaltung = await konto(A, 'Verwaltung', 'lk-verw');
  monteur = await konto(A, 'Mitarbeiter', 'lk-monteur');
  fremd = await konto(B, 'Geschäftsführung', 'lk-fremd');
  plattform = await plattformkonto('lk-support');
  expect((await admin.from('users').update({ name: 'Carla Chefin' }).eq('id', chefin.uid)).error).toBeNull();
  const { data, error } = await admin.from('customers').insert({
    company_id: A, name: 'Familie Link', kundenart: 'privat', strasse: 'Linkgasse 1', plz: '1010', ort: 'Wien',
    contact_name: 'Maria Link', contact_phone: '0664 123', email: 'link@example.at',
  }).select('id').single();
  expect(error).toBeNull();
  kunde = data!.id;
}, 180_000);

/*
  NICHTS BLEIBT LIEGEN, was ältere Migrationen nicht kennen: `verlaeufe` und
  `urlaubNurUeberAntrag` spielen sie erneut ein, und die Prüfung der Stände
  aus 20261027400200 kennt „Verworfen“ nicht (siehe `papierkorb.test.ts`).
*/
afterAll(async () => {
  clientEinreichen(null);
  await admin.from('quotes').delete().in('company_id', [A, B]).eq('status', 'Verworfen');
  await db.end();
});

describe('Erzeugen', () => {
  it('nur mit Abrechnungsart und Vorsatz — ein leerer Vorsatz heißt „ohne“, fehlen darf er nicht', async () => {
    const id = await angebot();
    expect((await erzeugen(chefin, id, null)).error?.message).toMatch(/Ohne Abrechnungsart gibt es keinen Annahme-Link/);
    expect((await erzeugen(chefin, id, 'Festpreis')).error?.message).toMatch(/Ohne Abrechnungsart/);
    expect((await erzeugen(chefin, id, 'Pauschal', null)).error?.message).toMatch(/Ohne Nummernvorsatz/);
    expect((await erzeugen(chefin, id, 'Pauschal', 'zu-lang-x')).error?.message).toMatch(/Ohne Nummernvorsatz/);
    expect((await admin.from('angebot_links').select('id').eq('quote_id', id)).data).toEqual([]);
    const ok = await erzeugen(chefin, id, 'Regie', '');
    expect(ok.error).toBeNull();
    expect((await admin.from('angebot_links').select('abrechnung, praefix').eq('quote_id', id)).data)
      .toEqual([{ abrechnung: 'Regie', praefix: '' }]);
  });

  it('nur die Führung im eigenen Betrieb — Mitarbeiter, Verwaltung, Buchhaltung, fremder Betrieb und Support scheitern', async () => {
    const id = await angebot();
    for (const k of [monteur, verwaltung, buch]) {
      const r = await erzeugen(k, id);
      expect(r.error?.message, k.rolle).toMatch(/nur die Führung/);
    }
    expect((await erzeugen(fremd, id)).error?.message).toMatch(/Angebot nicht gefunden/);
    const { data: freigabe } = await chefin.client.from('support_freigaben').insert({
      company_id: A, gewaehrt_von: chefin.uid, grund: 'Link prüfen', stufe: 'mitarbeiten',
      gilt_bis: new Date(Date.now() + 3_600_000).toISOString(),
    }).select('id').single();
    try {
      await einblickBeginnen(plattform, A, freigabe!.id);
      // Mit „mitarbeiten“ nimmt der Support intern an — einen Link an den Kunden gibt er nicht.
      expect((await erzeugen(plattform, id)).error).not.toBeNull();
      expect((await plattform.client.from('angebot_links').select('id').eq('quote_id', id)).data ?? []).toEqual([]);
      expect((await plattform.client.rpc('angebot_links_stand', { p_angebot: id })).error).not.toBeNull();
    } finally {
      await admin.from('support_zugriffe').delete().eq('company_id', A);
      await admin.from('support_freigaben').delete().eq('company_id', A);
    }
    expect((await admin.from('angebot_links').select('id').eq('quote_id', id)).data).toEqual([]);
    for (const k of [pl, admins, chefin]) expect((await erzeugen(k, id)).error, k.rolle).toBeNull();
  }, 60_000);

  it('nur für einen Entwurf oder ein versendetes Angebot', async () => {
    for (const status of ['Abgelehnt', 'Verworfen'] as const) {
      const id = await angebot({ status: 'Entwurf' });
      expect((await chefin.client.from('quotes').update({ status }).eq('id', id)).error).toBeNull();
      expect((await erzeugen(chefin, id)).error?.message, status).toMatch(/nur für einen Entwurf oder ein versendetes Angebot/);
    }
    const angenommen = await angebot();
    expect((await chefin.client.rpc('angebot_annehmen', { p_angebot: angenommen, p_praefix: 'LK', p_abrechnung: 'Pauschal' })).error).toBeNull();
    expect((await erzeugen(chefin, angenommen)).error?.message).toMatch(/„Angenommen“/);
    // Ersetzt: eine andere Fassung ist angenommen.
    const alt = await angebot();
    const neu = await angebot({ vorgaenger_id: alt });
    await chefin.client.rpc('angebot_annehmen', { p_angebot: neu, p_praefix: 'LK', p_abrechnung: 'Pauschal' });
    expect((await erzeugen(chefin, alt)).error?.message).toMatch(/„Ersetzt“/);
  });

  it('ein Entwurf ist danach versendet — mit Tag, Firmendaten und Journal im Namen der Führung', async () => {
    const id = await angebot({ status: 'Entwurf' });
    const vorher = Date.now();
    await neuerLink(id);
    const q = await quote(id);
    expect(q.status).toBe('Versendet');
    expect(Date.parse(String(q.versendet_am))).toBeGreaterThanOrEqual(vorher - 5_000);
    expect(q.aussteller_stand).not.toBeNull();
    const { data: journal } = await admin.from('aenderungsjournal').select('aenderungen, von_name')
      .eq('objekt_id', id).eq('art', 'geaendert');
    expect(journal).toEqual([{ aenderungen: { status: { alt: 'Entwurf', neu: 'Versendet' } }, von_name: 'Carla Chefin' }]);
  });

  it('der Stand: Angebot, Kunde und Firmendaten des Versands, mit Prüfsumme; gültig bis zur Bindefrist', async () => {
    const id = await angebot({ valid_until: tagPlus(20) });
    const l = await neuerLink(id);
    const z = await linkZeile(l.id);
    const stand = z.schnappschuss as Record<string, Record<string, unknown>>;
    expect(stand.angebot).toMatchObject({
      quoteNumber: (await quote(id)).quote_number, customerName: 'Familie Link', notes: 'Therme tauschen.',
      totalBrutto: 3264, vatRate: 0.2,
    });
    expect((stand.angebot.positions as unknown[]).length).toBe(3);
    expect(stand.angebot.positions).toEqual(expect.arrayContaining([
      expect.objectContaining({ art: 'titel', label: 'Material' }),
      expect.objectContaining({ label: 'Therme', rabattProzent: 10 }),
    ]));
    expect(stand.kunde).toMatchObject({ name: 'Familie Link' });
    expect(stand.aussteller).toMatchObject({ name: 'Link Installationen GmbH', addressLine: 'Werkstraße 1, 1010 Wien' });
    // Die Prüfsumme ist SHA-256 über den Stand als Text — nachrechenbar.
    const { rows } = await db.query<{ h: string }>(
      `select encode(sha256(convert_to(schnappschuss::text, 'UTF8')), 'hex') as h from public.angebot_links where id = $1`, [l.id]);
    expect(z.schnappschuss_hash).toBe(rows[0].h);
    expect(z.gueltig_bis).toBe(tagPlus(20));
    // Den Schlüssel kennt die Datenbank nicht — nur seinen Hashwert.
    expect(z.schluessel_hash).toBe(sha(l.schluessel));
    expect(l.schluessel).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('Gültigkeit: Vorgabe 30 Tage, wenn die Bindefrist vorbei ist; frei wählbar ab heute bis ein Jahr', async () => {
    const id = await angebot({ valid_until: '2020-01-01' });
    const l = await neuerLink(id);
    expect((await linkZeile(l.id)).gueltig_bis).toBe(tagPlus(30));
    expect((await erzeugen(chefin, id, 'Pauschal', 'LK', tagPlus(-1))).error?.message).toMatch(/höchstens ein Jahr/);
    expect((await erzeugen(chefin, id, 'Pauschal', 'LK', tagPlus(366))).error?.message).toMatch(/höchstens ein Jahr/);
    const { data, error } = await erzeugen(chefin, id, 'Pauschal', 'LK', tagPlus(365));
    expect(error).toBeNull();
    expect((data as { gueltig_bis: string }).gueltig_bis).toBe(tagPlus(365));
  });

  it('ein neuer Link widerruft den alten — der alte antwortet danach wie ein unbekannter', async () => {
    const id = await angebot();
    const alt = await neuerLink(id);
    expect((await abruf(alt.schluessel)).data).toMatchObject({ zustand: 'offen' });
    const neu = await neuerLink(id, 'Regie', 'NL');
    expect(await linkZeile(alt.id)).toMatchObject({ widerrufen_von_uid: chefin.uid, widerrufen_von_name: 'Carla Chefin' });
    expect((await abruf(alt.schluessel)).data).toBeNull();
    expect((await abruf(neu.schluessel)).data).toMatchObject({ zustand: 'offen' });
    // Die Datenbank hält fest: höchstens ein offener Link je Angebot.
    const { error } = await admin.from('angebot_links').update({ widerrufen_am: null, widerrufen_von_uid: null }).eq('id', alt.id);
    expect(error?.message).toMatch(/angebot_links_ein_offener/);
  });
});

describe('Abruf', () => {
  it('protokolliert jedes Öffnen — erstes, letztes, Anzahl; keine Adresse, kein Gerät', async () => {
    const id = await angebot();
    const l = await neuerLink(id);
    expect(await linkZeile(l.id)).toMatchObject({ geoeffnet_anzahl: 0, zuerst_geoeffnet_am: null });
    const r = await abruf(l.schluessel);
    // Die Bindefrist liegt weiter als ein Jahr: der Link gilt ein Jahr.
    expect(r.data).toMatchObject({ zustand: 'offen', gueltig_bis: tagPlus(365) });
    expect(Object.keys(r.data as object).sort()).toEqual(['gueltig_bis', 'pruefsumme', 'schnappschuss', 'zustand']);
    const erst = await linkZeile(l.id);
    await new Promise((w) => setTimeout(w, 20));
    await abruf(l.schluessel);
    const dann = await linkZeile(l.id);
    expect(dann.geoeffnet_anzahl).toBe(2);
    expect(dann.zuerst_geoeffnet_am).toBe(erst.zuerst_geoeffnet_am);
    expect(Date.parse(String(dann.zuletzt_geoeffnet_am))).toBeGreaterThan(Date.parse(String(erst.zuletzt_geoeffnet_am)));
    const { rows } = await db.query<{ spalte: string }>(
      `select column_name as spalte from information_schema.columns where table_name = 'angebot_links'
        and (column_name ~ '(ip|adresse|geraet|agent)')`);
    expect(rows).toEqual([]);
  });

  it('unbekannt, widerrufen, abgelaufen, gegenstandslos und geändert bekommen dieselbe Antwort', async () => {
    expect((await abruf('A'.repeat(43))).data).toBeNull();
    expect((await admin.rpc('angebot_link_abruf', { p_hash: 'kein-hash' })).data).toBeNull();

    const id1 = await angebot();
    const widerrufen = await neuerLink(id1);
    expect((await chefin.client.rpc('angebot_link_widerrufen', { p_link: widerrufen.id })).error).toBeNull();

    const id2 = await angebot();
    const abgelaufen = await neuerLink(id2);
    await admin.from('angebot_links').update({ gueltig_bis: tagPlus(-1) }).eq('id', abgelaufen.id);

    const id3 = await angebot();
    const gegenstandslos = await neuerLink(id3);
    expect((await chefin.client.from('quotes').update({ status: 'Abgelehnt' }).eq('id', id3)).error).toBeNull();

    const id4 = await angebot();
    const geaendert = await neuerLink(id4);
    // An der App vorbei geändert — angenommen würde sonst etwas anderes, als der Kunde sah.
    expect((await chefin.client.from('quotes').update({ notes: 'Doch zwei Thermen.' }).eq('id', id4)).error).toBeNull();

    for (const l of [widerrufen, abgelaufen, gegenstandslos, geaendert]) {
      expect((await abruf(l.schluessel)).data).toBeNull();
      expect((await annehmen(l.schluessel)).data).toBeNull();
      expect((await linkZeile(l.id)).geoeffnet_anzahl).toBe(0);
    }
    clientEinreichen(chefin.client);
    expect((await links.listAngebotLinks(id1))[0].zustand).toBe('widerrufen');
    expect((await links.listAngebotLinks(id2))[0].zustand).toBe('abgelaufen');
    expect((await links.listAngebotLinks(id3))[0].zustand).toBe('gegenstandslos');
    expect((await links.listAngebotLinks(id4))[0].zustand).toBe('geaendert');
  }, 60_000);

  it('ein ruhender Betrieb antwortet wie unbekannt', async () => {
    const id = await angebot();
    const l = await neuerLink(id);
    await db.query(
      `insert into public.betrieb_zustand (betrieb_kennung, name, deaktiviert_am, deaktiviert_grund)
       values ($1, $1, now(), 'Prüfung') on conflict (betrieb_kennung) do update set deaktiviert_am = now()`, [A]);
    try {
      expect((await abruf(l.schluessel)).data).toBeNull();
      expect((await annehmen(l.schluessel)).data).toBeNull();
    } finally {
      await db.query('update public.betrieb_zustand set deaktiviert_am = null where betrieb_kennung = $1', [A]);
    }
    expect((await abruf(l.schluessel)).data).toMatchObject({ zustand: 'offen' });
  });

  it('nur der Dienstschlüssel ruft ab, nimmt an und lehnt ab', async () => {
    const id = await angebot();
    const l = await neuerLink(id);
    for (const k of [chefin, monteur]) {
      expect((await k.client.rpc('angebot_link_abruf', { p_hash: sha(l.schluessel) })).error?.message).toMatch(/permission denied/);
      expect((await k.client.rpc('angebot_link_annehmen', {
        p_hash: sha(l.schluessel), p_name: 'X Y', p_unterschrift: BILD, p_bestaetigt: true,
      })).error?.message).toMatch(/permission denied/);
      expect((await k.client.rpc('angebot_link_ablehnen', { p_hash: sha(l.schluessel), p_name: 'X Y', p_grund: null })).error?.message)
        .toMatch(/permission denied/);
    }
    expect(((await quote(id)).status)).toBe('Versendet');
  });
});

describe('Annehmen', () => {
  it('legt dieselbe Baustelle an wie die interne Annahme — und ersetzt dieselben Fassungen', async () => {
    // Zwei gleiche Fälle: ein versendetes Angebot mit einer neuen Fassung im Entwurf.
    const internAlt = await angebot();
    const internEntwurf = await angebot({ vorgaenger_id: internAlt, status: 'Entwurf' });
    const linkAlt = await angebot();
    const linkEntwurf = await angebot({ vorgaenger_id: linkAlt, status: 'Entwurf' });

    const { error } = await chefin.client.rpc('angebot_annehmen', {
      p_angebot: internAlt, p_praefix: 'GL', p_abrechnung: 'Einheitspreis',
    });
    expect(error).toBeNull();
    const l = await neuerLink(linkAlt, 'Einheitspreis', 'GL');
    const r = await annehmen(l.schluessel);
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ zustand: 'angenommen', name: 'Maria Kundin', neu: true });

    const qi = await quote(internAlt);
    const ql = await quote(linkAlt);
    expect(String(ql.project_number)).toMatch(/^GL-\d{4}-\d{4}$/);
    const { data: projekte } = await admin.from('projects').select('*').in('project_number', [String(qi.project_number), String(ql.project_number)]);
    expect(projekte).toHaveLength(2);
    const ohne = (p: Record<string, unknown>, nummer: string) => {
      const { id, project_number, created_at, updated_at, description, ...rest } = p;
      void id; void project_number; void created_at; void updated_at;
      return { ...rest, description: String(description).replace(nummer, '<Angebot>') };
    };
    const pi = projekte!.find((p) => p.project_number === qi.project_number)!;
    const pk = projekte!.find((p) => p.project_number === ql.project_number)!;
    expect(ohne(pk, String(ql.quote_number))).toEqual(ohne(pi, String(qi.quote_number)));
    expect(pk).toMatchObject({ billing_mode: 'Einheitspreis', estimated_hours: 8, contact_name: 'Maria Link', status: 'Aktiv' });

    // Das Angebot selbst: Stand, Baustelle, Zeitpunkt der Annahme — wie intern.
    for (const [q, p] of [[qi, pi], [ql, pk]] as const) {
      expect(q.status).toBe('Angenommen');
      expect(q.project_id).toBe(p.id);
      expect(q.angenommen_am).not.toBeNull();
    }
    // Die neue Fassung im Entwurf ist ersetzt — mit den Firmendaten, die ihr Verlassen des Entwurfs festhält.
    const ei = await quote(internEntwurf);
    const el = await quote(linkEntwurf);
    expect([ei.status, el.status]).toEqual(['Ersetzt', 'Ersetzt']);
    expect(ei.aussteller_stand).not.toBeNull();
    expect(el.aussteller_stand).toBe(ei.aussteller_stand);

    // Das Journal: dieselben Zeilen in derselben Reihenfolge, nur der Akteur ist der Kunde.
    const journal = async (ids: string[], projekt: string) => ((await admin.from('aenderungsjournal')
      .select('objektart, objekt_id, art, aenderungen, von_uid, von_name, kunde_id')
      .in('objekt_id', [...ids, projekt]).order('am')).data ?? [])
      // Das Anlegen der Angebote selbst gehört nicht zur Annahme.
      .filter((j) => !(j.objektart === 'angebot' && j.art === 'angelegt'));
    const ji = await journal([internAlt, internEntwurf], String(pi.id));
    const jl = await journal([linkAlt, linkEntwurf], String(pk.id));
    const form = (j: Record<string, unknown>, nummer: string) => ({
      objektart: j.objektart, art: j.art, kunde_id: j.kunde_id,
      aenderungen: JSON.parse(JSON.stringify(j.aenderungen).split(nummer).join('<Baustelle>')),
    });
    expect(jl.map((j) => form(j, String(ql.project_number)))).toEqual(ji.map((j) => form(j, String(qi.project_number))));
    expect(jl.map((j) => j.objektart)).toEqual(['baustelle', 'angebot', 'angebot']);
    expect(jl.every((j) => j.von_uid === null && j.von_name === 'Kunde über Link: Maria Kundin')).toBe(true);
    expect(ji.every((j) => j.von_uid === chefin.uid)).toBe(true);

    // Der Link: verbraucht, mit Name, Zeitpunkt, Unterschrift und Prüfsumme.
    const z = await linkZeile(l.id);
    expect(z).toMatchObject({ angenommen_name: 'Maria Kundin', angenommen_unterschrift: BILD });
    expect(z.angenommen_am).not.toBeNull();
    expect(z.schnappschuss_hash).toMatch(/^[0-9a-f]{64}$/);
  }, 60_000);

  it('die Journalzeile steht im Verlauf des Angebots mit „Kunde über Link: <Name>“', async () => {
    const id = await angebot();
    const l = await neuerLink(id);
    await annehmen(l.schluessel, '  Josef Huber  ');
    const { data } = await chefin.client.from('objekt_verlauf').select('art, aenderungen, von_name')
      .eq('objektart', 'angebot').eq('objekt_id', id).eq('art', 'geaendert');
    expect(data).toEqual([expect.objectContaining({
      art: 'geaendert', von_name: 'Kunde über Link: Josef Huber',
      aenderungen: expect.objectContaining({ status: { alt: 'Versendet', neu: 'Angenommen' } }),
    })]);
  });

  it('ein zweiter Aufruf nimmt nicht noch einmal an — er sagt, wann es war', async () => {
    const id = await angebot();
    const l = await neuerLink(id);
    const erst = await annehmen(l.schluessel);
    const zahl = (await admin.from('projects').select('id', { count: 'exact', head: true }).eq('company_id', A)).count;
    const noch = await annehmen(l.schluessel, 'Jemand Anderer');
    expect(noch.data).toMatchObject({
      zustand: 'angenommen', neu: false, name: 'Maria Kundin',
      entschieden_am: (erst.data as { entschieden_am: string }).entschieden_am,
    });
    expect((await ablehnen(l.schluessel)).data).toMatchObject({ zustand: 'angenommen', neu: false });
    expect((await admin.from('projects').select('id', { count: 'exact', head: true }).eq('company_id', A)).count).toBe(zahl);
    expect((await linkZeile(l.id)).angenommen_name).toBe('Maria Kundin');
    // Der Abruf zeigt die Bestätigung.
    expect((await abruf(l.schluessel)).data).toMatchObject({ zustand: 'angenommen', name: 'Maria Kundin' });
  });

  it('zwei gleichzeitige Annahmen ergeben genau eine Baustelle', async () => {
    const id = await angebot();
    const l = await neuerLink(id);
    const vorher = (await admin.from('projects').select('id', { count: 'exact', head: true }).eq('company_id', A)).count ?? 0;
    const ergebnisse = await Promise.all([annehmen(l.schluessel, 'Erste Person'), annehmen(l.schluessel, 'Zweite Person')]);
    expect(ergebnisse.map((e) => e.error)).toEqual([null, null]);
    const daten = ergebnisse.map((e) => e.data as { zustand: string; neu: boolean; name: string });
    expect(daten.map((d) => d.zustand)).toEqual(['angenommen', 'angenommen']);
    expect(daten.filter((d) => d.neu)).toHaveLength(1);
    expect(daten[0].name).toBe(daten[1].name);
    expect((await admin.from('projects').select('id', { count: 'exact', head: true }).eq('company_id', A)).count).toBe(vorher + 1);
  });

  it('eine inzwischen ersetzte Fassung wird abgelehnt — auch neben einer schon angenommenen (Altbestand)', async () => {
    const alt = await angebot();
    const neu = await angebot({ vorgaenger_id: alt });
    const l = await neuerLink(alt);
    expect((await chefin.client.rpc('angebot_annehmen', { p_angebot: neu, p_praefix: 'LK', p_abrechnung: 'Pauschal' })).error).toBeNull();
    expect((await quote(alt)).status).toBe('Ersetzt');
    expect((await annehmen(l.schluessel)).data).toBeNull();
    expect((await quote(alt)).status).toBe('Ersetzt');

    // Altbestand: eine Fassung angenommen, die andere blieb versendet.
    const eins = await angebot();
    const zwei = await angebot({ vorgaenger_id: eins });
    const l2 = await neuerLink(eins);
    expect((await admin.from('quotes').update({ status: 'Angenommen' }).eq('id', zwei)).error).toBeNull();
    expect((await annehmen(l2.schluessel)).data).toBeNull();
    expect((await quote(eins)).status).toBe('Versendet');
  });

  it('ohne Name, Bestätigung oder Unterschrift wird nicht angenommen', async () => {
    const id = await angebot();
    const l = await neuerLink(id);
    expect((await annehmen(l.schluessel, ' ')).error?.message).toMatch(/Namen/);
    expect((await annehmen(l.schluessel, 'Maria Kundin', BILD, false)).error?.message).toMatch(/Bestätigung/);
    expect((await annehmen(l.schluessel, 'Maria Kundin', 'data:image/png;base64,!!')).error?.message).toMatch(/Unterschrift/);
    expect((await annehmen(l.schluessel, 'Maria Kundin', 'x'.repeat(10))).error?.message).toMatch(/Unterschrift/);
    expect((await quote(id)).status).toBe('Versendet');
    expect((await linkZeile(l.id)).angenommen_am).toBeNull();
  });

  it('der entschiedene Link bleibt als Bestätigung lesbar — bis zum Ablauf, mindestens 30 Tage', async () => {
    const id = await angebot();
    const l = await neuerLink(id);
    await annehmen(l.schluessel);
    await admin.from('angebot_links').update({ gueltig_bis: tagPlus(-5), angenommen_am: new Date(Date.now() - 10 * 86_400_000).toISOString() }).eq('id', l.id);
    expect((await abruf(l.schluessel)).data).toMatchObject({ zustand: 'angenommen' });
    await admin.from('angebot_links').update({ angenommen_am: new Date(Date.now() - 32 * 86_400_000).toISOString() }).eq('id', l.id);
    expect((await abruf(l.schluessel)).data).toBeNull();
  });
});

describe('Ablehnen', () => {
  it('wirkt wie „Als abgelehnt markieren“ — mit Tag, Grund und Journal im Namen des Kunden', async () => {
    const id = await angebot();
    const l = await neuerLink(id);
    expect((await ablehnen(l.schluessel, 'X')).error?.message).toMatch(/Namen/);
    const r = await ablehnen(l.schluessel, 'Maria Kundin', 'Zu teuer');
    expect(r.data).toMatchObject({ zustand: 'abgelehnt', name: 'Maria Kundin', neu: true });
    const q = await quote(id);
    expect(q.status).toBe('Abgelehnt');
    expect(q.abgelehnt_am).not.toBeNull();
    expect(await linkZeile(l.id)).toMatchObject({ abgelehnt_name: 'Maria Kundin', abgelehnt_grund: 'Zu teuer' });
    const { data } = await admin.from('aenderungsjournal').select('aenderungen, von_name').eq('objekt_id', id).eq('art', 'geaendert');
    expect(data).toEqual([{ aenderungen: { status: { alt: 'Versendet', neu: 'Abgelehnt' } }, von_name: 'Kunde über Link: Maria Kundin' }]);
    // Danach nimmt der Link nichts mehr an.
    expect((await annehmen(l.schluessel)).data).toMatchObject({ zustand: 'abgelehnt', neu: false });
    expect((await quote(id)).status).toBe('Abgelehnt');
    // Eine neue Fassung bekommt einen neuen Link (wie intern: „Neue Fassung“ aus einem abgelehnten).
    const neu = await angebot({ vorgaenger_id: id });
    expect((await erzeugen(chefin, neu)).error).toBeNull();
  });
});

describe('Widerrufen und Lesen im Büro', () => {
  it('widerrufen nur die Führung, nur solange offen; ein zweites Mal ändert nichts', async () => {
    const id = await angebot();
    const l = await neuerLink(id);
    for (const k of [monteur, buch, verwaltung]) {
      expect((await k.client.rpc('angebot_link_widerrufen', { p_link: l.id })).error?.message, k.rolle).toMatch(/nur die Führung/);
    }
    expect((await fremd.client.rpc('angebot_link_widerrufen', { p_link: l.id })).error?.message).toMatch(/nicht gefunden/);
    clientEinreichen(pl.client);
    await links.angebotLinkWiderrufen(l.id);
    const erst = await linkZeile(l.id);
    await links.angebotLinkWiderrufen(l.id);
    expect((await linkZeile(l.id)).widerrufen_am).toBe(erst.widerrufen_am);

    const id2 = await angebot();
    const l2 = await neuerLink(id2);
    await annehmen(l2.schluessel);
    await expect(links.angebotLinkWiderrufen(l2.id)).rejects.toThrow(/schon angenommen/);
  });

  it('das Büro liest den Zustand aus derselben Quelle — ohne Hashwert, Stand und Zähler; nur wer Angebote liest', async () => {
    const id = await angebot();
    const l = await neuerLink(id);
    await abruf(l.schluessel);
    clientEinreichen(buch.client);
    const [z] = await links.listAngebotLinks(id);
    expect(z).toMatchObject({ id: l.id, zustand: 'offen', abrechnung: 'Pauschal', praefix: 'LK', geoeffnetAnzahl: 1, erzeugtVonName: 'Carla Chefin' });
    expect(typeof z.erzeugtAm).toBe('number');
    expect(z).not.toHaveProperty('schluesselHash');
    expect(z).not.toHaveProperty('schnappschuss');
    expect(z).not.toHaveProperty('anfragenImFenster');
    for (const k of [monteur, verwaltung]) {
      expect((await k.client.rpc('angebot_links_stand', { p_angebot: id })).error?.message, k.rolle).toMatch(/wer die Angebote liest/);
      expect((await k.client.from('angebot_links').select('id').eq('quote_id', id)).data, k.rolle).toEqual([]);
    }
    expect((await fremd.client.rpc('angebot_links_stand', { p_angebot: id })).error?.message).toMatch(/nicht gefunden/);
    expect((await fremd.client.from('angebot_links').select('id').eq('quote_id', id)).data).toEqual([]);
    // Schreiben kann niemand direkt — auch nicht die Spitze.
    expect((await chefin.client.from('angebot_links').update({ gueltig_bis: '2100-01-01' }).eq('id', l.id).select('id')).error?.message)
      .toMatch(/permission denied/);
    expect((await chefin.client.from('angebot_links').delete().eq('id', l.id).select('id')).error?.message).toMatch(/permission denied/);
  });
});

describe('Modul (E51, V3)', () => {
  it('ausgeschaltet: kein neuer Link, der vorhandene antwortet wie unbekannt — eingeschaltet gilt er wieder', async () => {
    const id = await angebot();
    const l = await neuerLink(id);
    for (const festlegung of [{ 'angebote.online_annahme': false }, { angebote: false }]) {
      expect((await admins.client.from('companies').update({ modules: festlegung }).eq('id', A)).error).toBeNull();
      try {
        expect((await erzeugen(chefin, id)).error?.message).toMatch(/ausgeschaltet/);
        expect((await abruf(l.schluessel)).data).toBeNull();
        expect((await annehmen(l.schluessel)).data).toBeNull();
        // Nichts wird widerrufen oder gelöscht, und ein Abruf zählt nicht als Öffnen.
        expect(await linkZeile(l.id)).toMatchObject({ widerrufen_am: null, geoeffnet_anzahl: festlegung.angebote === false ? 1 : 0 });
      } finally {
        expect((await admins.client.from('companies').update({ modules: {} }).eq('id', A)).error).toBeNull();
      }
      expect((await abruf(l.schluessel)).data).toMatchObject({ zustand: 'offen' });
    }
  });

  it('app.modul_aktiv entscheidet wie aktiveSchalter — für eine Reihe von Festlegungen', async () => {
    const ids = MODULE.flatMap((m) => [m.id, ...(m.unter ?? []).map((f) => f.id)]);
    const festlegungen: Record<string, unknown>[] = [
      {}, { angebote: false }, { 'angebote.online_annahme': false }, { angebote: false, 'angebote.online_annahme': true },
      { 'angebote.online_annahme': true }, { rechnungen: false }, { rechnungen: false, nachkalkulation: true },
      { nachkalkulation: false }, { angebote: true, 'angebote.online_annahme': 0 }, { 'angebote.online_annahme': 1 },
      { 'angebote.online_annahme': '' }, { 'angebote.online_annahme': 'nein' }, { 'angebote.online_annahme': null },
      { 'angebote.online_annahme': {} }, { 'angebote.online_annahme': [] }, { rechnungen: 0, angebote: 'ja' },
      Object.fromEntries(ids.map((i) => [i, false])), Object.fromEntries(ids.map((i) => [i, true])),
    ];
    // Dazu ein fester Zufall über alle Schalter — dieselbe Folge bei jedem Lauf.
    let saat = 7;
    for (let n = 0; n < 40; n += 1) {
      festlegungen.push(Object.fromEntries(ids.flatMap((i) => {
        saat = (saat * 1103515245 + 12345) % 2147483648;
        const w = saat % 3;
        return w === 2 ? [] : [[i, w === 1]];
      })));
    }
    const abweichungen: string[] = [];
    await db.query('begin');
    try {
      await db.query('set local session_replication_role = replica');
      for (const f of [null, ...festlegungen]) {
        await db.query('update public.companies set modules = $2 where id = $1', [A, f === null ? null : JSON.stringify(f)]);
        const erwartet = aktiveSchalter((f ?? undefined) as Record<string, boolean> | undefined);
        for (const id of [...ids, 'gibtsnicht', 'angebote.gibtsnicht']) {
          const { rows } = await db.query<{ an: boolean }>('select app.modul_aktiv($1, $2) as an', [A, id]);
          if (rows[0].an !== erwartet.has(id as never)) abweichungen.push(`${JSON.stringify(f)} ${id}: SQL ${rows[0].an}`);
        }
      }
    } finally {
      await db.query('rollback');
    }
    expect(abweichungen).toEqual([]);
  }, 60_000);
});

describe('Erhaltung: die interne Annahme und der Zähler', () => {
  it('angebot_annehmen behält Signatur, Rechte und Ausführungsrecht', async () => {
    const { rows } = await db.query<{ args: string; definer: boolean; pfad: string[]; auth: boolean; anon: boolean; ergebnis: string }>(`
      select pg_get_function_arguments(p.oid) as args, p.prosecdef as definer, p.proconfig as pfad,
             has_function_privilege('authenticated', p.oid, 'execute') as auth,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             pg_get_function_result(p.oid) as ergebnis
        from pg_proc p where p.oid = 'public.angebot_annehmen(uuid,text,text)'::regprocedure`);
    expect(rows).toEqual([{
      args: "p_angebot uuid, p_praefix text, p_abrechnung text DEFAULT 'Pauschal'::text",
      definer: true, pfad: ['search_path=""'], auth: true, anon: false, ergebnis: 'text',
    }]);
    const n = await db.query<{ args: string; auth: boolean; anon: boolean }>(`
      select pg_get_function_arguments(p.oid) as args,
             has_function_privilege('authenticated', p.oid, 'execute') as auth,
             has_function_privilege('anon', p.oid, 'execute') as anon
        from pg_proc p where p.oid = 'public.naechste_nummer(text,integer,integer,integer)'::regprocedure`);
    expect(n.rows).toEqual([{ args: 'p_art text, p_jahr integer, p_seed integer DEFAULT 0, p_wunsch integer DEFAULT NULL::integer', auth: true, anon: false }]);
  });

  it('dieselben Meldungen für dieselben Fälle — Rolle, fremder Betrieb, Abrechnungsart, ersetzte Fassung', async () => {
    const id = await angebot();
    for (const k of [monteur, verwaltung, buch]) {
      const r = await k.client.rpc('angebot_annehmen', { p_angebot: id, p_praefix: 'LK', p_abrechnung: 'Pauschal' });
      expect([r.error?.code, r.error?.message], k.rolle).toEqual(['42501', 'Angebote annehmen darf nur die Führung']);
    }
    const f = await fremd.client.rpc('angebot_annehmen', { p_angebot: id, p_praefix: 'LK', p_abrechnung: 'Pauschal' });
    expect([f.error?.code, f.error?.message]).toEqual(['P0002', 'Angebot nicht gefunden']);
    const a = await chefin.client.rpc('angebot_annehmen', { p_angebot: id, p_praefix: 'LK', p_abrechnung: 'Festpreis' });
    expect([a.error?.code, a.error?.message]).toEqual(['22023', 'Unbekannte Abrechnungsart']);
    const alt = await angebot();
    const neu = await angebot({ vorgaenger_id: alt });
    await chefin.client.rpc('angebot_annehmen', { p_angebot: neu, p_praefix: 'LK', p_abrechnung: 'Pauschal' });
    const e = await chefin.client.rpc('angebot_annehmen', { p_angebot: alt, p_praefix: 'LK', p_abrechnung: 'Pauschal' });
    expect(e.error?.code).toBe('55000');
    expect(e.error?.message).toMatch(/^Angebot AN-LK-.* ist durch eine andere Fassung ersetzt$/);
    // Ein verworfenes: wie bisher hält der Papierkorb es auf.
    const weg = await angebot({ status: 'Entwurf' });
    await chefin.client.from('quotes').update({ status: 'Verworfen' }).eq('id', weg);
    expect((await chefin.client.rpc('angebot_annehmen', { p_angebot: weg, p_praefix: 'LK', p_abrechnung: 'Pauschal' })).error?.message)
      .toMatch(/liegt im Papierkorb/);
  });

  it('nimmt an wie bisher: Nummer aus dem Zähler mit Vorsatz, ohne Vorsatz ohne, wiederholt dieselbe — auch der Support mit „mitarbeiten“', async () => {
    const jahr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' }).slice(0, 4);
    const id = await angebot();
    const r = await chefin.client.rpc('angebot_annehmen', { p_angebot: id, p_praefix: 'ER', p_abrechnung: 'Regie' });
    expect(String(r.data)).toMatch(new RegExp(`^ER-${jahr}-\\d{4}$`));
    expect((await chefin.client.rpc('angebot_annehmen', { p_angebot: id, p_praefix: 'XX', p_abrechnung: 'Pauschal' })).data).toBe(r.data);
    const ohne = await chefin.client.rpc('angebot_annehmen', { p_angebot: await angebot(), p_praefix: '', p_abrechnung: 'Regie' });
    expect(String(ohne.data)).toMatch(new RegExp(`^${jahr}-\\d{4}$`));
    // Der Zähler läuft über beide Wege weiter: keine Nummer doppelt.
    const lfd = (n: unknown) => Number(String(n).slice(-4));
    expect(lfd(ohne.data)).toBe(lfd(r.data) + 1);
    const l = await neuerLink(await angebot(), 'Regie', '');
    await annehmen(l.schluessel);
    const viaLink = (await admin.from('angebot_links').select('quote_id').eq('id', l.id).single()).data!.quote_id;
    expect(lfd((await quote(viaLink)).project_number)).toBe(lfd(ohne.data) + 1);
    expect(lfd((await chefin.client.rpc('naechste_nummer', { p_art: 'projects', p_jahr: Number(jahr) })).data)).toBe(lfd(ohne.data) + 2);

    const { data: freigabe } = await chefin.client.from('support_freigaben').insert({
      company_id: A, gewaehrt_von: chefin.uid, grund: 'Annahme prüfen', stufe: 'mitarbeiten',
      gilt_bis: new Date(Date.now() + 3_600_000).toISOString(),
    }).select('id').single();
    try {
      await einblickBeginnen(plattform, A, freigabe!.id);
      const s = await plattform.client.rpc('angebot_annehmen', { p_angebot: await angebot(), p_praefix: 'SU', p_abrechnung: 'Pauschal' });
      expect(s.error).toBeNull();
      expect(String(s.data)).toMatch(new RegExp(`^SU-${jahr}-\\d{4}$`));
      // Rechnungsnummern bleiben ihm verschlossen — der Zähler fragt wie bisher.
      expect((await plattform.client.rpc('naechste_nummer', { p_art: 'invoices', p_jahr: Number(jahr) })).error?.message)
        .toMatch(/Rechnungsnummern vergibt nur der Betrieb selbst/);
    } finally {
      await admin.from('support_zugriffe').delete().eq('company_id', A);
      await admin.from('support_freigaben').delete().eq('company_id', A);
    }
    expect((await monteur.client.rpc('naechste_nummer', { p_art: 'projects', p_jahr: Number(jahr) })).error?.message)
      .toMatch(/Nur die Führung vergibt Baustellennummern/);
  }, 60_000);
});

describe('Datenauskunft und Löschung', () => {
  it('der Kunde bekommt seine Links mit Annahme und Unterschrift — ohne wer im Betrieb sie erzeugt hat', async () => {
    const id = await angebot();
    const l = await neuerLink(id);
    await abruf(l.schluessel);
    await annehmen(l.schluessel, 'Maria Kundin');
    const { data, error } = await chefin.client.rpc('person_auskunft', { p_art: 'kunde', p_id: kunde });
    expect(error).toBeNull();
    const eintraege = (data as { daten: { annahme_links: Record<string, unknown>[] } }).daten.annahme_links;
    for (const e of eintraege) {
      expect(Object.keys(e).some((k) => /erzeugt_von|widerrufen_von|schluessel|schnappschuss$/.test(k)), JSON.stringify(Object.keys(e))).toBe(false);
    }
    expect(eintraege.some((e) => e.angenommen_name === 'Maria Kundin' && e.angenommen_unterschrift === BILD && e.geoeffnet_anzahl === 1)).toBe(true);

    const p = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: chefin.uid });
    const bearbeitet = (p.data as { als_bearbeiter: Record<string, number> }).als_bearbeiter;
    expect(bearbeitet.annahme_links_erzeugt).toBeGreaterThan(0);
    expect(bearbeitet.annahme_links_widerrufen).toBeGreaterThan(0);
  });

  it('die Löschung eines Kunden widerruft seine offenen Links; ein angenommener bleibt mit dem Angebot', async () => {
    const { data: k } = await admin.from('customers').insert({ company_id: A, name: 'Familie Weg', kundenart: 'privat' }).select('id').single();
    const offen = await angebot({ customer_id: k!.id, customer_name: 'Familie Weg' });
    const lOffen = await neuerLink(offen);
    const fertig = await angebot({ customer_id: k!.id, customer_name: 'Familie Weg' });
    const lFertig = await neuerLink(fertig);
    await annehmen(lFertig.schluessel, 'Frau Weg');

    const probe = await chefin.client.rpc('person_loeschen', { p_art: 'kunde', p_id: k!.id, p_nur_pruefen: true });
    expect((probe.data as { sofort: Record<string, number> }).sofort.annahme_links).toBe(1);
    expect((await linkZeile(lOffen.id)).widerrufen_am).toBeNull();

    const echt = await chefin.client.rpc('person_loeschen', { p_art: 'kunde', p_id: k!.id, p_nur_pruefen: false });
    expect(echt.error).toBeNull();
    expect((echt.data as { ganz: boolean }).ganz).toBe(false);
    expect(await linkZeile(lOffen.id)).toMatchObject({ widerrufen_von_name: 'Carla Chefin (Löschung des Kunden)' });
    expect((await abruf(lOffen.schluessel)).data).toBeNull();
    expect(await linkZeile(lFertig.id)).toMatchObject({ angenommen_name: 'Frau Weg', angenommen_unterschrift: BILD, widerrufen_am: null });
  });
});

/*
  DIE FÜHRUNG ERFÄHRT ES (M02a): je Entscheidung des Kunden genau EIN
  Anstoß an `push-melden` — nicht beim zweiten Aufruf, nicht bei der
  internen Annahme (die meldet heute auch nichts). Die Function holt den
  Link genau einmal (`push_angebot_link`). Bis vor Google, wie `push.test.ts`:
  ohne Dienstkonto antwortet sie 503 und sagt, was sie verschickt hätte.
*/
describe('Push an die Führung', () => {
  const FUNKTION_INTERN = 'http://supabase_kong_Prototype-App-Installateure:8000/functions/v1/push-melden';

  beforeAll(async () => {
    await db.query(
      `select vault.create_secret($1, 'push_url'), vault.create_secret($2, 'push_schluessel')`,
      [FUNKTION_INTERN, SERVICE],
    ).catch(() => undefined); // gibt es sie schon (push.test.ts), bleiben sie
    for (const k of [chefin, admins, pl, buch]) {
      await admin.from('user_prefs').upsert({ user_id: k.uid, company_id: A, push_tokens: [`geraet-${k.uid}`] });
    }
  });

  /** Die Anstöße an die Push-Function seit `ab` — ihre Anfragenummern. */
  const anstoesse = async (ab: Date) => (await db.query<{ anfrage: string }>(
    `select anfrage::text from app.anstoss_wache where art = 'push' and angestossen >= $1 order by angestossen`, [ab])).rows.map((r) => r.anfrage);

  async function antwort(anfrage: string): Promise<{ status_code: number; content: string } | null> {
    for (let i = 0; i < 40; i += 1) {
      const { rows } = await db.query<{ status_code: number; content: string }>(
        'select status_code, content from net._http_response where id = $1', [anfrage]);
      if (rows[0]) return rows[0];
      await new Promise((w) => setTimeout(w, 500));
    }
    return null;
  }

  it('annehmen stößt genau einmal an — der zweite Aufruf und die interne Annahme nicht', async () => {
    const id = await angebot();
    const l = await neuerLink(id);
    const ab = new Date((await db.query<{ t: Date }>('select now() as t')).rows[0].t);
    expect((await annehmen(l.schluessel)).data).toMatchObject({ neu: true });
    const erst = await anstoesse(ab);
    expect(erst).toHaveLength(1);
    expect((await annehmen(l.schluessel)).data).toMatchObject({ neu: false });
    expect((await ablehnen(l.schluessel)).data).toMatchObject({ neu: false });
    expect(await anstoesse(ab)).toHaveLength(1);

    const r = await antwort(erst[0]);
    expect(r?.status_code).toBe(503); // ohne Dienstkonto wird nicht verschickt — bis dahin lief alles
    // Projektleitung, Geschäftsführung, Administration — nicht die Buchhaltung, nicht der Monteur.
    expect(JSON.parse(r!.content).geplant).toEqual([{ art: 'notifyAngebot', empfaenger: 3, geraete: 3 }]);
    expect((await linkZeile(l.id)).gemeldet_am).not.toBeNull();

    // Erhaltung: die interne Annahme meldet nichts.
    const intern = await angebot();
    const ab2 = new Date((await db.query<{ t: Date }>('select now() as t')).rows[0].t);
    expect((await chefin.client.rpc('angebot_annehmen', { p_angebot: intern, p_praefix: 'LK', p_abrechnung: 'Pauschal' })).error).toBeNull();
    expect(await anstoesse(ab2)).toEqual([]);
  }, 60_000);

  it('ablehnen stößt ebenso genau einmal an', async () => {
    const id = await angebot();
    const l = await neuerLink(id);
    const ab = new Date((await db.query<{ t: Date }>('select now() as t')).rows[0].t);
    await ablehnen(l.schluessel);
    await ablehnen(l.schluessel);
    const a = await anstoesse(ab);
    expect(a).toHaveLength(1);
    const r = await antwort(a[0]);
    expect(JSON.parse(r!.content).geplant).toEqual([{ art: 'notifyAngebot', empfaenger: 3, geraete: 3 }]);
  }, 60_000);

  it('ein zweiter Anstoß derselben Entscheidung meldet nichts (push_angebot_link gibt den Link nur einmal heraus)', async () => {
    const id = await angebot();
    const l = await neuerLink(id);
    await annehmen(l.schluessel);
    // Gleich, ob die Function den ersten Anstoß schon hatte: höchstens einer bekommt den Link.
    const ergebnisse = await Promise.all([1, 2].map(() => admin.rpc('push_angebot_link', { p_link: l.id })));
    const nachher = await admin.rpc('push_angebot_link', { p_link: l.id });
    expect([...ergebnisse.map((e) => e.data), nachher.data].filter(Boolean).length).toBeLessThanOrEqual(1);
    expect(nachher.data).toBeNull();
    // Nur der Dienstschlüssel.
    expect((await chefin.client.rpc('push_angebot_link', { p_link: l.id })).error?.message).toMatch(/permission denied/);
  });
});

describe('Startseite der Führung: über den Link angenommen', () => {
  it('bis jemand aus der Führung das Angebot öffnet, höchstens sieben Tage — abgelehnte nicht', async () => {
    const id = await angebot();
    const l = await neuerLink(id);
    await annehmen(l.schluessel, 'Frieda Start');
    const id2 = await angebot();
    const l2 = await neuerLink(id2);
    await ablehnen(l2.schluessel, 'Frieda Start');
    const meine = async (k: Konto) => ((await k.client.rpc('angebot_links_neu_angenommen')).data as { link: string }[] ?? [])
      .filter((z) => z.link === l.id || z.link === l2.id);
    const [z] = await meine(pl);
    expect(z).toMatchObject({ link: l.id, angebot: id, name: 'Frieda Start' });
    expect((z as unknown as { baustelle: string }).baustelle).toMatch(/^LK-/);
    expect(await meine(chefin)).toHaveLength(1);

    // Die Buchhaltung öffnet es: zählt nicht — und sie fragt die Liste gar nicht ab.
    expect((await buch.client.rpc('angebot_link_gesehen', { p_link: l.id })).error?.message).toMatch(/Führung/);
    expect((await buch.client.rpc('angebot_links_neu_angenommen')).error?.message).toMatch(/Führung/);
    expect((await fremd.client.rpc('angebot_link_gesehen', { p_link: l.id })).error).toBeNull();
    expect(await meine(chefin)).toHaveLength(1);

    // Älter als sieben Tage: weg, auch ungesehen.
    await admin.from('angebot_links').update({ angenommen_am: new Date(Date.now() - 8 * 86_400_000).toISOString() }).eq('id', l.id);
    expect(await meine(chefin)).toHaveLength(0);
    await admin.from('angebot_links').update({ angenommen_am: new Date().toISOString() }).eq('id', l.id);
    expect(await meine(chefin)).toHaveLength(1);

    // Die Projektleitung öffnet es: weg, für alle.
    expect((await pl.client.rpc('angebot_link_gesehen', { p_link: l.id })).error).toBeNull();
    expect(await meine(chefin)).toHaveLength(0);
    expect((await linkZeile(l.id)).gesehen_am).not.toBeNull();
  });

  it('der Schalter „Antwort über den Annahme-Link“ wird gespeichert und gelesen', async () => {
    clientEinreichen(pl.client);
    const prefs = await import('@/lib/db/pg/prefs');
    await prefs.savePrefs(A, pl.uid, { notifyAngebot: false });
    expect(await prefs.getPrefs(pl.uid)).toMatchObject({ notifyAngebot: false });
    await prefs.savePrefs(A, pl.uid, {});
    expect(await prefs.getPrefs(pl.uid)).toMatchObject({ notifyAngebot: true });
  });
});
