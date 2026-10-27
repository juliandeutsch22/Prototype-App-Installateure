/**
 * BELEGE MIT DEN FIRMENDATEN IHRER AUSSTELLUNG (A1, 24.10.2026).
 *
 * Gegen die echte Datenbank: Rechnung, Stornorechnung, Mahnung, Angebot und
 * Handwerksschein halten beim Ausstellen fest, welche Firmendaten galten
 * (`aussteller_staende`). Ändert der Betrieb danach Bank oder Anschrift,
 * bleibt der Stand des alten Belegs; ein neuer Beleg bekommt einen neuen.
 *
 * Gegenproben: den Stand setzt niemand von Hand, und nachträglich ändert ihn
 * niemand; ein Entwurf hat keinen; ein fremder Betrieb liest keinen; gleiche
 * Firmendaten ergeben keinen zweiten Stand; die Prüfsumme des Scheins hängt
 * nicht daran; der Rücklauf einer Sicherung behält den mitgebrachten Stand.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto, mahnInhalt } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import * as angebote from '@/lib/db/pg/quotes';
import * as scheine from '@/lib/db/pg/workSheets';
import { ausstellerStaende } from '@/lib/db/pg/aussteller';
import { clientEinreichen } from '@/lib/db/pg/kern';
import type { WorkSheetUnterschrift } from '@/types';

const BETRIEB = 'aussteller-a';
const FREMD = 'aussteller-b';
let buch: Konto;
let chefin: Konto;
let monteur: Konto;
let fremd: Konto;
let kunde = '';

const ALTE_BANK = { iban: 'AT611904300234573201', bic: 'BKAUATWW', bank_name: 'Alte Bank', address_line: 'Hauptplatz 1 · 2700 Wiener Neustadt' };
const NEUE_BANK = { iban: 'AT483200000012345864', bic: 'RLNWATWW', bank_name: 'Neue Bank', address_line: 'Neugasse 9 · 2700 Wiener Neustadt' };

async function firmendaten(d: Record<string, string>): Promise<void> {
  const { error } = await admin.from('companies').update(d).eq('id', BETRIEB);
  expect(error).toBeNull();
}

async function staendeVon(tabelle: string, id: string, spalte = 'aussteller_stand'): Promise<string | null> {
  const { data, error } = await admin.from(tabelle).select(spalte).eq('id', id).single();
  expect(error).toBeNull();
  return (data as unknown as Record<string, string | null>)[spalte];
}

async function angaben(stand: string | null): Promise<Record<string, unknown>> {
  const { data, error } = await admin.from('aussteller_staende').select('angaben').eq('id', stand).single();
  expect(error).toBeNull();
  return data!.angaben as Record<string, unknown>;
}

let nr = 0;
async function rechnung(): Promise<string> {
  nr += 1;
  clientEinreichen(buch.client);
  return rechnungen.createInvoice(BETRIEB, {
    invoiceNumber: `RE-AS-${String(nr).padStart(4, '0')}`, projectNumber: 'B-1', customerName: 'Familie Huber', ...{ customerId: kunde },
    address: 'Hauptstraße 1, 2700 Wiener Neustadt',
    invoiceDate: '2026-01-02', leistungVon: '2026-01-02', leistungBis: '2026-01-02', dueDate: '2026-01-16', subtotalNetto: 100, totalNetto: 100, totalVat: 20, totalBrutto: 120,
    vatRate: 0.2, paymentStatus: 'Offen',
    positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 100, netto: 100 }],
  });
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  buch = await konto(BETRIEB, 'Buchhaltung', 'ausstbuch');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'ausstgf');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'ausstmont');
  fremd = await konto(FREMD, 'Buchhaltung', 'ausstfremd');
  const { data: k, error } = await admin.from('customers')
    .insert({ company_id: BETRIEB, name: 'Familie Huber', kundenart: 'privat', strasse: 'Hauptstraße 1', plz: '2700', ort: 'Wiener Neustadt' })
    .select('id').single();
  expect(error).toBeNull();
  kunde = k!.id;
  await firmendaten(ALTE_BANK);
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('Rechnung und Stornorechnung', () => {
  it('die Rechnung behält die Firmendaten ihrer Ausstellung, eine neue bekommt die neuen', async () => {
    await firmendaten(ALTE_BANK);
    const alt = await rechnung();
    const altStand = await staendeVon('invoices', alt);
    expect(await angaben(altStand)).toMatchObject({ iban: ALTE_BANK.iban, bankName: 'Alte Bank', addressLine: ALTE_BANK.address_line });

    await firmendaten(NEUE_BANK);
    const neu = await rechnung();
    const neuStand = await staendeVon('invoices', neu);
    expect(neuStand).not.toBe(altStand);
    expect(await angaben(neuStand)).toMatchObject({ iban: NEUE_BANK.iban, bankName: 'Neue Bank' });
    // Der alte Beleg bleibt, wie er war.
    expect(await staendeVon('invoices', alt)).toBe(altStand);
    expect(await angaben(altStand)).toMatchObject({ iban: ALTE_BANK.iban });
  });

  it('gleiche Firmendaten ergeben keinen zweiten Stand', async () => {
    await firmendaten(NEUE_BANK);
    const a = await rechnung();
    const b = await rechnung();
    expect(await staendeVon('invoices', a)).toBe(await staendeVon('invoices', b));
  });

  it('den Stand setzt niemand von Hand, und ändern lässt er sich nicht', async () => {
    await firmendaten(ALTE_BANK);
    const altStand = await staendeVon('invoices', await rechnung());
    await firmendaten(NEUE_BANK);
    const id = await rechnung();
    clientEinreichen(chefin.client);
    const { error } = await chefin.client.from('invoices').update({ aussteller_stand: altStand }).eq('id', id);
    expect(error).not.toBeNull();
    expect(await staendeVon('invoices', id)).not.toBe(altStand);
  });

  it('die Stornorechnung hält die Firmendaten fest, wenn ihre Nummer vergeben wird', async () => {
    await firmendaten(ALTE_BANK);
    const id = await rechnung();
    const rechnungStand = await staendeVon('invoices', id);
    clientEinreichen(buch.client);
    const { error } = await buch.client.rpc('rechnung_stornieren', { p_id: id, p_grund: 'Prüfung' });
    expect(error).toBeNull();
    expect(await staendeVon('invoices', id, 'storno_aussteller_stand')).toBeNull();

    await firmendaten(NEUE_BANK);
    const { data: inv } = await admin.from('invoices').select('*').eq('id', id).single();
    clientEinreichen(buch.client);
    await rechnungen.stornorechnungAusstellen({ ...inv, id } as never, 'ST');
    const stornoStand = await staendeVon('invoices', id, 'storno_aussteller_stand');
    expect(await angaben(stornoStand)).toMatchObject({ iban: NEUE_BANK.iban });
    // Die Rechnung selbst behält ihren.
    expect(await staendeVon('invoices', id)).toBe(rechnungStand);
  });
});

describe('Mahnung', () => {
  it('die Mahnung hält die Firmendaten beim Festhalten fest', async () => {
    await firmendaten(NEUE_BANK);
    const id = await rechnung();
    clientEinreichen(buch.client);
    const mahnung = await rechnungen.mahnungFesthalten(id, {
      stufe: 1, gemahntAm: '2026-02-01', frist: '2026-02-08', spesen: 0,
      inhalt: mahnInhalt(1, '2026-02-01', '2026-02-08', 'RE-AS'),
    });
    const stand = await staendeVon('mahnungen', mahnung);
    expect(await angaben(stand)).toMatchObject({ iban: NEUE_BANK.iban });
    const liste = await rechnungen.listMahnungenZurRechnung(BETRIEB, id);
    expect(liste[0].ausstellerStand).toBe(stand);
  });
});

describe('Angebot', () => {
  const JAHR = new Date().getFullYear();
  let lfd = 0;
  const angebot = () => {
    lfd += 1;
    return {
      quoteNumber: `AN-${JAHR}-8${String(lfd).padStart(3, '0')}`, customerName: 'Familie Huber',
      quoteDate: `${JAHR}-03-01`, validUntil: `${JAHR}-03-31`, status: 'Entwurf',
      positions: [{ label: 'WC', qty: 1, unit: 'Stk', unitPrice: 300, netto: 300, istArbeitszeit: false }],
      subtotalNetto: 300, totalNetto: 300, totalVat: 60, totalBrutto: 360, vatRate: 0.2, kalkulierteStunden: 0,
    } as Parameters<typeof angebote.createQuote>[1];
  };

  it('ein Entwurf hat keinen Stand, der Versand hält ihn fest', async () => {
    await firmendaten(ALTE_BANK);
    clientEinreichen(chefin.client);
    const id = await angebote.createQuote(BETRIEB, angebot());
    expect(await staendeVon('quotes', id)).toBeNull();
    await angebote.updateQuote(id, { status: 'Versendet' });
    const stand = await staendeVon('quotes', id);
    expect(await angaben(stand)).toMatchObject({ iban: ALTE_BANK.iban });

    // Danach geändert: Annahme behält den Stand des Versands.
    await firmendaten(NEUE_BANK);
    clientEinreichen(chefin.client);
    await angebote.updateQuote(id, { status: 'Angenommen' });
    expect(await staendeVon('quotes', id)).toBe(stand);
  });

  it('von Hand setzt den Stand niemand', async () => {
    await firmendaten(NEUE_BANK);
    clientEinreichen(chefin.client);
    const id = await angebote.createQuote(BETRIEB, angebot());
    const fremderStand = await staendeVon('invoices', await rechnung());
    clientEinreichen(chefin.client);
    const { error } = await chefin.client.from('quotes').update({ aussteller_stand: fremderStand }).eq('id', id);
    expect(error).not.toBeNull();
    expect(await staendeVon('quotes', id)).toBeNull();
  });
});

describe('Handwerksschein', () => {
  const strich = (name: string): WorkSheetUnterschrift => ({ name, bild: 'data:image/png;base64,iVBORw0KGgo=', geraetZeit: 1776000000000 });
  const entwurf = () => ({
    projectNumber: 'B-100', customerName: 'Familie Huber', address: 'Hauptstraße 1', datum: '2026-04-13',
    status: 'Entwurf' as const, abrechnung: 'Regie' as const,
    zeiten: [{ datum: '2026-04-13', mitarbeiter: 'Anton', minuten: 120 }],
    material: [{ name: 'Dichtung', menge: 4 }],
    erstelltVonUid: monteur.uid, erstelltVonName: 'Anton',
  });

  it('die Unterschrift hält den Stand fest; die Prüfsumme hängt nicht daran', async () => {
    await firmendaten(ALTE_BANK);
    clientEinreichen(monteur.client);
    const alt = await scheine.createWorkSheet(BETRIEB, entwurf());
    expect(await staendeVon('work_sheets', alt)).toBeNull();
    await scheine.signWorkSheet(alt, strich('Anton'), strich('Huber'));
    const altStand = await staendeVon('work_sheets', alt);
    expect(await angaben(altStand)).toMatchObject({ iban: ALTE_BANK.iban });

    await firmendaten(NEUE_BANK);
    clientEinreichen(monteur.client);
    const neu = await scheine.createWorkSheet(BETRIEB, entwurf());
    await scheine.signWorkSheet(neu, strich('Anton'), strich('Huber'));
    expect(await staendeVon('work_sheets', neu)).not.toBe(altStand);
    // Gleicher Inhalt, anderer Stand: dieselbe Prüfsumme.
    const { data } = await admin.from('work_sheets').select('id, inhalt_hash').in('id', [alt, neu]);
    const hash = new Map((data ?? []).map((z) => [z.id, z.inhalt_hash]));
    expect(hash.get(alt)).toBe(hash.get(neu));
    // Die Liste bringt den Stand mit — das PDF aus der Liste braucht ihn.
    const liste = await scheine.listWorkSheetsForProject(BETRIEB, 'B-100');
    expect(liste.find((s) => s.id === alt)?.ausstellerStand).toBe(altStand);
  });
});

describe('Lesen und Rücklauf', () => {
  it('der Betrieb liest seine Stände, auch der Monteur; ein fremder Betrieb nicht', async () => {
    await firmendaten(NEUE_BANK);
    const stand = await staendeVon('invoices', await rechnung());
    clientEinreichen(monteur.client);
    expect((await ausstellerStaende(BETRIEB, [stand])).get(stand!)).toMatchObject({ iban: NEUE_BANK.iban });
    const { data } = await fremd.client.from('aussteller_staende').select('id').eq('id', stand);
    expect(data).toEqual([]);
  });

  it('einen Stand legt niemand direkt an', async () => {
    const { error } = await chefin.client.from('aussteller_staende')
      .insert({ company_id: BETRIEB, angaben: { name: 'Erfunden' }, pruefsumme: 'x' });
    expect(error).not.toBeNull();
    const { error: f } = await chefin.client.rpc('aussteller_stand' as never, { p_betrieb: BETRIEB } as never);
    expect(f).not.toBeNull();
  });

  it('bleibt gleich: der Rücklauf einer Sicherung behält den mitgebrachten Stand', async () => {
    await firmendaten(ALTE_BANK);
    const altStand = await staendeVon('invoices', await rechnung());
    await firmendaten(NEUE_BANK);
    const { data, error } = await admin.from('invoices').insert({
      company_id: BETRIEB, invoice_number: 'RE-AS-RUECK', project_number: 'B-1', customer_name: 'Familie Huber',
      invoice_date: '2025-05-05', due_date: '2025-05-19', subtotal_netto: 10, total_netto: 10, total_vat: 2, total_brutto: 12,
      vat_rate: 0.2, payment_status: 'Offen', aussteller_stand: altStand,
    }).select('aussteller_stand').single();
    expect(error).toBeNull();
    expect(data!.aussteller_stand).toBe(altStand);
  });
});
