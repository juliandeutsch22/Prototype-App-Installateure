/**
 * DIE STUNDEN DER BAUSTELLEN FÜR DIE LEITUNG (Testbericht Runde 5, M1).
 *
 * Als Projektleiter stand auf der Startseite „alle im Budget“, als
 * Administrator „3 über Budget“: gerechnet wurde aus den Buchungen, und von
 * denen liest die Projektleitung nur die eigenen. `baustellen_stunden` gibt
 * ihr die Summen aller — und sonst nichts aus dem Zeitkonto.
 *
 * Die Gegenprobe steht im ersten Fall: derselbe Projektleiter bekommt über
 * die Buchungen (`listEntriesForProjects`) weiter nur seine eigene — der Weg,
 * auf dem die Startseite bisher gerechnet hat.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, API, ANON, betriebAnlegen, konto, type Konto } from './helfer';
import * as zeiten from '@/lib/db/pg/timeEntries';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { groupProjectHours } from '@/lib/time';
import type { TimeEntry } from '@/types';

const A = 'bstd-a';
const B = 'bstd-b';

let pl: Konto;
let gf: Konto;
let buch: Konto;
let verw: Konto;
let max: Konto;
let anton: Konto;
let fremd: Konto;

const NAME = new Map<string, string>();

async function buche(betrieb: string, k: Konto, datum: string, rest: Record<string, unknown>) {
  const { error } = await admin.from('time_entries').insert({
    id: crypto.randomUUID(), company_id: betrieb, user_id: k.uid, user_name: NAME.get(k.uid),
    date: datum, status: 'Anwesend', start_time: '07:00', end_time: '16:00', break_duration: 30,
    ...rest,
  });
  if (error) throw new Error(error.message);
}

beforeAll(async () => {
  await betriebAnlegen(A);
  await betriebAnlegen(B);
  pl = await konto(A, 'Projektleiter', 'bstdpl');
  gf = await konto(A, 'Geschäftsführung', 'bstdgf');
  buch = await konto(A, 'Buchhaltung', 'bstdbuch');
  verw = await konto(A, 'Verwaltung', 'bstdverw');
  max = await konto(A, 'Mitarbeiter', 'Max');
  anton = await konto(A, 'Mitarbeiter', 'Anton');
  fremd = await konto(B, 'Mitarbeiter', 'Fremd');
  NAME.set(max.uid, 'Max').set(anton.uid, 'Anton').set(pl.uid, 'Paula').set(fremd.uid, 'Fremd');

  // Baustelle 2026-050, in beiden Schreibweisen gebucht.
  await buche(A, max, '2026-04-01', { project_number: 'PR-2026-050' });                       // 510 Fach
  await buche(A, anton, '2026-04-02', { project_number: '2026-050', end_time: '12:00' });     // 270 Fach (30 min Pause)
  await buche(A, anton, '2026-04-03', { project_number: '2026-050', end_time: '08:00', break_duration: 0, is_helper: true }); // 60 Helfer
  await buche(A, max, '2026-04-06', { project_number: '2026-050', end_time: '09:00', break_duration: 0, ins_budget: false }); // 120 Lehrling
  // Zählt nicht: Urlaub auf der Baustelle, eine Buchung ohne Arbeitszeit.
  await buche(A, max, '2026-04-07', { project_number: '2026-050', status: 'Urlaub' });
  await buche(A, anton, '2026-04-08', { project_number: '2026-050', start_time: null, end_time: null, break_duration: 0 });
  // Andere Baustelle, eigene Buchung des Projektleiters, fremder Betrieb.
  await buche(A, max, '2026-04-09', { project_number: '2026-051' });
  await buche(A, pl, '2026-04-10', { project_number: '2026-050', end_time: '08:00', break_duration: 0 }); // 60 Fach
  await buche(B, fremd, '2026-04-01', { project_number: '2026-050' });
}, 120_000);

afterAll(() => clientEinreichen(null));

const nachPerson = (rows: zeiten.BaustellenStunden[]) =>
  rows
    .map((r) => `${r.projectNumber} ${r.userName} ${r.art} ${r.minuten} ${r.zuletzt}`)
    .sort();

describe('baustellen_stunden', () => {
  it('gibt der Projektleitung die Stunden aller — über die Buchungen nur die eigenen (Gegenprobe)', async () => {
    clientEinreichen(pl.client);

    const eigene = await zeiten.listEntriesForProjects(A, ['2026-050']);
    // Der alte Weg: 60 von 840 Fachminuten — „alle im Budget“.
    expect(groupProjectHours(eigene as TimeEntry[])[0].fachMin).toBe(60);

    const summen = await zeiten.stundenDerBaustellen(['2026-050']);
    expect(nachPerson(summen)).toEqual([
      '2026-050 Anton fach 270 2026-04-02',
      '2026-050 Anton helfer 60 2026-04-03',
      '2026-050 Max fach 510 2026-04-01',
      '2026-050 Max lehrling 120 2026-04-06',
      '2026-050 Paula fach 60 2026-04-10',
    ]);
  });

  it('findet beide Schreibweisen der Nummer und gruppiert ohne „PR-“', async () => {
    clientEinreichen(pl.client);
    const mitPr = await zeiten.stundenDerBaustellen(['PR-2026-050']);
    expect(nachPerson(mitPr)).toEqual(nachPerson(await zeiten.stundenDerBaustellen(['2026-050'])));
    const zwei = await zeiten.stundenDerBaustellen(['2026-050', 'PR-2026-051']);
    expect(zwei.filter((z) => z.projectNumber === '2026-051').map((z) => z.minuten)).toEqual([510]);
  });

  it('gibt dasselbe wie die Rechnung der App aus allen Buchungen (Geschäftsführung)', async () => {
    clientEinreichen(gf.client);
    const alle = (await zeiten.listEntriesForProjects(A, ['2026-050'])) as TimeEntry[];
    const app = groupProjectHours(alle)[0];
    const summen = await zeiten.stundenDerBaustellen(['2026-050']);
    const art = (a: string) => summen.filter((z) => z.art === a).reduce((n, z) => n + z.minuten, 0);
    expect([art('fach'), art('helfer'), art('lehrling')]).toEqual([app.fachMin, app.helperMin, app.lehrlingMin]);
  });

  it('auch die Buchhaltung bekommt sie', async () => {
    clientEinreichen(buch.client);
    expect((await zeiten.stundenDerBaustellen(['2026-050'])).length).toBe(5);
  });

  it('Monteur und Verwaltung bekommen einen Fehler, keine leere Liste', async () => {
    for (const k of [max, verw]) {
      clientEinreichen(k.client);
      await expect(zeiten.stundenDerBaustellen(['2026-050'])).rejects.toThrow(/nur die Leitung/);
    }
  });

  it('holt seitenweise dasselbe wie in einem Zug', async () => {
    clientEinreichen(pl.client);
    const ganz = await zeiten.stundenDerBaustellen(['2026-050', '2026-051']);
    const inZweien = await zeiten.stundenDerBaustellen(['2026-050', '2026-051'], 2);
    expect(inZweien).toEqual(ganz);
    expect(inZweien).toHaveLength(6);
  });

  it('bekommt auch mehr als 1000 Zeilen — PostgREST deckelt still (Gegenprobe: ein Zug ohne Seiten)', async () => {
    // 1100 Baustellen mit je einer Buchung: 1100 Zeilen Antwort.
    const nummern = Array.from({ length: 1100 }, (_, i) => `V-${String(i).padStart(4, '0')}`);
    const { error } = await admin.from('time_entries').insert(nummern.map((nr, i) => ({
      id: crypto.randomUUID(), company_id: A, user_id: max.uid, user_name: 'Max',
      date: `2027-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
      status: 'Anwesend', start_time: `${String(6 + Math.floor(i / 336)).padStart(2, '0')}:00`,
      end_time: `${String(6 + Math.floor(i / 336)).padStart(2, '0')}:10`, break_duration: 0, project_number: nr,
    })));
    if (error) throw new Error(error.message);
    clientEinreichen(gf.client);
    const alle = await zeiten.stundenDerBaustellen(nummern);
    expect(alle).toHaveLength(1100);
    expect(new Set(alle.map((z) => z.projectNumber)).size).toBe(1100);
    const { data } = await gf.client.rpc('baustellen_stunden', { p_nummern: nummern });
    expect(data).toHaveLength(1000);
  });

  it('fragt nicht, wenn keine Nummer übrig bleibt', async () => {
    clientEinreichen(pl.client);
    expect(await zeiten.stundenDerBaustellen(['', '  ', 'PR-'])).toEqual([]);
    expect(await zeiten.stundenDerBaustellen([])).toEqual([]);
  });

  it('ist ohne Anmeldung nicht aufrufbar', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(API, ANON, { auth: { persistSession: false } });
    const { error } = await anon.rpc('baustellen_stunden', { p_nummern: ['2026-050'] });
    expect(error).not.toBeNull();
  });
});
