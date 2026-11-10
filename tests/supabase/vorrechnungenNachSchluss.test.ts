/**
 * Anzahlung und Teilrechnung nach der Schlussrechnung, Storno aufheben mit
 * den Prüfungen des Anlegens (Durchsicht 09.11.2026) — gegen eine echte
 * Datenbank (`app.vorrechnungen_pruefen`).
 *
 * BEFUND 1: nach einer gültigen Schlussrechnung ließ sich noch eine Anzahlung
 * stellen, die niemand mehr abzog — ihre Umsatzsteuer stand zweimal auf
 * Belegen (§ 11 Abs 12 UStG).
 * BEFUND 2: „Storno aufheben“ prüfte die Vorrechnungen nicht — in beiden
 * Reihenfolgen entstand ein Stand, den das Anlegen abgewiesen hätte.
 *
 * Jede Regel mit Gegenprobe: was sie verbietet UND was sie weiter zulässt.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { betriebAnlegen, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { clientEinreichen, type WithId } from '@/lib/db/pg/kern';
import type { Invoice, Vorrechnung } from '@/types';

const BETRIEB = 'vns-a';
const JAHR = new Date().getFullYear();

let buch: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'vnsbuch');
  clientEinreichen(buch.client);
}, 180_000);

afterAll(() => clientEinreichen(null));
afterEach(() => clientEinreichen(buch.client));

let lfd = 8000;
let baustellenNr = 800;
let baustelle = 'B-800';
// Jeder Test auf seiner eigenen Baustelle — sonst prüfte er die Reihenfolge der Tests.
beforeEach(() => {
  baustellenNr += 1;
  baustelle = `B-${baustellenNr}`;
});

const nummer = () => `RE-${JAHR}-${lfd}`;

/** Eine Rechnung über 1.200 € brutto. */
async function anlegen(extra: Partial<rechnungen.NewInvoice> = {}): Promise<string> {
  lfd += 1;
  return rechnungen.createInvoice(BETRIEB, {
    invoiceNumber: nummer(),
    projectNumber: baustelle,
    customerName: 'Familie Huber',
    address: 'Hauptplatz 1, 8200 Gleisdorf',
    invoiceDate: `${JAHR}-04-30`, leistungVon: `${JAHR}-04-30`, leistungBis: `${JAHR}-04-30`,
    dueDate: `${JAHR}-05-14`,
    totalNetto: 1000,
    totalVat: 200,
    totalBrutto: 1200,
    vatRate: 0.2,
    paymentStatus: 'Offen',
    positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 1000, netto: 1000 }],
    ...extra,
  });
}

const abzug = (id: string, nr: string): Vorrechnung => ({
  invoiceId: id, invoiceNumber: nr, invoiceDate: `${JAHR}-04-30`, netto: 1000, vat: 200, brutto: 1200,
});

/** Eine Schlussrechnung, die die genannten Vorrechnungen abzieht und aufgeht. */
function schluss(abzuege: Vorrechnung[] = []): Promise<string> {
  const g = abzuege.reduce(
    (s, a) => ({ netto: s.netto + a.netto, vat: s.vat + a.vat, brutto: s.brutto + a.brutto }),
    { netto: 1000, vat: 200, brutto: 1200 },
  );
  return anlegen({
    art: 'schluss',
    ...(abzuege.length > 0
      ? { vorrechnungen: abzuege, gesamtNetto: g.netto, gesamtVat: g.vat, gesamtBrutto: g.brutto }
      : {}),
  });
}

const stornieren = (id: string) =>
  rechnungen.cancelInvoice({ id } as unknown as WithId<Invoice>, 'Zahlendreher');
const aufheben = (id: string) =>
  rechnungen.reactivateInvoice({ id } as unknown as WithId<Invoice>);

