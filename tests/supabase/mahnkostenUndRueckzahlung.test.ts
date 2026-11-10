/**
 * Mahnspesen und Zinsen als eigener Eingang, Rückzahlung nicht über das
 * Löschen (Durchsicht 09.11.2026) — gegen eine echte Datenbank.
 *
 * BEFUND 4: zahlte der Kunde die Mahnung samt Spesen und Zinsen, wurde das
 * Mehr zum Guthaben, und Spesen und Zinsen standen nirgends als Ertrag.
 * Jetzt: Eingang der Art „Mahnkosten“, getrennt von `bezahlt_betrag` in
 * `mahnkosten_betrag`, höchstens bis zu dem, was die letzte Mahnung forderte.
 *
 * BEFUND 5: „zurückgezahlt höchstens, was eingegangen ist“ galt nur beim
 * Schreiben eines negativen Betrags — Löschen oder Verringern des Eingangs
 * danach umging es.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, mahnInhalt, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import * as zahlungen from '@/lib/db/pg/zahlungen';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'mahnkosten-a';
let buch: Konto;
let kunde = '';
let lfd = 0;

async function rechnung(): Promise<string> {
  lfd += 1;
  clientEinreichen(buch.client);
  return rechnungen.createInvoice(BETRIEB, {
    invoiceNumber: `RE-MK-${lfd}`, projectNumber: 'B-1', customerName: 'Familie Huber', ...{ customerId: kunde },
    address: 'Hauptstraße 1, 2700 Wiener Neustadt',
    invoiceDate: '2026-01-02', leistungVon: '2026-01-02', leistungBis: '2026-01-02', dueDate: '2026-01-16',
    subtotalNetto: 1000, totalNetto: 1000, totalVat: 200, totalBrutto: 1200, vatRate: 0.2, paymentStatus: 'Offen',
    positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 1000, netto: 1000 }],
  });
}

/** Eine Mahnung mit 10 € Spesen und 3,16 € Zinsen. */
async function mahnen(id: string, inhalt: Record<string, unknown> = {}) {
  clientEinreichen(buch.client);
  await rechnungen.mahnungFesthalten(id, {
    stufe: 1, gemahntAm: '2026-02-01', frist: '2026-02-08', spesen: 10,
    inhalt: {
      ...mahnInhalt(1, '2026-02-01', '2026-02-08'),
      zeilen: [['Rechnungsbetrag', '1.200,00 €'], ['Mahnspesen', '10,00 €'], ['Verzugszinsen 4 % p. a., 24 Tage', '3,16 €']],
      offen: 1213.16, kosten: 10, zinsen: 3.16, ...inhalt,
    } as never,
  });
}

const eingang = (id: string, betrag: number, art: 'Überweisung' | 'Mahnkosten' = 'Überweisung') =>
  zahlungen.createZahlung(BETRIEB, { invoiceId: id, datum: '2026-02-05', betrag, art });

