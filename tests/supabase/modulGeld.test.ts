/**
 * Rechnungen und Angebote auf Postgres.
 *
 * Der Bereich mit den härtesten Regeln, und das aus einem Grund: § 132 BAO
 * verlangt sieben Jahre Aufbewahrung, § 11 UStG schreibt vor, was auf einer
 * Rechnung zu stehen hat. Geprüft wird deshalb dreierlei — dass der
 * Nummernkreis dicht ist, dass eine ausgestellte Rechnung zu ist, und dass
 * Storno und Storno-Aufhebung ganz durchgehen oder gar nicht.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { admin, betriebAnlegen, konto, buchung, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import * as zahlungen from '@/lib/db/pg/zahlungen';
import * as angebote from '@/lib/db/pg/quotes';
import { clientEinreichen, NACHFASSEN_MS, type WithId } from '@/lib/db/pg/kern';
import type { Invoice } from '@/types';

const BETRIEB = 'geld-a';
const JAHR = new Date().getFullYear();

let buch: Konto;
let chef: Konto;
let anton: Konto;

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));
const letzter = <T>(staende: T[]): T => staende[staende.length - 1];

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'buch');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'chef');
  anton = await konto(BETRIEB, 'Mitarbeiter', 'anton');
  clientEinreichen(buch.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

async function leeren(): Promise<void> {
  await admin.from('invoices').delete().eq('company_id', BETRIEB);
  await admin.from('quotes').delete().eq('company_id', BETRIEB);
  await admin.from('number_counters').delete().eq('company_id', BETRIEB);
  await admin.from('time_entries').delete().eq('company_id', BETRIEB);
}

const rechnung = (rest: Record<string, unknown> = {}) => ({
  invoiceNumber: `RE-${JAHR}-1001`,
  projectNumber: 'B-100',
  customerName: 'Familie Huber',
  invoiceDate: '2026-04-30',
  dueDate: '2026-05-14',
  subtotalNetto: 1000,
  totalNetto: 1000,
  totalVat: 200,
  totalBrutto: 1200,
  vatRate: 0.2,
  paymentStatus: 'Offen' as const,
  positions: [
    { label: 'Facharbeiterstunden', qty: 10, unit: 'h', unitPrice: 80, netto: 800 },
    { label: 'Material', qty: 1, unit: 'Pauschale', unitPrice: 200, netto: 200 },
  ],
  ...rest,
});

const angebot = (rest: Record<string, unknown> = {}) => ({
  quoteNumber: `AN-${JAHR}-0001`,
  customerName: 'Familie Huber',
  quoteDate: '2026-04-01',
  validUntil: '2026-05-01',
  status: 'Entwurf' as const,
  positions: [{ label: 'Badsanierung', qty: 1, unit: 'Pauschale', unitPrice: 8000, netto: 8000 }],
  subtotalNetto: 8000,
  totalNetto: 8000,
  totalVat: 1600,
  totalBrutto: 9600,
  vatRate: 0.2,
  kalkulierteStunden: 60,
  ...rest,
});

describe('Rechnungsnummern', () => {
  afterEach(() => clientEinreichen(buch.client));

  it('beginnen bei 1001 und zählen hoch', async () => {
    /*
      NICHT BEI 1. „RE-2026-0001" sieht nach der ersten Rechnung des Betriebs
      aus, und das ist eine Auskunft an jeden Kunden, die niemand geben will.
    */
    await leeren();
    expect(await rechnungen.reserveInvoiceNumber(BETRIEB, { seedFrom: 0 }))
      .toBe(`RE-${JAHR}-1001`);
    expect(await rechnungen.reserveInvoiceNumber(BETRIEB, { seedFrom: 0 }))
      .toBe(`RE-${JAHR}-1002`);
  });

  it('nehmen den Altbestand auf — aber nur beim ersten Mal', async () => {
    await leeren();
    expect(await rechnungen.reserveInvoiceNumber(BETRIEB, { seedFrom: 500 }))
      .toBe(`RE-${JAHR}-0501`);
    /*
      Der Startwert zählt nur, solange es den Zähler nicht gibt. Danach ist der
      Zähler die Wahrheit — sonst könnte ein veralteter Bestand aus dem Browser
      den Kreis zurückwerfen.
    */
    expect(await rechnungen.reserveInvoiceNumber(BETRIEB, { seedFrom: 10 }))
      .toBe(`RE-${JAHR}-0502`);
  });

  it('nehmen eine von Hand gesetzte höhere Nummer an', async () => {
    await leeren();
    await rechnungen.reserveInvoiceNumber(BETRIEB, { seedFrom: 0 });
    expect(await rechnungen.reserveInvoiceNumber(BETRIEB, { seedFrom: 0, desired: 2000 }))
      .toBe(`RE-${JAHR}-2000`);
    // Danach läuft der Kreis von dort weiter.
    expect(await rechnungen.reserveInvoiceNumber(BETRIEB, { seedFrom: 0 }))
      .toBe(`RE-${JAHR}-2001`);
  });

  it('lehnen eine bereits verbrauchte Nummer ab und nennen die nächste freie', async () => {
    await leeren();
    await rechnungen.reserveInvoiceNumber(BETRIEB, { seedFrom: 0 }); // 1001
    await expect(
      rechnungen.reserveInvoiceNumber(BETRIEB, { seedFrom: 0, desired: 1001 }),
    ).rejects.toThrow(/1002/);
  });

  it('zwei gleichzeitige Abrechnungen bekommen nicht dieselbe Nummer', async () => {
    /*
      DER TEURE FALL. Rechnen Buchhaltung und Geschäftsführung im selben
      Moment ab, ist eine doppelte Nummer kein Schönheitsfehler, sondern ein
      Fall für den Steuerberater.
    */
    await leeren();
    const zugleich = await Promise.all(
      Array.from({ length: 8 }, () =>
        rechnungen.reserveInvoiceNumber(BETRIEB, { seedFrom: 0 })),
    );
    expect(new Set(zugleich).size).toBe(8);
  });

  it('ein Monteur zieht keine Rechnungsnummer', async () => {
    clientEinreichen(anton.client);
    await expect(rechnungen.reserveInvoiceNumber(BETRIEB, { seedFrom: 0 })).rejects.toThrow();
  });

  it('Angebotsnummern sind ein eigener Kreis und beginnen bei 1', async () => {
    await leeren();
    await rechnungen.reserveInvoiceNumber(BETRIEB, { seedFrom: 0 });
    clientEinreichen(chef.client);
    expect(await angebote.reserveQuoteNumber(BETRIEB)).toBe(`AN-${JAHR}-0001`);
    expect(await angebote.reserveQuoteNumber(BETRIEB)).toBe(`AN-${JAHR}-0002`);
  });
});

