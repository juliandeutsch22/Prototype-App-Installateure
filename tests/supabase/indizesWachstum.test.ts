/**
 * DIE INDIZES FÜR DIE WEGE, DIE MIT DEN JAHREN WACHSEN
 * (`20261010200000_indizes_fuer_wachstum.sql`, Analyse 09.10.2026).
 *
 * Ein Test kann Langsamkeit bei zwanzig Testzeilen nicht messen — Postgres
 * liest so kleine Tabellen ohnehin am Stück. Geprüft wird die Voraussetzung:
 * ist der sequenzielle Scan ausgeschaltet, nimmt jede dieser Abfragen ihren
 * Index. Ohne die Migration fehlt er, und die Prüfung ist rot (Gegenprobe:
 * gegen den Stand davor gelaufen).
 *
 * Die Abfragen sind dieselben wie in der App bzw. in den Datenbankfunktionen
 * (`datanorm_uebernehmen`, `app.lager_zugesagt`, `app.ruest_reserviert`,
 * `subscribeInvoices`, `listInvoicesForProject`, `listInvoicesForCustomer`,
 * `listRecentWorkSheets`).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';

const VERBINDUNG =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const db = new Client({ connectionString: VERBINDUNG });
const ID = '00000000-0000-4000-8000-000000000001';

beforeAll(async () => {
  await db.connect();
});
afterAll(async () => {
  await db.end();
});

function indexNamen(knoten: unknown, raus: string[] = []): string[] {
  if (Array.isArray(knoten)) for (const k of knoten) indexNamen(k, raus);
  else if (knoten && typeof knoten === 'object') {
    for (const [k, v] of Object.entries(knoten)) {
      if (k === 'Index Name' && typeof v === 'string') raus.push(v);
      else indexNamen(v, raus);
    }
  }
  return raus;
}

async function plan(sql: string, vorbereitung?: string): Promise<string[]> {
  await db.query('begin');
  try {
    /*
      MIT ECHTEM BESTAND, wo es auf ihn ankommt: für einen Betrieb ohne
      Zeilen ist dem Planer jeder Index gleich recht, und die Prüfung hinge
      an dem, was andere Prüfungen gerade in der Tabelle liegen haben (so am
      10.10.2026 geschehen). Die Zeilen verschwinden mit dem Zurückrollen.
    */
    if (vorbereitung) await db.query(vorbereitung);
    await db.query('set local enable_seqscan = off');
    const { rows } = await db.query(`explain (format json) ${sql}`);
    return indexNamen(rows[0]['QUERY PLAN']);
  } finally {
    await db.query('rollback');
  }
}

describe('Indizes für Wachstum', () => {
  const katalog = `
    insert into public.companies (id, name) values ('iw-katalog', 'Katalog') on conflict do nothing;
    set local session_replication_role = replica;
    insert into public.materials (company_id, name, article_number, stock)
      select 'iw-katalog', 'Artikel ' || i, 'K-' || i, 0 from generate_series(1, 2000) i;
    analyze public.materials;`;
  const faelle: [string, string, string, string?][] = [
    ['DATANORM: Artikel des Betriebs nach Artikelnummer', 'materials_artikelnummer',
      `select * from public.materials m where m.company_id = 'iw-katalog' and m.article_number = 'K-17'`, katalog],
    ['Frei im Lager: Zusagen eines Artikels', 'material_orders_artikel',
      `select coalesce(sum(o.quantity), 0) from public.material_orders o
        where o.material_id = '${ID}' and o.transaction_type = 'order' and not o.processed`],
    ['Frei im Lager: Rüstlisten eines Artikels', 'einsatz_material_positionen_artikel',
      `select coalesce(sum(p.menge), 0) from public.einsatz_material_positionen p where p.material_id = '${ID}'`],
    ['Rechnungsliste, jüngste zuerst', 'invoices_betrieb_angelegt',
      `select * from public.invoices where company_id = 'x' order by created_at desc limit 50`],
    ['Rechnungen einer Baustelle', 'invoices_baustelle',
      `select * from public.invoices where company_id = 'x' and project_number in ('2026-1', 'PR-2026-1')`],
    ['Kundenakte: Rechnungen nach Kunde', 'invoices_kunde',
      `select * from public.invoices where company_id = 'x' and customer_id = '${ID}'`],
    ['Kundenakte: Rechnungen nach Baustelle des Kunden', 'invoices_baustelle_id',
      `select * from public.invoices where company_id = 'x' and project_id in ('${ID}')`],
    ['Scheinliste, jüngste zuerst', 'work_sheets_betrieb_angelegt',
      `select * from public.work_sheets where company_id = 'x' order by created_at desc limit 100`],
  ];

  for (const [was, index, sql, vorbereitung] of faelle) {
    it(`${was} nimmt ${index}`, async () => {
      expect(await plan(sql, vorbereitung)).toContain(index);
    });
  }
});
