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
    /*
      ZURÜCKGEROLLT IST NICHT ALLES: `analyze` schreibt die Zeilenzahl der
      Tabelle (`pg_class.reltuples`) an Ort und Stelle, nicht in der
      Transaktion. Ohne neue Messung hielte der Planer die Tabelle für den
      nächsten Fall noch für 2.000 Zeilen groß — und entschiede dort anders.
    */
    if (vorbereitung) {
      for (const tabelle of vorbereitung.matchAll(/analyze (public\.\w+)/g)) await db.query(`analyze ${tabelle[1]}`);
    }
  }
}

describe('Indizes für Wachstum', () => {
  const katalog = `
    insert into public.companies (id, name) values ('iw-katalog', 'Katalog') on conflict do nothing;
    set local session_replication_role = replica;
    insert into public.materials (company_id, name, article_number, stock)
      select 'iw-katalog', 'Artikel ' || i, 'K-' || i, 0 from generate_series(1, 2000) i;
    analyze public.materials;`;
  /*
    DIE RECHNUNGSFÄLLE MIT EIGENEM BESTAND (06.11.2026). Ohne Zeilen des
    Betriebs entschied der Planer zwischen `invoices_betrieb_angelegt` und
    `invoices_baustelle` nach dem, was andere Prüfungen gerade in `invoices`
    liegen hatten — je nach Reihenfolge des Laufs, mal so, mal so. 2.000
    Rechnungen auf 200 Baustellen und 100 Kunden geben ihm, was ein
    wachsender Betrieb hat; mit dem Zurückrollen sind sie wieder weg.
  */
  const rechnungen = `
    insert into public.companies (id, name) values ('iw-rechnung', 'Rechnung') on conflict do nothing;
    set local session_replication_role = replica;
    insert into public.invoices (company_id, invoice_number, project_number, project_id, customer_id, customer_name,
                                 invoice_date, due_date, total_netto, total_vat, total_brutto, payment_status, created_at)
      select 'iw-rechnung', 'RE-' || i, 'PR-2026-' || (i % 200), md5('p' || (i % 200))::uuid, md5('k' || (i % 100))::uuid,
             'Kunde', current_date, current_date + 14, 100, 20, 120, 'Offen', now() - make_interval(mins => i)
        from generate_series(1, 2000) i;
    analyze public.invoices;`;
  const faelle: [string, string, string, string?][] = [
    ['DATANORM: Artikel des Betriebs nach Artikelnummer', 'materials_artikelnummer',
      `select * from public.materials m where m.company_id = 'iw-katalog' and m.article_number = 'K-17'`, katalog],
    ['Frei im Lager: Zusagen eines Artikels', 'material_orders_artikel',
      `select coalesce(sum(o.quantity), 0) from public.material_orders o
        where o.material_id = '${ID}' and o.transaction_type = 'order' and not o.processed`],
    ['Frei im Lager: Rüstlisten eines Artikels', 'einsatz_material_positionen_artikel',
      `select coalesce(sum(p.menge), 0) from public.einsatz_material_positionen p where p.material_id = '${ID}'`],
    ['Rechnungsliste, jüngste zuerst', 'invoices_betrieb_angelegt',
      `select * from public.invoices where company_id = 'iw-rechnung' order by created_at desc limit 50`, rechnungen],
    ['Rechnungen einer Baustelle', 'invoices_baustelle',
      `select * from public.invoices where company_id = 'iw-rechnung' and project_number in ('2026-1', 'PR-2026-1')`, rechnungen],
    ['Kundenakte: Rechnungen nach Kunde', 'invoices_kunde',
      `select * from public.invoices where company_id = 'iw-rechnung' and customer_id = '${ID}'`, rechnungen],
    ['Kundenakte: Rechnungen nach Baustelle des Kunden', 'invoices_baustelle_id',
      `select * from public.invoices where company_id = 'iw-rechnung' and project_id in ('${ID}')`, rechnungen],
    ['Scheinliste, jüngste zuerst', 'work_sheets_betrieb_angelegt',
      `select * from public.work_sheets where company_id = 'x' order by created_at desc limit 100`],
  ];

  for (const [was, index, sql, vorbereitung] of faelle) {
    it(`${was} nimmt ${index}`, async () => {
      expect(await plan(sql, vorbereitung)).toContain(index);
    });
  }
});