describe('Rechnung anlegen', () => {
  afterEach(() => clientEinreichen(buch.client));

  it('schreibt Kopf, Positionen und Abdeckung in einem Zug', async () => {
    await leeren();
    const { data: b } = await admin.from('time_entries')
      .insert(buchung({ ...anton, betrieb: BETRIEB } as Konto, '2026-04-13')).select('id').single();

    const id = await rechnungen.createInvoice(BETRIEB, rechnung({
      linkedEntries: [b!.id as string],
      linkedWorkSheets: [],
    }));

    const [r] = await rechnungen.listUnpaidInvoices(BETRIEB);
    expect(r.id).toBe(id);
    expect(r).toMatchObject({
      invoiceNumber: `RE-${JAHR}-1001`, totalBrutto: 1200, vatRate: 0.2, paymentStatus: 'Offen',
    });
    expect(r.positions).toEqual([
      { label: 'Facharbeiterstunden', qty: 10, unit: 'h', unitPrice: 80, netto: 800 },
      { label: 'Material', qty: 1, unit: 'Pauschale', unitPrice: 200, netto: 200 },
    ]);
    expect(r.linkedEntries).toEqual([b!.id]);
    // Eine leere Liste ist keine Liste — sonst stünde an jeder Rechnung ein
    // Feld, das nichts aussagt.
    expect(r.linkedWorkSheets).toBeUndefined();
  });

  it('trägt Rabatt, Reverse Charge und Leistungszeitraum mit', async () => {
    await leeren();
    await rechnungen.createInvoice(BETRIEB, rechnung({
      discount: { mode: 'percent', value: 5, label: 'Stammkundenrabatt' },
      discountAmount: 50,
      reverseCharge: true,
      vatRate: 0,
      totalVat: 0,
      customerVatId: 'ATU12345678',
      leistungVon: '2026-04-01',
      leistungBis: '2026-04-30',
    }));

    const [r] = await rechnungen.listUnpaidInvoices(BETRIEB);
    expect(r.discount).toEqual({ mode: 'percent', value: 5, label: 'Stammkundenrabatt' });
    expect(r).toMatchObject({
      discountAmount: 50, reverseCharge: true, customerVatId: 'ATU12345678',
      leistungVon: '2026-04-01', leistungBis: '2026-04-30',
    });
  });

  it('ohne Rabatt steht auch kein leerer Rabatt da', async () => {
    await leeren();
    await rechnungen.createInvoice(BETRIEB, rechnung());
    const [r] = await rechnungen.listUnpaidInvoices(BETRIEB);
    expect(r.discount).toBeUndefined();
  });

  it('dieselbe Nummer gibt es im Betrieb nur einmal', async () => {
    await leeren();
    await rechnungen.createInvoice(BETRIEB, rechnung());
    await expect(rechnungen.createInvoice(BETRIEB, rechnung())).rejects.toThrow();
  });

  it('ein Monteur legt keine Rechnung an und sieht keine', async () => {
    await leeren();
    await rechnungen.createInvoice(BETRIEB, rechnung());
    clientEinreichen(anton.client);
    await expect(rechnungen.createInvoice(BETRIEB, rechnung({ invoiceNumber: 'RE-X' })))
      .rejects.toThrow();
    expect(await rechnungen.listUnpaidInvoices(BETRIEB)).toEqual([]);
  });
});

