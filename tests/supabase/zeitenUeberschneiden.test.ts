/**
 * Zwei Arbeitszeiten derselben Person überschneiden sich nicht — gegen die
 * echte Datenbank.
 *
 * LAUNCH-CHECK 25.09.2026, K1: 20:00–02:00 auf einer Baustelle, dann
 * 21:00–23:00 auf einer anderen, beides gespeichert, die Woche zählte 16
 * statt 14 Stunden. Die Regel steht in der Datenbank, weil es mehrere
 * Schreiber gibt: Maske, Büro, Ausgangsfach, Nachtrag vom Schein.
 *
 * Die Tage liegen im November 2026.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, buchung, konto, type Konto } from './helfer';

const BETRIEB = 'zeit-quer';

let monteur: Konto;
let kollege: Konto;
let buch: Konto;

const zeit = (k: Konto, datum: string, von: string, bis: string, projekt: string) =>
  buchung(k, datum, { start_time: von, end_time: bis, break_duration: 0, project_number: projekt });

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Zeiten überschneiden');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'zqmon');
  kollege = await konto(BETRIEB, 'Mitarbeiter', 'zqkol');
  buch = await konto(BETRIEB, 'Buchhaltung', 'zqbuch');
}, 180_000);

describe('Zeiten zur selben Stunde', () => {
  it('lehnt die zweite Baustelle zur selben Stunde ab — auch über Mitternacht', async () => {
    const nacht = await monteur.client.from('time_entries').insert(zeit(monteur, '2026-11-03', '20:00', '02:00', 'PR-2026-0002'));
    expect(nacht.error).toBeNull();
    const quer = await monteur.client.from('time_entries').insert(zeit(monteur, '2026-11-03', '21:00', '23:00', 'PR-2026-0003'));
    expect(quer.error?.message).toMatch(/überschneidet sich mit 20:00–02:00 am 03\.11\.2026 \(PR-2026-0002\)/);
  });

  it('sieht die Nachtschicht des Vortags', async () => {
    // 20:00–02:00 am 03.11. reicht bis 02:00 am 04.11.
    const frueh = await monteur.client.from('time_entries').insert(zeit(monteur, '2026-11-04', '01:00', '05:00', 'PR-2026-0003'));
    expect(frueh.error?.message).toMatch(/überschneidet sich/);
    const danach = await monteur.client.from('time_entries').insert(zeit(monteur, '2026-11-04', '02:00', '06:00', 'PR-2026-0003'));
    expect(danach.error).toBeNull();
  });

  it('gilt auch, wenn das Büro bucht, und auch beim Ändern', async () => {
    const a = zeit(monteur, '2026-11-05', '07:00', '12:00', 'PR-2026-0002');
    expect((await buch.client.from('time_entries').insert(a)).error).toBeNull();
    const b = zeit(monteur, '2026-11-05', '12:00', '16:00', 'PR-2026-0003');
    expect((await buch.client.from('time_entries').insert(b)).error).toBeNull();
    const verschoben = await buch.client.from('time_entries').update({ start_time: '11:00' }).eq('id', b.id);
    expect(verschoben.error?.message).toMatch(/überschneidet sich mit 07:00–12:00/);
  });

  it('lässt den geteilten Dienst auf derselben Baustelle zu', async () => {
    expect((await monteur.client.from('time_entries').insert(zeit(monteur, '2026-11-06', '07:00', '12:00', 'PR-2026-0002'))).error).toBeNull();
    expect((await monteur.client.from('time_entries').insert(zeit(monteur, '2026-11-06', '19:00', '22:00', 'PR-2026-0002'))).error).toBeNull();
  });

  it('trennt Personen — der Kollege darf zur selben Stunde arbeiten', async () => {
    expect((await kollege.client.from('time_entries').insert(zeit(kollege, '2026-11-03', '21:00', '23:00', 'PR-2026-0003'))).error).toBeNull();
  });

  it('ein Kennzeichen an alten Einträgen fragt nicht nach der Zeit', async () => {
    // Zwei Zeiten, die sich vor dieser Regel schon überschnitten haben — der
    // Rücklauf spielt sie so ein. Eine Rechnung, die sie verrechnet, darf
    // nicht daran scheitern.
    const x = zeit(monteur, '2026-11-10', '07:00', '16:00', 'PR-2026-0002');
    const y = zeit(monteur, '2026-11-10', '08:00', '12:00', 'PR-2026-0003');
    expect((await admin.from('time_entries').insert([x, y])).error).toBeNull();
    const gesetzt = await buch.client.from('time_entries').update({ comment: 'geprüft' }).eq('id', y.id).select('id');
    expect(gesetzt.error).toBeNull();
    expect(gesetzt.data).toHaveLength(1);
  });
});

describe('Ein ganztägiger Eintrag steht allein am Tag', () => {
  /*
    PRÜFLAUF 25.09.2026 (P1-17). „Anwesend" neben „Krank", „Urlaub" oder
    ganztägigem Zeitausgleich verhinderte nur die Maske. Über die
    Schnittstelle oder aus dem Ausgangsfach zählte der Tag dann doppelt —
    als Krankentag UND mit Arbeitsstunden.
  */
  const za = (k: Konto, datum: string, von: string | null, bis: string | null) =>
    buchung(k, datum, { status: 'Zeitausgleich', start_time: von, end_time: bis, break_duration: 0 });

  it('keine Arbeitszeit an einem Krankentag — weder vom Monteur noch vom Büro', async () => {
    const { error: meldung } = await monteur.client.rpc('krankmeldung_speichern', {
      p_id: null, p_user: null, p_von: '2026-11-16', p_bis: '2026-11-16', p_notiz: null,
    });
    expect(meldung).toBeNull();

    const selbst = await monteur.client.from('time_entries')
      .insert(zeit(monteur, '2026-11-16', '07:00', '12:00', 'PR-2026-0002'));
    expect(selbst.error?.message).toMatch(/ganzen Tag/);
    const buero = await buch.client.from('time_entries')
      .insert(zeit(monteur, '2026-11-16', '13:00', '16:00', 'PR-2026-0002'));
    expect(buero.error?.message).toMatch(/ganzen Tag/);
  });

  it('auch nicht, indem eine Buchung auf den Tag verschoben wird', async () => {
    const b = zeit(monteur, '2026-11-18', '07:00', '12:00', 'PR-2026-0002');
    expect((await monteur.client.from('time_entries').insert(b)).error).toBeNull();
    const verschoben = await monteur.client.from('time_entries').update({ date: '2026-11-16' }).eq('id', b.id);
    expect(verschoben.error?.message).toMatch(/ganzen Tag/);
  });

  it('kein ganztägiger Zeitausgleich neben gearbeiteter Zeit — stundenweise schon', async () => {
    expect((await monteur.client.from('time_entries')
      .insert(zeit(monteur, '2026-11-17', '07:00', '12:00', 'PR-2026-0002'))).error).toBeNull();

    const ganztags = await buch.client.from('time_entries').insert(za(monteur, '2026-11-17', null, null));
    expect(ganztags.error?.message).toMatch(/ganzen Tag/);

    // Vormittags gearbeitet, nachmittags frei — der Fall, für den es den
    // stundenweisen Zeitausgleich gibt.
    const nachmittags = await buch.client.from('time_entries').insert(za(monteur, '2026-11-17', '13:00', '17:00'));
    expect(nachmittags.error).toBeNull();
  });

  it('der Kollege arbeitet an meinem Krankentag natürlich weiter', async () => {
    expect((await kollege.client.from('time_entries')
      .insert(zeit(kollege, '2026-11-16', '07:00', '16:00', 'PR-2026-0002'))).error).toBeNull();
  });
});
