/**
 * DAS FREIE IM LAGER JE GENANNTEM ARTIKEL (Analyse 09.10.2026, „Nebenbei
 * gefundene Lücken“; Migration `20261010100000_lager_frei_je_artikel.sql`).
 *
 * `lager_frei()` gab je Artikel des Betriebs eine Zeile ohne Reihenfolge, und
 * PostgREST deckelt auch Funktionsantworten bei 1.000 Zeilen. Jetzt fragt die
 * App nach den Artikeln, die sie zeigt, in Portionen unter der Grenze.
 *
 * Die Grenze selbst prüft `zeilengrenze.test.ts`. 1.001 Artikel stehen hier
 * nicht: `materials` ist veröffentlicht, und so viele Live-Ereignisse hielten
 * die Prüfungen der Abonnements auf (wie bei `baustellenStunden.test.ts`).
 * Geprüft wird stattdessen mit Portionen zu einem Artikel.
 *
 * Was je Artikel herauskommt, muss dasselbe sein wie ohne Liste — die
 * bisherigen Prüfungen (`ruestlisteReserviert`, `ruestlisteEinladen`) fragen
 * weiter ohne Liste und stehen für die Rechnung selbst.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, API, ANON, betriebAnlegen, konto, type Konto } from './helfer';
import * as material from '@/lib/db/pg/materials';
import { clientEinreichen } from '@/lib/db/pg/kern';

const A = 'lfja-a';
const B = 'lfja-b';
let lager: Konto;
let monteur: Konto;
const ID: Record<string, string> = {};

const morgen = new Date(Date.now() + 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });

async function artikel(betrieb: string, name: string, stock: number): Promise<string> {
  const { data, error } = await admin.from('materials')
    .insert({ company_id: betrieb, name, stock, unit: 'Stk' }).select('id').single();
  if (error) throw new Error(error.message);
  return data!.id as string;
}

beforeAll(async () => {
  await betriebAnlegen(A);
  await betriebAnlegen(B);
  lager = await konto(A, 'Verwaltung', 'lfjalager');
  monteur = await konto(A, 'Mitarbeiter', 'lfjamont');
  ID.rohr = await artikel(A, 'Rohr', 10);
  ID.bogen = await artikel(A, 'Bogen', 3);
  ID.katalog = await artikel(A, 'Nur Katalog', 0);
  ID.fremd = await artikel(B, 'Fremd', 7);

  // Rohr: 2 zugesagt (aus dem Lager), 4 morgen auf einer Rüstliste → 4 frei.
  const { error: e1 } = await admin.from('material_orders').insert({
    id: crypto.randomUUID(), company_id: A, material_id: ID.rohr, material_name: 'Rohr', quantity: 2,
    status: 'Abholbereit', beschaffung: 'lager', transaction_type: 'order', user_id: monteur.uid, user_name: 'Monteur',
  });
  if (e1) throw new Error(e1.message);
  const { data: liste, error: e2 } = await admin.from('einsatz_material')
    .insert({ company_id: A, date: morgen, project_number: 'L-1' }).select('id').single();
  if (e2) throw new Error(e2.message);
  const { error: e3 } = await admin.from('einsatz_material_positionen').insert({
    id: `p${crypto.randomUUID().slice(0, 8)}`, company_id: A, einsatz_material_id: liste!.id,
    position: 0, material_id: ID.rohr, name: 'Rohr', menge: 4,
  });
  if (e3) throw new Error(e3.message);
}, 120_000);

afterAll(() => clientEinreichen(null));

const alsText = (k: Map<string, material.LagerStand>) =>
  [...k].map(([id, s]) => `${id} ${s.bestand} ${s.zugesagt} ${s.geplant} ${s.frei}`).sort();

describe('lager_frei mit Liste', () => {
  it('nennt genau die gefragten Artikel, mit derselben Rechnung wie ohne Liste', async () => {
    clientEinreichen(lager.client);
    const gefragt = await material.lagerFrei([ID.rohr, ID.bogen]);
    expect([...gefragt.keys()].sort()).toEqual([ID.rohr, ID.bogen].sort());
    expect(gefragt.get(ID.rohr)).toEqual({ bestand: 10, zugesagt: 2, geplant: 4, frei: 4 });

    const { data, error } = await lager.client.rpc('lager_frei');
    expect(error).toBeNull();
    const ohneListe = new Map((data as Array<Record<string, unknown>>).map((z) => [String(z.material_id), {
      bestand: Number(z.bestand), zugesagt: Number(z.zugesagt), geplant: Number(z.geplant), frei: Number(z.frei),
    }]));
    expect(alsText(gefragt)).toEqual(alsText(new Map([...ohneListe].filter(([id]) => gefragt.has(id)))));
  });

  it('in Portionen zu einem Artikel dasselbe wie in einem Zug', async () => {
    clientEinreichen(lager.client);
    const alle = [ID.rohr, ID.bogen, ID.katalog];
    expect(alsText(await material.lagerFrei(alle, 1))).toEqual(alsText(await material.lagerFrei(alle)));
    expect((await material.lagerFrei(alle, 1)).size).toBe(3);
  });

  it('auch für den Monteur — wie bisher', async () => {
    clientEinreichen(monteur.client);
    expect((await material.lagerFrei([ID.rohr])).get(ID.rohr)?.frei).toBe(4);
  });

  it('nennt keinen Artikel eines anderen Betriebs, auch wenn danach gefragt wird', async () => {
    clientEinreichen(lager.client);
    const k = await material.lagerFrei([ID.rohr, ID.fremd]);
    expect([...k.keys()]).toEqual([ID.rohr]);
  });

  it('übergeht eine Id, die kein Artikel sein kann, statt die Portion scheitern zu lassen', async () => {
    clientEinreichen(lager.client);
    const k = await material.lagerFrei(['x1', '', ID.bogen]);
    expect([...k.keys()]).toEqual([ID.bogen]);
  });

  it('fragt ohne Artikel nicht und gibt nichts', async () => {
    clientEinreichen(lager.client);
    expect((await material.lagerFrei([])).size).toBe(0);
  });

  it('ohne Liste wie bisher alle Artikel des Betriebs, in fester Reihenfolge (ältere Fassung der App)', async () => {
    const { data, error } = await lager.client.rpc('lager_frei');
    expect(error).toBeNull();
    const ids = (data as Array<{ material_id: string }>).map((z) => z.material_id);
    expect([...ids].sort()).toEqual([ID.rohr, ID.bogen, ID.katalog].sort());
    expect(ids).toEqual([...ids].sort());
  });

  it('ist ohne Anmeldung nicht aufrufbar', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(API, ANON, { auth: { persistSession: false } });
    const { error } = await anon.rpc('lager_frei', { p_ids: [ID.rohr] });
    expect(error).not.toBeNull();
  });
});

describe('listLagerartikel', () => {
  it('nennt die im Lager geführten Artikel des Betriebs — ohne Katalogartikel', async () => {
    clientEinreichen(lager.client);
    const namen = (await material.listLagerartikel(A)).map((m) => m.name).sort();
    expect(namen).toEqual(['Bogen', 'Rohr']);
  });
});