describe('Eine ausgestellte Rechnung ist zu', () => {
  afterEach(() => clientEinreichen(buch.client));

  async function eine(): Promise<WithId<Invoice>> {
    await leeren();
    await rechnungen.createInvoice(BETRIEB, rechnung());
    const [r] = await rechnungen.listUnpaidInvoices(BETRIEB);
    return r;
  }

  it('Betrag, Datum, Nummer und Empfänger lassen sich nicht mehr ändern', async () => {
    const r = await eine();
    for (const feld of [
      { invoice_number: 'RE-2026-9999' },
      { invoice_date: '2026-01-01' },
      { total_brutto: 1 },
      { customer_name: 'Jemand anderer' },
      { vat_rate: 0 },
      { reverse_charge: true },
      { leistung_von: '2020-01-01' },
      /*
        Seit Stufe 10.2 gehören Art, Abzug und Gesamtleistung dazu. Sie stehen
        auf dem Beleg, den der Kunde bekommen hat: wer aus einer Anzahlung
        nachträglich eine Schlussrechnung macht, ändert, was abgezogen werden
        darf — und die Steuer, die zweimal ausgewiesen ist.
      */
      { art: 'schluss' },
      { vorrechnungen: [] },
      { gesamt_brutto: 99 },
    ]) {
      const { error } = await buch.client.from('invoices').update(feld).eq('id', r.id);
      expect(error, JSON.stringify(feld)).not.toBeNull();
    }
  });

  it('der Zahlungsstand und das Mahnwesen bewegen sich weiter', async () => {
    const r = await eine();

    /* Gemahnt wird zuerst — das ist die Reihenfolge des Alltags. */
    await rechnungen.mahnungFesthalten(r.id, {
      stufe: 1, gemahntAm: '2026-05-20', frist: '2026-06-03', spesen: 15,
      standJetzt: 'Offen',
    });
    const [gemahnt] = await rechnungen.listUnpaidInvoices(BETRIEB);
    expect(gemahnt).toMatchObject({
      mahnstufe: 1, gemahntAm: '2026-05-20', mahnfrist: '2026-06-03',
      mahnspesen: 15, paymentStatus: 'Überfällig',
    });

    /*
      DER STAND KOMMT ÜBER EINE ZAHLUNG, nicht über einen Haken. Bis zum
      19.09.2026 stand hier `updateInvoiceStatus(r.id, 'Bezahlt')`; seit
      Stufe 10.1 weist die Datenbank das ab, und der Typ lässt es gar nicht
      mehr zu. Was die Prüfung sagen will, bleibt dasselbe: eine ausgestellte
      Rechnung ist eingefroren, ihr ZAHLUNGSSTAND aber nicht.
    */
    await zahlungen.createZahlung(BETRIEB, {
      invoiceId: r.id, datum: '2026-05-25', betrag: 400, art: 'Überweisung',
    });
    const { data: teil } = await admin.from('invoices')
      .select('payment_status, bezahlt_betrag').eq('id', r.id).single();
    expect(teil!.payment_status).toBe('Teilbezahlt');
    expect(Number(teil!.bezahlt_betrag)).toBe(400);

    /*
      UND EINE GEMAHNTE, TEILBEZAHLTE RECHNUNG LÄSST SICH WEITER MAHNEN. Genau
      hier wäre der Fehler entstanden: „Überfällig" mitzuschreiben scheitert
      an der Datenbank, und die zweite Mahnung wäre erzeugt, aber nirgends
      festgehalten.
    */
    await rechnungen.mahnungFesthalten(r.id, {
      stufe: 2, gemahntAm: '2026-06-10', frist: '2026-06-20', spesen: 25,
      standJetzt: 'Teilbezahlt',
    });
    const [zweite] = await rechnungen.listUnpaidInvoices(BETRIEB);
    expect(zweite).toMatchObject({ mahnstufe: 2, paymentStatus: 'Teilbezahlt' });

    await zahlungen.createZahlung(BETRIEB, {
      invoiceId: r.id, datum: '2026-06-25', betrag: r.totalBrutto - 400, art: 'Überweisung',
    });
    const { data: voll } = await admin.from('invoices')
      .select('payment_status').eq('id', r.id).single();
    expect(voll!.payment_status).toBe('Bezahlt');
  }, 30_000);

  it('gelöscht wird keine — § 132 BAO', async () => {
    const r = await eine();
    const { error } = await buch.client.from('invoices').delete().eq('id', r.id);
    // Ohne Löschrichtlinie trifft die Anweisung nichts; die Rechnung bleibt.
    expect(error).toBeNull();
    expect(await rechnungen.listUnpaidInvoices(BETRIEB)).toHaveLength(1);
  });
});

