/**
 * Kontoauszug verbuchen (Durchsicht 15.11.2026, F13) — gegen die echte Datenbank.
 *
 * `kontoauszug_verbuchen` bucht je Bewegung über die bestehenden Eingänge
 * (Sperre, Skonto-, Mahnkosten- und Untergrenzen-Prüfung, Zahlstand), mit
 * einer Wiederholungssperre je Bewegung. Ohne
 * `20261117040000_kontoauszug_abgleich.sql` gibt es weder Funktion noch
 * Tabelle — jede Prüfung hier ist dann rot.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { admin, betriebAnlegen, deaktivieren, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { kontoauszugSchonVerbucht, kontoauszugVerbuchen, type ZuVerbuchen } from '@/lib/db/pg/kontoauszug';
import { clientEinreichen } from '@/lib/db/pg/kern';
import type { Invoice } from '@/types';

const BETRIEB = 'kontoauszug-f13';
const FREMD = 'kontoauszug-f13-fremd';
let buch: Konto;
let chef: Konto;
let pl: Konto;
let monteur: Konto;
let fremd: Konto;

function heute(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date());
}

/** Eine eindeutige Prüfsumme je Aufruf — 64 Hex-Zeichen. */
function kennung(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '').slice(0, 64);
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  buch = await konto(BETRIEB, 'Buchhaltung', 'kabuch');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'kachef');
  pl = await konto(BETRIEB, 'Projektleiter', 'kapl');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'kamon');
  fremd = await konto(FREMD, 'Buchhaltung', 'kafremd');
  clientEinreichen(buch.client);
}, 120_000);

afterAll(() => clientEinreichen(null));
afterEach(() => clientEinreichen(buch.client));

/** 1.200 € brutto, auf Wunsch mit Skonto 2 % bis heute. */
async function rechnung(extra: Partial<Invoice> = {}): Promise<{ id: string; nummer: string }> {
  const r = await rechnungen.rechnungAusstellen(BETRIEB, {
    projectNumber: 'B-F13', customerName: 'Familie Huber', address: 'Gartengasse 4, 8200 Gleisdorf',
    invoiceDate: heute(), leistungVon: heute(), leistungBis: heute(), dueDate: heute(),
    subtotalNetto: 1000, totalNetto: 1000, totalVat: 200, totalBrutto: 1200, vatRate: 0.2,
    paymentStatus: 'Offen',
    positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 1000, netto: 1000 }],
    ...extra,
  }, { praefix: 'RE' });
  const { data } = await admin.from('invoices').select('invoice_number').eq('id', r.id).single();
  return { id: r.id, nummer: (data as { invoice_number: string }).invoice_number };
}

async function stand(id: string) {
  const { data } = await admin.from('invoices').select('payment_status, bezahlt_betrag, skonto_betrag').eq('id', id).single();
  return { status: data!.payment_status as string, bezahlt: Number(data!.bezahlt_betrag), skonto: Number(data!.skonto_betrag) };
}

const posten = (id: string, betrag: number, teil: Partial<ZuVerbuchen['teile'][number]> = {}, k = kennung()): ZuVerbuchen => ({
  kennung: k, buchungstag: heute(), betrag, hinweis: 'Kontoauszug: Huber — RE-Test',
  teile: [{ rechnung: id, betrag, skonto: 0, mahnkosten: 0, ...teil }],
});

