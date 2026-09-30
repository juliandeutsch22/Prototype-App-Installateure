/**
 * Testbericht 30.09.2026, H1 — die Stundenzahl einer Buchung kommt aus den
 * Uhrzeiten, nicht vom Client.
 *
 * Nachgestellt ist genau der Weg des Berichts: ein Monteur schreibt über die
 * Schnittstelle 08:00–09:00 mit `hours = 12`. Gegenprobe: was die Regel
 * weiter zulässt (Rücklauf unter dem Dienstschlüssel, Änderungen an einer
 * Buchung, die die Zeit nicht berühren).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, buchung, type Konto } from './helfer';

const BETRIEB = 'stunden-h1';
let monteur: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'h1mont');
}, 60_000);

async function gespeichert(id: string): Promise<number | null> {
  const { data, error } = await admin.from('time_entries').select('hours').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data.hours === null ? null : Number(data.hours);
}

describe('Mit Uhrzeiten rechnet die Datenbank die Stunden selbst', () => {
  it('08:00–09:00 mit „12 Stunden“ ergibt eine Stunde', async () => {
    const zeile = buchung(monteur, '2026-05-04', {
      start_time: '08:00', end_time: '09:00', break_duration: 0, hours: 12,
    });
    const { error } = await monteur.client.from('time_entries').insert(zeile);
    expect(error).toBeNull();
    expect(await gespeichert(zeile.id)).toBe(1);
  });

  it('auch nachträglich lässt sich die Zahl nicht aufblähen', async () => {
    const zeile = buchung(monteur, '2026-05-05', { start_time: '07:00', end_time: '16:00', break_duration: 30 });
    await monteur.client.from('time_entries').insert(zeile);
    expect(await gespeichert(zeile.id)).toBe(8.5);

    const { error } = await monteur.client.from('time_entries').update({ hours: 12 }).eq('id', zeile.id);
    expect(error).toBeNull();
    expect(await gespeichert(zeile.id)).toBe(8.5);
  });

  it('über Mitternacht zählt die Nacht, abzüglich Pause', async () => {
    const zeile = buchung(monteur, '2026-05-06', { start_time: '22:00', end_time: '06:00', break_duration: 30 });
    await monteur.client.from('time_entries').insert(zeile);
    expect(await gespeichert(zeile.id)).toBe(7.5);
  });

  it('eine geänderte Endzeit rechnet neu', async () => {
    const zeile = buchung(monteur, '2026-05-07', { start_time: '07:00', end_time: '16:00', break_duration: 30 });
    await monteur.client.from('time_entries').insert(zeile);
    await monteur.client.from('time_entries').update({ end_time: '12:00' }).eq('id', zeile.id);
    expect(await gespeichert(zeile.id)).toBe(4.5);
  });

  it('ein Kommentar ändert nichts an der Zahl', async () => {
    const zeile = buchung(monteur, '2026-05-08');
    await monteur.client.from('time_entries').insert(zeile);
    const vorher = await gespeichert(zeile.id);
    const { error } = await monteur.client.from('time_entries').update({ comment: 'Leitung gespült' }).eq('id', zeile.id);
    expect(error).toBeNull();
    expect(await gespeichert(zeile.id)).toBe(vorher);
  });
});

describe('Ohne Uhrzeiten nimmt sie keine Stundenzahl an', () => {
  it('„Anwesend“ ohne Von und Bis, aber mit 12 Stunden: abgewiesen', async () => {
    const zeile = buchung(monteur, '2026-05-11', { start_time: null, end_time: null, hours: 12 });
    const { error } = await monteur.client.from('time_entries').insert(zeile);
    expect(error?.message).toMatch(/Stundenzahl ohne Uhrzeiten/);
  });

  it('auch nicht, indem man die Uhrzeiten nachträglich wegnimmt', async () => {
    const zeile = buchung(monteur, '2026-05-12');
    await monteur.client.from('time_entries').insert(zeile);
    const { error } = await monteur.client.from('time_entries')
      .update({ start_time: null, end_time: null, hours: 12 }).eq('id', zeile.id);
    expect(error?.message).toMatch(/Stundenzahl ohne Uhrzeiten/);
  });

  it('der Rücklauf aus der Sicherung (Dienstschlüssel) spielt zurück, wie es war', async () => {
    const zeile = buchung(monteur, '2026-05-13', { start_time: null, end_time: null, hours: 3.5 });
    const { error } = await admin.from('time_entries').insert(zeile);
    expect(error).toBeNull();
    expect(await gespeichert(zeile.id)).toBe(3.5);
  });
});
