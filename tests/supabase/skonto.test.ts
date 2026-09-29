/**
 * Skonto — gegen die echte Datenbank (offene Punkte B7, Teil 2).
 *
 * Geprüft wird die Bedingung an der Rechnung (nur wo sie Sinn hat, danach
 * eingefroren) und der Ausgleich: ein Eintrag der Art „Skonto" schliesst den
 * Rest, nicht mehr als zugesagt und nicht mehr als offen, in einem Zug mit
 * der Zahlung — und er geht nicht mit in einen Storno.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { createZahlung, createZahlungMitSkonto, deleteZahlung, listZahlungen } from '@/lib/db/pg/zahlungen';
import { clientEinreichen, type WithId } from '@/lib/db/pg/kern';
import type { Invoice } from '@/types';

const BETRIEB = 'skonto-b7';
const JAHR = new Date().getFullYear();

let buch: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'skbuch');
  clientEinreichen(buch.client);
}, 120_000);

afterAll(() => clientEinreichen(null));
afterEach(() => clientEinreichen(buch.client));

/** 1.200 € brutto; mit Skonto 2 % bis zum 07.05. */
async function ausstellen(extra: Partial<Invoice> = { skontoProzent: 2, skontoBis: `${JAHR}-05-07` }) {
  const { id } = await rechnungen.rechnungAusstellen(BETRIEB, {
    projectNumber: 'B-600',
    customerName: 'Baumeister Gruber',
    address: 'Bergweg 3, 2700 Wiener Neustadt',
    invoiceDate: `${JAHR}-04-30`,
    dueDate: `${JAHR}-05-14`,
    subtotalNetto: 1000,
    totalNetto: 1000,
    totalVat: 200,
    totalBrutto: 1200,
    vatRate: 0.2,
    paymentStatus: 'Offen',
    positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 1000, netto: 1000 }],
    ...extra,
  }, { praefix: 'RE' });
  return lies(id);
}

async function lies(id: string) {
  const { data, error } = await admin.from('invoices')
    .select('id, company_id, payment_status, bezahlt_betrag, skonto_betrag, skonto_prozent, skonto_bis')
    .eq('id', id).single();
  if (error) throw new Error(error.message);
  const z = data as Record<string, unknown>;
  return {
    id: z.id as string, companyId: z.company_id as string, paymentStatus: z.payment_status as string,
    bezahlt: Number(z.bezahlt_betrag), skonto: Number(z.skonto_betrag),
    skontoProzent: z.skonto_prozent == null ? null : Number(z.skonto_prozent), skontoBis: z.skonto_bis as string | null,
  };
}

const zahlung = (invoiceId: string, betrag: number, datum = `${JAHR}-05-05`) => ({
  invoiceId, datum, betrag, art: 'Überweisung' as const, erfasstVonName: 'Buchhaltung',
});

describe('Die Bedingung an der Rechnung', () => {
  it('wird mit der Rechnung gespeichert — und ist danach eingefroren', async () => {
    const inv = await ausstellen();
    expect(inv.skontoProzent).toBe(2);
    expect(inv.skontoBis).toBe(`${JAHR}-05-07`);
    const aendern = await buch.client.from('invoices').update({ skonto_prozent: 3 }).eq('id', inv.id);
    expect(aendern.error?.code).toBe('42501');
  });

  it('gibt es nicht auf einer Anzahlung und nicht über das Zahlungsziel hinaus', async () => {
    await expect(ausstellen({ skontoProzent: 2, skontoBis: `${JAHR}-05-07`, art: 'anzahlung' }))
      .rejects.toThrow(/nur auf einer Rechnung oder Schlussrechnung/);
    await expect(ausstellen({ skontoProzent: 2, skontoBis: `${JAHR}-05-20` }))
      .rejects.toThrow(/zwischen Rechnungsdatum und Zahlungsziel/);
  });
});

describe('Der Ausgleich', () => {
  it('schliesst den Rest: bezahlt, und der Skonto getrennt geführt', async () => {
    const inv = await ausstellen();
    await createZahlungMitSkonto(BETRIEB, zahlung(inv.id, 1176), 24);
    const danach = await lies(inv.id);
    expect(danach).toMatchObject({ paymentStatus: 'Bezahlt', bezahlt: 1200, skonto: 24 });
  });

  it('nicht mehr als zugesagt — und dann ist auch die Zahlung nicht gebucht', async () => {
    const inv = await ausstellen();
    await expect(createZahlungMitSkonto(BETRIEB, zahlung(inv.id, 1170), 30))
      .rejects.toThrow(/höchstens 24,00/);
    expect(await listZahlungen(BETRIEB, inv.id)).toHaveLength(0);
    expect((await lies(inv.id)).paymentStatus).toBe('Offen');
  });

  it('nicht mehr als offen — er macht keine Überzahlung', async () => {
    const inv = await ausstellen();
    await createZahlung(BETRIEB, zahlung(inv.id, 1190));
    await expect(createZahlung(BETRIEB, { ...zahlung(inv.id, 20), art: 'Skonto' }))
      .rejects.toThrow(/höher als das, was noch offen ist/);
  });

  it('nur, wo die Rechnung ihn zusagt', async () => {
    const inv = await ausstellen({});
    await expect(createZahlungMitSkonto(BETRIEB, zahlung(inv.id, 1176), 24))
      .rejects.toThrow(/sagt keinen Skonto zu/);
  });

  it('der Skonto-Betrag lässt sich nicht von Hand setzen', async () => {
    const inv = await ausstellen();
    const r = await buch.client.from('invoices').update({ skonto_betrag: 24 }).eq('id', inv.id);
    expect(r.error?.code).toBe('42501');
  });
});

describe('Und der Storno', () => {
  it('geht erst, wenn der Skonto-Eintrag weg ist — er ist kein Geld, das zurückgeht', async () => {
    const inv = await ausstellen();
    await createZahlungMitSkonto(BETRIEB, zahlung(inv.id, 1176), 24);
    const mitSkonto = { id: inv.id } as WithId<Invoice>;
    await expect(rechnungen.cancelInvoice(mitSkonto, 'Falscher Kunde')).rejects.toThrow(/Skonto-Eintrag vor dem Storno löschen/);

    const skonto = (await listZahlungen(BETRIEB, inv.id)).find((z) => z.art === 'Skonto')!;
    await deleteZahlung(skonto.id);
    await rechnungen.cancelInvoice(mitSkonto, 'Falscher Kunde');
    // Das Guthaben ist das Geld, das kam — nicht mehr.
    expect(await lies(inv.id)).toMatchObject({ paymentStatus: 'Storniert', bezahlt: 1176, skonto: 0 });
  });
});
