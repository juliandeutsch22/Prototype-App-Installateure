/**
 * DAS ÄNDERUNGSJOURNAL DER GESCHÄFTSOBJEKTE (M01b, 06.11.2026) — gegen die
 * echte Datenbank.
 *
 * Festgehalten wird:
 * - Kunde, Baustelle, Angebot, Rechnung, Zahlung, Wartung und Benutzer: Anlegen,
 *   Ändern (nur die geänderten Spalten mit alt und neu, ohne die
 *   ausgenommenen) und Löschen schreiben je eine Zeile — wer, wann, was;
 * - ein Speichern ohne Änderung schreibt nichts, auch nicht „leer statt
 *   nichts“; der Dienstschlüssel schreibt nichts;
 * - schreiben, ändern, löschen kann im Journal niemand, auch die
 *   Geschäftsführung nicht;
 * - lesen: der Mitarbeiter nichts, die übrigen Rollen, was sie am Objekt
 *   sehen, Benutzer und Gelöschtes nur die Spitze, kein fremder Betrieb, kein
 *   Support; der Support mit Schreibfreigabe kann weiter ändern und steht
 *   dann selbst im Journal;
 * - die Sicht `objekt_verlauf` vereint Journal, Mahnungen, Ausführungen,
 *   Kontoumstellungen und Urlaubsanpassungen und zeigt keinem mehr als die
 *   Quellen; die App blättert darin seitenweise ohne Lücke;
 * - einen Kunden löschen entfernt die Werte (auch über `person_loeschen`);
 * - Datenauskunft und Löschung einer Person;
 * - jede Spalte jeder protokollierten Tabelle steht entweder in der Textliste
 *   der App oder in der Ausnahmeliste des Triggers.
 *
 * Gegenprobe: ohne `20261106100000_aenderungsjournal.sql` gibt es weder
 * Tabelle noch Sicht noch Trigger — jede Prüfung hier ist rot.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { admin, betriebAnlegen, deaktivieren, einblickBeginnen, konto, mahnInhalt, plattformkonto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { listObjektVerlauf, VERLAUF_SEITE } from '@/lib/db/pg/objektVerlauf';
import { VERLAUF_FELDER } from '@/features/verlauf/objektVerlaufText';

const A = 'journal-a';
const B = 'journal-b';
let chefin: Konto;
let buch: Konto;
let pl: Konto;
let verwaltung: Konto;
let monteur: Konto;
let fremd: Konto;
let plattform: Konto;
/** Kunde mit Anschrift und Kundenart — ohne sie stellt die Datenbank keine Rechnung aus. */
let rechnungskunde = '';

interface Zeile {
  id: string; company_id: string; objektart: string; objekt_id: string; bezug_id: string | null; kunde_id: string | null;
  art: string; aenderungen: Record<string, unknown>; bezeichnung: string | null; von_uid: string | null; von_name: string | null;
}

async function journal(objekt: string): Promise<Zeile[]> {
  const { data, error } = await admin.from('aenderungsjournal').select('*')
    .or(`objekt_id.eq.${objekt},bezug_id.eq.${objekt}`).order('am');
  if (error) throw error;
  return (data ?? []) as Zeile[];
}

async function einfuegen(k: Konto, tabelle: string, werte: Record<string, unknown>): Promise<string> {
  const { data, error } = await k.client.from(tabelle).insert(werte).select('id').single();
  if (error) throw new Error(`${tabelle}: ${error.message}`);
  return (data as { id: string }).id;
}

async function aendern(k: Konto, tabelle: string, id: string, werte: Record<string, unknown>): Promise<void> {
  const { data, error } = await k.client.from(tabelle).update(werte).eq('id', id).select('id');
  if (error) throw new Error(`${tabelle}: ${error.message}`);
  // Eine vom Zeilenschutz abgewiesene Änderung meldet keinen Fehler — sie trifft nur nichts.
  expect(data, `${tabelle} geändert`).toHaveLength(1);
}

async function rechnung(nummer: string): Promise<string> {
  clientEinreichen(buch.client);
  return rechnungen.createInvoice(A, {
    invoiceNumber: nummer, projectNumber: 'B-J-1', customerName: 'Familie Gruber', ...{ customerId: rechnungskunde },
    address: 'Hauptplatz 3, 8010 Graz',
    invoiceDate: '2026-11-02', leistungVon: '2026-11-02', leistungBis: '2026-11-02', dueDate: '2026-11-16',
    subtotalNetto: 100, totalNetto: 100, totalVat: 20, totalBrutto: 120, vatRate: 0.2, paymentStatus: 'Offen',
    positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 100, netto: 100 }],
  });
}

const kundeNeu = (name: string, rest: Record<string, unknown> = {}) => ({
  company_id: A, name, strasse: 'Weg 1', plz: '1010', ort: 'Wien', kundenart: 'privat', ...rest,
});

