/**
 * NACHTSTUNDEN OHNE HAKEN — der Auslöser `time_entries_nacht` gegen die echte
 * Datenbank (Testbericht Runde 3, M4).
 *
 * Die Rechenregel prüft `tests/unit/lohnregeln.test.ts`. Hier geht es um das,
 * was nur die Datenbank kann: Sie setzt `is_night_work` selbst — auch für eine
 * ältere App, die noch den Haken schickt —, nimmt die Abwahl mit Grund an und
 * lässt eine Buchung ohne Von und Bis beim Haken.
 *
 * DER RÜCKLAUF (Abnahme Runde 3): `scripts/ruecklauf.mjs` spielt mit dem
 * Dienstschlüssel auch VERRECHNETE Buchungen zurück. Vor dem 06.10. ohne Haken
 * verrechnet, hätte der Auslöser ihnen beim Einfügen das Kennzeichen gesetzt —
 * und die Lohnliste eines alten Monats hätte danach Nachtstunden gezeigt, die
 * nie abgerechnet wurden. Verrechnet bleibt verrechnet, auch beim Rücklauf.
 *
 * Die Tage liegen im Jänner 2027 (keine Feiertage).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, buchung, konto, type Konto } from './helfer';

const BETRIEB = 'nacht-auto';

let monteur: Konto;

async function kennzeichen(id: string) {
  const { data } = await admin.from('time_entries')
    .select('is_night_work, nacht_abgewaehlt, is_billed').eq('id', id).maybeSingle();
  return data;
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Nachtstunden GmbH');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'nachtmon');
}, 120_000);

describe('Die Datenbank setzt das Nachtkennzeichen aus Von und Bis', () => {
  it('20:00–23:30 ohne Haken: Nachtarbeit', async () => {
    const b = buchung(monteur, '2027-01-18', { start_time: '20:00', end_time: '23:30', break_duration: 0 });
    expect((await monteur.client.from('time_entries').insert(b)).error).toBeNull();
    expect(await kennzeichen(b.id)).toMatchObject({ is_night_work: true, nacht_abgewaehlt: null });
  });

  it('Gegenprobe: tagsüber mit Haken aus einer älteren App — keine Nachtarbeit', async () => {
    const b = buchung(monteur, '2027-01-19', { is_night_work: true });
    expect((await monteur.client.from('time_entries').insert(b)).error).toBeNull();
    expect(await kennzeichen(b.id)).toMatchObject({ is_night_work: false });
  });

  it('mit Grund abgewählt: keine Nachtarbeit, der Grund bleibt stehen', async () => {
    const b = buchung(monteur, '2027-01-20', {
      start_time: '20:00', end_time: '23:30', break_duration: 0, nacht_abgewaehlt: '  Pauschal vereinbart  ',
    });
    expect((await monteur.client.from('time_entries').insert(b)).error).toBeNull();
    expect(await kennzeichen(b.id)).toMatchObject({ is_night_work: false, nacht_abgewaehlt: 'Pauschal vereinbart' });
  });

  it('ohne Von und Bis gilt der Haken, eine Abwahl gibt es dort nicht', async () => {
    // Eine Stundenzahl ohne Uhrzeiten nimmt die Datenbank seit 30.09. nicht mehr an; der Haken bleibt trotzdem stehen.
    const b = buchung(monteur, '2027-01-21', {
      start_time: null, end_time: null, break_duration: 0, is_night_work: true, nacht_abgewaehlt: 'ohne Zeiten',
    });
    expect((await monteur.client.from('time_entries').insert(b)).error).toBeNull();
    expect(await kennzeichen(b.id)).toMatchObject({ is_night_work: true, nacht_abgewaehlt: null });
  });
});

describe('Rücklauf aus der Sicherung (Dienstschlüssel)', () => {
  it('eine ohne Kennzeichen verrechnete Nachtbuchung kommt ohne Kennzeichen zurück', async () => {
    const b = buchung(monteur, '2027-01-22', {
      start_time: '20:00', end_time: '23:30', break_duration: 0,
      is_night_work: false, is_billed: true, invoice_number: 'RE-2026-1500',
    });
    expect((await admin.from('time_entries').insert(b)).error).toBeNull();
    expect(await kennzeichen(b.id)).toMatchObject({ is_night_work: false, is_billed: true });
  });

  it('Gegenprobe: eine offene Nachtbuchung bekommt das Kennzeichen auch beim Rücklauf', async () => {
    const b = buchung(monteur, '2027-01-25', {
      start_time: '20:00', end_time: '23:30', break_duration: 0, is_night_work: false,
    });
    expect((await admin.from('time_entries').insert(b)).error).toBeNull();
    expect(await kennzeichen(b.id)).toMatchObject({ is_night_work: true, is_billed: false });
  });
});
