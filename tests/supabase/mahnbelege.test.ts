import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { createInvoice } from '@/lib/db/pg/invoices';
import { listMahnbelegStufen } from '@/lib/db/pg/mahnbelege';

const BETRIEB = 'mahnarchiv';
const PDF = Buffer.from('%PDF-1.4\nOriginalbeleg\n%%EOF').toString('base64');
let buch: Konto, chef: Konto, monteur: Konto, fremd: Konto;
let kunde = '', folge = 0;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(`${BETRIEB}-fremd`);
  buch = await konto(BETRIEB, 'Buchhaltung', 'mahnbuch');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'mahnchef');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'mahnmont');
  fremd = await konto(`${BETRIEB}-fremd`, 'Buchhaltung', 'mahnfremd');
  const { data, error } = await admin.from('customers').insert({
    company_id: BETRIEB, name: 'Familie Original', kundenart: 'privat',
    address: 'Ring 1, 1010 Wien', plz: '1010', ort: 'Wien',
  }).select('id').single();
  if (error) throw error;
  kunde = data!.id;
});
afterAll(() => clientEinreichen(null));

async function rechnung() {
  clientEinreichen(buch.client);
  const daten: Parameters<typeof createInvoice>[1] & { customerId: string } = {
    customerId: kunde, invoiceNumber: `RE-2026-${String(++folge).padStart(4, '0')}`,
    projectNumber: 'B-1', customerName: 'Familie Original', address: 'Ring 1, 1010 Wien',
    invoiceDate: '2026-01-01', dueDate: '2026-01-15', totalNetto: 100, totalVat: 20,
    totalBrutto: 120, vatRate: 0.2, paymentStatus: 'Offen',
    positions: [{ label: 'Arbeit', qty: 1, unit: 'h', unitPrice: 100, netto: 100 }],
  };
  return createInvoice(BETRIEB, daten);
}

const args = (id: string) => ({ p_id: id, p_stufe: 1, p_tag: '2026-02-01',
  p_frist: '2026-02-15', p_spesen: 0, p_pdf_base64: PDF });

