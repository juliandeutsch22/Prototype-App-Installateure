/**
 * Eine Rechnung entsteht in EINEM Zug — Nummer, Sperre, Anlegen.
 *
 * Aus dem Prüflauf (25.09.2026):
 *
 *   P2-04  Die Ansicht zog die Nummer, sperrte danach die Zeiteinträge und
 *          legte zuletzt die Rechnung an — drei Aufrufe. Ein Abbruch
 *          dazwischen liess eine verbrauchte Nummer und gesperrte Stunden
 *          ohne Rechnung zurück, und das Sperren fragte nicht, ob die Stunde
 *          noch frei war.
 *   P2-03  Ob ein Handwerksschein schon verrechnet ist, wusste nur der
 *          Browser — aus den fünfzig jüngsten Rechnungen.
 *   P2-10  Eine Rechnung ohne Positionen oder über null Euro liess sich
 *          anlegen; das Abzeichen zählte Rechnungen ohne Rest als fällig.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { admin, betriebAnlegen, buchung, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { clientEinreichen, type WithId } from '@/lib/db/pg/kern';
import type { Invoice } from '@/types';

const BETRIEB = 'zug-a';
const JAHR = new Date().getFullYear();

let buch: Konto;
let anton: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'zbuch');
  anton = await konto(BETRIEB, 'Mitarbeiter', 'zanton');
  clientEinreichen(buch.client);
}, 120_000);

afterAll(() => clientEinreichen(null));
afterEach(() => clientEinreichen(buch.client));

async function leeren(): Promise<void> {
  await admin.from('invoices').delete().eq('company_id', BETRIEB);
  await admin.from('number_counters').delete().eq('company_id', BETRIEB);
  await admin.from('time_entries').delete().eq('company_id', BETRIEB);
}

/** Eine freie Stunde auf der Baustelle. */
async function stunde(tag = '2026-04-13'): Promise<string> {
  const z = buchung(anton, tag, { project_number: 'B-300' });
  const { error } = await admin.from('time_entries').insert(z);
  if (error) throw new Error(error.message);
  return z.id;
}

async function verrechnungsstand(id: string) {
  const { data } = await admin.from('time_entries')
    .select('is_billed, invoice_number').eq('id', id).single();
  return data!;
}

const entwurf = (rest: Record<string, unknown> = {}) => ({
  projectNumber: 'B-300',
  customerName: 'Familie Huber',
  invoiceDate: '2026-04-30',
  dueDate: '2026-05-14',
  subtotalNetto: 800,
  totalNetto: 800,
  totalVat: 160,
  totalBrutto: 960,
  vatRate: 0.2,
  paymentStatus: 'Offen' as const,
  positions: [{ label: 'Facharbeiterstunden', qty: 10, unit: 'h', unitPrice: 80, netto: 800 }],
  ...rest,
});

describe('Ausstellen: Nummer, Sperre und Rechnung zusammen (P2-04)', () => {
  it('zieht die Nummer und sperrt die Belege im selben Aufruf', async () => {
    await leeren();
    const b = await stunde();

    const r = await rechnungen.rechnungAusstellen(BETRIEB, entwurf({ linkedEntries: [b] }), {
      praefix: 'RE',
    });

    expect(r.invoiceNumber).toBe(`RE-${JAHR}-1001`);
    expect(await verrechnungsstand(b)).toEqual({ is_billed: true, invoice_number: `RE-${JAHR}-1001` });
    const [angelegt] = await rechnungen.listUnpaidInvoices(BETRIEB);
    expect(angelegt).toMatchObject({ id: r.id, invoiceNumber: `RE-${JAHR}-1001` });
    expect(angelegt.linkedEntries).toEqual([b]);
  });

  it('bricht ganz ab, wenn ein Beleg schon verrechnet ist — keine Nummer verbraucht, nichts gesperrt', async () => {
    await leeren();
    const frei = await stunde('2026-04-13');
    const vergeben = await stunde('2026-04-14');
    await rechnungen.rechnungAusstellen(BETRIEB, entwurf({ linkedEntries: [vergeben] }), { praefix: 'RE' });

    await expect(
      rechnungen.rechnungAusstellen(BETRIEB, entwurf({ linkedEntries: [frei, vergeben] }), { praefix: 'RE' }),
    ).rejects.toThrow(/inzwischen verrechnet/);

    // Die freie Stunde ist frei geblieben …
    expect(await verrechnungsstand(frei)).toEqual({ is_billed: false, invoice_number: null });
    // … es gibt nur die erste Rechnung …
    expect(await rechnungen.listUnpaidInvoices(BETRIEB)).toHaveLength(1);
    // … und die Nummer ist nicht verbraucht: die nächste ist die 1002.
    const danach = await rechnungen.rechnungAusstellen(BETRIEB, entwurf({ linkedEntries: [frei] }), {
      praefix: 'RE',
    });
    expect(danach.invoiceNumber).toBe(`RE-${JAHR}-1002`);
  });

  it('zwei gleichzeitige Abrechnungen derselben Stunde: genau eine gelingt', async () => {
    await leeren();
    const b = await stunde();

    const ergebnisse = await Promise.allSettled([
      rechnungen.rechnungAusstellen(BETRIEB, entwurf({ linkedEntries: [b] }), { praefix: 'RE' }),
      rechnungen.rechnungAusstellen(BETRIEB, entwurf({ linkedEntries: [b] }), { praefix: 'RE' }),
    ]);

    expect(ergebnisse.filter((e) => e.status === 'fulfilled')).toHaveLength(1);
    expect(await rechnungen.listUnpaidInvoices(BETRIEB)).toHaveLength(1);
    // Und keine Lücke: die gescheiterte hat ihre Nummer nicht behalten.
    const naechste = await rechnungen.rechnungAusstellen(BETRIEB, entwurf(), { praefix: 'RE' });
    expect(naechste.invoiceNumber).toBe(`RE-${JAHR}-1002`);
  }, 30_000);

  it('ein Beleg aus einem anderen Betrieb oder einer, den es nicht gibt, bricht ab', async () => {
    await leeren();
    await expect(
      rechnungen.rechnungAusstellen(
        BETRIEB, entwurf({ linkedEntries: [crypto.randomUUID()] }), { praefix: 'RE' },
      ),
    ).rejects.toThrow(/inzwischen verrechnet oder gehört nicht zu diesem Betrieb/);
    expect(await rechnungen.listUnpaidInvoices(BETRIEB)).toEqual([]);
  });

  it('ein Monteur stellt keine Rechnung aus', async () => {
    await leeren();
    clientEinreichen(anton.client);
    await expect(
      rechnungen.rechnungAusstellen(BETRIEB, entwurf(), { praefix: 'RE' }),
    ).rejects.toThrow();
  });
});