beforeAll(async () => {
  await betriebAnlegen(A);
  await betriebAnlegen(B);
  chefin = await konto(A, 'Geschäftsführung', 'jr-chefin');
  buch = await konto(A, 'Buchhaltung', 'jr-buch');
  pl = await konto(A, 'Projektleiter', 'jr-pl');
  verwaltung = await konto(A, 'Verwaltung', 'jr-verw');
  monteur = await konto(A, 'Mitarbeiter', 'jr-monteur');
  fremd = await konto(B, 'Geschäftsführung', 'jr-fremd');
  plattform = await plattformkonto('jr-support');
  for (const [k, name] of [[chefin, 'Carla Chefin'], [buch, 'Berta Büro'], [pl, 'Paul Projektleiter']] as const) {
    expect((await admin.from('users').update({ name }).eq('id', k.uid)).error).toBeNull();
  }
  const { data, error } = await admin.from('customers').insert({
    company_id: A, name: 'Familie Gruber', kundenart: 'privat', strasse: 'Hauptplatz 3', plz: '8010', ort: 'Graz',
  }).select('id').single();
  expect(error).toBeNull();
  rechnungskunde = data!.id;
}, 180_000);

afterAll(() => clientEinreichen(null));

describe('Das Journal schreibt mit', () => {
  it('Kunde: Anlegen, Ändern (nur was sich ändert), Löschen — und das Löschen nimmt die Werte mit', async () => {
    const id = await einfuegen(chefin, 'customers', kundeNeu('Familie Probe', { contact_phone: '0664 1' }));
    await aendern(chefin, 'customers', id, { contact_phone: '0664 2', email: '' });
    // Speichern ohne Änderung, und „leer“ statt „nichts“: keine Zeile.
    await aendern(chefin, 'customers', id, { contact_phone: '0664 2', notes: '' });

    const vorher = await journal(id);
    expect(vorher.map((z) => z.art)).toEqual(['angelegt', 'geaendert']);
    const [angelegt, geaendert] = vorher;
    expect(angelegt).toMatchObject({
      company_id: A, objektart: 'kunde', aenderungen: {}, bezeichnung: 'Familie Probe', kunde_id: id,
      von_uid: chefin.uid, von_name: 'Carla Chefin',
    });
    // Nur das Telefon — nicht der Zeitstempel, nicht die Prüfvermerke der Datenbank, nicht das leere Feld.
    expect(geaendert.aenderungen).toEqual({ contact_phone: { alt: '0664 1', neu: '0664 2' } });

    expect((await chefin.client.from('customers').delete().eq('id', id)).error).toBeNull();
    const danach = await journal(id);
    expect(danach.map((z) => z.art)).toEqual(['angelegt', 'geaendert', 'geloescht']);
    // DSGVO Art. 17: wer wann was geändert hat, bleibt — die Werte und der Name gehen.
    expect(danach[1].aenderungen).toEqual({ contact_phone: { entfernt: true } });
    expect(danach.map((z) => z.bezeichnung)).toEqual([null, null, null]);
    expect(danach[2].von_uid).toBe(chefin.uid);
  }, 60_000);

  it('Baustelle: Team als Kennungen, die Kundenkennung nicht — und das Löschen nennt die Nummer', async () => {
    const k1 = await einfuegen(chefin, 'customers', kundeNeu('Familie Eins'));
    const k2 = await einfuegen(chefin, 'customers', kundeNeu('Familie Zwei'));
    const id = await einfuegen(chefin, 'projects', {
      company_id: A, project_number: 'B-J-TEAM', customer_id: k1, customer_name: 'Familie Eins', status: 'Aktiv',
      assigned_employees: [monteur.uid],
    });
    await aendern(chefin, 'projects', id, {
      assigned_employees: [monteur.uid, pl.uid], customer_id: k2, customer_name: 'Familie Zwei',
    });
    expect((await chefin.client.from('projects').delete().eq('id', id)).error).toBeNull();

    const zeilen = await journal(id);
    expect(zeilen.map((z) => z.art)).toEqual(['angelegt', 'geaendert', 'geloescht']);
    expect(zeilen[1].aenderungen).toEqual({
      assigned_employees: { alt: [monteur.uid], neu: [monteur.uid, pl.uid] },
      customer_name: { alt: 'Familie Eins', neu: 'Familie Zwei' },
    });
    expect(zeilen[2]).toMatchObject({ objektart: 'baustelle', bezeichnung: 'B-J-TEAM', kunde_id: k2 });
  }, 60_000);

  it('Angebot: der Stand ja, die Zeit, die die Datenbank dazu setzt, nicht', async () => {
    const id = await einfuegen(chefin, 'quotes', {
      company_id: A, quote_number: 'AN-J-1', customer_name: 'Familie Gruber', quote_date: '2026-11-06',
      valid_until: '2026-12-06', status: 'Entwurf', vat_rate: 0.2,
    });
    await aendern(chefin, 'quotes', id, { status: 'Versendet' });
    const zeilen = await journal(id);
    expect(zeilen.map((z) => z.art)).toEqual(['angelegt', 'geaendert']);
    expect(zeilen[1].aenderungen).toEqual({ status: { alt: 'Entwurf', neu: 'Versendet' } });
    expect(zeilen[0]).toMatchObject({ objektart: 'angebot', bezeichnung: 'AN-J-1' });

    const entwurf = await einfuegen(chefin, 'quotes', {
      company_id: A, quote_number: 'AN-J-2', customer_name: 'Familie Gruber', quote_date: '2026-11-06',
      valid_until: '2026-12-06', status: 'Entwurf', vat_rate: 0.2,
    });
    expect((await chefin.client.from('quotes').delete().eq('id', entwurf)).error).toBeNull();
    expect((await journal(entwurf)).map((z) => z.art)).toEqual(['angelegt', 'geloescht']);
  }, 60_000);

  it('Rechnung und Zahlung: die Zahlung im Verlauf der Rechnung, vor dem Stand, den sie bewirkt; Mahnen nicht doppelt', async () => {
    const id = await rechnung('RE-J-1');
    const zahlung = await einfuegen(buch, 'zahlungseingaenge', {
      company_id: A, invoice_id: id, datum: '2026-11-05', betrag: 50, art: 'Überweisung',
    });
    clientEinreichen(buch.client);
    await rechnungen.mahnungFesthalten(id, {
      stufe: 1, gemahntAm: '2026-11-20', frist: '2026-11-27', spesen: 0, inhalt: mahnInhalt(1, '2026-11-20', '2026-11-27', 'RE-J-1'),
    });
    expect((await buch.client.from('zahlungseingaenge').delete().eq('id', zahlung)).error).toBeNull();

    const zeilen = await journal(id);
    const kurz = zeilen.map((z) => `${z.objektart}:${z.art}`);
    expect(kurz).toEqual([
      'rechnung:angelegt', 'zahlung:angelegt', 'rechnung:geaendert', 'zahlung:geloescht', 'rechnung:geaendert',
    ]);
    const [angelegt, bezahlt, teil, weg, offen] = zeilen;
    expect(angelegt).toMatchObject({ bezeichnung: 'RE-J-1', kunde_id: rechnungskunde, von_uid: buch.uid });
    expect(bezahlt).toMatchObject({ objekt_id: zahlung, bezug_id: id, kunde_id: rechnungskunde, von_name: 'Berta Büro' });
    expect(bezahlt.bezeichnung).toBe('€ 50,00 vom 05.11.2026 · Überweisung');
    // Der Stand, nicht die Summe der Zahlungen (die stehen selbst da) und nicht der Mahnstand (steht in der Mahnung).
    expect(teil.aenderungen).toEqual({ payment_status: { alt: 'Offen', neu: 'Teilbezahlt' } });
    expect(weg).toMatchObject({ objekt_id: zahlung, bezug_id: id, art: 'geloescht' });
    expect(offen.aenderungen).toEqual({ payment_status: { alt: 'Teilbezahlt', neu: 'Offen' } });

    // In der Sicht dazu die Mahnung, mit wer.
    const { data: mahnung } = await buch.client.from('objekt_verlauf').select('quelle, art, aenderungen, von_name')
      .eq('objekt_id', id).eq('art', 'gemahnt');
    expect(mahnung).toEqual([{
      quelle: 'mahnung', art: 'gemahnt', von_name: 'Berta Büro',
      aenderungen: { stufe: 1, datum: '2026-11-20', frist: '2026-11-27', spesen: 0 },
    }]);
  }, 60_000);

  it('Wartung: der von Hand gesetzte Termin steht da; die Ausführung zusätzlich in der Sicht', async () => {
    const id = await einfuegen(chefin, 'wartungen', {
      company_id: A, customer_id: rechnungskunde, customer_name: 'Familie Gruber', anlage: 'Gastherme',
      intervall_monate: 12, faellig_am: '2027-01-01',
    });
    await aendern(chefin, 'wartungen', id, { faellig_am: '2027-01-15' });
    await aendern(chefin, 'wartungen', id, { zuletzt_am: '2026-10-01', letzte_baustelle: 'B-J-1' });
    const { data: ausfuehrung } = await chefin.client.from('objekt_verlauf').select('quelle, art, aenderungen')
      .eq('objekt_id', id).eq('quelle', 'wartung_ausfuehrung');
    expect(ausfuehrung).toEqual([
      { quelle: 'wartung_ausfuehrung', art: 'ausgefuehrt', aenderungen: { am: '2026-10-01', baustelle: 'B-J-1' } },
    ]);
    expect((await chefin.client.from('wartungen').delete().eq('id', id)).error).toBeNull();

    const zeilen = await journal(id);
    expect(zeilen.map((z) => z.art)).toEqual(['angelegt', 'geaendert', 'geaendert', 'geloescht']);
    expect(zeilen[1].aenderungen).toEqual({ faellig_am: { alt: '2027-01-01', neu: '2027-01-15' } });
    // Den nächsten Termin rechnet die Datenbank aus der Ausführung nach — gespeichert ist er, also steht er da.
    expect(zeilen[2].aenderungen).toEqual({
      zuletzt_am: { alt: null, neu: '2026-10-01' }, letzte_baustelle: { alt: null, neu: 'B-J-1' },
      faellig_am: { alt: '2027-01-15', neu: '2027-10-01' },
    });

    expect(zeilen[3]).toMatchObject({ bezeichnung: 'Gastherme', kunde_id: rechnungskunde });
  }, 60_000);

  it('Benutzer: Stammdaten ja, der eigene Verlauf der Einstufung nicht', async () => {
    const person = await konto(A, 'Mitarbeiter', 'jr-person');
    await aendern(chefin, 'users', person.uid, { weekly_target_hours: 40, einstufung: 'facharbeiter' });
    await aendern(chefin, 'users', person.uid, { einstufung: 'helfer' });
    const zeilen = await journal(person.uid);
    expect(zeilen.map((z) => z.art)).toEqual(['geaendert', 'geaendert']);
    expect(Object.keys(zeilen[0].aenderungen).sort()).toEqual(['einstufung', 'weekly_target_hours']);
    // Die Datenbank hat die alte Einstufung in `einstufung_verlauf` geschrieben — im Journal steht nur die Einstufung.
    expect(zeilen[1].aenderungen).toEqual({ einstufung: { alt: 'facharbeiter', neu: 'helfer' } });
    expect(zeilen[1]).toMatchObject({ objektart: 'benutzer', kunde_id: null, von_uid: chefin.uid });
  }, 60_000);

  it('der Dienstschlüssel schreibt nichts — der Rücklauf bringt das Journal selbst mit', async () => {
    const { data: k } = await admin.from('customers').insert(kundeNeu('Dienst Kunde')).select('id').single();
    await admin.from('customers').update({ contact_phone: '1' }).eq('id', k!.id);
    const { data: p } = await admin.from('projects').insert({
      company_id: A, project_number: 'B-J-DIENST', customer_name: 'Dienst Kunde', status: 'Aktiv',
    }).select('id').single();
    await admin.from('projects').update({ status: 'Abgeschlossen' }).eq('id', p!.id);
    const { data: w } = await admin.from('wartungen').insert({
      company_id: A, customer_id: k!.id, customer_name: 'Dienst Kunde', anlage: 'Therme', intervall_monate: 12, faellig_am: '2027-01-01',
    }).select('id').single();
    const r = await rechnung('RE-J-DIENST');
    const { data: z } = await admin.from('zahlungseingaenge').insert({
      company_id: A, invoice_id: r, datum: '2026-11-05', betrag: 10, art: 'Bar',
    }).select('id').single();
    await admin.from('zahlungseingaenge').delete().eq('id', z!.id);
    await admin.from('users').update({ weekly_target_hours: 20 }).eq('id', monteur.uid);
    await admin.from('wartungen').delete().eq('id', w!.id);
    await admin.from('projects').delete().eq('id', p!.id);
    await admin.from('customers').delete().eq('id', k!.id);

    for (const id of [k!.id, p!.id, w!.id, z!.id, monteur.uid]) expect(await journal(id), id).toEqual([]);
    // Die Rechnung legte die Buchhaltung an — nur das steht da, die Zahlung mit dem Dienstschlüssel nicht.
    expect((await journal(r)).map((x) => `${x.objektart}:${x.art}`)).toEqual(['rechnung:angelegt']);
  }, 60_000);
});