describe('Storno und Storno-Aufhebung', () => {
  afterEach(() => clientEinreichen(buch.client));

  async function mitBelegen(): Promise<{ r: WithId<Invoice>; beleg: string }> {
    await leeren();
    const { data: b } = await admin.from('time_entries')
      .insert(buchung({ ...anton, betrieb: BETRIEB } as Konto, '2026-04-13')).select('id').single();
    const beleg = b!.id as string;
    await rechnungen.markBilled('timeEntries', [beleg], `RE-${JAHR}-1001`);
    await rechnungen.createInvoice(BETRIEB, rechnung({ linkedEntries: [beleg] }));
    const [r] = await rechnungen.listUnpaidInvoices(BETRIEB);
    return { r, beleg };
  }

  async function verrechnungsstand(id: string) {
    const { data } = await admin.from('time_entries')
      .select('is_billed, invoice_number').eq('id', id).single();
    return data!;
  }

  it('sperrt die Belege beim Anlegen', async () => {
    const { beleg } = await mitBelegen();
    expect(await verrechnungsstand(beleg))
      .toEqual({ is_billed: true, invoice_number: `RE-${JAHR}-1001` });
  });

  it('gibt sie beim Storno wieder frei — Rechnung und Belege zusammen', async () => {
    const { r, beleg } = await mitBelegen();
    await rechnungen.cancelInvoice(r, 'Doppelt erfasst');

    const { data: nach } = await admin.from('invoices')
      .select('payment_status, cancellation_note, cancelled_at').eq('id', r.id).single();
    expect(nach).toMatchObject({ payment_status: 'Storniert', cancellation_note: 'Doppelt erfasst' });
    expect(nach!.cancelled_at).not.toBeNull();
    expect(await verrechnungsstand(beleg)).toEqual({ is_billed: false, invoice_number: null });
  });

  it('und sperrt sie bei der Aufhebung wieder', async () => {
    const { r, beleg } = await mitBelegen();
    await rechnungen.cancelInvoice(r, 'Doppelt erfasst');
    await rechnungen.reactivateInvoice(r);

    const [wieder] = await rechnungen.listUnpaidInvoices(BETRIEB);
    expect(wieder.paymentStatus).toBe('Offen');
    expect(wieder.cancellationNote).toBeUndefined();
    expect(wieder.cancelledAt).toBeUndefined();
    expect(await verrechnungsstand(beleg))
      .toEqual({ is_billed: true, invoice_number: `RE-${JAHR}-1001` });
  });

  it('holt die betroffenen Belege aus der Abdeckung, nicht aus dem Aufruf', async () => {
    /*
      Eine unvollständige Liste im Aufruf hinterliesse genau den halben
      Zustand, den die Klammer verhindern soll: Rechnung storniert, Stunden
      weiter gesperrt. Sie stünden auf keiner gültigen Rechnung und liessen
      sich auf keine neue nehmen — Geld, das nie wieder eingefordert wird.
    */
    const { r, beleg } = await mitBelegen();
    await rechnungen.cancelInvoice({ ...r, linkedEntries: [] }, 'Trotzdem vollständig');
    expect(await verrechnungsstand(beleg)).toEqual({ is_billed: false, invoice_number: null });
  });

  it('eine Rechnung, die es nicht gibt, storniert niemand still', async () => {
    await expect(
      rechnungen.cancelInvoice({ id: crypto.randomUUID() } as WithId<Invoice>, 'x'),
    ).rejects.toThrow();
  });

  it('ein Monteur ändert den Verrechnungsstand nicht', async () => {
    const { beleg } = await mitBelegen();
    clientEinreichen(anton.client);
    const { error } = await anton.client.from('time_entries')
      .update({ is_billed: false, invoice_number: null }).eq('id', beleg);
    expect(error).not.toBeNull();
  });
});

