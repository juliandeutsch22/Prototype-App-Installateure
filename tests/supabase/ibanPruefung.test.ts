/**
 * Runde 3, H3: die IBAN-Prüfung in der Datenbank — dieselbe Regel wie
 * `shared/iban.ts`. Eine ungültige IBAN lässt sich nicht speichern, und mit
 * einer ungültigen (aus dem Altbestand) entsteht keine Rechnung.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { ibanFehler } from '../../shared/iban';

const BETRIEB = 'h3-iban';
let chefin: Konto;
const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'h3gf');
});

const rechnung = (nr: string) => ({
  company_id: BETRIEB, invoice_number: nr, project_number: 'PR-2026-0001',
  customer_name: 'Familie Huber', invoice_date: heute, due_date: heute,
  total_netto: 100, total_vat: 20, total_brutto: 120, payment_status: 'Offen',
});

describe('IBAN in den Firmendaten', () => {
  it('gültige IBAN: gespeichert ohne Leerzeichen, BIC gross', async () => {
    const { error } = await chefin.client.from('companies')
      .update({ iban: 'at61 1904 3002 3457 3201', bic: 'bkauatww' }).eq('id', BETRIEB);
    expect(error).toBeNull();
    const { data } = await admin.from('companies').select('iban, bic').eq('id', BETRIEB).single();
    expect(data).toEqual({ iban: 'AT611904300234573201', bic: 'BKAUATWW' });
  });

  it('der Befund AT74123456 und eine falsche Prüfziffer werden abgewiesen — mit derselben Meldung wie in der App', async () => {
    for (const falsch of ['AT74123456', 'AT61 1904 3002 3457 3210', 'DE89370400440532013001']) {
      const { error } = await chefin.client.from('companies').update({ iban: falsch }).eq('id', BETRIEB);
      expect(error?.code, falsch).toBe('22023');
      expect(error?.message).toBe(ibanFehler(falsch));
    }
    const bic = await chefin.client.from('companies').update({ bic: 'BKAU' }).eq('id', BETRIEB);
    expect(bic.error?.code).toBe('22023');
  });

  it('Gegenprobe: eine DE-IBAN geht, und ein Altbestand hält das Speichern anderer Felder nicht auf', async () => {
    expect((await chefin.client.from('companies').update({ iban: 'DE89 3704 0044 0532 0130 00' }).eq('id', BETRIEB)).error)
      .toBeNull();
    // Altbestand an der Prüfung vorbei, wie er vor dieser Regel entstehen konnte.
    const { Client } = await import('pg');
    const db = new Client({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
    await db.connect();
    await db.query("alter table public.companies disable trigger companies_bankverbindung");
    await db.query("update public.companies set iban = 'AT74123456' where id = $1", [BETRIEB]);
    await db.query("alter table public.companies enable trigger companies_bankverbindung");
    await db.end();
    const { error } = await chefin.client.from('companies').update({ contact_line: '02622 12345' }).eq('id', BETRIEB);
    expect(error).toBeNull();
  });

  it('mit ungültiger IBAN entsteht keine Rechnung — mit Hinweis auf die Firmendaten', async () => {
    const { error } = await admin.from('invoices').insert(rechnung('RE-2026-0001'));
    expect(error?.message).toMatch(/IBAN in den Firmendaten ist ungültig.*Firmendaten berichtigen/);
  });

  it('Gegenprobe: berichtigt, und die Rechnung entsteht', async () => {
    expect((await chefin.client.from('companies').update({ iban: 'AT61 1904 3002 3457 3201' }).eq('id', BETRIEB)).error)
      .toBeNull();
    const { error } = await admin.from('invoices').insert(rechnung('RE-2026-0002'));
    expect(error).toBeNull();
  });
});
