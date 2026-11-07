/**
 * AUFTRAGSEINGANG (M02b, A03 und A11) — gegen die echte Datenbank.
 *
 * Festgehalten wird:
 * - Erfassen durch das Büro (Verwaltung, Buchhaltung, Führung), nicht durch
 *   den Monteur; Nummer aus dem eigenen Kreis („EG-JJJJ-NNNN“), wer erfasst
 *   hat; Stand, Nummer und Verweise setzt kein Konto selbst; Pflichtangaben;
 * - Ändern nur, solange offen;
 * - Eingang → Baustelle in einem Zug, auch mit neuem Kunden: Kunde, Ort,
 *   Ansprechpartner, Abrechnungsart, Nummer aus dem Zähler der Baustellen
 *   (dieselbe Folge wie „Neue Baustelle“); ein zweiter und ein
 *   gleichzeitiger Aufruf ergeben genau eine Baustelle;
 * - Eingang → Angebotsentwurf mit Nummer aus dem Zähler der Angebote;
 * - Ablehnen mit Grund, wieder öffnen; Löschen nur offen bzw. abgelehnt und
 *   nur durch die Führung;
 * - ohne das Recht „Kunden pflegen“ kein neuer Kunde — mit einem Satz;
 * - Modul aus: kein Erfassen, Ändern oder Umwandeln — und zurück;
 * - fremder Betrieb und Support abgewiesen (der Support liest mit Einblick);
 * - Journal, Termin, Umbenennen des Kunden, Datenauskunft, Kundenlöschung;
 * - Erhaltung: `naechste_nummer` vergibt die drei Kreise wie bisher.
 *
 * Gegenprobe: ohne `20261107300000_auftragseingang.sql` gibt es weder die
 * Tabelle noch die Funktionen — jede Prüfung hier ist rot, außer denen zur
 * Erhaltung, die mit und ohne Änderung grün sein müssen.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { admin, betriebAnlegen, einblickBeginnen, konto, plattformkonto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { EINGANG_SEITE, listEingaenge, zaehleOffeneEingaenge } from '@/lib/db/pg/auftragseingaenge';

const A = 'eingang-a';
const B = 'eingang-b';
let chefin: Konto;
let pl: Konto;
let verwaltung: Konto;
let buch: Konto;
let monteur: Konto;
let fremd: Konto;
let plattform: Konto;
let kunde = '';
let db: Client;

const JAHR = Number(new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' }).slice(0, 4));

type Zeile = Record<string, unknown>;

async function erfassen(wer: Konto, x: Zeile = {}): Promise<Zeile> {
  const { data, error } = await wer.client.from('auftragseingaenge').insert({
    company_id: wer.betrieb, quelle: 'telefon', customer_id: kunde, anliegen: 'Heizung kalt',
    ort: 'Linkgasse 1, 1010 Wien', ansprechpartner_name: 'Hr. Hausmeister', ansprechpartner_telefon: '0664 77', ...x,
  }).select('*').single();
  if (error) throw new Error(error.message);
  return data as Zeile;
}
const eingang = async (id: string) => (await admin.from('auftragseingaenge').select('*').eq('id', id).single()).data as Zeile;
const zuBaustelle = (wer: Konto, id: string, abrechnung: string | null = 'Regie', praefix: string | null = 'EB') =>
  wer.client.rpc('eingang_zu_baustelle', { p_eingang: id, p_praefix: praefix, p_abrechnung: abrechnung });
const zuAngebot = (wer: Konto, id: string) => wer.client.rpc('eingang_zu_angebot', { p_eingang: id });
const ablehnen = (wer: Konto, id: string, grund: string | null = 'Nicht unser Gebiet') =>
  wer.client.rpc('eingang_ablehnen', { p_eingang: id, p_grund: grund });
const wiederOeffnen = (wer: Konto, id: string) => wer.client.rpc('eingang_wieder_oeffnen', { p_eingang: id });
const kundeAnlegen = (wer: Konto, id: string) => wer.client.rpc('eingang_kunde_anlegen', { p_eingang: id });
const module = async (festlegung: Zeile) =>
  expect((await admin.from('companies').update({ modules: festlegung }).eq('id', A)).error).toBeNull();

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();
  await betriebAnlegen(A, 'Eingang Installationen GmbH');
  await betriebAnlegen(B);
  chefin = await konto(A, 'Geschäftsführung', 'eg-chefin');
  pl = await konto(A, 'Projektleiter', 'eg-pl');
  verwaltung = await konto(A, 'Verwaltung', 'eg-verw');
  buch = await konto(A, 'Buchhaltung', 'eg-buch');
  monteur = await konto(A, 'Mitarbeiter', 'eg-monteur');
  fremd = await konto(B, 'Geschäftsführung', 'eg-fremd');
  plattform = await plattformkonto('eg-support');
  for (const [k, name] of [[chefin, 'Carla Chefin'], [verwaltung, 'Vera Verwaltung'], [pl, 'Paul Leitner']] as const) {
    expect((await admin.from('users').update({ name }).eq('id', k.uid)).error).toBeNull();
  }
  await admin.from('companies').update({ modules: {}, praefix_angebot: 'AN' }).eq('id', A);
  const { data, error } = await admin.from('customers').insert({
    company_id: A, name: 'Familie Eingang', kundenart: 'privat', strasse: 'Kundengasse 2', plz: '1020', ort: 'Wien',
    contact_name: 'Maria Eingang', contact_phone: '0664 123',
  }).select('id').single();
  expect(error).toBeNull();
  kunde = data!.id;
}, 180_000);

afterAll(async () => {
  clientEinreichen(null);
  await admin.from('companies').update({ modules: {} }).eq('id', A);
  // Ein verworfener Entwurf bliebe sonst liegen (siehe `papierkorb.test.ts`).
  await admin.from('quotes').delete().in('company_id', [A, B]).eq('status', 'Verworfen');
  await db.end();
});

describe('Erfassen', () => {
  it('das Büro erfasst — Verwaltung, Buchhaltung, Projektleitung, Geschäftsführung; der Monteur nicht', async () => {
    for (const k of [verwaltung, buch, pl, chefin]) {
      const e = await erfassen(k);
      expect(e, k.rolle).toMatchObject({ stand: 'offen', erfasst_von_uid: k.uid, kunde_name: 'Familie Eingang' });
      expect(String(e.nummer), k.rolle).toMatch(new RegExp(`^EG-${JAHR}-\\d{4,}$`));
    }
    const { error } = await monteur.client.from('auftragseingaenge').insert({
      company_id: A, quelle: 'telefon', customer_id: kunde, anliegen: 'x',
    });
    expect(error).not.toBeNull();
    // Und lesen kann er sie nicht.
    expect((await monteur.client.from('auftragseingaenge').select('id').eq('company_id', A)).data).toEqual([]);
  });

  it('die Nummer zählt fortlaufend im eigenen Kreis; wer erfasst hat, steht mit Namen da', async () => {
    const eins = await erfassen(verwaltung);
    const zwei = await erfassen(verwaltung);
    const lfd = (n: unknown) => Number(String(n).split('-').pop());
    expect(lfd(zwei.nummer)).toBe(lfd(eins.nummer) + 1);
    expect(eins.erfasst_von_name).toBe('Vera Verwaltung');
    const { rows } = await db.query<{ stand: number }>(
      `select stand from public.number_counters where company_id = $1 and art = 'eingaenge' and jahr = $2`, [A, JAHR]);
    expect(rows[0].stand).toBe(lfd(zwei.nummer));
  });

  it('Stand, Nummer, Verweise und „wer“ setzt kein Konto selbst', async () => {
    for (const x of [{ stand: 'uebernommen' }, { nummer: 'EG-1' }, { project_id: crypto.randomUUID() }, { erfasst_von_name: 'Jemand' }]) {
      const { error } = await verwaltung.client.from('auftragseingaenge').insert({
        company_id: A, quelle: 'telefon', customer_id: kunde, anliegen: 'x', ...x,
      });
      expect(error, JSON.stringify(x)).not.toBeNull();
    }
    const e = await erfassen(verwaltung);
    const { error } = await chefin.client.from('auftragseingaenge').update({ stand: 'abgelehnt' }).eq('id', e.id as string);
    expect(error).not.toBeNull();
    expect((await eingang(e.id as string)).stand).toBe('offen');
  });

  it('Pflicht: Quelle, Anliegen und ein Kunde oder der Name eines neuen — mit Satz', async () => {
    const ohneKunde = await verwaltung.client.from('auftragseingaenge').insert({ company_id: A, quelle: 'telefon', anliegen: 'x' });
    expect(ohneKunde.error?.message).toMatch(/Kunden wählen oder den Namen eines neuen Kunden/);
    const leer = await verwaltung.client.from('auftragseingaenge').insert({ company_id: A, quelle: 'telefon', customer_id: kunde, anliegen: '   ' });
    expect(leer.error).not.toBeNull();
    const ohneQuelle = await verwaltung.client.from('auftragseingaenge').insert({ company_id: A, customer_id: kunde, anliegen: 'x' });
    expect(ohneQuelle.error).not.toBeNull();
    const falsch = await verwaltung.client.from('auftragseingaenge').insert({ company_id: A, quelle: 'portal', customer_id: kunde, anliegen: 'x' });
    expect(falsch.error).not.toBeNull();
    const neu = await erfassen(verwaltung, { customer_id: null, neukunde_name: 'Familie Neu' });
    expect(neu).toMatchObject({ customer_id: null, kunde_name: 'Familie Neu' });
  });

  it('nur ein Kunde dieses Betriebs', async () => {
    const { data: k } = await admin.from('customers').insert({ company_id: B, name: 'Fremdkunde' }).select('id').single();
    const { error } = await verwaltung.client.from('auftragseingaenge').insert({
      company_id: A, quelle: 'telefon', customer_id: k!.id, anliegen: 'x',
    });
    expect(error?.message).toMatch(/gibt es in diesem Betrieb nicht/);
  });

  it('Dringlichkeit ordnet: Notfall, dringend, normal — die Datenbank rechnet den Rang', async () => {
    const n = await erfassen(verwaltung, { dringlichkeit: 'notfall' });
    const d = await erfassen(verwaltung, { dringlichkeit: 'dringend' });
    const o = await erfassen(verwaltung);
    expect([n.dringlichkeit_rang, d.dringlichkeit_rang, o.dringlichkeit_rang]).toEqual([0, 1, 2]);
    const { error } = await verwaltung.client.from('auftragseingaenge').update({ dringlichkeit: 'notfall' }).eq('id', o.id as string);
    expect(error).toBeNull();
    expect((await eingang(o.id as string)).dringlichkeit_rang).toBe(0);
  });
});

describe('Ändern', () => {
  it('solange offen — danach trifft ein Ändern nichts', async () => {
    const e = await erfassen(verwaltung);
    const id = e.id as string;
    const r1 = await verwaltung.client.from('auftragseingaenge').update({ anliegen: 'Heizung kalt, Kinder im Haus' }, { count: 'exact' }).eq('id', id);
    expect([r1.error, r1.count]).toEqual([null, 1]);
    expect(await eingang(id)).toMatchObject({ anliegen: 'Heizung kalt, Kinder im Haus', bearbeitet_von_name: 'Vera Verwaltung' });
    expect((await ablehnen(verwaltung, id)).error).toBeNull();
    const r2 = await verwaltung.client.from('auftragseingaenge').update({ anliegen: 'anders' }, { count: 'exact' }).eq('id', id);
    expect(r2.count).toBe(0);
    expect((await eingang(id)).anliegen).toBe('Heizung kalt, Kinder im Haus');
  });
});

describe('Eingang → Baustelle', () => {
  it('in einem Zug: Kunde, Ort, Ansprechpartner, Abrechnung, Nummer aus dem Zähler der Baustellen, Verweis', async () => {
    const e = await erfassen(verwaltung, { auftraggeber_nummer: 'SCH-2026-77', anliegen: 'Wasserfleck an der Decke' });
    // Die Nummer nach derselben Logik wie „Neue Baustelle“: der Zähler, den `reserveProjectNumber` zieht.
    const vorher = await chefin.client.rpc('naechste_nummer', { p_art: 'projects', p_jahr: JAHR });
    expect(vorher.error).toBeNull();
    const { data, error } = await zuBaustelle(chefin, e.id as string, 'Regie', 'EB');
    expect(error).toBeNull();
    const r = data as { project_id: string; project_number: string; neu: boolean; customer_id: string };
    expect(r.neu).toBe(true);
    expect(r.project_number).toBe(`EB-${JAHR}-${String(Number(vorher.data) + 1).padStart(4, '0')}`);
    const { data: p } = await admin.from('projects').select('*').eq('id', r.project_id).single();
    expect(p).toMatchObject({
      company_id: A, project_number: r.project_number, customer_id: kunde, customer_name: 'Familie Eingang',
      address: 'Linkgasse 1, 1010 Wien', status: 'Aktiv', billing_mode: 'Regie',
      contact_name: 'Hr. Hausmeister', contact_phone: '0664 77',
    });
    expect(p!.description).toBe(`Wasserfleck an der Decke\n\nNummer des Auftraggebers: SCH-2026-77\n\nAus Eingang ${e.nummer}`);
    expect(await eingang(e.id as string)).toMatchObject({
      stand: 'uebernommen', project_id: r.project_id, uebernommen_von_name: 'Carla Chefin',
    });
  });

  it('ohne Ort und Ansprechpartner: die Anschrift und der Ansprechpartner der Kundenakte; ohne Vorsatz ohne', async () => {
    const e = await erfassen(verwaltung, { ort: null, ansprechpartner_name: null, ansprechpartner_telefon: null });
    const { data } = await zuBaustelle(pl, e.id as string, 'Pauschal', '');
    const r = data as { project_id: string; project_number: string };
    expect(r.project_number).toMatch(new RegExp(`^${JAHR}-\\d{4,}$`));
    const { data: p } = await admin.from('projects').select('address, contact_name, contact_phone, billing_mode').eq('id', r.project_id).single();
    expect(p).toEqual({ address: 'Kundengasse 2, 1020 Wien', contact_name: 'Maria Eingang', contact_phone: '0664 123', billing_mode: 'Pauschal' });
  });

  it('mit neuem Kunden: er entsteht aus den Angaben, der Eingang verweist auf ihn, die Angaben dort sind leer', async () => {
    const e = await erfassen(verwaltung, {
      customer_id: null, neukunde_name: 'Familie Neukunde', neukunde_strasse: 'Neugasse 3', neukunde_plz: '1030',
      neukunde_ort: 'Wien', neukunde_telefon: '0664 555', neukunde_email: 'neu@example.at', ort: null,
    });
    const { data, error } = await zuBaustelle(chefin, e.id as string);
    expect(error).toBeNull();
    const r = data as { project_id: string; customer_id: string };
    const { data: k } = await admin.from('customers').select('company_id, name, address, contact_phone, email').eq('id', r.customer_id).single();
    expect(k).toEqual({ company_id: A, name: 'Familie Neukunde', address: 'Neugasse 3, 1030 Wien', contact_phone: '0664 555', email: 'neu@example.at' });
    expect(await eingang(e.id as string)).toMatchObject({
      customer_id: r.customer_id, kunde_name: 'Familie Neukunde', neukunde_name: null, neukunde_telefon: null, neukunde_email: null,
    });
    const { data: p } = await admin.from('projects').select('customer_id, address').eq('id', r.project_id).single();
    expect(p).toEqual({ customer_id: r.customer_id, address: 'Neugasse 3, 1030 Wien' });
    // Die Journalzeilen von vorher tragen den Kunden jetzt mit (Löschung und Auskunft finden sie).
    const { data: j } = await admin.from('aenderungsjournal').select('kunde_id').eq('objekt_id', e.id as string);
    expect((j ?? []).length).toBeGreaterThan(0);
    expect((j ?? []).every((z) => z.kunde_id === r.customer_id)).toBe(true);
  });

  it('ein zweiter Aufruf legt keine zweite Baustelle an — er gibt dieselbe zurück', async () => {
    const e = await erfassen(verwaltung);
    const eins = (await zuBaustelle(chefin, e.id as string)).data as { project_id: string; project_number: string };
    const zwei = await zuBaustelle(chefin, e.id as string, 'Pauschal', 'XX');
    expect(zwei.error).toBeNull();
    expect(zwei.data).toEqual({ project_id: eins.project_id, project_number: eins.project_number, neu: false });
    const { count } = await admin.from('projects').select('*', { count: 'exact', head: true }).eq('company_id', A).like('description', `%Aus Eingang ${e.nummer}`);
    expect(count).toBe(1);
  });

  it('zwei gleichzeitige Aufrufe ergeben genau eine Baustelle', async () => {
    const e = await erfassen(verwaltung);
    const [x, y] = await Promise.all([zuBaustelle(chefin, e.id as string), zuBaustelle(pl, e.id as string)]);
    expect([x.error, y.error]).toEqual([null, null]);
    const ids = [x.data, y.data].map((d) => (d as { project_id: string }).project_id);
    expect(ids[0]).toBe(ids[1]);
    expect([x.data, y.data].map((d) => (d as { neu: boolean }).neu).sort()).toEqual([false, true]);
    const { count } = await admin.from('projects').select('*', { count: 'exact', head: true }).eq('company_id', A).like('description', `%Aus Eingang ${e.nummer}`);
    expect(count).toBe(1);
  });

  it('nur die Führung; Abrechnung und Vorsatz sind Pflicht; ein abgelehnter wird nicht übernommen', async () => {
    const e = await erfassen(verwaltung);
    for (const k of [verwaltung, buch, monteur]) {
      expect((await zuBaustelle(k, e.id as string)).error?.message, k.rolle).toMatch(/nur die Führung/);
    }
    expect((await zuBaustelle(chefin, e.id as string, null)).error?.message).toMatch(/Abrechnung der Baustelle wählen/);
    expect((await zuBaustelle(chefin, e.id as string, 'Festpreis')).error?.message).toMatch(/Abrechnung der Baustelle wählen/);
    expect((await zuBaustelle(chefin, e.id as string, 'Regie', null)).error?.message).toMatch(/Vorsatz/);
    expect((await zuBaustelle(chefin, e.id as string, 'Regie', 'zu-lang-x')).error?.message).toMatch(/Vorsatz/);
    expect((await ablehnen(verwaltung, e.id as string)).error).toBeNull();
    expect((await zuBaustelle(chefin, e.id as string)).error?.message).toMatch(/ist abgelehnt; übernommen wird nur ein offener/);
    expect((await eingang(e.id as string)).project_id).toBeNull();
  });
});

describe('Eingang → Angebot', () => {
  it('ein Entwurf mit Nummer aus dem Zähler der Angebote, Kunde, Adresse und Anliegen in der Notiz', async () => {
    const e = await erfassen(verwaltung, { auftraggeber_nummer: 'HV-17', anliegen: 'Bad erneuern' });
    const vorher = await chefin.client.rpc('naechste_nummer', { p_art: 'quotes', p_jahr: JAHR });
    const { data, error } = await zuAngebot(chefin, e.id as string);
    expect(error).toBeNull();
    const r = data as { quote_id: string; quote_number: string; neu: boolean };
    expect(r.quote_number).toBe(`AN-${JAHR}-${String(Number(vorher.data) + 1).padStart(4, '0')}`);
    const { data: q } = await admin.from('quotes').select('*').eq('id', r.quote_id).single();
    expect(q).toMatchObject({
      company_id: A, status: 'Entwurf', customer_id: kunde, customer_name: 'Familie Eingang', address: 'Linkgasse 1, 1010 Wien',
      notes: 'Bad erneuern\n\nIhre Auftrags- bzw. Schadensnummer: HV-17', total_brutto: 0,
    });
    expect(await eingang(e.id as string)).toMatchObject({ stand: 'uebernommen', quote_id: r.quote_id, project_id: null });
    // Ein zweiter Aufruf: dasselbe Angebot.
    expect((await zuAngebot(chefin, e.id as string)).data).toEqual({ quote_id: r.quote_id, quote_number: r.quote_number, neu: false });
    // Übernommen als Angebot wird er keine Baustelle mehr.
    expect((await zuBaustelle(chefin, e.id as string)).error?.message).toMatch(/ist übernommen/);
  });

  it('wird der Entwurf verworfen und gelöscht, lässt sich der Eingang wieder öffnen', async () => {
    const e = await erfassen(verwaltung);
    const r = (await zuAngebot(chefin, e.id as string)).data as { quote_id: string };
    expect((await wiederOeffnen(verwaltung, e.id as string)).error?.message).toMatch(/belegt, woher das Angebot kam/);
    expect((await chefin.client.from('quotes').update({ status: 'Verworfen' }).eq('id', r.quote_id)).error).toBeNull();
    expect((await chefin.client.from('quotes').delete().eq('id', r.quote_id)).error).toBeNull();
    expect(await eingang(e.id as string)).toMatchObject({ stand: 'uebernommen', quote_id: null });
    expect((await wiederOeffnen(verwaltung, e.id as string)).error).toBeNull();
    expect(await eingang(e.id as string)).toMatchObject({ stand: 'offen', uebernommen_am: null });
  });

  it('nur mit dem Modul Angebote', async () => {
    const e = await erfassen(verwaltung);
    await module({ angebote: false });
    try {
      expect((await zuAngebot(chefin, e.id as string)).error?.message).toMatch(/Angebote sind in diesem Betrieb ausgeschaltet/);
    } finally {
      await module({});
    }
    expect((await eingang(e.id as string)).stand).toBe('offen');
  });
});

describe('Ablehnen, wieder öffnen, löschen', () => {
  it('ablehnen mit Grund — das Büro; ohne Grund nicht; ein zweites Mal ändert nichts', async () => {
    const e = await erfassen(verwaltung);
    const id = e.id as string;
    expect((await ablehnen(monteur, id)).error?.message).toMatch(/nur das Büro/);
    expect((await ablehnen(buch, id, ' ')).error?.message).toMatch(/Grund angeben/);
    expect((await ablehnen(buch, id, 'Kein Einsatzgebiet')).error).toBeNull();
    const nachher = await eingang(id);
    expect(nachher).toMatchObject({ stand: 'abgelehnt', abgelehnt_grund: 'Kein Einsatzgebiet', abgelehnt_von_uid: buch.uid });
    expect((await ablehnen(verwaltung, id, 'Anders')).error).toBeNull();
    expect((await eingang(id)).abgelehnt_grund).toBe('Kein Einsatzgebiet');
    expect((await wiederOeffnen(verwaltung, id)).error).toBeNull();
    expect(await eingang(id)).toMatchObject({ stand: 'offen', abgelehnt_grund: null, abgelehnt_am: null });
  });

  it('löschen: nur die Führung, nur offen oder abgelehnt — ein übernommener bleibt', async () => {
    const offen = await erfassen(verwaltung);
    const abgelehnt = await erfassen(verwaltung);
    await ablehnen(verwaltung, abgelehnt.id as string);
    const uebernommen = await erfassen(verwaltung);
    await zuBaustelle(chefin, uebernommen.id as string);
    const weg = async (k: Konto, id: unknown) =>
      (await k.client.from('auftragseingaenge').delete({ count: 'exact' }).eq('id', id as string)).count;

    expect(await weg(verwaltung, offen.id)).toBe(0);
    expect(await weg(buch, abgelehnt.id)).toBe(0);
    expect(await weg(chefin, uebernommen.id)).toBe(0);
    expect(await weg(pl, offen.id)).toBe(1);
    expect(await weg(chefin, abgelehnt.id)).toBe(1);
    expect(await eingang(uebernommen.id as string)).toMatchObject({ stand: 'uebernommen' });
    // Das Journal hält das Löschen mit der Nummer fest.
    const { data: j } = await admin.from('aenderungsjournal').select('art, bezeichnung').eq('objekt_id', offen.id as string).eq('art', 'geloescht');
    expect(j).toEqual([{ art: 'geloescht', bezeichnung: offen.nummer }]);
  });
});

describe('Kundenrechte', () => {
  it('ohne „Kunden pflegen“ kein neuer Kunde — mit Satz, und es entsteht nichts; mit dem Recht schon', async () => {
    const e = await erfassen(verwaltung, { customer_id: null, neukunde_name: 'Familie Rechtlos' });
    const id = e.id as string;
    const ohne = await kundeAnlegen(verwaltung, id);
    expect(ohne.error?.message).toMatch(/darf nur, wer Kunden pflegen darf/);
    expect((await admin.from('customers').select('id').eq('company_id', A).eq('name', 'Familie Rechtlos')).data).toEqual([]);
    expect((await eingang(id)).customer_id).toBeNull();
    expect((await admin.from('users').update({ kunden_pflegen: true }).eq('id', verwaltung.uid)).error).toBeNull();
    try {
      const mit = await kundeAnlegen(verwaltung, id);
      expect(mit.error).toBeNull();
      expect(await eingang(id)).toMatchObject({ customer_id: mit.data, stand: 'offen', neukunde_name: null });
      // Ein zweites Mal: derselbe Kunde.
      expect((await kundeAnlegen(verwaltung, id)).data).toBe(mit.data);
    } finally {
      await admin.from('users').update({ kunden_pflegen: false }).eq('id', verwaltung.uid);
    }
  });
});

describe('Modul (E51, V3)', () => {
  it('aus: kein Erfassen, kein Ändern, kein Umwandeln, kein Ablehnen — vorhandene bleiben; an: alles wieder', async () => {
    const e = await erfassen(verwaltung);
    const id = e.id as string;
    for (const festlegung of [{ 'baustellen.auftragseingang': false }, { 'baustellen.auftragseingang': 0 }]) {
      await module(festlegung);
      try {
        const neu = await verwaltung.client.from('auftragseingaenge').insert({ company_id: A, quelle: 'telefon', customer_id: kunde, anliegen: 'x' });
        expect(neu.error?.message).toMatch(/ausgeschaltet/);
        const aendern = await verwaltung.client.from('auftragseingaenge').update({ anliegen: 'anders' }).eq('id', id);
        expect(aendern.error?.message).toMatch(/ausgeschaltet/);
        expect((await zuBaustelle(chefin, id)).error?.message).toMatch(/ausgeschaltet/);
        expect((await zuAngebot(chefin, id)).error?.message).toMatch(/ausgeschaltet/);
        expect((await ablehnen(verwaltung, id)).error?.message).toMatch(/ausgeschaltet/);
        expect((await eingang(id)).stand).toBe('offen');
      } finally {
        await module({});
      }
    }
    // Eine Festlegung des Kerns selbst schaltet nichts ab.
    await module({ baustellen: false });
    try {
      expect((await zuBaustelle(chefin, id)).error).toBeNull();
    } finally {
      await module({});
    }
  });
});

describe('Mandanten und Support', () => {
  it('ein fremder Betrieb sieht nichts und wandelt nichts um', async () => {
    const e = await erfassen(verwaltung);
    expect((await fremd.client.from('auftragseingaenge').select('id').eq('id', e.id as string)).data).toEqual([]);
    expect((await zuBaustelle(fremd, e.id as string)).error?.message).toMatch(/Eingang nicht gefunden/);
    expect((await ablehnen(fremd, e.id as string)).error?.message).toMatch(/Eingang nicht gefunden/);
    const { error } = await fremd.client.from('auftragseingaenge').insert({ company_id: A, quelle: 'telefon', neukunde_name: 'x', anliegen: 'x' });
    expect(error).not.toBeNull();
  });

  it('der Support liest mit Einblick — erfasst, ändert und wandelt aber nichts, auch mit „mitarbeiten“', async () => {
    const e = await erfassen(verwaltung);
    const { data: freigabe } = await chefin.client.from('support_freigaben').insert({
      company_id: A, gewaehrt_von: chefin.uid, grund: 'Eingang prüfen', stufe: 'mitarbeiten',
      gilt_bis: new Date(Date.now() + 3_600_000).toISOString(),
    }).select('id').single();
    try {
      await einblickBeginnen(plattform, A, freigabe!.id);
      expect((await plattform.client.from('auftragseingaenge').select('id').eq('id', e.id as string)).data).toEqual([{ id: e.id }]);
      const neu = await plattform.client.from('auftragseingaenge').insert({ company_id: A, quelle: 'telefon', customer_id: kunde, anliegen: 'x' });
      expect(neu.error).not.toBeNull();
      const aendern = await plattform.client.from('auftragseingaenge').update({ anliegen: 'Support' }, { count: 'exact' }).eq('id', e.id as string);
      expect(aendern.count ?? 0).toBe(0);
      expect((await zuBaustelle(plattform, e.id as string)).error).not.toBeNull();
      expect((await ablehnen(plattform, e.id as string)).error).not.toBeNull();
    } finally {
      await admin.from('support_zugriffe').delete().eq('company_id', A);
      await admin.from('support_freigaben').delete().eq('company_id', A);
    }
    expect(await eingang(e.id as string)).toMatchObject({ stand: 'offen', anliegen: 'Heizung kalt' });
  });
});

describe('Journal, Termin, Name des Kunden', () => {
  it('Anlegen und Ändern stehen im Änderungsjournal mit Nummer — das Büro liest es, der Monteur nicht', async () => {
    const e = await erfassen(verwaltung);
    const id = e.id as string;
    await verwaltung.client.from('auftragseingaenge').update({ dringlichkeit: 'notfall' }).eq('id', id);
    await ablehnen(verwaltung, id, 'Doppelt erfasst');
    const { data: j } = await verwaltung.client.from('objekt_verlauf').select('art, aenderungen, bezeichnung, von_name')
      .eq('objektart', 'eingang').eq('objekt_id', id).order('am');
    expect(j).toEqual([
      { art: 'angelegt', aenderungen: {}, bezeichnung: e.nummer, von_name: 'Vera Verwaltung' },
      { art: 'geaendert', aenderungen: { dringlichkeit: { alt: 'normal', neu: 'notfall' } }, bezeichnung: e.nummer, von_name: 'Vera Verwaltung' },
      {
        art: 'geaendert',
        aenderungen: { stand: { alt: 'offen', neu: 'abgelehnt' }, abgelehnt_grund: { alt: null, neu: 'Doppelt erfasst' } },
        bezeichnung: e.nummer, von_name: 'Vera Verwaltung',
      },
    ]);
    expect((await monteur.client.from('objekt_verlauf').select('id').eq('objekt_id', id)).data).toEqual([]);
    expect((await buch.client.from('objekt_verlauf').select('id').eq('objekt_id', id)).data).toHaveLength(3);
  });

  it('die Besichtigung: ein Termin dieses Betriebs hängt am Eingang, ein fremder nicht', async () => {
    const e = await erfassen(verwaltung);
    const { data: t } = await verwaltung.client.from('termine').insert({
      company_id: A, art: 'Besichtigung', datum: '2099-11-12', customer_id: kunde,
    }).select('id').single();
    const { data: f } = await admin.from('termine').insert({
      company_id: B, art: 'Besichtigung', datum: '2099-11-12', customer_id: (await admin.from('customers').insert({ company_id: B, name: 'F' }).select('id').single()).data!.id,
    }).select('id').single();
    expect((await verwaltung.client.from('auftragseingaenge').update({ termin_id: f!.id }).eq('id', e.id as string)).error?.message)
      .toMatch(/Diesen Termin gibt es in diesem Betrieb nicht/);
    expect((await verwaltung.client.from('auftragseingaenge').update({ termin_id: t!.id }).eq('id', e.id as string)).error).toBeNull();
    expect(await eingang(e.id as string)).toMatchObject({ termin_id: t!.id, stand: 'offen' });
  });

  it('ein umbenannter Kunde heißt auch am Eingang so', async () => {
    const { data: k } = await admin.from('customers').insert({ company_id: A, name: 'Familie Alt' }).select('id').single();
    const e = await erfassen(verwaltung, { customer_id: k!.id });
    expect((await chefin.client.from('customers').update({ name: 'Familie Neuname' }).eq('id', k!.id)).error).toBeNull();
    expect((await eingang(e.id as string)).kunde_name).toBe('Familie Neuname');
  });
});

describe('Datenauskunft und Löschung', () => {
  it('der Kunde bekommt seine Eingänge — ohne wer im Betrieb erfasst hat; die Person die Anzahl', async () => {
    const { data: k } = await admin.from('customers').insert({ company_id: A, name: 'Familie Auskunft' }).select('id').single();
    const e = await erfassen(verwaltung, { customer_id: k!.id, anliegen: 'Therme tropft' });
    const { data, error } = await chefin.client.rpc('person_auskunft', { p_art: 'kunde', p_id: k!.id });
    expect(error).toBeNull();
    const eintraege = (data as { daten: { auftragseingaenge: Zeile[] } }).daten.auftragseingaenge;
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0]).toMatchObject({ nummer: e.nummer, anliegen: 'Therme tropft', ansprechpartner_name: 'Hr. Hausmeister' });
    expect(Object.keys(eintraege[0]).some((s) => /_von_|company_id/.test(s))).toBe(false);

    const p = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: verwaltung.uid });
    const bearbeitet = (p.data as { als_bearbeiter: Record<string, number> }).als_bearbeiter;
    expect(bearbeitet.auftragseingaenge_erfasst).toBeGreaterThan(0);
    expect(bearbeitet).toHaveProperty('auftragseingaenge_bearbeitet');
  });

  it('die Löschung eines Kunden: offene und abgelehnte gehen, der übernommene bleibt ohne Kontaktdaten, das Journal ohne Werte', async () => {
    const { data: k } = await admin.from('customers').insert({ company_id: A, name: 'Familie Weg', kundenart: 'privat' }).select('id').single();
    const offen = await erfassen(verwaltung, { customer_id: k!.id });
    await verwaltung.client.from('auftragseingaenge').update({ ansprechpartner_telefon: '0664 99' }).eq('id', offen.id as string);
    const abgelehnt = await erfassen(verwaltung, { customer_id: k!.id });
    await ablehnen(verwaltung, abgelehnt.id as string);
    const uebernommen = await erfassen(verwaltung, { customer_id: k!.id });
    await zuBaustelle(chefin, uebernommen.id as string);

    const probe = await chefin.client.rpc('person_loeschen', { p_art: 'kunde', p_id: k!.id, p_nur_pruefen: true });
    expect((probe.data as { sofort: Record<string, number> }).sofort.auftragseingaenge).toBe(2);
    const echt = await chefin.client.rpc('person_loeschen', { p_art: 'kunde', p_id: k!.id, p_nur_pruefen: false });
    expect(echt.error).toBeNull();
    expect((echt.data as { ganz: boolean }).ganz).toBe(false);
    expect((await admin.from('auftragseingaenge').select('id').in('id', [offen.id, abgelehnt.id])).data).toEqual([]);
    expect(await eingang(uebernommen.id as string)).toMatchObject({
      stand: 'uebernommen', ansprechpartner_name: null, ansprechpartner_telefon: null,
    });
    const { data: j } = await admin.from('aenderungsjournal').select('aenderungen').eq('objektart', 'eingang').eq('kunde_id', k!.id);
    for (const z of j ?? []) {
      for (const w of Object.values(z.aenderungen as Record<string, unknown>)) expect(w).toEqual({ entfernt: true });
    }
    expect((j ?? []).some((z) => Object.keys(z.aenderungen as object).length > 0)).toBe(true);
  });
});

describe('Die Liste über die Datenschicht', () => {
  it('offen: Notfall, dringend, normal — je der älteste zuerst; die Suche findet Nummer des Auftraggebers und Anliegen', async () => {
    clientEinreichen(verwaltung.client);
    const { data: k } = await admin.from('customers').select('id').eq('id', kunde).single();
    const zeile = (anliegen: string, dringlichkeit: string, am: string) => ({
      company_id: A, quelle: 'email', customer_id: k!.id, anliegen, dringlichkeit, eingegangen_am: am, auftraggeber_nummer: 'LISTE-1',
    });
    expect((await admin.from('auftragseingaenge').insert([
      zeile('Liste normal alt', 'normal', '2026-01-01T08:00:00Z'),
      zeile('Liste notfall neu', 'notfall', '2026-03-01T08:00:00Z'),
      zeile('Liste dringend', 'dringend', '2026-02-01T08:00:00Z'),
      zeile('Liste notfall alt', 'notfall', '2026-01-15T08:00:00Z'),
    ])).error).toBeNull();
    const seite = await listEingaenge(A, { stand: 'offen', suche: 'LISTE-1' });
    expect(seite.zeilen.map((z) => z.anliegen)).toEqual(['Liste notfall alt', 'Liste notfall neu', 'Liste dringend', 'Liste normal alt']);
    expect(seite.weiter).toBeNull();
    expect((await listEingaenge(A, { stand: 'offen', suche: 'notfall neu' })).zeilen.map((z) => z.anliegen)).toEqual(['Liste notfall neu']);
    // Der Monteur bekommt nichts, der fremde Betrieb nichts.
    clientEinreichen(monteur.client);
    expect((await listEingaenge(A, { stand: 'offen', suche: 'LISTE-1' })).zeilen).toEqual([]);
    clientEinreichen(verwaltung.client);
    const zahl = await zaehleOffeneEingaenge(A);
    expect(zahl.notfall).toBeGreaterThanOrEqual(2);
    expect(zahl.offen).toBeGreaterThanOrEqual(zahl.notfall + zahl.dringend);
  });

  it('seitenweise ohne Lücke und ohne Doppel — auch bei gleichem Zeitpunkt', async () => {
    clientEinreichen(verwaltung.client);
    const gleich = '2026-04-01T08:00:00Z';
    expect((await admin.from('auftragseingaenge').insert(Array.from({ length: EINGANG_SEITE + 3 }, (_, i) => ({
      company_id: A, quelle: 'telefon', customer_id: kunde, anliegen: `Seite ${i}`, auftraggeber_nummer: 'SEITE-1',
      eingegangen_am: i % 2 ? gleich : `2026-04-0${(i % 8) + 1}T09:00:00Z`,
    })))).error).toBeNull();
    const eins = await listEingaenge(A, { stand: 'offen', suche: 'SEITE-1' });
    expect(eins.zeilen).toHaveLength(EINGANG_SEITE);
    expect(eins.weiter).not.toBeNull();
    const zwei = await listEingaenge(A, { stand: 'offen', suche: 'SEITE-1', nach: eins.weiter });
    expect(zwei.zeilen).toHaveLength(3);
    expect(zwei.weiter).toBeNull();
    const alle = [...eins.zeilen, ...zwei.zeilen].map((z) => z.id);
    expect(new Set(alle).size).toBe(EINGANG_SEITE + 3);
  });
});

describe('Erhaltung: der Zähler', () => {
  it('naechste_nummer vergibt Angebote und Baustellen wie bisher — Eingangsnummern nicht', async () => {
    const q = await chefin.client.rpc('naechste_nummer', { p_art: 'quotes', p_jahr: JAHR });
    const p = await chefin.client.rpc('naechste_nummer', { p_art: 'projects', p_jahr: JAHR });
    expect([q.error, p.error]).toEqual([null, null]);
    expect((await verwaltung.client.rpc('naechste_nummer', { p_art: 'projects', p_jahr: JAHR })).error?.message).toMatch(/Nur die Führung vergibt Baustellennummern/);
    const eg = await chefin.client.rpc('naechste_nummer', { p_art: 'eingaenge', p_jahr: JAHR });
    expect(eg.error?.message).toMatch(/vergibt die App selbst/);
  });

  it('„Neue Baustelle“ geht wie bisher — die Führung legt eine Baustelle direkt an', async () => {
    const { error } = await chefin.client.from('projects').insert({
      company_id: A, project_number: `EG-DIREKT-${Date.now()}`, customer_id: kunde, customer_name: 'Familie Eingang', status: 'Aktiv',
    });
    expect(error).toBeNull();
    expect((await verwaltung.client.from('projects').insert({
      company_id: A, project_number: `EG-VERW-${Date.now()}`, customer_name: 'x', status: 'Aktiv',
    })).error).not.toBeNull();
  });
});
