import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { admin, betriebAnlegen, einblickBeginnen, konto, plattformkonto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { createQuote, getQuote, updateQuote } from '@/lib/db/pg/quotes';
import { createProject } from '@/lib/db/pg/projects';
import { angebotAnnehmen } from '@/features/quotes/angebotAnnehmen';
import type { Quote } from '@/types';
import type { WithId } from '@/lib/db/core';

const BETRIEB = 'audit-annahme';
let chef: Konto;
let db: Client;
let q: WithId<Quote>;
let nummer = 0;
let kunde: string;
let plattform: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chef = await konto(BETRIEB, 'Geschäftsführung', 'annahme');
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL
    ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();
  const k = await db.query(`insert into public.customers (company_id, name)
    values ($1, 'Kunde') returning id`, [BETRIEB]);
  kunde = k.rows[0].id;
});

beforeEach(async () => {
  clientEinreichen(chef.client);
  const id = await createQuote(BETRIEB, {
    quoteNumber: `AN-2026-${++nummer}`, customerId: kunde, customerName: 'Kunde', address: 'Baustelle',
    quoteDate: '2026-10-08', validUntil: '2026-11-08', status: 'Versendet', positions: [],
    subtotalNetto: 100, totalNetto: 100, totalVat: 20, totalBrutto: 120,
    vatRate: 0.2, kalkulierteStunden: 12, notes: ' \t\nHeizung tauschen\n\t\u00a0',
  });
  q = (await getQuote(BETRIEB, id))!;
});

afterAll(async () => {
  clientEinreichen(null);
  await admin.from('support_zugriffe').delete().eq('company_id', BETRIEB);
  await admin.from('support_freigaben').delete().eq('company_id', BETRIEB);
  await db?.query('drop trigger if exists audit_annahme_abbruch on public.quotes');
  await db?.query('drop function if exists public.audit_annahme_abbruch()');
  await db?.end();
});