describe('Ohne angemeldete Person schreibt nichts', () => {
  /*
    Migrationen, Zeitpläne, Test- und Prüfskripte arbeiten als `postgres`
    ohne Anmeldung. Es gibt niemanden, dem eine Zeile zuzuschreiben wäre —
    und ein Skript, das danach den Betrieb löscht, scheiterte sonst am
    Journal, das es eben selbst geschrieben hat (`zeilengrenze.test.ts`).
  */
  it('Anlegen, Ändern und Löschen direkt in der Datenbank hinterlassen keine Zeile', async () => {
    const db = new Client({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
    await db.connect();
    try {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.customers (company_id, name) values ($1, 'Direkt Kunde') returning id`, [A]);
      const id = rows[0].id;
      await db.query(`update public.customers set contact_phone = '1' where id = $1`, [id]);
      await db.query(`delete from public.customers where id = $1`, [id]);
      expect(await journal(id)).toEqual([]);
    } finally {
      await db.end();
    }
  }, 60_000);
});

describe('Niemand schreibt im Journal', () => {
  it('auch die Geschäftsführung nicht: anlegen, ändern, löschen — weder in der Tabelle noch in der Sicht', async () => {
    const id = await einfuegen(chefin, 'customers', kundeNeu('Familie Unverändert'));
    const [zeile] = await journal(id);

    const anlegen = await chefin.client.from('aenderungsjournal').insert({
      company_id: A, objektart: 'kunde', objekt_id: id, art: 'geaendert',
    });
    expect(anlegen.error).not.toBeNull();
    expect((await chefin.client.from('objekt_verlauf').insert({ company_id: A, objektart: 'kunde', objekt_id: id })).error)
      .not.toBeNull();

    await chefin.client.from('aenderungsjournal').update({ von_name: 'Niemand' }).eq('id', zeile.id);
    await chefin.client.from('aenderungsjournal').delete().eq('id', zeile.id);
    await buch.client.from('aenderungsjournal').delete().eq('id', zeile.id);
    const danach = await journal(id);
    expect(danach).toHaveLength(1);
    expect(danach[0].von_name).toBe('Carla Chefin');
  }, 60_000);
});

describe('Wer das Journal liest', () => {
  /*
    Je Objektart ein Objekt mit Journal, dazu eine gelöschte Baustelle. Die
    Rollen sehen, was sie am Objekt sehen — Benutzer und Gelöschtes nur die
    Spitze.
  */
  const objekte: Record<string, string> = {};

  beforeAll(async () => {
    objekte.kunde = await einfuegen(chefin, 'customers', kundeNeu('Familie Lesen'));
    objekte.baustelle = await einfuegen(chefin, 'projects', {
      company_id: A, project_number: 'B-J-LESEN', customer_name: 'Familie Lesen', status: 'Aktiv',
    });
    objekte.geloescht = await einfuegen(chefin, 'projects', {
      company_id: A, project_number: 'B-J-WEG', customer_name: 'Familie Lesen', status: 'Aktiv',
    });
    expect((await chefin.client.from('projects').delete().eq('id', objekte.geloescht)).error).toBeNull();
    objekte.angebot = await einfuegen(chefin, 'quotes', {
      company_id: A, quote_number: 'AN-J-LESEN', customer_name: 'Familie Lesen', quote_date: '2026-11-06',
      valid_until: '2026-12-06', status: 'Entwurf', vat_rate: 0.2,
    });
    objekte.rechnung = await rechnung('RE-J-LESEN');
    objekte.zahlung = await einfuegen(buch, 'zahlungseingaenge', {
      company_id: A, invoice_id: objekte.rechnung, datum: '2026-11-05', betrag: 20, art: 'Bar',
    });
    objekte.wartung = await einfuegen(chefin, 'wartungen', {
      company_id: A, customer_id: rechnungskunde, customer_name: 'Familie Gruber', anlage: 'Kessel', intervall_monate: 12,
      faellig_am: '2027-02-01',
    });
    objekte.benutzer = monteur.uid;
    await aendern(chefin, 'users', monteur.uid, { weekly_target_hours: 39 });
  }, 120_000);

  async function sieht(k: Konto): Promise<string[]> {
    const { data, error } = await k.client.from('aenderungsjournal').select('objekt_id').in('objekt_id', Object.values(objekte));
    expect(error).toBeNull();
    const ids = new Set((data ?? []).map((z) => z.objekt_id as string));
    return Object.entries(objekte).filter(([, id]) => ids.has(id)).map(([art]) => art).sort();
  }

  it('Mitarbeiter nichts; jede andere Rolle, was sie am Objekt sieht; Benutzer und Gelöschtes nur die Spitze', async () => {
    expect(await sieht(monteur)).toEqual([]);
    expect(await sieht(verwaltung)).toEqual(['baustelle', 'kunde', 'wartung']);
    expect(await sieht(pl)).toEqual(['angebot', 'baustelle', 'kunde', 'wartung']);
    expect(await sieht(buch)).toEqual(['angebot', 'baustelle', 'kunde', 'rechnung', 'wartung', 'zahlung']);
    expect(await sieht(chefin)).toEqual(['angebot', 'baustelle', 'benutzer', 'geloescht', 'kunde', 'rechnung', 'wartung', 'zahlung']);
  }, 60_000);

  it('eine GELÖSCHTE Zahlung sieht die Buchhaltung im Verlauf ihrer Rechnung — die Projektleitung nicht', async () => {
    /*
      Über die Zeile der Zahlung gelesen, sähe nach dem Löschen nur noch die
      Spitze sie. Die Buchhaltung sucht aber genau dann im Verlauf der
      Rechnung, wenn eine Zahlung fehlt.
    */
    const weg = await einfuegen(buch, 'zahlungseingaenge', {
      company_id: A, invoice_id: objekte.rechnung, datum: '2026-11-06', betrag: 7, art: 'Bar',
    });
    expect((await buch.client.from('zahlungseingaenge').delete().eq('id', weg)).error).toBeNull();
    const arten = async (k: Konto) => {
      const { data, error } = await k.client.from('aenderungsjournal').select('art').eq('objekt_id', weg);
      expect(error).toBeNull();
      return (data ?? []).map((z) => z.art as string).sort();
    };
    expect(await arten(buch)).toEqual(['angelegt', 'geloescht']);
    expect(await arten(pl)).toEqual([]);
    expect(await arten(verwaltung)).toEqual([]);
  }, 60_000);

  it('kein fremder Betrieb, kein Support — auch nicht mit Schreibfreigabe; der Support steht aber selbst im Journal', async () => {
    expect(await sieht(fremd)).toEqual([]);
    const { data: freigabe, error } = await chefin.client.from('support_freigaben').insert({
      company_id: A, gewaehrt_von: chefin.uid, grund: 'Journal prüfen', stufe: 'mitarbeiten',
      gilt_bis: new Date(Date.now() + 3_600_000).toISOString(),
    }).select('id').single();
    expect(error).toBeNull();
    try {
      await einblickBeginnen(plattform, A, freigabe!.id);
      // Der Kunde ist für den Support sichtbar — sein Journal nicht.
      expect((await plattform.client.from('customers').select('id').eq('id', objekte.kunde)).data).toHaveLength(1);
      expect(await sieht(plattform)).toEqual([]);
      expect((await plattform.client.from('objekt_verlauf').select('id').eq('quelle', 'journal')).data).toEqual([]);

      // Mit „mitarbeiten“ ändert er — und das Journal hält ihn fest, statt die Änderung scheitern zu lassen.
      await aendern(plattform, 'customers', objekte.kunde, { contact_name: 'Vom Support' });
      const letzte = (await journal(objekte.kunde)).pop()!;
      expect(letzte.aenderungen).toEqual({ contact_name: { alt: null, neu: 'Vom Support' } });
      expect(letzte).toMatchObject({ von_uid: plattform.uid, von_name: expect.stringMatching(/^Support \(jr-support\)$/) });
    } finally {
      await admin.from('support_zugriffe').delete().eq('company_id', A);
      await admin.from('support_freigaben').delete().eq('company_id', A);
    }
  }, 60_000);
});

describe('Die Sicht vereint die Verläufe', () => {
  let person: Konto;

  beforeAll(async () => {
    person = await konto(A, 'Mitarbeiter', 'jr-sicht');
    await aendern(chefin, 'users', person.uid, { weekly_target_hours: 30 });
    expect((await admin.from('konto_umstellungen').insert({
      company_id: A, user_id: person.uid, nach: 'benutzername', grund: 'Kein Postfach', durch: chefin.uid, durch_name: 'Carla Chefin',
    })).error).toBeNull();
    expect((await admin.from('urlaubsanspruch_anpassungen').insert([
      { company_id: A, user_id: person.uid, urlaubsjahr: 2026, tage: -2, grund: 'Unbezahlter Urlaub', angelegt_von_name: 'Carla Chefin' },
      {
        company_id: A, user_id: person.uid, urlaubsjahr: 2026, tage: 1, grund: 'Irrtum', angelegt_von_name: 'Carla Chefin',
        entfernt_am: new Date().toISOString(), entfernt_von_name: 'Carla Chefin', entfernt_grund: 'Falsch eingetragen',
      },
    ])).error).toBeNull();
  }, 120_000);

  it('im Verlauf einer Person: Journal, Kontoumstellung, Anpassung und ihr Entfernen — über die Datenschicht der App', async () => {
    clientEinreichen(chefin.client);
    const seite = await listObjektVerlauf(A, 'benutzer', person.uid);
    expect(seite.weiter).toBeNull();
    expect(seite.zeilen.map((z) => z.art).sort()).toEqual([
      'geaendert', 'konto_umgestellt', 'urlaubsanspruch_angepasst', 'urlaubsanspruch_angepasst', 'urlaubsanspruch_entfernt',
    ]);
    expect(seite.zeilen.find((z) => z.art === 'urlaubsanspruch_entfernt')?.aenderungen)
      .toEqual({ urlaubsjahr: 2026, tage: 1, grund: 'Falsch eingetragen' });
    // Neueste zuerst; `am` als Zahl für die Anzeige, roh für das Blättern.
    const zeiten = seite.zeilen.map((z) => z.am);
    expect([...zeiten].sort((a, b) => b - a)).toEqual(zeiten);
    expect(typeof seite.zeilen[0].amRoh).toBe('string');
  }, 60_000);

  it('zeigt keiner Rolle mehr als die Quellen', async () => {
    const quellen: [string, string, string?][] = [
      ['journal', 'aenderungsjournal'], ['mahnung', 'mahnungen'], ['wartung_ausfuehrung', 'wartung_ausfuehrungen'],
      ['konto_umstellung', 'konto_umstellungen'], ['urlaubsanspruch', 'urlaubsanspruch_anpassungen'],
    ];
    for (const k of [monteur, verwaltung, buch, pl, chefin, fremd]) {
      for (const [quelle, tabelle] of quellen) {
        const { count: inSicht } = await k.client.from('objekt_verlauf').select('id', { count: 'exact', head: true })
          .eq('company_id', A).eq('quelle', quelle);
        const { count: inQuelle } = await k.client.from(tabelle).select('id', { count: 'exact', head: true }).eq('company_id', A);
        let erwartet = inQuelle ?? 0;
        if (tabelle === 'urlaubsanspruch_anpassungen') {
          const { count: entfernt } = await k.client.from(tabelle).select('id', { count: 'exact', head: true })
            .eq('company_id', A).not('entfernt_am', 'is', null);
          erwartet += entfernt ?? 0;
        }
        expect(inSicht ?? 0, `${k.rolle} ${k.betrieb}: ${quelle}`).toBe(erwartet);
      }
    }
  }, 120_000);
});

describe('Blättern', () => {
  it('seitenweise ohne Lücke und ohne Doppel, neueste zuerst — und eine Rechnung mit ihren Zahlungen', async () => {
    const id = await einfuegen(chefin, 'customers', kundeNeu('Familie Viel'));
    for (let i = 1; i <= VERLAUF_SEITE + 1; i += 1) await aendern(chefin, 'customers', id, { notes: `Notiz ${i}` });

    clientEinreichen(chefin.client);
    const eins = await listObjektVerlauf(A, 'kunde', id);
    expect(eins.zeilen).toHaveLength(VERLAUF_SEITE);
    expect(eins.weiter).not.toBeNull();
    const zwei = await listObjektVerlauf(A, 'kunde', id, eins.weiter);
    expect(zwei.zeilen).toHaveLength(2);
    expect(zwei.weiter).toBeNull();
    const alle = [...eins.zeilen, ...zwei.zeilen];
    expect(new Set(alle.map((z) => z.id)).size).toBe(VERLAUF_SEITE + 2);
    expect(alle[0].aenderungen).toEqual({ notes: { alt: `Notiz ${VERLAUF_SEITE}`, neu: `Notiz ${VERLAUF_SEITE + 1}` } });
    expect(alle[alle.length - 1].art).toBe('angelegt');

    const r = await rechnung('RE-J-BLAETTERN');
    await einfuegen(buch, 'zahlungseingaenge', { company_id: A, invoice_id: r, datum: '2026-11-05', betrag: 120, art: 'Überweisung' });
    clientEinreichen(buch.client);
    const verlauf = await listObjektVerlauf(A, 'rechnung', r);
    expect(verlauf.zeilen.map((z) => `${z.objektart}:${z.art}`)).toEqual(['rechnung:geaendert', 'zahlung:angelegt', 'rechnung:angelegt']);
  }, 120_000);
});

describe('Datenschutz', () => {
  it('die Löschung eines Kunden mit Belegen nimmt aus dem Journal, was sie auch am Bestand entfernt', async () => {
    const k = await einfuegen(chefin, 'customers', kundeNeu('Familie Behalten', { contact_phone: '0664 7', email: 'a@b.at' }));
    await aendern(chefin, 'customers', k, { contact_phone: '0664 8', name: 'Familie Behalten-Neu' });
    const p = await einfuegen(chefin, 'projects', {
      company_id: A, project_number: 'B-J-BEHALTEN', customer_id: k, customer_name: 'Familie Behalten-Neu', status: 'Aktiv',
      contact_name: 'Frau Behalten',
    });
    await aendern(chefin, 'projects', p, { contact_phone: '0664 9', status: 'Abgeschlossen' });
    const w = await einfuegen(chefin, 'wartungen', {
      company_id: A, customer_id: k, customer_name: 'Familie Behalten-Neu', anlage: 'Therme bei Behalten', intervall_monate: 12,
      faellig_am: '2027-03-01',
    });
    // Ein Beleg hält den Kunden fest: er bleibt, nur Kontaktdaten und Wartungen gehen.
    clientEinreichen(buch.client);
    await rechnungen.createInvoice(A, {
      invoiceNumber: 'RE-J-BEHALTEN', projectNumber: 'B-J-BEHALTEN', customerName: 'Familie Behalten-Neu', ...{ customerId: k },
      address: 'Weg 1, 1010 Wien', invoiceDate: '2026-11-02', leistungVon: '2026-11-02', leistungBis: '2026-11-02',
      dueDate: '2026-11-16', subtotalNetto: 100, totalNetto: 100, totalVat: 20, totalBrutto: 120, vatRate: 0.2, paymentStatus: 'Offen',
      positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 100, netto: 100 }],
    });

    const antwort = await chefin.client.rpc('person_loeschen', { p_art: 'kunde', p_id: k, p_nur_pruefen: false });
    expect(antwort.error).toBeNull();
    expect((antwort.data as { ganz: boolean }).ganz).toBe(false);

    const kunde = await journal(k);
    const kundeGeaendert = kunde.filter((z) => z.art === 'geaendert');
    // Der Name bleibt (er steht auf dem Beleg), das Telefon nicht — auch nicht in der Zeile, die die Löschung selbst schrieb.
    expect(kundeGeaendert[0].aenderungen).toEqual({
      name: { alt: 'Familie Behalten', neu: 'Familie Behalten-Neu' }, contact_phone: { entfernt: true },
    });
    for (const z of kundeGeaendert) {
      for (const s of ['contact_name', 'contact_phone', 'email', 'notes']) {
        if (s in z.aenderungen) expect(z.aenderungen[s], s).toEqual({ entfernt: true });
      }
    }
    expect(kunde.every((z) => z.bezeichnung !== null)).toBe(true);

    const baustelle = await journal(p);
    expect(baustelle.find((z) => z.art === 'geaendert' && 'status' in z.aenderungen)?.aenderungen).toEqual({
      contact_phone: { entfernt: true }, status: { alt: 'Aktiv', neu: 'Abgeschlossen' },
    });

    const wartung = await journal(w);
    expect(wartung.map((z) => z.art)).toEqual(['angelegt', 'geloescht']);
    expect(wartung.map((z) => z.bezeichnung)).toEqual([null, null]);
  }, 90_000);

  it('Datenauskunft: der Stammdaten-Verlauf der Person, als Bearbeiter die Anzahl, beim Kunden sein Journal ohne Bearbeiter', async () => {
    const person = await konto(A, 'Mitarbeiter', 'jr-auskunft');
    await aendern(chefin, 'users', person.uid, { yearly_vacation_days: 30 });

    const fuerPerson = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: person.uid });
    expect(fuerPerson.error).toBeNull();
    const daten = (fuerPerson.data as { daten: { stammdaten_verlauf: { art: string; aenderungen: object; von: string }[] } }).daten;
    expect(daten.stammdaten_verlauf).toEqual([expect.objectContaining({
      art: 'geaendert', aenderungen: { yearly_vacation_days: { alt: null, neu: 30 } }, von: 'Carla Chefin',
    })]);

    const fuerChefin = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: chefin.uid });
    expect(fuerChefin.error).toBeNull();
    expect((fuerChefin.data as { als_bearbeiter: { aenderungsjournal_eintraege: number } }).als_bearbeiter.aenderungsjournal_eintraege)
      .toBeGreaterThanOrEqual(1);

    const k = await einfuegen(chefin, 'customers', kundeNeu('Familie Auskunft'));
    await aendern(chefin, 'customers', k, { contact_phone: '0664 3' });
    const fuerKunde = await chefin.client.rpc('person_auskunft', { p_art: 'kunde', p_id: k });
    expect(fuerKunde.error).toBeNull();
    const journalKunde = (fuerKunde.data as { daten: { aenderungsjournal: Record<string, unknown>[] } }).daten.aenderungsjournal;
    expect(journalKunde.map((z) => z.art)).toEqual(['angelegt', 'geaendert']);
    expect(journalKunde[1]).toMatchObject({ objekt: 'kunde', aenderungen: { contact_phone: { alt: null, neu: '0664 3' } } });
    // Wer geändert hat, ist eine Angabe über einen Mitarbeiter — nicht über den Kunden.
    expect(JSON.stringify(journalKunde)).not.toContain('Carla Chefin');
  }, 60_000);

  it('bei der Löschung einer Person bleibt ihr Stammdaten-Verlauf aufbewahrt (§ 132 BAO)', async () => {
    const weg = await konto(A, 'Mitarbeiter', 'jr-weg');
    await aendern(chefin, 'users', weg.uid, { weekly_target_hours: 20 });
    await deaktivieren(weg.uid);

    const antwort = await chefin.client.rpc('person_loeschen', { p_art: 'mitarbeiter', p_id: weg.uid, p_nur_pruefen: false });
    expect(antwort.error).toBeNull();
    const aufbewahren = (antwort.data as { aufbewahren: { was: string; anzahl: number; grund: string }[] }).aufbewahren;
    const verlauf = aufbewahren.find((a) => a.was === 'Änderungsjournal der Stammdaten');
    expect(verlauf?.anzahl).toBe(1);
    expect(verlauf?.grund).toMatch(/§ 132 BAO/);
    expect(await journal(weg.uid)).toHaveLength(1);
  }, 60_000);
});

describe('Keine Spalte fehlt still', () => {
  /*
    JEDE SPALTE STEHT ENTWEDER IN DER TEXTLISTE DER APP ODER IN DER
    AUSNAHMELISTE DES TRIGGERS — und nie in beiden. Kommt eine Spalte dazu,
    fällt sie hier auf: sonst stünde sie im Journal als Rohname oder gar
    nicht, ohne dass es jemand merkt.
  */
  it('Textliste und Ausnahmeliste decken jede Tabelle genau ab', async () => {
    const db = new Client({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
    await db.connect();
    try {
      const { rows } = await db.query<{ tabelle: string; argumente: string }>(`
        select c.relname as tabelle, encode(t.tgargs, 'escape') as argumente
          from pg_trigger t join pg_class c on c.oid = t.tgrelid
         where not t.tgisinternal and t.tgfoid = 'app.journal_protokollieren'::regproc`);
      // Seit M02b dazu der Auftragseingang (bewusst nachgezogen).
      expect(rows.map((r) => r.tabelle).sort()).toEqual(
        ['auftragseingaenge', 'customers', 'invoices', 'projects', 'quotes', 'users', 'wartungen', 'zahlungseingaenge']);
      const abweichend: string[] = [];
      for (const { tabelle, argumente } of rows) {
        const [objektart, liste] = argumente.split('\\000');
        const ohne = liste.replace(/[{}]/g, '').split(',');
        const { rows: spalten } = await db.query<{ name: string }>(
          `select column_name as name from information_schema.columns where table_schema = 'public' and table_name = $1`, [tabelle]);
        const text = (VERLAUF_FELDER[objektart as keyof typeof VERLAUF_FELDER] ?? []).map(([s]) => s);
        const echt = new Set(spalten.map((s) => s.name));
        for (const s of echt) if (!text.includes(s) && !ohne.includes(s)) abweichend.push(`${tabelle}.${s}: weder Text noch Ausnahme`);
        for (const s of text) if (!echt.has(s)) abweichend.push(`${tabelle}.${s}: in der Textliste, aber keine Spalte`);
        for (const s of ohne) if (!echt.has(s)) abweichend.push(`${tabelle}.${s}: ausgenommen, aber keine Spalte`);
        for (const s of text) if (ohne.includes(s)) abweichend.push(`${tabelle}.${s}: Text UND Ausnahme`);
      }
      expect(abweichend).toEqual([]);
    } finally {
      await db.end();
    }
  });
});
