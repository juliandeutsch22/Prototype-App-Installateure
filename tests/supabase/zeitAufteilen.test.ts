/**
 * EINE ZEITBUCHUNG AUF MEHRERE BAUSTELLEN AUFTEILEN (10.10.2026) — gegen die
 * echte Datenbank.
 *
 * Der Monteur bucht 07:00–16:00 mit 30 Min. Pause auf die erste Baustelle
 * und verteilt danach 2 Std. auf eine zweite und 1,5 Std. auf eine dritte.
 * Der Tag bleibt derselbe (Beginn, Ende, Pause, Summe); die Teile schliessen
 * lückenlos an.
 *
 * Gegenproben: was nicht geht, ändert gar nichts — auch nicht die gekürzte
 * Buchung (eine Transaktion). Fremde Buchungen teilt nur das Büro.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin, ANON, API, betriebAnlegen, buchung, konto, type Konto } from './helfer';

const BETRIEB = 'zeit-teilen';
let monteur: Konto;
let kollege: Konto;
let buero: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'ztmon');
  kollege = await konto(BETRIEB, 'Mitarbeiter', 'ztkol');
  buero = await konto(BETRIEB, 'Buchhaltung', 'ztbuch');
  const { error } = await admin.from('projects').insert(['B-1', 'B-2', 'B-3'].map((nr) => ({
    company_id: BETRIEB, project_number: nr, customer_name: `Kunde ${nr}`, status: 'Aktiv',
  })));
  expect(error).toBeNull();
}, 120_000);

/** Eine Buchung des Monteurs auf B-1, angelegt wie aus der Maske. */
async function tag(datum: string, rest: Record<string, unknown> = {}): Promise<string> {
  const zeile = buchung(monteur, datum, {
    project_number: 'B-1', customer_name: 'Kunde B-1', user_name: 'Anton Monteur', vehicle_plate: 'WN-1A',
    comment: 'Heizung', travel_time: 20, ...rest,
  });
  const { error } = await monteur.client.from('time_entries').insert(zeile);
  expect(error).toBeNull();
  return zeile.id as string;
}

async function amTag(datum: string) {
  const { data } = await admin.from('time_entries')
    .select('id, project_number, customer_name, start_time, end_time, break_duration, hours, user_name, vehicle_plate, comment, travel_time, last_edited_by')
    .eq('company_id', BETRIEB).eq('user_id', monteur.uid).eq('date', datum).order('start_time');
  return data ?? [];
}

