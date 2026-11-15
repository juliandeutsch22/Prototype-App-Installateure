/**
 * „NEU EINGEGANGEN“ (Durchsicht 15.11.2026, V9) — `scheine_neu` und
 * `scheine_gesehen` aus
 * `supabase/migrations/20261116010900_scheine_neu_eingegangen.sql`.
 *
 * Gegenprobe: ohne die Migration gibt es weder die beiden Funktionen noch
 * den Merker `user_prefs.scheine_gesehen_bis` — Projektleitung und
 * Verwaltung erfuhren von einem unterschriebenen Schein nur, wenn sie die
 * Liste von sich aus öffneten. „Bleibt gleich“: die Meldungsvorgaben einer
 * Person ändert das Ansehen nicht; wer noch keine hat, bekommt die der App
 * (alle an), nicht die drei „aus“ der Spaltenvorgaben.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin, ANON, API, betriebAnlegen, konto, type Konto } from './helfer';

const B = 'scheine-neu-a';
const FREMD = 'scheine-neu-b';
let leitung: Konto;
let verwaltung: Konto;
let monteur: Konto;
let fremd: Konto;

const vor = (tage: number) => new Date(Date.now() - tage * 86_400_000).toISOString();

async function schein(p: { von?: Konto; am?: string; status?: string; betrieb?: string; kunde?: string } = {}): Promise<string> {
  const id = crypto.randomUUID();
  const von = p.von ?? monteur;
  const status = p.status ?? 'Unterschrieben';
  const { error } = await admin.from('work_sheets').insert({
    id, company_id: p.betrieb ?? B, project_number: 'SN-1', customer_name: p.kunde ?? 'Familie Huber',
    datum: '2026-11-10', status, abrechnung: 'Regie', erstellt_von_uid: von.uid, erstellt_von_name: 'Max',
    unterschrieben_am: status === 'Unterschrieben' ? (p.am ?? vor(1)) : null,
  });
  if (error) throw new Error(error.message);
  return id;
}

const neu = async (k: Konto) => {
  const { data, error } = await k.client.rpc('scheine_neu');
  if (error) throw error;
  return ((data ?? []) as { id: string }[]).map((z) => z.id);
};

async function aufraeumen() {
  await admin.from('work_sheets').delete().in('company_id', [B, FREMD]);
  await admin.from('user_prefs').delete().in('company_id', [B, FREMD]);
}

beforeAll(async () => {
  await betriebAnlegen(B);
  await betriebAnlegen(FREMD);
  leitung = await konto(B, 'Projektleiter', 'sn-pl');
  verwaltung = await konto(B, 'Verwaltung', 'sn-verw');
  monteur = await konto(B, 'Mitarbeiter', 'sn-mon');
  fremd = await konto(FREMD, 'Projektleiter', 'sn-fremd');
}, 120_000);

beforeEach(aufraeumen);
afterAll(aufraeumen);

describe('scheine_neu', () => {
  it('beim ersten Mal: die unterschriebenen der letzten sieben Tage, neueste zuerst — ohne die eigenen', async () => {
    const gestern = await schein({ am: vor(1) });
    const vorDrei = await schein({ am: vor(3) });
    await schein({ am: vor(10) });
    await schein({ von: leitung, am: vor(1) });
    await schein({ status: 'Entwurf' });
    await schein({ betrieb: FREMD, von: fremd });
    expect(await neu(leitung)).toEqual([gestern, vorDrei]);
  });

  it('gibt nur den Kopf und den Zeitpunkt', async () => {
    await schein({ kunde: 'Familie Frisch' });
    const { data } = await verwaltung.client.rpc('scheine_neu');
    expect(Object.keys((data as object[])[0]).sort())
      .toEqual(['customer_name', 'datum', 'erstellt_von_name', 'id', 'project_number', 'unterschrieben_am']);
  });

  it('nach dem Ansehen: nur, was danach unterschrieben wurde — je Person', async () => {
    await schein({ am: vor(1) });
    expect((await leitung.client.rpc('scheine_gesehen')).error).toBeNull();
    expect(await neu(leitung)).toEqual([]);
    // Die Verwaltung hat noch nicht angesehen: für sie bleibt er neu.
    expect(await neu(verwaltung)).toHaveLength(1);

    const spaeter = await schein({ am: new Date(Date.now() + 60_000).toISOString() });
    expect(await neu(leitung)).toEqual([spaeter]);
  });

  it('ein fremder Betrieb sieht die Scheine nicht', async () => {
    await schein();
    expect(await neu(fremd)).toEqual([]);
  });

  it('ohne Anmeldung keine Antwort', async () => {
    const anon = createClient(API, ANON, { auth: { persistSession: false } });
    expect((await anon.rpc('scheine_neu')).error).not.toBeNull();
    expect((await anon.rpc('scheine_gesehen')).error).not.toBeNull();
  });
});

describe('scheine_gesehen und die Meldungsvorgaben', () => {
  it('ohne Vorgaben entstehen sie mit allen Meldungen an', async () => {
    expect((await monteur.client.rpc('scheine_gesehen')).error).toBeNull();
    const { data } = await admin.from('user_prefs')
      .select('company_id, scheine_gesehen_bis, notify_new_order, notify_order_ready, notify_urgent_delivery')
      .eq('user_id', monteur.uid).single();
    expect(data).toMatchObject({ company_id: B, notify_new_order: true, notify_order_ready: true, notify_urgent_delivery: true });
    expect(data?.scheine_gesehen_bis).not.toBeNull();
  });

  it('bleibt gleich: vorhandene Vorgaben ändert das Ansehen nicht', async () => {
    await admin.from('user_prefs').insert({
      user_id: leitung.uid, company_id: B, notify_new_order: false, notify_order_ready: true, notify_urgent_delivery: false,
    });
    expect((await leitung.client.rpc('scheine_gesehen')).error).toBeNull();
    const { data } = await admin.from('user_prefs')
      .select('notify_new_order, notify_order_ready, notify_urgent_delivery, scheine_gesehen_bis')
      .eq('user_id', leitung.uid).single();
    expect(data).toMatchObject({ notify_new_order: false, notify_order_ready: true, notify_urgent_delivery: false });
    expect(data?.scheine_gesehen_bis).not.toBeNull();
  });
});