describe('Rechnungen lesen', () => {
  afterEach(() => clientEinreichen(buch.client));

  beforeAll(async () => {
    await leeren();
    clientEinreichen(buch.client);
    await rechnungen.createInvoice(BETRIEB, rechnung({
      invoiceNumber: `RE-${JAHR}-1001`, invoiceDate: '2026-01-15',
    }));
    await rechnungen.createInvoice(BETRIEB, rechnung({
      invoiceNumber: `RE-${JAHR}-1002`, invoiceDate: '2026-02-15',
    }));
    const bezahlt = await rechnungen.createInvoice(BETRIEB, rechnung({
      invoiceNumber: `RE-${JAHR}-1003`, invoiceDate: '2026-03-15',
    }));
    /* Voll bezahlt — und damit fällt sie aus den offenen Forderungen. */
    await zahlungen.createZahlung(BETRIEB, {
      invoiceId: bezahlt, datum: '2026-03-20', betrag: 1200, art: 'Überweisung',
    });
  }, 60_000);

  it('die unbezahlten sind die offenen Forderungen', async () => {
    const rows = await rechnungen.listUnpaidInvoices(BETRIEB);
    expect(rows.map((r) => r.invoiceNumber).sort())
      .toEqual([`RE-${JAHR}-1001`, `RE-${JAHR}-1002`]);
  });

  it('der Zeitraum geht über das RECHNUNGSdatum und hat keine Obergrenze', async () => {
    /*
      Eine im Jänner nachgetragene Dezember-Rechnung gehört ins
      Dezember-Journal; danach fragt der Steuerberater. Und ein Export, der
      stillschweigend abschneidet, meldet Lücken im Nummernkreis, die keine
      sind — ein Befund, den es nicht gibt, kostet in einer Kanzlei einen
      halben Tag.
    */
    const rows = await rechnungen.listInvoicesInRange(BETRIEB, '2026-01-01', '2026-02-28');
    expect(rows.map((r) => r.invoiceDate)).toEqual(['2026-01-15', '2026-02-15']);
    expect(rows[0].positions).toHaveLength(2);
  });

  it('das Abonnement meldet eine neue Rechnung samt Positionen', async () => {
    const staende: WithId<Invoice>[][] = [];
    const stopp = rechnungen.subscribeRecentInvoices(
      BETRIEB, 50, (rows) => staende.push(rows), (e) => { throw e; },
    );
    try {
      await warte(NACHFASSEN_MS + 1800);
      const vorher = staende.length;
      await rechnungen.createInvoice(BETRIEB, rechnung({
        invoiceNumber: `RE-${JAHR}-1004`, invoiceDate: '2026-04-15',
      }));

      for (let i = 0; i < 40 && staende.length === vorher; i += 1) await warte(100);
      expect(staende.length).toBeGreaterThan(vorher);
      const neu = letzter(staende).find((r) => r.invoiceNumber === `RE-${JAHR}-1004`);
      expect(neu!.positions).toHaveLength(2);
    } finally {
      stopp();
    }
  }, 30_000);
});

