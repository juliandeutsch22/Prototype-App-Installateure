/**
 * EINE ZEIT ZWISCHEN BESTEHENDE BUCHUNGEN EINFÜGEN (10.10.2026) — gegen die
 * echte Datenbank, über denselben Weg wie die Maske (`zeitEinfuegen`).
 *
 * Der Monteur hat 07:00–16:00 (Pause 30) auf B-1 gebucht und trägt am Abend
 * den Schein von B-2, 10:00–12:00, nach. Danach: B-1 07:00–10:00,
 * B-2 10:00–12:00, B-1 12:00–16:00 mit der Pause — die Summe des Tages
 * bleibt, und die Maske (`einfuegenPlan`) hat genau das vorher gezeigt.
 *
 * Gegenproben: was nicht geht, ändert gar nichts (eine Transaktion) —
 * dieselbe Baustelle, verrechnet, über Mitternacht, ganz bedeckt, Pause passt
 * nicht, keine Überschneidung, fremde Buchungen.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, buchung, konto, type Konto } from './helfer';
import * as zeiten from '@/lib/db/pg/timeEntries';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { einfuegenPlan } from '@/features/time/einfuegen';
import type { TimeEntry } from '@/types';

const BETRIEB = 'zeit-einfuegen';
let monteur: Konto;
let kollege: Konto;
let buero: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'zemon');
  kollege = await konto(BETRIEB, 'Mitarbeiter', 'zekol');
  buero = await konto(BETRIEB, 'Buchhaltung', 'zebuch');
  const { error } = await admin.from('projects').insert(['B-1', 'B-2', 'B-3'].map((nr) => ({
    company_id: BETRIEB, project_number: nr, customer_name: `Kunde ${nr}`, status: 'Aktiv',
  })));
  expect(error).toBeNull();
}, 120_000);

afterAll(() => clientEinreichen(null));

/** Eine Buchung, angelegt wie aus der Maske. */
async function gebucht(k: Konto, datum: string, rest: Record<string, unknown> = {}): Promise<string> {
  const zeile = buchung(k, datum, {
    project_number: 'B-1', customer_name: 'Kunde B-1', user_name: 'Anton Monteur', vehicle_plate: 'WN-1A',
    comment: 'Heizung', travel_time: 20, ...rest,
  });
  const { error } = await k.client.from('time_entries').insert(zeile);
  expect(error).toBeNull();
  return zeile.id as string;
}

async function amTag(datum: string, uid = monteur.uid) {
  const { data } = await admin.from('time_entries')
    .select('id, project_number, start_time, end_time, break_duration, hours, comment, travel_time, vehicle_plate, last_edited_by')
    .eq('company_id', BETRIEB).eq('user_id', uid).eq('date', datum).order('start_time');
  return data ?? [];
}
const kurz = (zeilen: Awaited<ReturnType<typeof amTag>>) =>
  zeilen.map((z) => [z.project_number, z.start_time.slice(0, 5), z.end_time.slice(0, 5), z.break_duration]);

/** Die neue Zeit, so wie die Maske sie übergibt. */
const schein = (k: Konto, datum: string, von: string, bis: string, nr = 'B-2', rest: Partial<TimeEntry> = {}) => ({
  date: datum, status: 'Anwesend' as const, startTime: von, endTime: bis, breakDuration: 0, travelTime: 0,
  projectNumber: nr, customerName: `Kunde ${nr}`, vehiclePlate: '', helperName: '', comment: 'Notfall laut Schein',
  isHelper: false, isNightWork: false, nachtAbgewaehlt: null, isEmergency: false,
  userId: k.uid, userName: 'Anton Monteur', source: 'manual' as const, ...rest,
}) as unknown as Omit<TimeEntry, 'id' | 'companyId'>;

async function einfuegen(k: Konto, neu: ReturnType<typeof schein>) {
  clientEinreichen(k.client);
  return zeiten.zeitEinfuegen(neu);
}

