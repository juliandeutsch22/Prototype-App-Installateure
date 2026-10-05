/**
 * Haft- und Deckungsrücklass in der Datenbank (Stand-Datei 11.1, Punkt 5):
 * angelegt nur vollständig und richtig gerechnet, eingefroren wie der Beleg,
 * und die Zahl am Menüpunkt zählt ihn erst, wenn er fällig ist.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { betriebAnlegen, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { createZahlung } from '@/lib/db/pg/zahlungen';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'ruecklass-a';
const JAHR = new Date().getFullYear();
let buch: Konto;
let lfd = 7000;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'rlbuch');
  clientEinreichen(buch.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

/** 12.000 € brutto, Zahlungsziel am 31.08.2026 — lange vorbei. */
async function anlegen(extra: Partial<rechnungen.NewInvoice> = {}): Promise<string> {
  lfd += 1;
  return rechnungen.createInvoice(BETRIEB, {
    invoiceNumber: `RE-${JAHR}-${lfd}`,
    projectNumber: 'B-RL',
    customerName: 'Bauträger Nord',
    address: 'Hauptstraße 1, 2700 Wiener Neustadt',
    invoiceDate: '2026-08-01',
    dueDate: '2026-08-31',
    subtotalNetto: 10000,
    totalNetto: 10000,
    totalVat: 2000,
    totalBrutto: 12000,
    vatRate: 0.2,
    paymentStatus: 'Offen',
    positions: [{ label: 'Installation', qty: 1, unit: 'Pauschale', unitPrice: 10000, netto: 10000 }],
    ...extra,
  });
}

const haft = (bis = '2029-08-01') => ({
  ruecklassArt: 'haft' as const, ruecklassProzent: 5, ruecklassBetrag: 600, ruecklassBis: bis,
});

const lies = async (id: string) =>
  (await buch.client.from('invoices').select('total_vat, ruecklass_art, ruecklass_prozent, ruecklass_betrag, ruecklass_bis').eq('id', id).single()).data;

const zaehler = async (heute: string) =>
  ((await buch.client.rpc('offene_posten', { p_heute: heute })).data as Array<{ mahnungen: number }>)[0].mahnungen;

describe('Rücklass anlegen', () => {
  it('ein Haftrücklass wird gespeichert — die Umsatzsteuer bleibt voll', async () => {
    const id = await anlegen(haft());
    expect(await lies(id)).toEqual({
      total_vat: 2000, ruecklass_art: 'haft', ruecklass_prozent: 5, ruecklass_betrag: 600, ruecklass_bis: '2029-08-01',
    });
  });

  it('ein falsch gerechneter Betrag wird abgewiesen, einer innerhalb eines Cents nicht', async () => {
    await expect(anlegen({ ...haft(), ruecklassBetrag: 599 })).rejects.toThrow(/falsch gerechnet/);
    await expect(anlegen({ ...haft(), ruecklassBetrag: 600.01 })).resolves.toBeTruthy();
  });

  it('nur vollständig, nur zur passenden Rechnungsart, nicht mit Skonto, fällig nach dem Rechnungsdatum', async () => {
    await expect(anlegen({ ruecklassArt: 'haft', ruecklassProzent: 5 })).rejects.toThrow(/Art, Prozentsatz und Fälligkeit/);
    await expect(anlegen({ ...haft(), ruecklassArt: 'deckung' })).rejects.toThrow(/Teilrechnung/);
    await expect(anlegen({ ...haft(), skontoProzent: 2, skontoBis: '2026-08-10' })).rejects.toThrow(/Skonto und Rücklass/);
    await expect(anlegen({ ...haft('2026-07-01') })).rejects.toThrow(/nach dem Rechnungsdatum/);
    await expect(anlegen({ ...haft(), ruecklassProzent: 25, ruecklassBetrag: 3000 })).rejects.toThrow(/zwischen 0 und 20/);
  });

  it('Gegenprobe: ohne Rücklass bleibt alles leer', async () => {
    const id = await anlegen();
    expect(await lies(id)).toMatchObject({ ruecklass_art: null, ruecklass_betrag: null, ruecklass_bis: null });
  });

  it('ist eingefroren wie der Rest des Belegs', async () => {
    const id = await anlegen(haft());
    const { error } = await buch.client.from('invoices').update({ ruecklass_bis: '2027-01-01' }).eq('id', id);
    expect(error?.code).toBe('42501');
  });
});

describe('Die Zahl am Menüpunkt Rechnungen', () => {
  it('ist nur noch der Rücklass offen, zählt sie ihn erst ab seiner Fälligkeit', async () => {
    const vorher = await zaehler('2026-10-05');
    const id = await anlegen(haft('2026-12-01'));
    // Ohne Zahlung ist der übrige Betrag überfällig — die Rechnung zählt.
    expect(await zaehler('2026-10-05')).toBe(vorher + 1);
    await createZahlung(BETRIEB, { invoiceId: id, datum: '2026-09-01', betrag: 11400, art: 'Überweisung' });
    // Offen ist nur der Rücklass, fällig erst im Dezember — sie zählt nicht.
    expect(await zaehler('2026-10-05')).toBe(vorher);
    // Nach seiner Fälligkeit zählt sie wieder.
    expect(await zaehler('2026-12-02')).toBe(vorher + 1);
  });
});
