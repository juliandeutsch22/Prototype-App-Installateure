import { beforeAll, afterAll, expect, it } from 'vitest';
import { Client } from 'pg';
import { betriebAnlegen, konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { listInvoicesInRange } from '@/lib/db/pg/invoices';

const betrieb = 'rechnungsarchiv-gross';
const anzahl = 12001;
beforeAll(async () => {
  await betriebAnlegen(betrieb).catch((e) => {
    throw Object.assign(new Error('Archiv-Testbestand: Firmenanlage fehlgeschlagen'), { cause: e });
  });
  const chef = await konto(betrieb, 'Geschäftsführung', 'rechnungsarchiv-gross').catch((e) => {
    throw Object.assign(new Error('Archiv-Testbestand: Kontoanlage fehlgeschlagen'), { cause: e });
  });
  // Geprüft wird das Lesen des Archivs. Der HTTP-Aufbau brach in CI vor
  // dieser Prüfung mit „fetch failed“ ab; er versendete drei Riesenaufträge.
  // Derselbe vollständige Bestand entsteht lokal direkt in einer Transaktion;
  // der eigentliche Abruf bleibt über die echte API samt Rechten und Kindzeilen.
  const db = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();
  try {
    await db.query('begin');
    await db.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)");
    await db.query(`insert into public.invoices
      (id,company_id,invoice_number,project_number,customer_name,invoice_date,due_date,
       total_netto,total_vat,total_brutto,payment_status,vat_rate)
      select gen_random_uuid(),$1,'RE-2026-' || i,'B-1','Archivkunde','2026-01-01'::date,
        '2026-02-01'::date,100,20,120,'Bezahlt',0.2 from generate_series(0,$2::int-1) i`, [betrieb, anzahl]);
    await db.query(`insert into public.invoice_lines
      (company_id,invoice_id,position,label,qty,unit,unit_price,netto)
      select company_id,id,0,invoice_number,1,'h',100,100 from public.invoices where company_id=$1`, [betrieb]);
    await db.query(`insert into public.invoice_coverage(company_id,invoice_id,art,ziel_id)
      select company_id,id,'time_entry',gen_random_uuid() from public.invoices where company_id=$1`, [betrieb]);
    await db.query('commit');
  } catch (e) {
    await db.query('rollback');
    throw e;
  } finally {
    await db.end();
  }
  clientEinreichen(chef.client);
});
afterAll(() => clientEinreichen(null));

it('lädt alle 12.001 Archiv-Rechnungen samt Positionen und Abdeckung ohne überlange Adressen', async () => {
  const alle = await listInvoicesInRange(betrieb, '2026-01-01', '2026-12-31');
  expect(alle).toHaveLength(anzahl);
  expect(new Set(alle.map((r) => r.id)).size).toBe(anzahl);
  expect(alle.every((r) => r.positions?.length === 1 && r.positions[0].label === r.invoiceNumber)).toBe(true);
  expect(alle.every((r) => r.linkedEntries?.length === 1)).toBe(true);
  expect(await listInvoicesInRange(betrieb, '2025-01-01', '2025-12-31')).toEqual([]);
});