describe('Zeit einfügen', () => {
  it('mitten in den Tag: geteilt, die Pause am längeren Teil, die Summe bleibt — wie die Maske es zeigt', async () => {
    const id = await gebucht(monteur, '2026-11-02');
    const vorher = await amTag('2026-11-02');
    const plan = einfuegenPlan(
      { status: 'Anwesend', projectNumber: 'B-2', startTime: '10:00', endTime: '12:00' },
      [{ id, status: 'Anwesend', projectNumber: 'B-1', startTime: '07:00', endTime: '16:00', breakDuration: 30, isBilled: false }],
    );
    const neu = await einfuegen(monteur, schein(monteur, '2026-11-02', '10:00', '12:00'));
    const zeilen = await amTag('2026-11-02');
    expect(kurz(zeilen)).toEqual([
      ['B-1', '07:00', '10:00', 0],
      ['B-2', '10:00', '12:00', 0],
      ['B-1', '12:00', '16:00', 30],
    ]);
    // Dieselben Spannen, die die Maske vorher angekündigt hat.
    expect(plan).toEqual({ art: 'geht', aenderungen: [expect.objectContaining({ nachher: ['07:00–10:00', '12:00–16:00'] })] });
    // Der Tag: vorher 8,5 Std. auf B-1, jetzt 6,5 auf B-1 und 2 auf B-2.
    expect(zeilen.reduce((s, z) => s + Number(z.hours), 0)).toBe(vorher.reduce((s, z) => s + Number(z.hours), 0));
    // Kommentar und Wegzeit bleiben an der ursprünglichen Buchung; die neue trägt ihre eigenen.
    expect(zeilen.map((z) => [z.id === id, z.id === neu, z.comment, z.travel_time])).toEqual([
      [true, false, 'Heizung', 20],
      [false, true, 'Notfall laut Schein', 0],
      [false, false, null, null],
    ]);
  });

  it('am Rand zweier Buchungen: beide gekürzt', async () => {
    await gebucht(monteur, '2026-11-03', { end_time: '10:00', break_duration: 0 });
    await gebucht(monteur, '2026-11-03', { project_number: 'B-3', customer_name: 'Kunde B-3', start_time: '10:00', end_time: '16:00' });
    await einfuegen(monteur, schein(monteur, '2026-11-03', '09:00', '11:00'));
    expect(kurz(await amTag('2026-11-03'))).toEqual([
      ['B-1', '07:00', '09:00', 0],
      ['B-2', '09:00', '11:00', 0],
      ['B-3', '11:00', '16:00', 30],
    ]);
  });

  it('das Büro fügt für den Monteur ein und steht als Bearbeiter da', async () => {
    await gebucht(monteur, '2026-11-04');
    await einfuegen(buero, schein(monteur, '2026-11-04', '10:00', '12:00'));
    const zeilen = await amTag('2026-11-04');
    expect(kurz(zeilen)).toHaveLength(3);
    const { data: name } = await admin.from('users').select('name').eq('id', buero.uid).single();
    expect(zeilen.every((z) => z.last_edited_by === name!.name)).toBe(true);
  });

  describe('Gegenproben: es ändert sich nichts', () => {
    async function unveraendert(datum: string, neu: ReturnType<typeof schein>, k: Konto, muster: RegExp) {
      const vorher = kurz(await amTag(datum));
      await expect(einfuegen(k, neu)).rejects.toThrow(muster);
      expect(kurz(await amTag(datum))).toEqual(vorher);
    }

    it('dieselbe Baustelle', async () => {
      await gebucht(monteur, '2026-11-10');
      await unveraendert('2026-11-10', schein(monteur, '2026-11-10', '10:00', '12:00', 'B-1'), monteur, /derselben Baustelle/);
    });

    it('verrechnet', async () => {
      const id = await gebucht(monteur, '2026-11-11');
      const { error } = await admin.from('time_entries').update({ is_billed: true, invoice_number: 'RE-1' }).eq('id', id);
      expect(error).toBeNull();
      await unveraendert('2026-11-11', schein(monteur, '2026-11-11', '10:00', '12:00'), monteur, /verrechnet/);
    });

    it('über Mitternacht — die bestehende und die neue', async () => {
      await gebucht(monteur, '2026-11-12', { start_time: '20:00', end_time: '02:00', break_duration: 0 });
      await unveraendert('2026-11-12', schein(monteur, '2026-11-12', '21:00', '22:00'), monteur, /über Mitternacht/);
      await unveraendert('2026-11-12', schein(monteur, '2026-11-12', '23:00', '01:00'), monteur, /über Mitternacht/);
    });

    it('die neue Zeit bedeckt die andere ganz', async () => {
      await gebucht(monteur, '2026-11-13', { start_time: '10:00', end_time: '11:00', break_duration: 0 });
      await unveraendert('2026-11-13', schein(monteur, '2026-11-13', '09:00', '12:00'), monteur, /ganz/);
    });

    it('die Pause passt nicht — auch wenn die erste Buchung schon gekürzt wäre (eine Transaktion)', async () => {
      await gebucht(monteur, '2026-11-14', { end_time: '10:00', break_duration: 0 });
      await gebucht(monteur, '2026-11-14', { project_number: 'B-3', customer_name: 'Kunde B-3', start_time: '10:00', end_time: '11:00', break_duration: 45 });
      await unveraendert('2026-11-14', schein(monteur, '2026-11-14', '09:00', '10:30'), monteur, /Pause von 45 Min\./);
    });

    it('keine Überschneidung — nichts einzufügen', async () => {
      await gebucht(monteur, '2026-11-15', { end_time: '12:00' });
      await unveraendert('2026-11-15', schein(monteur, '2026-11-15', '13:00', '14:00'), monteur, /keiner Buchung/);
    });

    it('der Kollege kann für den Monteur nichts einfügen', async () => {
      await gebucht(monteur, '2026-11-16');
      await unveraendert('2026-11-16', schein(monteur, '2026-11-16', '10:00', '12:00'), kollege, /keiner Buchung/);
    });
  });
});