describe('Angebote', () => {
  afterEach(() => clientEinreichen(chef.client));

  beforeAll(() => clientEinreichen(chef.client));

  it('legt Kopf und Positionen an', async () => {
    await leeren();
    const id = await angebote.createQuote(BETRIEB, angebot());
    const [a] = await angebote.listRecentQuotes(BETRIEB);
    expect(a.id).toBe(id);
    expect(a).toMatchObject({
      quoteNumber: `AN-${JAHR}-0001`, status: 'Entwurf',
      totalBrutto: 9600, kalkulierteStunden: 60,
    });
    expect(a.positions).toEqual([
      { label: 'Badsanierung', qty: 1, unit: 'Pauschale', unitPrice: 8000, netto: 8000 },
    ]);
  });

  it('ändern ersetzt die Positionen, statt sie zu häufen', async () => {
    await leeren();
    const id = await angebote.createQuote(BETRIEB, angebot());
    await angebote.updateQuote(id, {
      status: 'Versendet',
      positions: [
        { label: 'Badsanierung', qty: 1, unit: 'Pauschale', unitPrice: 7500, netto: 7500 },
        { label: 'Anfahrt', qty: 1, unit: 'Pauschale', unitPrice: 90, netto: 90 },
      ],
    });
    const [a] = await angebote.listRecentQuotes(BETRIEB);
    expect(a.status).toBe('Versendet');
    expect(a.positions.map((p) => p.label)).toEqual(['Badsanierung', 'Anfahrt']);
  });

  it('ein Teilschreiben lässt die Kalkulation stehen', async () => {
    /*
      „leer" und „nicht mitgeschickt" dürfen nicht dasselbe heissen — sonst
      räumte ein Statuswechsel die Positionen ab.
    */
    await leeren();
    const id = await angebote.createQuote(BETRIEB, angebot({
      discount: { mode: 'percent', value: 10 }, discountAmount: 800,
    }));
    await angebote.updateQuote(id, { status: 'Angenommen' });

    const [a] = await angebote.listRecentQuotes(BETRIEB);
    expect(a.status).toBe('Angenommen');
    expect(a.positions).toHaveLength(1);
    /*
      Auch der Rabatt bleibt. „Nicht mitgeschickt" heisst nicht
      „ausdrücklich weggenommen" — sonst verlöre ein Statuswechsel einen
      Nachlass, den der Kunde schriftlich hat.
    */
    expect(a.discount).toEqual({ mode: 'percent', value: 10 });
    expect(a.discountAmount).toBe(800);
  });

  it('ein Rabatt lässt sich ausdrücklich wegnehmen', async () => {
    await leeren();
    const id = await angebote.createQuote(BETRIEB, angebot({
      discount: { mode: 'amount', value: 500 }, discountAmount: 500,
    }));
    let [a] = await angebote.listRecentQuotes(BETRIEB);
    expect(a.discount).toEqual({ mode: 'amount', value: 500 });

    await angebote.updateQuote(id, { discount: null });
    [a] = await angebote.listRecentQuotes(BETRIEB);
    expect(a.discount).toBeUndefined();
  });

  it('die Angebote eines Kunden', async () => {
    await leeren();
    const { data: k } = await admin.from('customers')
      .insert({ company_id: BETRIEB, name: 'Huber GmbH' }).select('id').single();
    await angebote.createQuote(BETRIEB, angebot({ customerId: k!.id }));
    await angebote.createQuote(BETRIEB, angebot({ quoteNumber: `AN-${JAHR}-0002` }));

    const rows = await angebote.listQuotesForCustomer(BETRIEB, k!.id as string);
    expect(rows.map((a) => a.quoteNumber)).toEqual([`AN-${JAHR}-0001`]);
  });

  it('ein Entwurf lässt sich löschen', async () => {
    await leeren();
    const id = await angebote.createQuote(BETRIEB, angebot());
    await angebote.deleteQuote(id);
    expect(await angebote.listRecentQuotes(BETRIEB)).toEqual([]);
  });

  it('ein Angebot für sich — und „gibt es nicht" statt eines Fehlers', async () => {
    await leeren();
    const id = await angebote.createQuote(BETRIEB, angebot());
    const a = await angebote.getQuote(BETRIEB, id);
    expect(a?.quoteNumber).toBe(`AN-${JAHR}-0001`);
    expect(a?.positions).toHaveLength(1);
    // Eine fremde Kennung und eine, die gar keine uuid ist (altes Lesezeichen).
    expect(await angebote.getQuote(BETRIEB, '00000000-0000-0000-0000-000000000000')).toBeNull();
    expect(await angebote.getQuote(BETRIEB, 'kaputt')).toBeNull();
  });

  /*
    DIE BAUSTELLE FINDET IHR ANGEBOT AUCH NACH DEM UMBENENNEN. Die Nummer der
    Baustelle lässt sich in der Akte ändern; am Angebot bliebe die alte
    stehen. Die Kennung, die die Datenbank beim Annehmen aus der Nummer
    auflöst, zeigt weiter auf dieselbe Baustelle.
  */
  it('die Angebote einer Baustelle, über ihre Kennung', async () => {
    await leeren();
    await admin.from('projects').delete().eq('company_id', BETRIEB);
    const { data: p } = await admin.from('projects')
      .insert({ company_id: BETRIEB, project_number: 'B-ANG-1', customer_name: 'Huber', status: 'Aktiv' })
      .select('id').single();
    const id = await angebote.createQuote(BETRIEB, angebot());
    await angebote.updateQuote(id, { status: 'Angenommen', projectNumber: 'B-ANG-1' });

    let rows = await angebote.listQuotesForProject(BETRIEB, p!.id as string);
    expect(rows.map((a) => a.id)).toEqual([id]);
    expect(rows[0].projectId).toBe(p!.id);

    await admin.from('projects').update({ project_number: 'B-ANG-1-NEU' }).eq('id', p!.id);
    rows = await angebote.listQuotesForProject(BETRIEB, p!.id as string);
    expect(rows.map((a) => a.id)).toEqual([id]);
    await admin.from('quotes').delete().eq('company_id', BETRIEB);
    await admin.from('projects').delete().eq('company_id', BETRIEB);
  });

  it('ein Monteur sieht keine Angebote', async () => {
    await leeren();
    await angebote.createQuote(BETRIEB, angebot());
    clientEinreichen(anton.client);
    expect(await angebote.listRecentQuotes(BETRIEB)).toEqual([]);
    // Auch nicht über die neue Einzelabfrage der Angebotsseite.
    const [q] = (await admin.from('quotes').select('id').eq('company_id', BETRIEB)).data!;
    expect(await angebote.getQuote(BETRIEB, q.id as string)).toBeNull();
  });
});

