/**
 * Testbericht 30.09.2026, Paket 2b — Eintritt und Tagessoll in der Datenbank.
 *
 *   M7  Vor dem Eintritt nimmt die Datenbank keine Buchung an. Gegenprobe:
 *       ab dem Eintritt geht es, der Rücklauf (Dienstschlüssel) ist
 *       ausgenommen, und eine alte Buchung bleibt änderbar, solange ihr Tag
 *       bleibt.
 *   M6  Der Saldo-Start liegt nie vor dem Eintritt.
 *   M5  Das Tagessoll hat eine feste Form: Wochentag 0–6, Stunden 0–24.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, buchung, type Konto } from './helfer';

const BETRIEB = 'eintritt-m7';
let monteur: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'm7mont');
  const { error } = await admin.from('users')
    .update({ eintritt: '2026-10-01', app_start_date: '2026-10-15' })
    .eq('id', monteur.uid);
  if (error) throw new Error(error.message);
}, 60_000);

describe('M7 — vor dem Eintritt keine Buchung', () => {
  it('am Tag vor dem Eintritt: abgewiesen', async () => {
    const { error } = await monteur.client.from('time_entries').insert(buchung(monteur, '2026-09-30'));
    expect(error?.message).toMatch(/Vor dem Eintritt am 01\.10\.2026/);
  });

  it('am Eintritt selbst: angenommen — auch vor dem Saldo-Start', async () => {
    const { error } = await monteur.client.from('time_entries').insert(buchung(monteur, '2026-10-01'));
    expect(error).toBeNull();
  });

  it('auch nicht, indem man eine Buchung auf einen Tag davor schiebt', async () => {
    const zeile = buchung(monteur, '2026-10-02');
    expect((await monteur.client.from('time_entries').insert(zeile)).error).toBeNull();
    const { error } = await monteur.client.from('time_entries')
      .update({ date: '2026-09-29' }).eq('id', zeile.id);
    expect(error?.message).toMatch(/Vor dem Eintritt/);
  });

  it('der Rücklauf unter dem Dienstschlüssel ist ausgenommen', async () => {
    const { error } = await admin.from('time_entries').insert(buchung(monteur, '2026-09-28'));
    expect(error).toBeNull();
  });

  it('eine alte Buchung vor dem Eintritt bleibt änderbar, solange ihr Tag bleibt', async () => {
    const zeile = buchung(monteur, '2026-09-25');
    expect((await admin.from('time_entries').insert(zeile)).error).toBeNull();
    const { error } = await monteur.client.from('time_entries')
      .update({ comment: 'nachgetragen' }).eq('id', zeile.id);
    expect(error).toBeNull();
  });
});

describe('M6 — Saldo-Start nie vor dem Eintritt', () => {
  it('ein Saldo-Start vor dem Eintritt: abgewiesen', async () => {
    const { error } = await admin.from('users')
      .update({ app_start_date: '2026-09-01' }).eq('id', monteur.uid);
    expect(error?.message).toMatch(/users_eintritt_vor_saldostart/);
  });

  it('gleich oder danach: angenommen', async () => {
    const { error } = await admin.from('users')
      .update({ app_start_date: '2026-10-01' }).eq('id', monteur.uid);
    expect(error).toBeNull();
  });
});

describe('M5 — das Tagessoll hat eine feste Form', () => {
  it('Mo–Do 8,5 und Freitag 5 Stunden: angenommen', async () => {
    const { error } = await admin.from('users')
      .update({ tagessoll: { 1: 8.5, 2: 8.5, 3: 8.5, 4: 8.5, 5: 5 } }).eq('id', monteur.uid);
    expect(error).toBeNull();
  });

  it('leer ist erlaubt — dann gilt die gleichmässige Verteilung', async () => {
    const { error } = await admin.from('users').update({ tagessoll: null }).eq('id', monteur.uid);
    expect(error).toBeNull();
  });

  it.each([
    ['ein Wochentag 7', { 7: 8 }],
    ['mehr als 24 Stunden', { 1: 25 }],
    ['negative Stunden', { 1: -1 }],
    ['Text statt Zahl', { 1: 'acht' }],
    ['eine Liste statt einer Zuordnung', [8, 8, 8, 8, 5]],
  ])('%s: abgewiesen', async (_, wert) => {
    const { error } = await admin.from('users').update({ tagessoll: wert }).eq('id', monteur.uid);
    expect(error?.message).toMatch(/users_tagessoll_form/);
  });
});
