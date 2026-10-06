/**
 * Was ein Monteur von seinen Kollegen liest (Testbericht Runde 3, G25) —
 * gegen die echte Datenbank.
 *
 * Gesehen: über die Schnittstelle las ein Monteur E-Mail-Adressen und
 * Freigaben aller Kollegen. Jetzt: die volle Zeile nur von sich selbst; von
 * den anderen Name, Rolle, Einstufung und „aktiv“ über `kollegen()`. Büro und
 * Führung lesen wie bisher alles — Gegenprobe je Rolle. Und die App merkt
 * davon nichts: `listUsers` liefert dem Monteur weiter alle Namen.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin, ANON, API, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { listUsers } from '@/lib/db/pg/users';

const BETRIEB = 'kollegen-g25';
const FREMD = 'kollegen-g25-fremd';

let chefin: Konto;
let admin_: Konto;
let buch: Konto;
let verwaltung: Konto;
let pl: Konto;
let monteur: Konto;
let lehrling: Konto;
let fremderMonteur: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'g25chefin');
  admin_ = await konto(BETRIEB, 'Administrator', 'g25admin');
  buch = await konto(BETRIEB, 'Buchhaltung', 'g25buch');
  verwaltung = await konto(BETRIEB, 'Verwaltung', 'g25verw');
  pl = await konto(BETRIEB, 'Projektleiter', 'g25pl');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'g25mont');
  lehrling = await konto(BETRIEB, 'Mitarbeiter', 'g25lehr');
  fremderMonteur = await konto(FREMD, 'Mitarbeiter', 'g25fremd');
  const { error } = await admin.from('users').update({
    name: 'Lena Lehrling', einstufung: 'lehrling', lehrbeginn: '2025-09-01', lehrzeit_monate: 36, kunden_pflegen: true,
  }).eq('id', lehrling.uid);
  if (error) throw new Error(error.message);
  await admin.from('users').update({ name: 'Max Monteur' }).eq('id', monteur.uid);
}, 180_000);

afterAll(() => clientEinreichen(null));

describe('Der Monteur', () => {
  it('liest in der Belegschaft nur die eigene Zeile — die ganz', async () => {
    const { data, error } = await monteur.client.from('users').select('*');
    expect(error).toBeNull();
    expect((data ?? []).map((u) => u.id)).toEqual([monteur.uid]);
    expect(data![0].email).toMatch(/@kollegen-g25\.test$/);
  });

  it('liest E-Mail und Freigaben einer Kollegin nicht', async () => {
    const { data } = await monteur.client.from('users').select('email, kunden_pflegen').eq('id', lehrling.uid);
    expect(data ?? []).toEqual([]);
  });

  it('bekommt über kollegen() Name, Rolle, Einstufung und „aktiv“ — sonst nichts', async () => {
    const { data, error } = await monteur.client.rpc('kollegen');
    expect(error).toBeNull();
    const zeilen = data as Array<Record<string, unknown>>;
    expect(zeilen.map((z) => z.id).sort()).toEqual(
      [chefin, admin_, buch, verwaltung, pl, monteur, lehrling].map((k) => k.uid).sort());
    const lena = zeilen.find((z) => z.id === lehrling.uid)!;
    expect(lena).toEqual({
      id: lehrling.uid, company_id: BETRIEB, name: 'Lena Lehrling', role: 'Mitarbeiter', active: true, einstufung: 'lehrling',
    });
    for (const z of zeilen) {
      expect(Object.keys(z).sort()).toEqual(['active', 'company_id', 'einstufung', 'id', 'name', 'role']);
    }
  });

  it('… nur aus dem eigenen Betrieb', async () => {
    const { data } = await fremderMonteur.client.rpc('kollegen');
    expect((data as Array<{ id: string }>).map((z) => z.id)).toEqual([fremderMonteur.uid]);
  });

  it('die App merkt nichts: listUsers liefert alle Namen, die eigene Zeile voll, Kollegen ohne E-Mail', async () => {
    clientEinreichen(monteur.client);
    const alle = await listUsers(BETRIEB);
    expect(alle.map((u) => u.uid).sort()).toEqual(
      [chefin, admin_, buch, verwaltung, pl, monteur, lehrling].map((k) => k.uid).sort());
    expect(alle.find((u) => u.uid === monteur.uid)?.email).toMatch(/@kollegen-g25\.test$/);
    const lena = alle.find((u) => u.uid === lehrling.uid)!;
    expect(lena).toMatchObject({ name: 'Lena Lehrling', role: 'Mitarbeiter', einstufung: 'lehrling', active: true, email: '' });
    expect(lena.kundenPflegen).toBeUndefined();
  });

  it('ohne Anmeldung gibt es keine Kollegen', async () => {
    const ohne = createClient(API, ANON, { auth: { persistSession: false } });
    const { data, error } = await ohne.rpc('kollegen');
    expect(error !== null || (data as unknown[] | null)?.length === 0).toBe(true);
  });
});

describe('Gegenprobe: Büro und Führung lesen alles wie bisher', () => {
  it('jede dieser Rollen liest E-Mail und Freigaben der Kollegin', async () => {
    for (const k of [verwaltung, buch, pl, chefin, admin_]) {
      const { data, error } = await k.client.from('users').select('email, kunden_pflegen').eq('id', lehrling.uid);
      expect(error, k.rolle).toBeNull();
      expect(data, k.rolle).toHaveLength(1);
      expect(data![0].kunden_pflegen, k.rolle).toBe(true);
    }
  });

  it('listUsers liefert dort die vollen Zeilen', async () => {
    clientEinreichen(buch.client);
    const alle = await listUsers(BETRIEB);
    expect(alle.find((u) => u.uid === lehrling.uid)?.email).toMatch(/@kollegen-g25\.test$/);
  });

  it('niemand liest über die Betriebsgrenze', async () => {
    const { data } = await chefin.client.from('users').select('id').eq('id', fremderMonteur.uid);
    expect(data ?? []).toEqual([]);
  });
});
