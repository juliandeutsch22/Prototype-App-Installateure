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

  it('nur vollständig, nur zur passenden Rechnungsart, fällig nach dem Rechnungsdatum — mit Skonto seit 10.10.2026', async () => {
    await expect(anlegen({ ruecklassArt: 'haft', ruecklassProzent: 5 })).rejects.toThrow(/Art, Prozentsatz und Fälligkeit/);
    await expect(anlegen({ ...haft(), ruecklassArt: 'deckung' })).rejects.toThrow(/Teilrechnung/);
    await expect(anlegen({ ...haft(), skontoProzent: 2, skontoBis: '2026-08-10' })).resolves.toBeTruthy();
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

describe('Skonto auf den Zahlbetrag (10.10.2026)', () => {
  /*
    12.000 € mit 600 € Haftrücklass und 2 % Skonto: der Kunde zahlt in der
    Frist 11.400 € abzüglich 2 % — zugesagt sind 228 €, nicht 240 € auf den
    ganzen Rechnungsbetrag. Der Rücklass wird später ohne Skonto ausgezahlt.
  */
  it('der Skonto ist höchstens 2 % des Zahlbetrags — auf den ganzen Betrag wäre er zu hoch', async () => {
    const id = await anlegen({ ...haft(), skontoProzent: 2, skontoBis: '2026-08-10' });
    await createZahlung(BETRIEB, { invoiceId: id, datum: '2026-08-09', betrag: 11172, art: 'Überweisung' });
    await expect(createZahlung(BETRIEB, { invoiceId: id, datum: '2026-08-09', betrag: 240, art: 'Skonto' }))
      .rejects.toThrow(/höchstens 228,00/);
    await expect(createZahlung(BETRIEB, { invoiceId: id, datum: '2026-08-09', betrag: 228, art: 'Skonto' })).resolves.toBeTruthy();
    // Offen ist danach genau der Rücklass.
    const { data } = await buch.client.from('invoices').select('total_brutto, bezahlt_betrag').eq('id', id).single();
    expect(Number(data!.total_brutto) - Number(data!.bezahlt_betrag)).toBe(600);
  });

  it('Gegenprobe: ohne Rücklass bleibt es der ganze Rechnungsbetrag', async () => {
    const id = await anlegen({ skontoProzent: 2, skontoBis: '2026-08-10' });
    await createZahlung(BETRIEB, { invoiceId: id, datum: '2026-08-09', betrag: 11760, art: 'Überweisung' });
    await expect(createZahlung(BETRIEB, { invoiceId: id, datum: '2026-08-09', betrag: 240, art: 'Skonto' })).resolves.toBeTruthy();
  });
});

describe('Rücklass durch Bankgarantie abgelöst (10.10.2026)', () => {
  const garantie = (id: string, felder: Record<string, unknown>) =>
    buch.client.from('invoices').update(felder).eq('id', id);

  it('lässt sich nach der Ausstellung erfassen — und macht den Rücklass ab der Ablöse fällig', async () => {
    const vorher = await zaehler('2026-10-05');
    const id = await anlegen(haft('2029-08-01'));
    await createZahlung(BETRIEB, { invoiceId: id, datum: '2026-09-01', betrag: 11400, art: 'Überweisung' });
    expect(await zaehler('2026-10-05')).toBe(vorher);
    // Abgelöst am 01.11.: am 05.10. noch nicht fällig.
    expect((await garantie(id, { ruecklass_garantie_am: '2026-11-01', ruecklass_garantie_bank: 'Raiffeisen', ruecklass_garantie_nr: 'G-1', ruecklass_garantie_bis: '2029-08-01' })).error).toBeNull();
    expect(await zaehler('2026-10-05')).toBe(vorher);
    // Abgelöst am 01.10.: seither fällig.
    expect((await garantie(id, { ruecklass_garantie_am: '2026-10-01' })).error).toBeNull();
    expect(await zaehler('2026-10-05')).toBe(vorher + 1);
    // Zurückgenommen: wieder der vereinbarte Tag.
    expect((await garantie(id, { ruecklass_garantie_am: null, ruecklass_garantie_bank: null, ruecklass_garantie_nr: null, ruecklass_garantie_bis: null })).error).toBeNull();
    expect(await zaehler('2026-10-05')).toBe(vorher);
  });

  it('nur an einer Rechnung mit Rücklass, und nie ohne Tag der Ablöse', async () => {
    const ohne = await anlegen();
    expect((await garantie(ohne, { ruecklass_garantie_am: '2026-10-01' })).error?.code).toBe('23514');
    const mit = await anlegen(haft());
    expect((await garantie(mit, { ruecklass_garantie_bank: 'Raiffeisen' })).error?.code).toBe('23514');
  });

  it('die Startseite findet Garantien nach ihrem Ende — auch an einer bezahlten Rechnung', async () => {
    const id = await anlegen(haft('2029-08-01'));
    await createZahlung(BETRIEB, { invoiceId: id, datum: '2026-09-01', betrag: 12000, art: 'Überweisung' });
    expect((await garantie(id, {
      ruecklass_garantie_am: '2026-09-01', ruecklass_garantie_bank: 'Erste', ruecklass_garantie_nr: 'G-77', ruecklass_garantie_bis: '2031-03-15',
    })).error).toBeNull();
    const treffer = await rechnungen.listGarantienEndenIn(BETRIEB, '2031-03-01', '2031-03-31');
    expect(treffer.filter((r) => r.id === id).map((r) => [r.ruecklassGarantieBank, r.ruecklassGarantieNr, r.ruecklassGarantieBis]))
      .toEqual([['Erste', 'G-77', '2031-03-15']]);
    // Gegenprobe: ausserhalb des Zeitraums nicht.
    expect((await rechnungen.listGarantienEndenIn(BETRIEB, '2031-04-01', '2031-04-30')).some((r) => r.id === id)).toBe(false);
  });

  it('der vereinbarte Rücklass selbst bleibt eingefroren', async () => {
    const id = await anlegen(haft());
    expect((await garantie(id, { ruecklass_garantie_am: '2026-10-01', ruecklass_bis: '2027-01-01' })).error?.code).toBe('42501');
  });
});