describe('Ein Schein steht auf höchstens einer gültigen Rechnung (P2-03)', () => {
  it('weist denselben Schein auf einer zweiten Rechnung ab', async () => {
    await leeren();
    const schein = crypto.randomUUID();
    await rechnungen.createInvoice(BETRIEB, {
      ...entwurf({ linkedWorkSheets: [schein] }), invoiceNumber: `RE-${JAHR}-1001`,
    });

    await expect(
      rechnungen.createInvoice(BETRIEB, {
        ...entwurf({ linkedWorkSheets: [schein] }), invoiceNumber: `RE-${JAHR}-1002`,
      }),
    ).rejects.toThrow(new RegExp(`schon auf der Rechnung RE-${JAHR}-1001`));
    expect(await rechnungen.listUnpaidInvoices(BETRIEB)).toHaveLength(1);
  });

  it('nach einem Storno ist der Schein wieder frei', async () => {
    await leeren();
    const schein = crypto.randomUUID();
    const erste = await rechnungen.createInvoice(BETRIEB, {
      ...entwurf({ linkedWorkSheets: [schein] }), invoiceNumber: `RE-${JAHR}-1001`,
    });
    await rechnungen.cancelInvoice({ id: erste } as WithId<Invoice>, 'Falscher Kunde');

    await rechnungen.createInvoice(BETRIEB, {
      ...entwurf({ linkedWorkSheets: [schein] }), invoiceNumber: `RE-${JAHR}-1002`,
    });
    const offen = await rechnungen.listUnpaidInvoices(BETRIEB);
    expect(offen.map((r) => r.invoiceNumber)).toEqual([`RE-${JAHR}-1002`]);
  });

  it('die Ansicht erfährt es über alle Rechnungen — ein Storno zählt nicht', async () => {
    await leeren();
    const gueltig = crypto.randomUUID();
    const storniert = crypto.randomUUID();
    const frei = crypto.randomUUID();
    await rechnungen.createInvoice(BETRIEB, {
      ...entwurf({ linkedWorkSheets: [gueltig] }), invoiceNumber: `RE-${JAHR}-1001`,
    });
    const weg = await rechnungen.createInvoice(BETRIEB, {
      ...entwurf({ linkedWorkSheets: [storniert] }), invoiceNumber: `RE-${JAHR}-1002`,
    });
    await rechnungen.cancelInvoice({ id: weg } as WithId<Invoice>, 'Irrtum');

    expect(await rechnungen.scheineAufRechnung(BETRIEB, [gueltig, storniert, frei]))
      .toEqual([gueltig]);
  });
});

describe('Keine Rechnung über nichts (P2-10)', () => {
  it('ohne Positionen wird nichts angelegt', async () => {
    await leeren();
    await expect(
      rechnungen.rechnungAusstellen(BETRIEB, entwurf({ positions: [] }), { praefix: 'RE' }),
    ).rejects.toThrow(/ohne Positionen/);
    expect(await rechnungen.listUnpaidInvoices(BETRIEB)).toEqual([]);
  });

  it('über null Euro auch nicht', async () => {
    await leeren();
    await expect(
      rechnungen.rechnungAusstellen(BETRIEB, entwurf({
        subtotalNetto: 0, totalNetto: 0, totalVat: 0, totalBrutto: 0,
        positions: [{ label: 'Anzahlung', qty: 1, unit: 'Pauschale', unitPrice: 0, netto: 0 }],
      }), { praefix: 'RE' }),
    ).rejects.toThrow(/null Euro/);
  });

  it('das Abzeichen zählt keine Rechnung, auf der nichts mehr offen ist', async () => {
    await leeren();
    // Überfällig vermerkt, aber voll beglichen — der Mahnlauf zeigt sie nicht.
    const { error } = await admin.from('invoices').insert({
      company_id: BETRIEB, invoice_number: `RE-${JAHR}-9001`, project_number: 'B-300',
      customer_name: 'Familie Huber', invoice_date: '2026-03-01', due_date: '2026-03-15',
      total_netto: 100, total_vat: 20, total_brutto: 120, bezahlt_betrag: 120,
      payment_status: 'Überfällig',
    });
    expect(error).toBeNull();

    const { data } = await buch.client.rpc('offene_posten', { p_heute: '2026-09-16' });
    const z = (Array.isArray(data) ? data[0] : data) as { mahnungen: number };
    expect(Number(z.mahnungen)).toBe(0);
  });
});
