/**
 * Testbericht 30.09.2026, M10 — die UID wird in der Form geprüft, und ob ein
 * Kunde Unternehmer ist, sagt die Kundenart. Die Datenbank entscheidet: bei
 * Kunden, beim Betrieb und bei neuen Rechnungen.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'm10-uid';
const JAHR = new Date().getFullYear();
let chefin: Konto;
let lfd = 5000;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'm10gf');
  clientEinreichen(chefin.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

async function kunde(felder: Record<string, unknown>) {
  const { data, error } = await chefin.client.from('customers')
    .insert({ company_id: BETRIEB, name: `Kunde ${crypto.randomUUID().slice(0, 6)}`, ...felder })
    .select('id, vat_id, kundenart').single();
  if (error) throw new Error(error.message);
  return data as { id: string; vat_id: string | null; kundenart: string | null };
}

describe('Kunden', () => {
  it('„ATU123“ wird abgewiesen — der Fall aus dem Bericht', async () => {
    await expect(kunde({ vat_id: 'ATU123' })).rejects.toThrow(/ATU“ und acht Ziffern/);
  });

  it('„AT“ ohne „U“ und „GR“ statt „EL“ ebenso', async () => {
    await expect(kunde({ vat_id: 'AT12345678' })).rejects.toThrow(/acht Ziffern/);
    await expect(kunde({ vat_id: 'GR123456789' })).rejects.toThrow(/EL/);
    await expect(kunde({ vat_id: 'DE12345678' })).rejects.toThrow(/Form einer UID-Nummer/);
  });

  it('wird einheitlich gespeichert, und mit UID ist der Kunde Unternehmer', async () => {
    const k = await kunde({ vat_id: 'atu 1234.5678' });
    expect(k).toMatchObject({ vat_id: 'ATU12345678', kundenart: 'unternehmen' });
  });

  it('eine Privatperson mit UID gibt es nicht', async () => {
    await expect(kunde({ vat_id: 'ATU12345678', kundenart: 'privat' })).rejects.toThrow(/Privatperson/);
  });

  it('Gegenprobe: andere EU-Staaten und Länder ausserhalb gehen durch', async () => {
    expect((await kunde({ vat_id: 'DE123456789' })).vat_id).toBe('DE123456789');
    expect((await kunde({ vat_id: 'NL123456789B01' })).vat_id).toBe('NL123456789B01');
    expect((await kunde({ vat_id: 'CHE-123.456.789' })).vat_id).toBe('CHE123456789');
  });

  it('Gegenprobe: ohne UID bleibt die Kundenart, wie sie gewählt wurde', async () => {
    expect((await kunde({ kundenart: 'privat' })).kundenart).toBe('privat');
    expect((await kunde({ kundenart: 'unternehmen' })).kundenart).toBe('unternehmen');
    expect((await kunde({})).kundenart).toBeNull();
  });

  it('eine unveränderte UID hält eine andere Änderung nicht auf', async () => {
    const k = await kunde({ vat_id: 'ATU12345678' });
    const { error } = await chefin.client.from('customers')
      .update({ contact_phone: '01 234', vat_id: 'atu12345678' }).eq('id', k.id);
    expect(error).toBeNull();
  });
});

describe('Umbenennen nimmt alle Felder mit', () => {
  it('Straße, Kundennummer und Kundenart bleiben nicht liegen', async () => {
    const k = await kunde({});
    const { error } = await chefin.client.rpc('kunde_umbenennen', {
      p_kunde: k.id,
      p_name: `Umbenannt ${k.id.slice(0, 6)}`,
      p_rest: { strasse: 'Gartengasse 12', plz: '2700', ort: 'Wiener Neustadt', kundennummer: 'K-77', kundenart: 'unternehmen' },
    });
    expect(error).toBeNull();
    const { data } = await admin.from('customers').select('address, kundennummer, kundenart').eq('id', k.id).single();
    expect(data).toMatchObject({
      address: 'Gartengasse 12, 2700 Wiener Neustadt', kundennummer: 'K-77', kundenart: 'unternehmen',
    });
  });

  it('prüft auch dort die UID', async () => {
    const k = await kunde({});
    const { error } = await chefin.client.rpc('kunde_umbenennen', {
      p_kunde: k.id, p_name: 'Irgendwer', p_rest: { vat_id: 'ATU1' },
    });
    expect(error?.message).toMatch(/acht Ziffern/);
  });
});

describe('Betrieb', () => {
  it('die eigene UID wird geprüft', async () => {
    const { error } = await admin.from('companies').update({ vat_id: 'ATU99' }).eq('id', BETRIEB);
    expect(error?.message).toMatch(/acht Ziffern/);
    const gut = await admin.from('companies').update({ vat_id: 'ATU 1111 2222' }).eq('id', BETRIEB);
    expect(gut.error).toBeNull();
    const { data } = await admin.from('companies').select('vat_id').eq('id', BETRIEB).single();
    expect(data!.vat_id).toBe('ATU11112222');
  });
});

describe('Rechnungen', () => {
  function anlegen(customerVatId: string): Promise<string> {
    lfd += 1;
    return rechnungen.createInvoice(BETRIEB, {
      invoiceNumber: `RE-${JAHR}-${lfd}`,
      projectNumber: 'B-310',
      customerName: 'Baumeister Gruber',
      invoiceDate: '2026-04-30',
      dueDate: '2026-05-14',
      totalNetto: 1000,
      totalVat: 200,
      totalBrutto: 1200,
      vatRate: 20,
      paymentStatus: 'Offen',
      customerVatId,
      positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 1000, netto: 1000 }],
    });
  }

  it('eine UID in falscher Form kommt nicht auf die Rechnung', async () => {
    await expect(anlegen('ATU123')).rejects.toThrow(/UID-Nummer des Kunden/);
  });

  it('Gegenprobe: eine richtige wird einheitlich gespeichert, eine leere bleibt leer', async () => {
    const id = await anlegen('atu 5555 6666');
    const { data } = await admin.from('invoices').select('customer_vat_id').eq('id', id).single();
    expect(data!.customer_vat_id).toBe('ATU55556666');
    await expect(anlegen('')).resolves.toBeTruthy();
  });
});
