/**
 * Eine gültige Schlussrechnung je Baustelle (Testbericht Runde 6, M7) —
 * gegen eine echte Datenbank.
 *
 * Nach der Schlussrechnung RE-2026-1510 stellte „Neue Rechnung“ wieder eine
 * Schlussrechnung über dieselbe Baustelle zusammen. Die Maske weicht jetzt
 * aus; gesperrt wird hier (`app.eine_schlussrechnung`). Jede Regel mit
 * Gegenprobe: was sie verbietet UND was sie weiter zulässt.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { betriebAnlegen, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { clientEinreichen, type WithId } from '@/lib/db/pg/kern';
import type { Invoice } from '@/types';

const BETRIEB = 'r6p2-schluss';
const JAHR = new Date().getFullYear();

let buch: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'r6p2buch');
  clientEinreichen(buch.client);
}, 180_000);

afterAll(() => clientEinreichen(null));
afterEach(() => clientEinreichen(buch.client));

let lfd = 7000;
let baustellenNr = 700;
let baustelle = 'B-700';
beforeEach(() => {
  baustellenNr += 1;
  baustelle = `B-${baustellenNr}`;
});

/** Eine Rechnung über 1.200 € brutto, ohne Abzüge — die Baustelle hat keine Vorrechnung. */
async function anlegen(extra: Partial<rechnungen.NewInvoice> = {}): Promise<string> {
  lfd += 1;
  return rechnungen.createInvoice(BETRIEB, {
    invoiceNumber: `RE-${JAHR}-${lfd}`,
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

const stornieren = (id: string) =>
  rechnungen.cancelInvoice({ id } as unknown as WithId<Invoice>, 'Zahlendreher');

describe('Eine Schlussrechnung je Baustelle (M7)', () => {
  it('weist eine zweite gültige Schlussrechnung ab und nennt die erste', async () => {
    await anlegen({ art: 'schluss' });
    const erste = `RE-${JAHR}-${lfd}`;
    await expect(anlegen({ art: 'schluss' })).rejects.toThrow(new RegExp(`schon die Schlussrechnung ${erste}`));
  });

  it('erkennt dieselbe Baustelle auch in der anderen Schreibweise der Nummer', async () => {
    await anlegen({ art: 'schluss' });
    await expect(anlegen({ art: 'schluss', projectNumber: `PR-${baustelle}` })).rejects.toThrow(/schon die Schlussrechnung/);
  });

  it('Gegenprobe: nach dem Storno der ersten geht eine neue', async () => {
    const erste = await anlegen({ art: 'schluss' });
    await stornieren(erste);
    await expect(anlegen({ art: 'schluss' })).resolves.toBeTruthy();
  });

  it('lässt den Storno der ersten nicht aufheben, solange eine neue gilt', async () => {
    const erste = await anlegen({ art: 'schluss' });
    await stornieren(erste);
    await anlegen({ art: 'schluss' });
    await expect(
      rechnungen.reactivateInvoice({ id: erste } as unknown as WithId<Invoice>),
    ).rejects.toThrow(/schon die Schlussrechnung/);
  });

  it('Gegenprobe: ohne neue lässt sich der Storno am selben Tag aufheben', async () => {
    const erste = await anlegen({ art: 'schluss' });
    await stornieren(erste);
    await expect(
      rechnungen.reactivateInvoice({ id: erste } as unknown as WithId<Invoice>),
    ).resolves.toBeUndefined();
  });

  it('Gleichbleiben: nach der Schlussrechnung geht eine Rechnung, und eine andere Baustelle hat ihre eigene', async () => {
    await anlegen({ art: 'schluss' });
    await expect(anlegen({ art: 'einzel' })).resolves.toBeTruthy();
    await expect(anlegen({ art: 'schluss', projectNumber: `${baustelle}-2` })).resolves.toBeTruthy();
  });
});