describe('Angebot und Baustelle werden gemeinsam angenommen', () => {
  it('legt bei gleichzeitiger Annahme derselben geladenen Fassung nur eine Baustelle an', async () => {
    const vorher = await admin.from('projects').select('id', { count: 'exact' }).eq('company_id', BETRIEB);
    const [a, b] = await Promise.all([
      angebotAnnehmen(BETRIEB, q, 'B', 'Regie'),
      angebotAnnehmen(BETRIEB, q, 'B', 'Regie'),
    ]);
    expect(a.projectNumber).toBe(b.projectNumber);
    const nachher = await admin.from('projects').select('*', { count: 'exact' }).eq('company_id', BETRIEB);
    expect(nachher.count).toBe((vorher.count ?? 0) + 1);
    const p = nachher.data!.find((p) => p.project_number === a.projectNumber)!;
    expect(p.billing_mode).toBe('Regie');
    expect(p.customer_id).toBe(kunde);
    expect(p.customer_name).toBe('Kunde');
    expect(p.address).toBe('Baustelle');
    expect(p.status).toBe('Aktiv');
    expect(p.assigned_employees).toEqual([]);
    expect(p.project_managers).toEqual([]);
    expect(Number(p.estimated_hours)).toBe(12);
    expect(p.description).toBe(`Heizung tauschen\n\nAus Angebot ${q.quoteNumber}`);
    expect((await getQuote(BETRIEB, q.id))?.projectId).toBe(p.id);
  });

  it('findet bei Wiederholung mit einem unveränderten Browserobjekt dieselbe Baustelle', async () => {
    const a = await angebotAnnehmen(BETRIEB, q, 'B');
    const b = await angebotAnnehmen(BETRIEB, q, 'B');
    expect(b).toEqual(a);
  });

  it('übernimmt ohne Anmerkungen nur den Verweis, ohne Arbeitszeit kein Budget', async () => {
    const id = await createQuote(BETRIEB, {
      ...q, quoteNumber: `${q.quoteNumber}-Z`, notes: ' \t\n\u00a0\ufeff', kalkulierteStunden: 0,
    });
    const neu = (await getQuote(BETRIEB, id))!;
    const r = await angebotAnnehmen(BETRIEB, neu, '', 'Einheitspreis');
    expect(r.projectNumber).toMatch(/^\d{4}-\d{4,}$/);
    const { data } = await admin.from('projects').select('*').eq('company_id', BETRIEB)
      .eq('project_number', r.projectNumber).single();
    expect(data?.description).toBe(`Aus Angebot ${neu.quoteNumber}`);
    expect(data?.estimated_hours).toBeNull();
    expect(data?.billing_mode).toBe('Einheitspreis');
  });

  it('übernimmt den aktuellen gespeicherten Auftrag statt veralteter Browserwerte', async () => {
    const alt = { ...q, notes: 'Überholt', kalkulierteStunden: 999, customerName: 'Überholt' };
    const r = await angebotAnnehmen(BETRIEB, alt, 'B');
    const { data } = await admin.from('projects').select('*').eq('company_id', BETRIEB)
      .eq('project_number', r.projectNumber).single();
    expect(data?.customer_name).toBe('Kunde');
    expect(Number(data?.estimated_hours)).toBe(12);
    expect(data?.description).toBe(`Heizung tauschen\n\nAus Angebot ${q.quoteNumber}`);
  });

  it('findet die Baustelle aus einer früheren abgebrochenen Annahme und behält deren Daten', async () => {
    const id = await createProject(BETRIEB, {
      projectNumber: 'ALT-AUFTRAG', customerName: 'Kunde', status: 'Pausiert',
      billingMode: 'Regie', estimatedHours: 25, assignedEmployees: [], projectManagers: [],
    });
    await updateQuote(q.id, { projectNumber: 'ALT-AUFTRAG' });
    const r = await angebotAnnehmen(BETRIEB, q, 'B');
    expect(r.projectNumber).toBe('ALT-AUFTRAG');
    expect((await getQuote(BETRIEB, q.id))?.projectId).toBe(id);
    const { data } = await admin.from('projects').select('*').eq('id', id).single();
    expect(data?.status).toBe('Pausiert');
    expect(data?.billing_mode).toBe('Regie');
    expect(Number(data?.estimated_hours)).toBe(25);
  });

  it.each(['Projektleiter', 'Administrator'] as const)('erlaubt die Annahme weiterhin für %s', async (rolle) => {
    const k = await konto(BETRIEB, rolle, `annahme-${rolle}`);
    clientEinreichen(k.client);
    expect((await angebotAnnehmen(BETRIEB, q, 'B')).projectNumber).toMatch(/^B-\d{4}-\d{4,}$/);
  });

  it.each(['Mitarbeiter', 'Verwaltung', 'Buchhaltung'] as const)('erlaubt %s keine Annahme über die Schnittstelle', async (rolle) => {
    const k = await konto(BETRIEB, rolle, `annahme-${rolle}`);
    const { error } = await k.client.rpc('angebot_annehmen', { p_id: q.id, p_praefix: 'B' });
    expect(error?.code).toBe('42501');
    expect((await getQuote(BETRIEB, q.id))?.status).toBe('Versendet');
  });

  it('nimmt trotz bekannter Kennung kein Angebot eines fremden Betriebs an', async () => {
    await betriebAnlegen('audit-annahme-fremd');
    const fremd = await konto('audit-annahme-fremd', 'Geschäftsführung', 'fremd');
    const { error } = await fremd.client.rpc('angebot_annehmen', { p_id: q.id, p_praefix: 'B' });
    expect(error?.code).toBe('P0002');
    expect((await getQuote(BETRIEB, q.id))?.status).toBe('Versendet');
  });

  it.each(['ansehen', 'mitarbeiten'] as const)('beachtet die Supportfreigabe %s', async (stufe) => {
    plattform ??= await plattformkonto('audit-annahme');
    await admin.from('support_zugriffe').delete().eq('company_id', BETRIEB);
    await admin.from('support_freigaben').delete().eq('company_id', BETRIEB);
    const { data, error } = await chef.client.from('support_freigaben').insert({
      company_id: BETRIEB, gewaehrt_von: chef.uid, grund: 'Angebot prüfen', stufe,
      gilt_bis: new Date(Date.now() + 3_600_000).toISOString(),
    }).select('id').single();
    if (error) throw error;
    await einblickBeginnen(plattform, BETRIEB, data!.id);
    clientEinreichen(plattform.client);
    if (stufe === 'ansehen') {
      const { error: e } = await plattform.client.rpc('angebot_annehmen', { p_id: q.id, p_praefix: 'B' });
      expect(e?.code).toBe('42501');
    } else {
      expect((await angebotAnnehmen(BETRIEB, q, 'B')).projectNumber).toMatch(/^B-\d{4}-\d{4,}$/);
    }
  });

  it('gibt der neuen Funktion nur die erforderlichen Ausführungsrechte', async () => {
    const { rows } = await db.query(`select
      has_function_privilege('anon', 'public.angebot_annehmen(uuid,text,text)', 'execute') as anonym,
      has_function_privilege('authenticated', 'public.angebot_annehmen(uuid,text,text)', 'execute') as angemeldet,
      prosecdef, proconfig from pg_proc where oid = 'public.angebot_annehmen(uuid,text,text)'::regprocedure`);
    expect(rows[0]).toMatchObject({ anonym: false, angemeldet: true, prosecdef: true });
    expect(rows[0].proconfig).toContain('search_path=""');
  });

  it('rollt Baustelle, Nummer und Angebotsänderung bei einem Abbruch gemeinsam zurück', async () => {
    const vorher = await admin.from('number_counters').select('stand')
      .eq('company_id', BETRIEB).eq('art', 'projects');
    await db.query(`create function public.audit_annahme_abbruch() returns trigger
      language plpgsql as $$ begin
        if new.company_id = 'audit-annahme' and new.status = 'Angenommen' then
          raise exception 'Prüfabbruch beim Annehmen';
        end if;
        return new;
      end $$;
      create trigger audit_annahme_abbruch before update on public.quotes
      for each row execute function public.audit_annahme_abbruch()`);
    try {
      const bestand = await admin.from('projects').select('id', { count: 'exact' }).eq('company_id', BETRIEB);
      await expect(angebotAnnehmen(BETRIEB, q, 'B')).rejects.toThrow('Prüfabbruch');
      const danach = await admin.from('projects').select('id', { count: 'exact' }).eq('company_id', BETRIEB);
      expect(danach.count).toBe(bestand.count);
      expect((await getQuote(BETRIEB, q.id))?.projectNumber).toBeFalsy();
      const zaehler = await admin.from('number_counters').select('stand')
        .eq('company_id', BETRIEB).eq('art', 'projects');
      expect(zaehler.data).toEqual(vorher.data);
    } finally {
      await db.query('drop trigger audit_annahme_abbruch on public.quotes; drop function public.audit_annahme_abbruch()');
    }
  });
});