describe('Kontoauszug verbuchen (F13)', () => {
  it('bucht Zahlung und Skonto in einem Zug; der Zahlstand folgt, die Eingänge tragen Bewegung und Hinweis', async () => {
    const r = await rechnung({ skontoProzent: 2, skontoBis: heute() });
    const p = posten(r.id, 1176, { skonto: 24 });
    expect(await kontoauszugVerbuchen([p])).toEqual([{ kennung: p.kennung, ergebnis: 'gebucht' }]);
    expect(await stand(r.id)).toEqual({ status: 'Bezahlt', bezahlt: 1200, skonto: 24 });
    const { data } = await admin.from('zahlungseingaenge')
      .select('art, betrag, hinweis, bank_buchung, erfasst_von').eq('invoice_id', r.id).order('art');
    expect(data!.map((z) => [z.art, Number(z.betrag)])).toEqual([['Skonto', 24], ['Überweisung', 1176]]);
    expect(data!.every((z) => z.bank_buchung && z.erfasst_von === buch.uid)).toBe(true);
    expect(data!.find((z) => z.art === 'Überweisung')!.hinweis).toBe('Kontoauszug: Huber — RE-Test');
  });

  it('dieselbe Bewegung zweimal: beim zweiten Mal „schon verbucht“, nichts doppelt', async () => {
    const r = await rechnung();
    const p = posten(r.id, 500);
    await kontoauszugVerbuchen([p]);
    expect(await kontoauszugVerbuchen([p])).toEqual([{ kennung: p.kennung, ergebnis: 'schon_verbucht' }]);
    expect(await stand(r.id)).toMatchObject({ status: 'Teilbezahlt', bezahlt: 500 });
    expect([...(await kontoauszugSchonVerbucht([p.kennung, kennung()])).keys()]).toEqual([p.kennung]);
  });

  it('zwei Personen verbuchen dieselbe Datei gleichzeitig: eine bucht, die andere geht leer aus', async () => {
    const r = await rechnung();
    const p = posten(r.id, 300);
    const [a, b] = await Promise.all([
      buch.client.rpc('kontoauszug_verbuchen', { p_posten: [p] }),
      chef.client.rpc('kontoauszug_verbuchen', { p_posten: [p] }),
    ]);
    const ergebnisse = [...(a.data as { ergebnis: string }[]), ...(b.data as { ergebnis: string }[])].map((e) => e.ergebnis).sort();
    expect(ergebnisse).toEqual(['gebucht', 'schon_verbucht']);
    expect(await stand(r.id)).toMatchObject({ bezahlt: 300 });
  });

  it('eine abgewiesene Bewegung hält die übrigen nicht auf und kommt mit dem Grund der Datenbank zurück', async () => {
    const r = await rechnung();
    const ohneSkonto = posten(r.id, 100, { skonto: 5 });
    const zuViel = { ...posten(r.id, 50), teile: [{ rechnung: r.id, betrag: 60, skonto: 0, mahnkosten: 0 }] };
    const gut = posten(r.id, 200);
    const e = await kontoauszugVerbuchen([ohneSkonto, zuViel, gut]);
    expect(e.map((x) => x.ergebnis)).toEqual(['abgewiesen', 'abgewiesen', 'gebucht']);
    expect(e[0].grund).toMatch(/Skonto/);
    expect(e[1].grund).toMatch(/eingegangen nur 50,00/);
    expect(await stand(r.id)).toMatchObject({ bezahlt: 200, skonto: 0 });
    // Die abgewiesene Bewegung ist nicht gesperrt — korrigiert geht sie durch.
    expect(await kontoauszugVerbuchen([{ ...ohneSkonto, teile: [{ rechnung: r.id, betrag: 100, skonto: 0, mahnkosten: 0 }] }]))
      .toEqual([{ kennung: ohneSkonto.kennung, ergebnis: 'gebucht' }]);
  });

  it('Sammelüberweisung: eine Bewegung, zwei Rechnungen', async () => {
    const a = await rechnung();
    const b = await rechnung();
    const p: ZuVerbuchen = {
      kennung: kennung(), buchungstag: heute(), betrag: 2400,
      teile: [{ rechnung: a.id, betrag: 1200, skonto: 0, mahnkosten: 0 }, { rechnung: b.id, betrag: 1200, skonto: 0, mahnkosten: 0 }],
    };
    expect((await kontoauszugVerbuchen([p]))[0].ergebnis).toBe('gebucht');
    expect((await stand(a.id)).status).toBe('Bezahlt');
    expect((await stand(b.id)).status).toBe('Bezahlt');
  });

  it('Buchungstag in der Zukunft, fremde Rechnung, doppelte Rechnung: abgewiesen', async () => {
    const r = await rechnung();
    clientEinreichen(fremd.client);
    const { data: fremdeRechnung } = await admin.from('invoices').select('id').eq('company_id', BETRIEB).limit(1).single();
    const auchFremd = await kontoauszugVerbuchen([posten((fremdeRechnung as { id: string }).id, 10)]);
    expect(auchFremd[0]).toMatchObject({ ergebnis: 'abgewiesen' });
    expect(auchFremd[0].grund).toMatch(/gibt es hier nicht/);
    clientEinreichen(buch.client);
    const morgen = new Date(Date.parse(`${heute()}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const e = await kontoauszugVerbuchen([
      { ...posten(r.id, 10), buchungstag: morgen },
      { ...posten(r.id, 20), teile: [{ rechnung: r.id, betrag: 10, skonto: 0, mahnkosten: 0 }, { rechnung: r.id, betrag: 10, skonto: 0, mahnkosten: 0 }] },
    ]);
    expect(e.map((x) => x.ergebnis)).toEqual(['abgewiesen', 'abgewiesen']);
    expect(e[0].grund).toMatch(/Zukunft/);
    expect(e[1].grund).toMatch(/höchstens einmal/);
  });

  it('nur wer Zahlungen erfasst: Projektleitung, Monteur und deaktivierte Konten werden abgewiesen', async () => {
    const r = await rechnung();
    for (const wer of [pl, monteur]) {
      const { error } = await wer.client.rpc('kontoauszug_verbuchen', { p_posten: [posten(r.id, 10)] });
      expect(error?.message).toMatch(/wer Zahlungen erfasst/);
      const { data } = await wer.client.rpc('kontoauszug_schon_verbucht', { p_kennungen: [kennung()] });
      expect(data).toEqual([]);
    }
    const weg = await konto(BETRIEB, 'Buchhaltung', 'kaweg');
    await deaktivieren(weg.uid);
    const { error } = await weg.client.rpc('kontoauszug_verbuchen', { p_posten: [posten(r.id, 10)] });
    expect(error).not.toBeNull();
    expect((await stand(r.id)).bezahlt).toBe(0);
  });

  it('die Bewegung eines Eingangs setzt nur der Abgleich — von Hand weder anlegen noch umhängen', async () => {
    const r = await rechnung();
    await kontoauszugVerbuchen([posten(r.id, 100)]);
    const { data: b } = await admin.from('zahlungseingaenge').select('bank_buchung').eq('invoice_id', r.id).single();
    const { error: anlegen } = await buch.client.from('zahlungseingaenge').insert({
      company_id: BETRIEB, invoice_id: r.id, datum: heute(), betrag: 5, art: 'Bar', bank_buchung: b!.bank_buchung,
    });
    expect(anlegen?.message).toMatch(/setzt nur der Abgleich/);
    const { data: neu } = await buch.client.from('zahlungseingaenge').insert({
      company_id: BETRIEB, invoice_id: r.id, datum: heute(), betrag: 5, art: 'Bar',
    }).select('id').single();
    const { error: umhaengen } = await buch.client.from('zahlungseingaenge')
      .update({ bank_buchung: b!.bank_buchung }).eq('id', (neu as { id: string }).id);
    expect(umhaengen?.message).toMatch(/setzt nur der Abgleich/);
  });

  it('wird der letzte Eingang gelöscht (Fehlgriff), lässt sich die Bewegung erneut verbuchen', async () => {
    const r = await rechnung({ skontoProzent: 2, skontoBis: heute() });
    const p = posten(r.id, 1176, { skonto: 24 });
    await kontoauszugVerbuchen([p]);
    const { data: z } = await admin.from('zahlungseingaenge').select('id').eq('invoice_id', r.id).eq('art', 'Überweisung').single();
    // Eine Hälfte gelöscht: die Bewegung hängt noch am Skonto — weiter gesperrt.
    await buch.client.from('zahlungseingaenge').delete().eq('id', (z as { id: string }).id);
    expect((await kontoauszugSchonVerbucht([p.kennung])).has(p.kennung)).toBe(true);
    await buch.client.from('zahlungseingaenge').delete().eq('invoice_id', r.id);
    expect((await kontoauszugSchonVerbucht([p.kennung])).has(p.kennung)).toBe(false);
    expect((await kontoauszugVerbuchen([p]))[0].ergebnis).toBe('gebucht');
  });

  it('Gegenprobe der Leseregel: ein fremder Betrieb sieht keine Bewegung', async () => {
    const r = await rechnung();
    const p = posten(r.id, 10);
    await kontoauszugVerbuchen([p]);
    const { data } = await fremd.client.from('bank_buchungen').select('id').eq('kennung', p.kennung);
    expect(data).toEqual([]);
    const { data: eigen } = await buch.client.from('bank_buchungen').select('id').eq('kennung', p.kennung);
    expect(eigen).toHaveLength(1);
  });

  it('Datenauskunft und Löschung kennen, wer verbucht hat', async () => {
    const wer = await konto(BETRIEB, 'Buchhaltung', 'kaausk');
    const r = await rechnung();
    await wer.client.rpc('kontoauszug_verbuchen', { p_posten: [posten(r.id, 10)] });
    const { data: auskunft } = await chef.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: wer.uid });
    expect((auskunft as { als_bearbeiter: Record<string, number> }).als_bearbeiter.kontoauszug_verbucht).toBe(1);
    await deaktivieren(wer.uid);
    const { data: pruefung } = await chef.client.rpc('person_loeschen', { p_art: 'mitarbeiter', p_id: wer.uid, p_nur_pruefen: true });
    expect((pruefung as { sofort: Record<string, number> }).sofort.bank_buchungen).toBe(1);
    const { error } = await chef.client.rpc('person_loeschen', { p_art: 'mitarbeiter', p_id: wer.uid, p_nur_pruefen: false });
    expect(error).toBeNull();
    const { count } = await admin.from('bank_buchungen').select('id', { count: 'exact', head: true }).eq('verbucht_von', wer.uid);
    expect(count).toBe(0);
  });
});