describe('Originalmahnungen und Mahnstand gehören zusammen', () => {
  it('speichert dieselben PDF-Bytes und den Mahnstand gemeinsam', async () => {
    const id = await rechnung();
    const r = await buch.client.rpc('mahnung_mit_beleg_festhalten', args(id));
    expect(r.error).toBeNull();
    const gespeichert = await buch.client.from('mahnbelege').select('*').eq('id', r.data).single();
    expect(gespeichert.error).toBeNull();
    expect(gespeichert.data).toMatchObject({ invoice_id: id, stufe: 1, datum: '2026-02-01', pdf_base64: PDF });
    expect((await buch.client.from('invoices').select('mahnstufe,payment_status').eq('id', id).single()).data)
      .toMatchObject({ mahnstufe: 1, payment_status: 'Überfällig' });
  });

  it('erzeugt bei Wiederholung oder gleichzeitigen Aufrufen nur einen Beleg', async () => {
    const id = await rechnung();
    const rs = await Promise.all([1, 2].map(() => buch.client.rpc('mahnung_mit_beleg_festhalten', args(id))));
    expect(rs.map((r) => r.error)).toEqual([null, null]);
    expect(rs[0].data).toBe(rs[1].data);
    expect((await buch.client.from('mahnbelege').select('id').eq('invoice_id', id)).data).toHaveLength(1);
    const geaendert = await buch.client.rpc('mahnung_mit_beleg_festhalten', { ...args(id), p_spesen: 5 });
    expect(geaendert.error?.code).toBe('40001');
  });

  it('lässt bei ungültigem PDF weder einen Beleg noch einen Mahnstand zurück', async () => {
    const id = await rechnung();
    const r = await buch.client.rpc('mahnung_mit_beleg_festhalten', { ...args(id), p_pdf_base64: Buffer.from('kein PDF').toString('base64') });
    expect(r.error).not.toBeNull();
    expect((await buch.client.from('invoices').select('mahnstufe').eq('id', id).single()).data?.mahnstufe ?? 0).toBe(0);
    expect((await buch.client.from('mahnbelege').select('id').eq('invoice_id', id)).data).toEqual([]);
  });

  it('nimmt keine fremde Rechnung an und zeigt fremde Originale nicht', async () => {
    const id = await rechnung();
    expect((await buch.client.rpc('mahnung_mit_beleg_festhalten', args(id))).error).toBeNull();
    expect((await fremd.client.rpc('mahnung_mit_beleg_festhalten', args(id))).error?.code).toBe('P0002');
    expect((await fremd.client.from('mahnbelege').select('id').eq('invoice_id', id)).data).toEqual([]);
    expect((await monteur.client.rpc('mahnung_mit_beleg_festhalten', args(id))).error?.code).toBe('42501');
  });

  it('rollt das Original zurück, wenn erst das Fortschreiben der Rechnung scheitert', async () => {
    const id = await rechnung();
    const db = new Client({ connectionString: process.env.SUPABASE_DB_URL
      ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
    await db.connect();
    try {
      await db.query(`create function public.audit_mahnabbruch() returns trigger language plpgsql as $$
        begin if new.company_id = 'mahnarchiv' and new.mahnstufe = 1 then
          raise exception 'Gezielter Abbruch nach dem Speichern des Originals'; end if; return new; end $$`);
      await db.query(`create trigger audit_mahnabbruch before update on public.invoices
        for each row execute function public.audit_mahnabbruch()`);
      const r = await buch.client.rpc('mahnung_mit_beleg_festhalten', args(id));
      expect(r.error?.message).toContain('Gezielter Abbruch');
      expect((await buch.client.from('mahnbelege').select('id').eq('invoice_id', id)).data).toEqual([]);
      expect((await buch.client.from('invoices').select('mahnstufe').eq('id', id).single()).data?.mahnstufe ?? 0).toBe(0);
    } finally {
      await db.query('drop trigger if exists audit_mahnabbruch on public.invoices');
      await db.query('drop function if exists public.audit_mahnabbruch()');
      await db.end();
    }
  });

  it('lädt nur Stufen der ausgewählten Rechnungen, keine übrige Historie oder PDF-Inhalte', async () => {
    const id = await rechnung();
    const r = await buch.client.rpc('mahnung_mit_beleg_festhalten', args(id));
    expect(r.error).toBeNull();
    clientEinreichen(buch.client);
    const stufen = await listMahnbelegStufen(BETRIEB, [id]);
    expect(stufen).toEqual([{ id: r.data,
      invoiceNumber: (await buch.client.from('invoices').select('invoice_number').eq('id', id).single()).data!.invoice_number,
      stufe: 1 }]);
    expect(await listMahnbelegStufen(BETRIEB, [])).toEqual([]);
  });

  it('erlaubt keine direkte Anlage, Änderung oder Löschung durch die Buchhaltung', async () => {
    const id = await rechnung();
    const r = await buch.client.rpc('mahnung_mit_beleg_festhalten', args(id));
    expect(r.error).toBeNull();
    expect((await buch.client.from('mahnbelege').insert({ company_id: BETRIEB,
      invoice_id: id, invoice_number: 'unzulässig', stufe: 2, datum: '2026-02-01',
      frist: '2026-02-15', spesen: 0, pdf_base64: PDF })).error?.code).toBe('42501');
    expect((await buch.client.from('mahnbelege').update({ spesen: 99 }).eq('id', r.data)).error?.code).toBe('42501');
    expect((await buch.client.from('mahnbelege').delete().eq('id', r.data)).error?.code).toBe('42501');
  });

  it('gehört zur Kundenauskunft, Aufbewahrung und vollständigen Sicherung', async () => {
    const id = await rechnung();
    const r = await buch.client.rpc('mahnung_mit_beleg_festhalten', args(id));
    expect(r.error).toBeNull();
    const auskunft = await chef.client.rpc('person_auskunft', { p_art: 'kunde', p_id: kunde });
    expect(auskunft.error).toBeNull();
    expect(auskunft.data.daten.mahnbelege.map((m: { id: string }) => m.id)).toContain(r.data);
    const pruefung = await chef.client.rpc('person_loeschen', { p_art: 'kunde', p_id: kunde, p_nur_pruefen: true });
    expect(pruefung.error).toBeNull();
    expect(pruefung.data.aufbewahren).toContainEqual(expect.objectContaining({ was: 'Originalmahnungen', bis: '2033-12-31' }));
    const auszug = await chef.client.rpc('betrieb_auszug');
    expect(auszug.error).toBeNull();
    expect(JSON.stringify(auszug.data)).toContain(PDF);
  });
});
