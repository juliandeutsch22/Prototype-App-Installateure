/**
 * FÄLLIGE WARTUNGEN DER STARTSEITE AUS DER DATENBANK
 * (`wartungen_faellig_stand`, Durchsicht 15.11.2026, Budget B3).
 *
 * Die Startseite holte jede fällige Wartung bis zum Stichtag, höchstens 200,
 * und ordnete im Browser: ohne Baustelle (überfällig, demnächst) und
 * eingeplant (ohne die mit Vorschlag „erledigt?“). Gezeigt werden je
 * Abschnitt drei. Jetzt zählt die Datenbank und gibt die ersten.
 *
 * Geprüft: dieselben Zahlen und Zeilen wie die Rechnung im Browser
 * (`beurteile`, sortiert nach dem Fälligkeitstag) — und über 200 hinaus,
 * wo der alte Weg still abschnitt. Dazu Rechte und Betriebsgrenze.
 *
 * Gegenprobe: ohne 20261118031000 gibt es die Funktion nicht (rot); der alte
 * Weg (`listFaelligeWartungen`) zählt bei 230 fälligen nur 200 (unten belegt).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { admin, API, ANON, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { listFaelligeWartungen, wartungenFaelligStand } from '@/lib/db/pg/wartungen';
import { beurteile } from '@/features/maintenance/wartungsplan';

const A = 'wartungstand-a';
const B = 'wartungstand-b';
const HEUTE = '2026-11-16';
const BIS = '2026-12-16';
let leitung: Konto;
let fremd: Konto;
let vorschlag = '';

function tag(versatz: number): string {
  return new Date(Date.parse(`${HEUTE}T00:00:00Z`) + versatz * 86_400_000).toISOString().slice(0, 10);
}

beforeAll(async () => {
  await betriebAnlegen(A);
  await betriebAnlegen(B);
  leitung = await konto(A, 'Geschäftsführung', 'ws-leitung');
  fremd = await konto(B, 'Geschäftsführung', 'ws-fremd');
  const kunde = await admin.from('customers').insert({ company_id: A, name: 'Bäckerei Stein' }).select('id').single();
  if (kunde.error) throw new Error(kunde.error.message);
  const kundeB = await admin.from('customers').insert({ company_id: B, name: 'Fremd' }).select('id').single();
  if (kundeB.error) throw new Error(kundeB.error.message);
  const w = (faellig: string, p: Record<string, unknown> = {}) => ({
    id: randomUUID(), company_id: A, customer_id: kunde.data.id, customer_name: 'Bäckerei Stein', anlage: 'Therme',
    intervall_monate: 12, faellig_am: faellig, aktiv: true, offene_baustelle: null, ...p,
  });
  vorschlag = randomUUID();
  const zeilen = [
    // 230 ohne Baustelle: 30 überfällig, 200 demnächst — mehr, als der alte Weg holte.
    ...Array.from({ length: 30 }, (_, i) => w(tag(-30 + i))),
    ...Array.from({ length: 200 }, (_, i) => w(tag(i % 31))),
    // Eingeplant: zwei fällig, eine davon überfällig, eine mit Vorschlag, eine später.
    w(tag(-3), { offene_baustelle: 'PR-9' }),
    w(tag(5), { offene_baustelle: 'PR-8' }),
    { ...w(tag(-10), { offene_baustelle: 'PR-7' }), id: vorschlag },
    w(tag(60), { offene_baustelle: 'PR-6' }),
    // Ruht oder liegt nach dem Stichtag: in keinem Abschnitt.
    w(tag(-5), { aktiv: false }),
    w(tag(31)),
  ];
  for (let i = 0; i < zeilen.length; i += 100) {
    const { error } = await admin.from('wartungen').insert(zeilen.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }
  const f = await admin.from('wartungen').insert({ ...w(tag(-1)), company_id: B, customer_id: kundeB.data.id });
  if (f.error) throw new Error(f.error.message);
  clientEinreichen(leitung.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('fällige Wartungen der Startseite', () => {
  it('zählt über alle — auch über die 200 hinaus, bei denen der alte Weg abschnitt', async () => {
    const s = await wartungenFaelligStand(HEUTE, BIS, 3, [vorschlag]);
    expect(s.ohne).toMatchObject({ anzahl: 230, ueberfaellig: 30 });
    expect(s.eingeplant).toMatchObject({ anzahl: 2, ueberfaellig: 1 });
    // Der Weg davor: höchstens 200 fällige, die Zahl darüber fehlte still.
    expect((await listFaelligeWartungen(A, BIS)).length).toBe(200);
  });

  it('bleibt gleich: die ersten Zeilen wie die Rechnung im Browser — nach dem Fälligkeitstag, überfällige zuerst', async () => {
    const s = await wartungenFaelligStand(HEUTE, BIS, 3, [vorschlag]);
    const alle = await listFaelligeWartungen(A, BIS, 1000);
    const ohne = alle.filter((w) => w.aktiv && !w.offeneBaustelle)
      .filter((w) => ['überfällig', 'fällig'].includes(beurteile(w, HEUTE).stand))
      .sort((a, b) => a.faelligAm.localeCompare(b.faelligAm));
    expect(s.ohne.zeilen.map((w) => w.faelligAm)).toEqual(ohne.slice(0, 3).map((w) => w.faelligAm));
    expect(s.ohne.anzahl).toBe(ohne.length);
    expect(s.ohne.ueberfaellig).toBe(ohne.filter((w) => beurteile(w, HEUTE).stand === 'überfällig').length);
    const eingeplant = alle.filter((w) => w.aktiv && w.offeneBaustelle && w.id !== vorschlag)
      .sort((a, b) => a.faelligAm.localeCompare(b.faelligAm));
    expect(s.eingeplant.zeilen.map((w) => w.offeneBaustelle)).toEqual(eingeplant.map((w) => w.offeneBaustelle));
    expect(s.eingeplant.zeilen.map((w) => w.offeneBaustelle)).toEqual(['PR-9', 'PR-8']);
  });

  it('ohne Liste der Vorschläge zählt die eingeplante mit Vorschlag mit; mit 0 nur Zahlen', async () => {
    const s = await wartungenFaelligStand(HEUTE, BIS, 0);
    expect(s.eingeplant).toEqual({ anzahl: 3, ueberfaellig: 2, zeilen: [] });
    expect(s.ohne.zeilen).toEqual([]);
  });

  it('Rechte: nur der eigene Betrieb; ohne Anmeldung nichts', async () => {
    clientEinreichen(fremd.client);
    const b = await wartungenFaelligStand(HEUTE, BIS, 3);
    expect(b.ohne).toMatchObject({ anzahl: 1, ueberfaellig: 1 });
    clientEinreichen(leitung.client);
    const anon = createClient(API, ANON, { auth: { persistSession: false } });
    const { error } = await anon.rpc('wartungen_faellig_stand', { p_heute: HEUTE, p_bis: BIS });
    expect(error).not.toBeNull();
  });
});
