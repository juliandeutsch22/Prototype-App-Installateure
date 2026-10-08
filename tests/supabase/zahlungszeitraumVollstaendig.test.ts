import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { createInvoice } from '@/lib/db/pg/invoices';
import { listZahlungenImZeitraum } from '@/lib/db/pg/zahlungen';

const BETRIEB = 'audit-zahlungszeitraum';
const ANZAHL = 2001;
let db: Client;
let buch: Konto;

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL
    ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'export');
  clientEinreichen(buch.client);
  const id = await createInvoice(BETRIEB, {
    invoiceNumber: 'RE-2026-1001', projectNumber: 'B-1', customerName: 'Kunde',
    address: 'Hauptplatz 1, 8200 Gleisdorf', invoiceDate: '2026-01-01',
    dueDate: '2026-01-15', totalNetto: 2500, totalVat: 500, totalBrutto: 3000,
    vatRate: 0.2, paymentStatus: 'Offen',
    positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 2500, netto: 2500 }],
  });
  // Der große Bestand belegt die abgeschnittene Exportabfrage. Die beiden
  // Randtage sichern, dass Vollständigkeit nicht den Zeitraum aufhebt.
  await db.query(`insert into public.zahlungseingaenge
    (company_id, invoice_id, datum, betrag, art)
    select $1, $2::uuid, '2026-02-15'::date, 1, 'Überweisung'
    from generate_series(1, $3)`, [BETRIEB, id, ANZAHL]);
  await db.query(`insert into public.zahlungseingaenge
    (company_id, invoice_id, datum, betrag, art) values
    ($1, $2::uuid, '2026-01-31', 1, 'Überweisung'),
    ($1, $2::uuid, '2026-03-01', 1, 'Überweisung')`, [BETRIEB, id]);
}, 180_000);

afterAll(async () => {
  clientEinreichen(null);
  await admin.from('invoices').delete().eq('company_id', BETRIEB);
  await db?.end();
});

describe('Vollständiger Zahlungszeitraum für Kennzahlen und Export', () => {
  it('liefert auch den 2001. Eingang genau einmal und nur im gewählten Zeitraum', async () => {
    const zeilen = await listZahlungenImZeitraum(BETRIEB, '2026-02-01', '2026-02-28');
    expect(zeilen).toHaveLength(ANZAHL);
    expect(new Set(zeilen.map((z) => z.id)).size).toBe(ANZAHL);
    expect(zeilen.reduce((s, z) => s + Number(z.betrag), 0)).toBe(ANZAHL);
    expect(zeilen.every((z) => z.datum === '2026-02-15')).toBe(true);
  });

  it('hält eine ausdrücklich angeforderte Grenze weiterhin ein', async () => {
    expect(await listZahlungenImZeitraum(BETRIEB, '2026-02-01', '2026-02-28', 3))
      .toHaveLength(3);
  });

  it('liest auch mit bekanntem Zeitraum keine fremden Zahlungen', async () => {
    await betriebAnlegen('audit-zahlungszeitraum-fremd');
    const fremd = await konto('audit-zahlungszeitraum-fremd', 'Buchhaltung', 'fremd');
    clientEinreichen(fremd.client);
    try {
      expect(await listZahlungenImZeitraum(BETRIEB, '2026-02-01', '2026-02-28')).toEqual([]);
    } finally {
      clientEinreichen(buch.client);
    }
  });
});
