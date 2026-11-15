/**
 * „NICHT VERRECHNET“ ÜBER ALLE SCHEINE (Durchsicht 15.11.2026, P3) —
 * `scheine_unverrechnet` aus
 * `supabase/migrations/20261116010100_scheine_unverrechnet.sql`.
 *
 * Gegenprobe: vorher suchten Startseite, Rechnungen und Scheinliste nur
 * unter den 60 zuletzt angelegten Scheinen (`UNVERRECHNET_BASIS`). Der Test
 * „der 61. von hinten“ ist ohne die Funktion nicht zu bestehen — der älteste
 * Schein stand in keiner der drei Listen. Die übrigen Fälle halten fest, dass
 * die Regeln dieselben geblieben sind (Storno gibt frei, nur Unterschriebenes,
 * Pauschale wie die Vorschau, Rechte).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { pauschaleVerrechnetMit } from '@/features/invoices/pauschale';
import type { Invoice } from '@/types';

const B = 'scheine-unverr-a';
const FREMD = 'scheine-unverr-b';
let buch: Konto;
let chef: Konto;
let leitung: Konto;
let monteur: Konto;
let fremd: Konto;
let laufend = 9500;

async function schein(datum: string, p: { status?: string; nummer?: string; betrieb?: string } = {}): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await admin.from('work_sheets').insert({
    id, company_id: p.betrieb ?? B, project_number: p.nummer ?? 'SU-REGIE', customer_name: 'Familie Huber',
    datum, status: p.status ?? 'Unterschrieben', abrechnung: 'Regie', erstellt_von_uid: monteur.uid, erstellt_von_name: 'Max',
  });
  if (error) throw new Error(error.message);
  return id;
}

/*
  DER LEISTUNGSZEITRAUM IST EIN TAG (15.10.), wenn nichts anderes verlangt ist.
  Sonst deckte eine gültige Rechnung mit verknüpftem Schein über die Regel
  „Schein ohne Material im abgerechneten Zeitraum“ (A1, `inAbgerechnetemZeitraum`)
  jeden früheren Schein der Baustelle — dieselbe Regel prüft der eigene Fall unten.
*/
async function rechnung(nummer: string, p: { art?: string; status?: string; scheine?: string[]; von?: string | null; bis?: string } = {}): Promise<string> {
  const id = crypto.randomUUID();
  laufend += 1;
  const { error } = await admin.from('invoices').insert({
    id, company_id: B, invoice_number: `RE-2026-${laufend}`, project_number: nummer, customer_name: 'Familie Huber',
    invoice_date: '2026-10-15', due_date: '2026-10-29', total_netto: 100, total_vat: 20, total_brutto: 120,
    payment_status: p.status ?? 'Offen', art: p.art ?? 'einzel',
    leistung_von: p.von === undefined ? '2026-10-15' : p.von, leistung_bis: p.bis ?? '2026-10-15',
    ...(p.status === 'Storniert' ? { cancellation_note: 'Prüfung' } : {}),
  });
  if (error) throw new Error(error.message);
  if (p.scheine?.length) {
    const { error: f } = await admin.from('invoice_coverage').insert(
      p.scheine.map((ziel_id) => ({ company_id: B, invoice_id: id, art: 'work_sheet', ziel_id })),
    );
    if (f) throw new Error(f.message);
  }
  return id;
}

const liste = async (k: Konto = buch) => {
  const { data, error } = await k.client.rpc('scheine_unverrechnet');
  if (error) throw error;
  return (data ?? []) as { id: string; project_number: string; customer_name: string; datum: string; abrechnung: string }[];
};

async function aufraeumen() {
  await admin.from('invoice_coverage').delete().eq('company_id', B);
  await admin.from('invoices').delete().eq('company_id', B);
  await admin.from('work_sheets').delete().in('company_id', [B, FREMD]);
  await admin.from('projects').delete().eq('company_id', B);
}

beforeAll(async () => {
  await betriebAnlegen(B);
  await betriebAnlegen(FREMD);
  buch = await konto(B, 'Buchhaltung', 'su-buch');
  chef = await konto(B, 'Geschäftsführung', 'su-chef');
  leitung = await konto(B, 'Projektleiter', 'su-pl');
  monteur = await konto(B, 'Mitarbeiter', 'su-mon');
  fremd = await konto(FREMD, 'Buchhaltung', 'su-fremd');
}, 120_000);

beforeEach(aufraeumen);
afterAll(aufraeumen);