describe('Nach der Schlussrechnung keine Anzahlung oder Teilrechnung mehr (Befund 1)', () => {
  it('weist eine Anzahlung nach einer gültigen Schlussrechnung ab und nennt sie', async () => {
    await schluss();
    const s = nummer();
    await expect(anlegen({ art: 'anzahlung' })).rejects.toThrow(new RegExp(`schon die Schlussrechnung ${s}`));
  });

  it('weist eine Teilrechnung nach einer gültigen Schlussrechnung ab', async () => {
    await schluss();
    await expect(anlegen({ art: 'teil' })).rejects.toThrow(/Anzahlungs- oder Teilrechnung danach/);
  });

  it('erkennt die Baustelle auch in der anderen Schreibweise der Nummer', async () => {
    await schluss();
    await expect(anlegen({ art: 'anzahlung', projectNumber: `PR-${baustelle}` }))
      .rejects.toThrow(/schon die Schlussrechnung/);
  });

  it('Erhaltung: vor der Schlussrechnung gehen Anzahlung und Teilrechnung weiter', async () => {
    await expect(anlegen({ art: 'anzahlung' })).resolves.toBeTruthy();
    await expect(anlegen({ art: 'teil' })).resolves.toBeTruthy();
  });

  it('Erhaltung: nach der Schlussrechnung geht eine Rechnung, und nach ihrem Storno wieder eine Anzahlung', async () => {
    const s = await schluss();
    await expect(anlegen({ art: 'einzel' })).resolves.toBeTruthy();
    await stornieren(s);
    await expect(anlegen({ art: 'anzahlung' })).resolves.toBeTruthy();
  });

  it('Erhaltung: eine andere Baustelle hat ihre eigene Schlussrechnung', async () => {
    await schluss();
    await expect(anlegen({ art: 'anzahlung', projectNumber: `${baustelle}-2` })).resolves.toBeTruthy();
  });
});

describe('Storno aufheben prüft wie das Anlegen (Befund 2)', () => {
  it('(a) die Schlussrechnung gilt nicht wieder, wenn ihre Anzahlung inzwischen storniert ist', async () => {
    const a = await anlegen({ art: 'anzahlung' });
    const aNr = nummer();
    const s = await schluss([abzug(a, aNr)]);
    await stornieren(s);
    await stornieren(a);
    await expect(aufheben(s)).rejects.toThrow(new RegExp(`${aNr} ist storniert`));
  });

  it('(a) Gegenprobe: mit gültiger Anzahlung lässt sich der Storno der Schlussrechnung aufheben', async () => {
    const a = await anlegen({ art: 'anzahlung' });
    const s = await schluss([abzug(a, nummer())]);
    await stornieren(s);
    await expect(aufheben(s)).resolves.toBeUndefined();
  });

  it('(a′) die Schlussrechnung gilt nicht wieder, wenn inzwischen eine Anzahlung dazukam, die sie nicht abzieht', async () => {
    const s = await schluss();
    await stornieren(s);
    await anlegen({ art: 'anzahlung' });
    const aNr = nummer();
    await expect(aufheben(s)).rejects.toThrow(new RegExp(`muss abziehen.*${aNr}`));
  });

  it('(b) die Anzahlung gilt nicht wieder, wenn eine neue Schlussrechnung sie nicht abzieht', async () => {
    const a = await anlegen({ art: 'anzahlung' });
    await stornieren(a);
    await schluss();
    const s2 = nummer();
    await expect(aufheben(a)).rejects.toThrow(new RegExp(`schon die Schlussrechnung ${s2}`));
  });

  it('(b) Gegenprobe: ohne Schlussrechnung lässt sich der Storno der Anzahlung aufheben', async () => {
    const a = await anlegen({ art: 'anzahlung' });
    await stornieren(a);
    await expect(aufheben(a)).resolves.toBeUndefined();
  });

  it('(b) ebenso eine Teilrechnung', async () => {
    const t = await anlegen({ art: 'teil' });
    await stornieren(t);
    await schluss();
    await expect(aufheben(t)).rejects.toThrow(/Anzahlungs- oder Teilrechnung danach/);
  });
});