describe('Aufteilen', () => {
  it('kürzt die Buchung und legt die Teile lückenlos dahinter an', async () => {
    const id = await tag('2026-11-02');
    const r = await monteur.client.rpc('zeit_aufteilen', {
      p_id: id,
      p_teile: [{ project_number: 'B-2', minuten: 120 }, { project_number: 'B-3', minuten: 90 }],
    });
    expect(r.error).toBeNull();
    const zeilen = await amTag('2026-11-02');
    expect(zeilen.map((z) => [z.project_number, z.customer_name, z.start_time, z.end_time, z.break_duration, Number(z.hours)])).toEqual([
      ['B-1', 'Kunde B-1', '07:00:00', '12:30:00', 30, 5],
      ['B-2', 'Kunde B-2', '12:30:00', '14:30:00', 0, 2],
      ['B-3', 'Kunde B-3', '14:30:00', '16:00:00', 0, 1.5],
    ]);
    // Dieselbe Summe wie vorher: 8:30 Std.
    expect(zeilen.reduce((s, z) => s + Number(z.hours), 0)).toBe(8.5);
    // Kommentar und Wegzeit bleiben an der Buchung, Fahrzeug und Name gehen mit.
    expect(zeilen.map((z) => [z.comment, z.travel_time, z.vehicle_plate, z.user_name])).toEqual([
      ['Heizung', 20, 'WN-1A', 'Anton Monteur'],
      [null, null, 'WN-1A', 'Anton Monteur'],
      [null, null, 'WN-1A', 'Anton Monteur'],
    ]);
    expect((r.data as { neu: string[] }).neu).toHaveLength(2);
  });

  it('Gegenprobe: ist für die gebuchte Baustelle keine Zeit übrig, ändert sich nichts', async () => {
    const id = await tag('2026-11-03');
    const r = await monteur.client.rpc('zeit_aufteilen', {
      p_id: id, p_teile: [{ project_number: 'B-2', minuten: 510 }],
    });
    expect(r.error?.message).toMatch(/bleibt keine Zeit/);
    expect((await amTag('2026-11-03')).map((z) => [z.project_number, z.end_time])).toEqual([['B-1', '16:00:00']]);
  });

  it('Gegenprobe: eine unbekannte Baustelle nimmt auch die Kürzung zurück', async () => {
    const id = await tag('2026-11-04');
    const r = await monteur.client.rpc('zeit_aufteilen', {
      p_id: id, p_teile: [{ project_number: 'B-2', minuten: 60 }, { project_number: 'GIBTSNICHT', minuten: 60 }],
    });
    expect(r.error?.message).toMatch(/Baustelle GIBTSNICHT gibt es in diesem Betrieb nicht/);
    expect((await amTag('2026-11-04')).map((z) => [z.project_number, z.end_time])).toEqual([['B-1', '16:00:00']]);
  });

  it('weist doppelte Baustellen, fehlende Stunden und die Nacht ab', async () => {
    const id = await tag('2026-11-05');
    const doppelt = await monteur.client.rpc('zeit_aufteilen', {
      p_id: id, p_teile: [{ project_number: 'B-1', minuten: 60 }],
    });
    expect(doppelt.error?.message).toMatch(/B-1 steht doppelt/);
    const ohne = await monteur.client.rpc('zeit_aufteilen', { p_id: id, p_teile: [{ project_number: 'B-2', minuten: 0 }] });
    expect(ohne.error?.message).toMatch(/fehlen die Stunden/);
    const nacht = await tag('2026-11-06', { start_time: '20:00', end_time: '02:00', break_duration: 0 });
    const n = await monteur.client.rpc('zeit_aufteilen', { p_id: nacht, p_teile: [{ project_number: 'B-2', minuten: 60 }] });
    expect(n.error?.message).toMatch(/über Mitternacht/);
  });

  it('eine verrechnete Buchung bleibt, wie sie ist', async () => {
    const id = await tag('2026-11-09');
    expect((await admin.from('time_entries').update({ is_billed: true, invoice_number: 'RE-1' }).eq('id', id)).error).toBeNull();
    const r = await monteur.client.rpc('zeit_aufteilen', { p_id: id, p_teile: [{ project_number: 'B-2', minuten: 60 }] });
    expect(r.error?.message).toMatch(/verrechnet/);
    expect(await amTag('2026-11-09')).toHaveLength(1);
  });

  it('ein Kollege sieht die Buchung nicht; das Büro teilt sie und steht als Bearbeiter da', async () => {
    const id = await tag('2026-11-10');
    const fremd = await kollege.client.rpc('zeit_aufteilen', { p_id: id, p_teile: [{ project_number: 'B-2', minuten: 60 }] });
    expect(fremd.error?.message).toMatch(/gibt es nicht/);
    expect(await amTag('2026-11-10')).toHaveLength(1);

    const r = await buero.client.rpc('zeit_aufteilen', { p_id: id, p_teile: [{ project_number: 'B-2', minuten: 60 }] });
    expect(r.error).toBeNull();
    const zeilen = await amTag('2026-11-10');
    expect(zeilen.map((z) => [z.project_number, z.end_time])).toEqual([['B-1', '15:00:00'], ['B-2', '16:00:00']]);
    // Wer geteilt hat, steht an beiden — wie bei jeder Buchung des Büros für jemand anderen.
    expect(zeilen.every((z) => !!z.last_edited_by)).toBe(true);
  });

  it('ohne Anmeldung gibt es die Funktion nicht', async () => {
    const id = await tag('2026-11-11');
    const anon = createClient(API, ANON, { auth: { persistSession: false } });
    const r = await anon.rpc('zeit_aufteilen', { p_id: id, p_teile: [{ project_number: 'B-2', minuten: 60 }] });
    expect(r.error).not.toBeNull();
    expect(await amTag('2026-11-11')).toHaveLength(1);
  });
});
