/**
 * Der Basiszinssatz, zentral gepflegt (Stand-Datei 11.1, Punkt 2).
 *
 * Lesen darf jeder Angemeldete, schreiben nur das Plattformkonto und nur
 * über die beiden Funktionen. Die Halbjahre liegen weit zurück, damit kein
 * anderer Lauf sie sieht.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin, ANON, API, betriebAnlegen, konto, plattformkonto, type Konto } from './helfer';

const BETRIEB = 'basiszins-zentral';
const HJ = '1991-07-01';
let plattform: Konto;
let buchhaltung: Konto;
let monteur: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buchhaltung = await konto(BETRIEB, 'Buchhaltung', 'bzbuch');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'bzmont');
  plattform = await plattformkonto('bz');
  await admin.from('basiszinssaetze').delete().lt('ab', '1995-01-01');
}, 120_000);

afterAll(async () => {
  await admin.from('basiszinssaetze').delete().lt('ab', '1995-01-01');
});

const lies = async (k: Konto) =>
  (await k.client.from('basiszinssaetze').select('ab, satz').lt('ab', '1995-01-01').order('ab')).data;

describe('Basiszinssatz zentral', () => {
  it('das Plattformkonto trägt ein und ersetzt', async () => {
    expect((await plattform.client.rpc('basiszinssatz_setzen', { p_ab: HJ, p_satz: 2.5 })).error).toBeNull();
    expect((await plattform.client.rpc('basiszinssatz_setzen', { p_ab: HJ, p_satz: -0.62 })).error).toBeNull();
    expect(await lies(plattform)).toEqual([{ ab: HJ, satz: -0.62 }]);
  });

  it('jeder Angemeldete eines Betriebs liest ihn — auch der Monteur', async () => {
    expect(await lies(buchhaltung)).toEqual([{ ab: HJ, satz: -0.62 }]);
    expect(await lies(monteur)).toEqual([{ ab: HJ, satz: -0.62 }]);
  });

  it('Gegenprobe: ein Betrieb schreibt ihn nicht — weder über die Funktion noch direkt', async () => {
    const ueber = await buchhaltung.client.rpc('basiszinssatz_setzen', { p_ab: '1992-01-01', p_satz: 1 });
    expect(ueber.error?.code).toBe('42501');
    const direkt = await buchhaltung.client.from('basiszinssaetze').insert({ ab: '1992-01-01', satz: 1 });
    expect(direkt.error).not.toBeNull();
    const aendern = await buchhaltung.client.from('basiszinssaetze').update({ satz: 9 }).eq('ab', HJ).select('ab');
    expect(aendern.data ?? []).toEqual([]);
    const weg = await buchhaltung.client.rpc('basiszinssatz_entfernen', { p_ab: HJ });
    expect(weg.error?.code).toBe('42501');
    expect(await lies(plattform)).toEqual([{ ab: HJ, satz: -0.62 }]);
  });

  it('Gegenprobe: ohne Anmeldung kein Lesen', async () => {
    const anonym = createClient(API, ANON, { auth: { persistSession: false } });
    const { data, error } = await anonym.from('basiszinssaetze').select('ab');
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  it('lehnt Tage ab, die kein Halbjahresbeginn sind, und Sätze über 20 %', async () => {
    const tag = await plattform.client.rpc('basiszinssatz_setzen', { p_ab: '1992-03-01', p_satz: 1 });
    expect(tag.error?.message).toMatch(/1\. Jänner oder 1\. Juli/);
    const satz = await plattform.client.rpc('basiszinssatz_setzen', { p_ab: '1992-01-01', p_satz: 25 });
    expect(satz.error?.message).toMatch(/Prozentsatz/);
    expect(await lies(plattform)).toEqual([{ ab: HJ, satz: -0.62 }]);
  });

  it('das Plattformkonto entfernt ihn', async () => {
    expect((await plattform.client.rpc('basiszinssatz_entfernen', { p_ab: HJ })).error).toBeNull();
    expect(await lies(plattform)).toEqual([]);
  });
});
