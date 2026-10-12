/**
 * Eine Anforderung nachträglich als eilig markieren (12.10.2026, Plan 17 F)
 * — gegen die echte Datenbank.
 *
 * Wer: der Besteller (auch wenn das Lager sie schon in Arbeit hat), das
 * Lager, die Führung. Wann: offen oder in Arbeit, mit Baustelle, keine
 * Retoure. Die Meldung prüft `push.test.ts`.
 *
 * Gegenprobe: ohne `20261012100000_anforderung_eilig.sql` gibt es die
 * Funktion nicht (rot). Gleich bleibt: ändern darf der Besteller eine
 * Anforderung in Arbeit sonst weiterhin nicht.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'eil-a';
const ANDERER = 'eil-b';
const BAUSTELLE = 'B-EIL-1';

let monteur: Konto;
let kollege: Konto;
let verwaltung: Konto;
let buch: Konto;
let leitung: Konto;
let fremd: Konto;

async function anforderung(rest: Record<string, unknown> = {}): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await admin.from('material_orders').insert({
    id, company_id: BETRIEB, material_name: 'Kupferrohr 15mm', quantity: 2,
    project_number: BAUSTELLE, status: 'Offen', transaction_type: 'order',
    is_urgent: false, user_id: monteur.uid, user_name: 'Max', ...rest,
  });
  if (error) throw new Error(error.message);
  return id;
}

const eilig = (wer: Konto, id: string, wert = true) =>
  wer.client.rpc('anforderung_eilig_setzen', { p_id: id, p_eilig: wert });

async function istEilig(id: string): Promise<boolean> {
  const { data } = await admin.from('material_orders').select('is_urgent').eq('id', id).single();
  return (data as { is_urgent: boolean }).is_urgent;
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(ANDERER);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'eilmont');
  kollege = await konto(BETRIEB, 'Mitarbeiter', 'eilkoll');
  verwaltung = await konto(BETRIEB, 'Verwaltung', 'eilverw');
  buch = await konto(BETRIEB, 'Buchhaltung', 'eilbuch');
  leitung = await konto(BETRIEB, 'Projektleiter', 'eilpl');
  fremd = await konto(ANDERER, 'Geschäftsführung', 'eilfremd');
  const { error } = await admin.from('projects').insert({
    company_id: BETRIEB, project_number: BAUSTELLE, customer_name: 'Familie Huber', status: 'Aktiv',
  });
  if (error) throw new Error(error.message);
}, 180_000);

describe('Nachträglich eilig: wer', () => {
  it('der Besteller — auch wenn das Lager sie schon in Arbeit hat', async () => {
    const offen = await anforderung();
    expect((await eilig(monteur, offen)).error).toBeNull();
    expect(await istEilig(offen)).toBe(true);

    const inArbeit = await anforderung({ status: 'In Bearbeitung' });
    expect((await eilig(monteur, inArbeit)).error).toBeNull();
    expect(await istEilig(inArbeit)).toBe(true);
  });

  it('gleich geblieben: sonst ändern darf er eine Anforderung in Arbeit nicht', async () => {
    const inArbeit = await anforderung({ status: 'In Bearbeitung' });
    const { error } = await monteur.client.from('material_orders').update({ quantity: 5 }).eq('id', inArbeit);
    expect(error?.code).toBe('42501');
  });

  it('das Lager und die Führung, in beide Richtungen', async () => {
    const id = await anforderung();
    expect((await eilig(verwaltung, id)).error).toBeNull();
    expect(await istEilig(id)).toBe(true);
    expect((await eilig(leitung, id, false)).error).toBeNull();
    expect(await istEilig(id)).toBe(false);
  });

  it('nicht ein Kollege, nicht die Buchhaltung, nicht ein anderer Betrieb', async () => {
    const id = await anforderung();
    for (const wer of [kollege, buch, fremd]) {
      expect((await eilig(wer, id)).error?.code).toBe('42501');
    }
    expect(await istEilig(id)).toBe(false);
  });
});

describe('Nachträglich eilig: wann', () => {
  it('nicht mehr, wenn sie abholbereit oder erledigt ist', async () => {
    for (const status of ['Abholbereit', 'Erledigt']) {
      const id = await anforderung({ status });
      const { error } = await eilig(verwaltung, id);
      expect(error?.message).toMatch(/schon abholbereit oder erledigt/);
      expect(await istEilig(id)).toBe(false);
    }
  });

  it('nur mit Baustelle — „nicht mehr eilig“ geht auch ohne', async () => {
    const id = await anforderung({ project_number: null });
    expect((await eilig(verwaltung, id)).error?.message).toMatch(/nur mit Baustelle/);
    expect((await eilig(verwaltung, id, false)).error).toBeNull();
  });

  it('eine Rückgabe ist nie eilig', async () => {
    const id = await anforderung({ transaction_type: 'return', condition: 'neuwertig' });
    expect((await eilig(verwaltung, id)).error?.message).toMatch(/Rückgabe/);
  });
});