async function stand(id: string) {
  const { data } = await admin.from('invoices')
    .select('bezahlt_betrag, mahnkosten_betrag, payment_status').eq('id', id).single();
  return data as { bezahlt_betrag: number; mahnkosten_betrag: number; payment_status: string };
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'mkbuch');
  const { data, error } = await admin.from('customers')
    .insert({ company_id: BETRIEB, name: 'Familie Huber', kundenart: 'privat', strasse: 'Hauptstraße 1', plz: '2700', ort: 'Wiener Neustadt' })
    .select('id').single();
  expect(error).toBeNull();
  kunde = data!.id;
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('Mahnspesen und Zinsen (Befund 4)', () => {
  it('Rest, Spesen und Zinsen in einem Zug: die Rechnung ist bezahlt, kein Guthaben, die Mahnkosten getrennt', async () => {
    const id = await rechnung();
    await mahnen(id);
    clientEinreichen(buch.client);
    await zahlungen.createZahlungAufgeteilt(
      BETRIEB, { invoiceId: id, datum: '2026-02-05', betrag: 1200, art: 'Überweisung' }, { mahnkosten: 13.16 },
    );
    expect(await stand(id)).toEqual({ bezahlt_betrag: 1200, mahnkosten_betrag: 13.16, payment_status: 'Bezahlt' });
  });

  it('Gegenprobe: dieselben 1.213,16 € als ein Eingang auf die Rechnung sind wie bisher überzahlt', async () => {
    const id = await rechnung();
    await mahnen(id);
    clientEinreichen(buch.client);
    await eingang(id, 1213.16);
    expect(await stand(id)).toEqual({ bezahlt_betrag: 1213.16, mahnkosten_betrag: 0, payment_status: 'Überzahlt' });
  });

  it('höchstens, was die letzte Mahnung gefordert hat — das Mehr ist ein Guthaben', async () => {
    const id = await rechnung();
    await mahnen(id);
    clientEinreichen(buch.client);
    await eingang(id, 10, 'Mahnkosten');
    await expect(eingang(id, 3.17, 'Mahnkosten')).rejects.toThrow(/13,16 € an Mahnspesen und Zinsen, davon sind 10,00 € schon verbucht/);
    await expect(eingang(id, 3.16, 'Mahnkosten')).resolves.toBeTruthy();
  });

  it('in einem Zug: geht der Anteil der Mahnkosten nicht durch, ist auch der Rest nicht gebucht', async () => {
    const id = await rechnung();
    await mahnen(id);
    clientEinreichen(buch.client);
    await expect(zahlungen.createZahlungAufgeteilt(
      BETRIEB, { invoiceId: id, datum: '2026-02-05', betrag: 1200, art: 'Überweisung' }, { mahnkosten: 20 },
    )).rejects.toThrow(/an Mahnspesen und Zinsen/);
    expect(await stand(id)).toMatchObject({ bezahlt_betrag: 0, mahnkosten_betrag: 0 });
  });

  it('ohne Mahnung gibt es keine Mahnkosten', async () => {
    const id = await rechnung();
    clientEinreichen(buch.client);
    await expect(eingang(id, 5, 'Mahnkosten')).rejects.toThrow(/keine Mahnung mit Mahnspesen oder Zinsen/);
  });

  it('eine ältere Mahnung ohne Zinsen als Zahl: sie werden aus der Zeile des Zahlenblocks gelesen', async () => {
    const id = await rechnung();
    await mahnen(id, { zinsen: undefined, kosten: 40, zeilen: [['Verzugszinsen, 400 Tage', '1.234,56 €'], ['    9,2 % p. a.', '']] });
    clientEinreichen(buch.client);
    await expect(eingang(id, 1274.57, 'Mahnkosten')).rejects.toThrow(/1274,56 €/);
    await expect(eingang(id, 1274.56, 'Mahnkosten')).resolves.toBeTruthy();
  });

  it('eine Rückbuchung der Mahnkosten geht, aber nicht unter null — und berührt den Rechnungsstand nicht', async () => {
    const id = await rechnung();
    await mahnen(id);
    clientEinreichen(buch.client);
    await eingang(id, 1200);
    await eingang(id, 13.16, 'Mahnkosten');
    await expect(eingang(id, -13.17, 'Mahnkosten')).rejects.toThrow(/höchstens, was eingegangen ist/);
    await eingang(id, -3.16, 'Mahnkosten');
    expect(await stand(id)).toEqual({ bezahlt_betrag: 1200, mahnkosten_betrag: 10, payment_status: 'Bezahlt' });
    // Eine Rückzahlung der Rechnung lässt sich nicht mit den Mahnkosten decken.
    await expect(eingang(id, -1210)).rejects.toThrow(/höchstens, was eingegangen ist: 1200,00 €/);
  });

  it('in anderer Reihenfolge: zuerst die Mahnkosten, dann der Rest — die Rechnung ist bezahlt, nicht überzahlt', async () => {
    const id = await rechnung();
    await mahnen(id);
    clientEinreichen(buch.client);
    await eingang(id, 13.16, 'Mahnkosten');
    await eingang(id, 1200);
    expect(await stand(id)).toEqual({ bezahlt_betrag: 1200, mahnkosten_betrag: 13.16, payment_status: 'Bezahlt' });
  });
});

describe('Zurückgezahlt höchstens, was eingegangen ist — auch beim Löschen (Befund 5)', () => {
  it('der Eingang lässt sich nicht löschen, solange die Rückzahlung steht', async () => {
    const id = await rechnung();
    clientEinreichen(buch.client);
    const ein = await eingang(id, 100);
    await eingang(id, -100);
    await expect(zahlungen.deleteZahlung(ein)).rejects.toThrow(/mehr zurückgezahlt als eingegangen/);
    expect(await stand(id)).toMatchObject({ bezahlt_betrag: 0 });
  });

  it('und nicht unter die Rückzahlung verringern', async () => {
    const id = await rechnung();
    clientEinreichen(buch.client);
    const ein = await eingang(id, 100);
    await eingang(id, -100);
    await expect(zahlungen.updateZahlung(ein, { betrag: 50 })).rejects.toThrow(/höchstens, was eingegangen ist/);
  });

  it('Gegenprobe: zuerst die Rückzahlung gelöscht, dann der Eingang — geht; verringern bis zur Rückzahlung geht', async () => {
    const id = await rechnung();
    clientEinreichen(buch.client);
    const ein = await eingang(id, 100);
    const rueck = await eingang(id, -60);
    await expect(zahlungen.updateZahlung(ein, { betrag: 60 })).resolves.toBeUndefined();
    await zahlungen.deleteZahlung(rueck);
    await expect(zahlungen.deleteZahlung(ein)).resolves.toBeUndefined();
    expect(await stand(id)).toMatchObject({ bezahlt_betrag: 0, payment_status: 'Offen' });
  });

  it('Gleichbleiben: mit dem Dienstschlüssel geht die Rechnung samt allen Eingängen', async () => {
    const id = await rechnung();
    clientEinreichen(buch.client);
    await eingang(id, 100);
    await eingang(id, -100);
    const { error } = await admin.from('zahlungseingaenge').delete().eq('invoice_id', id);
    expect(error).toBeNull();
  });
});