describe('über alle Scheine', () => {
  it('der 61. von hinten: der älteste unverrechnete Schein steht in der Liste — vorne', async () => {
    const aeltester = await schein('2026-06-01');
    // 65 jüngere, später angelegte Scheine — sie hätten den ältesten aus den „60 jüngsten“ gedrängt.
    const juengere = Array.from({ length: 65 }, (_, i) => ({
      id: crypto.randomUUID(), company_id: B, project_number: 'SU-REGIE', customer_name: 'Familie Huber',
      datum: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`, status: 'Unterschrieben', abrechnung: 'Regie',
      erstellt_von_uid: monteur.uid, erstellt_von_name: 'Max',
    }));
    const { error } = await admin.from('work_sheets').insert(juengere);
    if (error) throw new Error(error.message);
    const l = await liste();
    expect(l).toHaveLength(66);
    expect(l[0]).toEqual({
      id: aeltester, project_number: 'SU-REGIE', customer_name: 'Familie Huber', datum: '2026-06-01', abrechnung: 'Regie',
    });
    // Älteste zuerst.
    expect(l.map((z) => z.datum)).toEqual([...l.map((z) => z.datum)].sort());
  });

  it('dieselbe Antwort für Buchhaltung und Geschäftsführung', async () => {
    await schein('2026-09-01');
    expect((await liste(chef)).length).toBe(1);
    expect((await liste(buch)).length).toBe(1);
  });
});

describe('dieselben Regeln wie bisher', () => {
  it('nur Unterschriebenes; eine gültige Rechnung verrechnet, ein Storno gibt frei', async () => {
    const offen = await schein('2026-09-01');
    const verrechnet = await schein('2026-09-02');
    const freigegeben = await schein('2026-09-03');
    await schein('2026-09-04', { status: 'Entwurf' });
    await schein('2026-09-05', { status: 'Storniert' });
    await schein('2026-09-06', { status: 'Verworfen' });
    await rechnung('SU-REGIE', { scheine: [verrechnet] });
    await rechnung('SU-REGIE', { scheine: [freigegeben], status: 'Storniert' });
    expect((await liste()).map((z) => z.id)).toEqual([offen, freigegeben]);
  });

  it('ein Schein ohne Material im Zeitraum einer Rechnung, die Belege verbraucht hat: verrechnet (A1) — mit Material nicht', async () => {
    const imZeitraum = await schein('2026-09-10');
    const davor = await schein('2026-08-31');
    // Material kommt nur auf einen Entwurf; unterschrieben ist der Schein danach.
    const mitMaterial = await schein('2026-09-12', { status: 'Entwurf' });
    expect((await admin.from('work_sheet_material').insert({
      work_sheet_id: mitMaterial, company_id: B, name: 'Therme', menge: 1, position: 0,
    })).error).toBeNull();
    expect((await admin.from('work_sheets').update({ status: 'Unterschrieben' }).eq('id', mitMaterial)).error).toBeNull();
    const beleg = await schein('2026-09-20');
    await rechnung('SU-REGIE', { scheine: [beleg], von: '2026-09-01', bis: '2026-09-30' });
    expect((await liste()).map((z) => z.id)).toEqual([davor, mitMaterial]);
    void imZeitraum;
  });

  it('Pauschale: dieselbe Bedingung wie die Vorschau (`pauschaleVerrechnetMit`)', async () => {
    await admin.from('projects').insert({
      company_id: B, project_number: 'PR-SU-PAUSCH', customer_name: 'Familie Huber', status: 'Aktiv', billing_mode: 'Pauschal',
    });
    const faelle: Array<[string, string]> = [
      ['einzel', 'Bezahlt'], ['schluss', 'Offen'], ['anzahlung', 'Offen'], ['teil', 'Offen'],
      ['schluss', 'Storniert'], ['einzel', 'Teilbezahlt'],
    ];
    for (const [art, status] of faelle) {
      await admin.from('invoice_coverage').delete().eq('company_id', B);
      await admin.from('invoices').delete().eq('company_id', B);
      await admin.from('work_sheets').delete().eq('company_id', B);
      const s = await schein('2026-10-20', { nummer: 'SU-PAUSCH' });
      await rechnung('su-pausch', { art, status });
      const vorschau = pauschaleVerrechnetMit(
        [{ projectNumber: 'su-pausch', invoiceNumber: 'RE-1', art, paymentStatus: status } as Invoice], 'PR-SU-PAUSCH',
      ) !== null;
      const inListe = (await liste()).some((z) => z.id === s);
      expect(inListe, `${art} ${status}`).toBe(!vorschau);
    }
  });

  it('nur der eigene Betrieb', async () => {
    await schein('2026-09-01', { betrieb: FREMD });
    expect(await liste()).toEqual([]);
    expect(await liste(fremd)).toHaveLength(1);
  });
});

describe('wer fragen darf', () => {
  it('ohne Rechnungsrecht ein Fehler statt einer leeren Liste („alles verrechnet“ wäre falsch)', async () => {
    await schein('2026-09-01');
    for (const k of [leitung, monteur]) {
      const { error } = await k.client.rpc('scheine_unverrechnet');
      expect(error?.code).toBe('42501');
      expect((await k.client.rpc('scheine_verrechnet', { p_ids: [crypto.randomUUID()] })).error?.code).toBe('42501');
    }
  });
});
