/**
 * Zeitausgleich, der keinen einzigen Tag buchen kann, wird nicht genehmigt (Z8).
 *
 * DER BEFUND (Durchsicht 15.11.2026, B11). `urlaub_entscheiden` wies eine
 * Genehmigung nur beim URLAUB ab, wenn jeder Arbeitstag schon gebucht war.
 * Ein ganztägiger Zeitausgleich für Mo–Mi, an denen schon Arbeit stand, ging
 * als „Genehmigt — 0 Tage“ durch: kein ZA-Tag im Zeitkonto, aber der
 * Wochenplan zeigte die Person drei Tage als „ZA“ abwesend. Dasselbe beim
 * stundenweisen Zeitausgleich an einem Tag mit einem Krankenstand.
 *
 * Gegenprobe: ohne 20261116030000_za_nichts_zu_genehmigen.sql sind die
 * ersten beiden Prüfungen rot (die Genehmigung geht mit `angelegt: 0` durch).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, buchung, type Konto } from './helfer';

const BETRIEB = 'za-null-tage';

let chefin: Konto;
let monteur: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'chefin');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'monteur');
}, 120_000);

async function antrag(von: string, bis: string, art: 'Urlaub' | 'Zeitausgleich', zeiten?: [string, string]) {
  const { data, error } = await admin.from('vacations').insert({
    company_id: BETRIEB, user_id: monteur.uid, user_name: 'Monteur', von, bis,
    tage: 3, status: 'Beantragt', art,
    ...(zeiten ? { za_von: zeiten[0], za_bis: zeiten[1], za_stunden: 4 } : {}),
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data!.id as string;
}

async function arbeitAn(...tage: string[]) {
  const { error } = await admin.from('time_entries').insert(tage.map((t) => buchung(monteur, t)));
  if (error) throw new Error(error.message);
}

const genehmigen = (id: string) =>
  chefin.client.rpc('urlaub_entscheiden', { p_antrag: id, p_entscheidung: 'Genehmigt', p_grund: '', p_entscheider_name: 'Chefin' });

async function status(id: string) {
  const { data } = await admin.from('vacations').select('status').eq('id', id).single();
  return data!.status as string;
}

describe('Zeitausgleich ohne freien Tag (Z8)', () => {
  it('ganztägig: an jedem Tag schon Arbeit — abgewiesen, der Antrag bleibt offen', async () => {
    // Mo–Mi, 1.–3. März 2027
    await arbeitAn('2027-03-01', '2027-03-02', '2027-03-03');
    const id = await antrag('2027-03-01', '2027-03-03', 'Zeitausgleich');
    const { error } = await genehmigen(id);
    expect(error?.code).toBe('55000');
    expect(error?.message).toMatch(/keinen Zeitausgleich zu genehmigen/);
    expect(await status(id)).toBe('Beantragt');
  });

  it('stundenweise: am Tag steht ein Krankenstand — abgewiesen', async () => {
    const { error: e1 } = await admin.from('time_entries').insert(buchung(monteur, '2027-03-08', {
      status: 'Krank', start_time: null, end_time: null, break_duration: 0,
    }));
    expect(e1).toBeNull();
    const id = await antrag('2027-03-08', '2027-03-08', 'Zeitausgleich', ['13:00', '17:00']);
    const { error } = await genehmigen(id);
    expect(error?.code).toBe('55000');
    expect(await status(id)).toBe('Beantragt');
  });

  it('bleibt gleich: ein freier Tag genügt — genehmigt, genau dieser Tag im Zeitkonto', async () => {
    await arbeitAn('2027-03-15', '2027-03-16');
    const id = await antrag('2027-03-15', '2027-03-17', 'Zeitausgleich');
    const { data, error } = await genehmigen(id);
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: 'Genehmigt', angelegt: 1, uebersprungen: 2 });
    const { data: za } = await admin.from('time_entries').select('date, status').eq('vacation_id', id);
    expect(za).toEqual([{ date: '2027-03-17', status: 'Zeitausgleich' }]);
  });

  it('bleibt gleich: Urlaub ohne freien Tag ist weiter abgewiesen, mit dem bisherigen Satz', async () => {
    await arbeitAn('2027-03-22', '2027-03-23', '2027-03-24');
    const id = await antrag('2027-03-22', '2027-03-24', 'Urlaub');
    const { error } = await genehmigen(id);
    expect(error?.code).toBe('55000');
    expect(error?.message).toBe('Im Zeitraum ist jeder Arbeitstag schon gebucht — es gibt nichts zu genehmigen');
  });
});