describe('Angebote bearbeiten — nur der Entwurf ändert seinen Inhalt', () => {
  beforeAll(() => clientEinreichen(chef.client));
  afterEach(() => clientEinreichen(chef.client));

  it('merkt sich je Position, ob sie Arbeitszeit ist', async () => {
    await leeren();
    const id = await angebote.createQuote(BETRIEB, angebot({
      positions: [
        { label: 'Montage', qty: 16, unit: 'h', unitPrice: 70, netto: 1120, istArbeitszeit: true },
        { label: 'Anfahrt', qty: 1, unit: 'h', unitPrice: 45, netto: 45, istArbeitszeit: false },
      ],
    }));
    const a = await angebote.getQuote(BETRIEB, id);
    expect(a!.positions.map((p) => p.istArbeitszeit)).toEqual([true, false]);
  });

  it('der Entwurf lässt sich ändern', async () => {
    await leeren();
    const id = await angebote.createQuote(BETRIEB, angebot());
    await angebote.updateQuote(id, { notes: 'Nachgetragen', kalkulierteStunden: 70 });
    const a = await angebote.getQuote(BETRIEB, id);
    expect(a).toMatchObject({ notes: 'Nachgetragen', kalkulierteStunden: 70 });
  });

  it('ein versendetes Angebot behält Positionen und Preise', async () => {
    await leeren();
    const id = await angebote.createQuote(BETRIEB, angebot());
    await angebote.updateQuote(id, { status: 'Versendet' });

    await expect(angebote.updateQuote(id, {
      positions: [{ label: 'Billiger', qty: 1, unit: 'Pauschale', unitPrice: 1, netto: 1 }],
    })).rejects.toThrow(/Nur ein Entwurf/);
    await expect(angebote.updateQuote(id, { totalBrutto: 1 })).rejects.toThrow(/Nur ein Entwurf/);

    const a = await angebote.getQuote(BETRIEB, id);
    expect(a!.positions.map((p) => p.label)).toEqual(['Badsanierung']);
    expect(a!.totalBrutto).toBe(9600);
  });

  it('Status und Baustelle darf ein versendetes Angebot weiter ändern', async () => {
    await leeren();
    const id = await angebote.createQuote(BETRIEB, angebot());
    await angebote.updateQuote(id, { status: 'Versendet' });
    await angebote.updateQuote(id, { status: 'Angenommen', projectNumber: `B-${JAHR}-0099` });
    const a = await angebote.getQuote(BETRIEB, id);
    expect(a).toMatchObject({ status: 'Angenommen', projectNumber: `B-${JAHR}-0099` });
  });
});
