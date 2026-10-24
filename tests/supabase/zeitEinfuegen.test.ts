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
 * dieselbe Baustelle, verrechnet, ganz bedeckt (auch über Mitternacht), Pause
 * passt nicht, keine Überschneidung, fremde Buchungen.
 *
 * Seit A11 (24.10.2026) auch über Mitternacht und beim Bearbeiten (eigener
 * Abschnitt unten).
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

    it('über Mitternacht ganz bedeckt — auch am Folgetag ändert sich nichts', async () => {
      await gebucht(monteur, '2026-11-12', { start_time: '22:00', end_time: '02:00', break_duration: 0 });
      await unveraendert('2026-11-12', schein(monteur, '2026-11-12', '21:00', '03:00'), monteur, /ganz/);
      expect(await amTag('2026-11-13')).toEqual([]);
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

/*
  ÜBER MITTERNACHT UND BEIM BEARBEITEN (A11, 24.10.2026). Gerechnet wird ab
  Mitternacht des Tages der neuen Zeit; Vortag und Folgetag zählen mit. Ein
  Teil steht an dem Tag, an dem er beginnt.
*/
describe('Einfügen über Mitternacht', () => {
  it('in eine Nachtschicht: geteilt, der hintere Teil reicht über Mitternacht', async () => {
    await gebucht(monteur, '2026-12-01', { start_time: '20:00', end_time: '04:00', break_duration: 30 });
    await einfuegen(monteur, schein(monteur, '2026-12-01', '22:00', '23:00'));
    expect(kurz(await amTag('2026-12-01'))).toEqual([
      ['B-1', '20:00', '22:00', 0], ['B-2', '22:00', '23:00', 0], ['B-1', '23:00', '04:00', 30],
    ]);
  });

  it('nach Mitternacht in eine Nachtschicht: der hintere Teil steht am Folgetag', async () => {
    await gebucht(monteur, '2026-12-03', { start_time: '20:00', end_time: '04:00', break_duration: 30 });
    await einfuegen(monteur, schein(monteur, '2026-12-03', '20:30', '01:00'));
    expect(kurz(await amTag('2026-12-03'))).toEqual([['B-1', '20:00', '20:30', 0], ['B-2', '20:30', '01:00', 0]]);
    expect(kurz(await amTag('2026-12-04'))).toEqual([['B-1', '01:00', '04:00', 30]]);
  });

  it('eine Nachtzeit kürzt die Buchung am Folgetag', async () => {
    await gebucht(monteur, '2026-12-08', { project_number: 'B-3', customer_name: 'Kunde B-3', start_time: '00:30', end_time: '05:00', break_duration: 0 });
    await einfuegen(monteur, schein(monteur, '2026-12-07', '22:00', '02:00'));
    expect(kurz(await amTag('2026-12-07'))).toEqual([['B-2', '22:00', '02:00', 0]]);
    expect(kurz(await amTag('2026-12-08'))).toEqual([['B-3', '02:00', '05:00', 0]]);
  });

  it('am Morgen in die Nachtschicht vom Vortag', async () => {
    await gebucht(monteur, '2026-12-09', { start_time: '22:00', end_time: '06:00', break_duration: 0 });
    await einfuegen(monteur, schein(monteur, '2026-12-10', '05:00', '08:00'));
    expect(kurz(await amTag('2026-12-09'))).toEqual([['B-1', '22:00', '05:00', 0]]);
    expect(kurz(await amTag('2026-12-10'))).toEqual([['B-2', '05:00', '08:00', 0]]);
  });

  it('Gegenprobe: in eine verrechnete Buchung am Folgetag nicht — und nichts ändert sich', async () => {
    const id = await gebucht(monteur, '2026-12-12', { start_time: '00:30', end_time: '05:00', break_duration: 0 });
    expect((await admin.from('time_entries').update({ is_billed: true, invoice_number: 'RE-9' }).eq('id', id)).error).toBeNull();
    await expect(einfuegen(monteur, schein(monteur, '2026-12-11', '22:00', '02:00'))).rejects.toThrow(/am Folgetag.*verrechnet/);
    expect(await amTag('2026-12-11')).toEqual([]);
    expect(kurz(await amTag('2026-12-12'))).toEqual([['B-1', '00:30', '05:00', 0]]);
  });
});

describe('Einfügen beim Bearbeiten', () => {
  async function aendern(k: Konto, neu: ReturnType<typeof schein>, id: string) {
    clientEinreichen(k.client);
    return zeiten.zeitEinfuegen(neu, id);
  }

  it('der frühere Beginn kürzt die Buchung davor; die geänderte Buchung behält ihre Kennung', async () => {
    await gebucht(monteur, '2026-12-14', { end_time: '11:00', break_duration: 0 });
    const id = await gebucht(monteur, '2026-12-14', { project_number: 'B-2', customer_name: 'Kunde B-2', start_time: '11:00', end_time: '12:00', break_duration: 0 });
    const r = await aendern(monteur, schein(monteur, '2026-12-14', '10:00', '12:00', 'B-2', { comment: 'Rohrbruch' }), id);
    expect(r).toBe(id);
    const zeilen = await amTag('2026-12-14');
    expect(kurz(zeilen)).toEqual([['B-1', '07:00', '10:00', 0], ['B-2', '10:00', '12:00', 0]]);
    expect(zeilen.find((z) => z.id === id)?.comment).toBe('Rohrbruch');
  });

  it('auf einen anderen Tag verschoben, mitten in dessen Buchung', async () => {
    await gebucht(monteur, '2026-12-15');
    const id = await gebucht(monteur, '2026-12-16', { project_number: 'B-2', customer_name: 'Kunde B-2', start_time: '07:00', end_time: '09:00', break_duration: 0 });
    await aendern(monteur, schein(monteur, '2026-12-15', '10:00', '12:00'), id);
    expect(kurz(await amTag('2026-12-15'))).toEqual([['B-1', '07:00', '10:00', 0], ['B-2', '10:00', '12:00', 0], ['B-1', '12:00', '16:00', 30]]);
    expect(await amTag('2026-12-16')).toEqual([]);
  });

  it('das Büro ändert die Buchung des Monteurs und steht als Bearbeiter da', async () => {
    await gebucht(monteur, '2026-12-17', { end_time: '11:00', break_duration: 0 });
    const id = await gebucht(monteur, '2026-12-17', { project_number: 'B-2', customer_name: 'Kunde B-2', start_time: '11:00', end_time: '12:00', break_duration: 0 });
    await aendern(buero, schein(monteur, '2026-12-17', '10:00', '12:00'), id);
    const zeilen = await amTag('2026-12-17');
    expect(zeilen.every((z) => !!z.last_edited_by)).toBe(true);
  });

  it('Gegenprobe: eine verrechnete Buchung wird nicht geändert — auch die andere bleibt', async () => {
    await gebucht(monteur, '2026-12-18', { end_time: '11:00', break_duration: 0 });
    const id = await gebucht(monteur, '2026-12-18', { project_number: 'B-2', customer_name: 'Kunde B-2', start_time: '11:00', end_time: '12:00', break_duration: 0 });
    expect((await admin.from('time_entries').update({ is_billed: true, invoice_number: 'RE-10' }).eq('id', id)).error).toBeNull();
    await expect(aendern(monteur, schein(monteur, '2026-12-18', '10:00', '12:00'), id)).rejects.toThrow(/verrechnet/);
    expect(kurz(await amTag('2026-12-18'))).toEqual([['B-1', '07:00', '11:00', 0], ['B-2', '11:00', '12:00', 0]]);
  });

  it('Gegenprobe: der Kollege ändert die Buchung des Monteurs nicht', async () => {
    await gebucht(monteur, '2026-12-21', { end_time: '11:00', break_duration: 0 });
    const id = await gebucht(monteur, '2026-12-21', { project_number: 'B-2', customer_name: 'Kunde B-2', start_time: '11:00', end_time: '12:00', break_duration: 0 });
    await expect(aendern(kollege, schein(monteur, '2026-12-21', '10:00', '12:00'), id)).rejects.toThrow(/gibt es nicht/);
    expect(kurz(await amTag('2026-12-21'))).toEqual([['B-1', '07:00', '11:00', 0], ['B-2', '11:00', '12:00', 0]]);
  });
});
