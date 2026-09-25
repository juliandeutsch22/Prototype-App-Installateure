/**
 * Eine verrechnete Buchung ändert sich nicht mehr — gegen die echte Datenbank.
 *
 * PRÜFLAUF 25.09.2026 (P1-09, P2-07, P3-06): geschützt waren nur das
 * Verrechnet-Kennzeichen und die Rechnungsnummer. Die Stunden daneben liessen
 * sich über die Schnittstelle kürzen, die Buchung ganz löschen — auch von
 * einem spät nachgesendeten Vorgang aus dem Ausgangsfach. Die Rechnung stand
 * danach auf Stunden, die es im Zeitkonto nicht mehr gab.
 *
 * Die Tage liegen im Januar 2027.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, buchung, konto, type Konto } from './helfer';

const BETRIEB = 'verrechnet-fest';

let monteur: Konto;
let buch: Konto;

/** Eine Buchung, wie sie nach dem Anlegen einer Rechnung dasteht. */
async function verrechnet(datum: string): Promise<string> {
  const b = buchung(monteur, datum, { project_number: 'VF-1' });
  const { error } = await monteur.client.from('time_entries').insert(b);
  if (error) throw new Error(error.message);
  const { error: e2 } = await buch.client.from('time_entries')
    .update({ is_billed: true, invoice_number: 'RE-2027-0001' }).eq('id', b.id);
  if (e2) throw new Error(e2.message);
  return b.id;
}

async function zeile(id: string) {
  const { data } = await admin.from('time_entries')
    .select('start_time, end_time, is_billed, comment').eq('id', id).maybeSingle();
  return data;
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Verrechnet bleibt verrechnet');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'vfmon');
  buch = await konto(BETRIEB, 'Buchhaltung', 'vfbuch');
}, 120_000);

describe('Eine verrechnete Buchung', () => {
  it('kürzt der Monteur nicht mehr — auch nicht über die Schnittstelle', async () => {
    const id = await verrechnet('2027-01-11');
    const { error } = await monteur.client.from('time_entries')
      .update({ end_time: '12:00' }).eq('id', id);
    expect(error?.code).toBe('42501');
    expect(await zeile(id)).toMatchObject({ end_time: '16:00:00', is_billed: true });
  });

  it('löscht der Monteur nicht', async () => {
    const id = await verrechnet('2027-01-12');
    const { error } = await monteur.client.from('time_entries').delete().eq('id', id);
    expect(error?.code).toBe('42501');
    expect(await zeile(id)).not.toBeNull();
  });

  it('ändert auch die Buchhaltung nicht — sie storniert zuerst die Rechnung', async () => {
    const id = await verrechnet('2027-01-13');
    const verschoben = await buch.client.from('time_entries')
      .update({ date: '2027-01-14', project_number: 'VF-2' }).eq('id', id);
    expect(verschoben.error?.code).toBe('42501');
    const zuschlag = await buch.client.from('time_entries')
      .update({ is_night_work: true }).eq('id', id);
    expect(zuschlag.error?.code).toBe('42501');
    const geloescht = await buch.client.from('time_entries').delete().eq('id', id);
    expect(geloescht.error?.code).toBe('42501');
  });

  it('nimmt keine Änderung im selben Zug wie die Freigabe mit', async () => {
    const id = await verrechnet('2027-01-15');
    const { error } = await buch.client.from('time_entries')
      .update({ is_billed: false, invoice_number: null, start_time: '08:00' }).eq('id', id);
    expect(error?.code).toBe('42501');
    expect(await zeile(id)).toMatchObject({ start_time: '07:00:00', is_billed: true });
  });
});

describe('Was weiter geht', () => {
  it('der Storno gibt die Buchung frei — danach ist sie wieder zu korrigieren', async () => {
    const id = await verrechnet('2027-01-18');
    const frei = await buch.client.from('time_entries')
      .update({ is_billed: false, invoice_number: null }).eq('id', id);
    expect(frei.error).toBeNull();
    const korrigiert = await monteur.client.from('time_entries')
      .update({ end_time: '15:00' }).eq('id', id);
    expect(korrigiert.error).toBeNull();
    expect(await zeile(id)).toMatchObject({ end_time: '15:00:00', is_billed: false });
  });

  it('das Aufheben eines Stornos sperrt sie wieder', async () => {
    const id = await verrechnet('2027-01-19');
    await buch.client.from('time_entries')
      .update({ is_billed: false, invoice_number: null }).eq('id', id);
    const wieder = await buch.client.from('time_entries')
      .update({ is_billed: true, invoice_number: 'RE-2027-0001' }).eq('id', id);
    expect(wieder.error).toBeNull();
  });

  it('ein Kommentar, der nicht auf der Rechnung steht, bleibt änderbar', async () => {
    const id = await verrechnet('2027-01-20');
    const { error } = await monteur.client.from('time_entries')
      .update({ comment: 'Schlüssel beim Hausmeister' }).eq('id', id);
    expect(error).toBeNull();
    expect(await zeile(id)).toMatchObject({ comment: 'Schlüssel beim Hausmeister' });
  });

  it('der Rücklauf mit dem Dienstschlüssel kommt durch', async () => {
    const id = await verrechnet('2027-01-21');
    const { error } = await admin.from('time_entries').delete().eq('id', id);
    expect(error).toBeNull();
  });
});
