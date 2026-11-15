/**
 * DAS EIGENE KALENDER-ABO UND DIE ABWESENHEIT (Durchsicht 15.11.2026, P9) —
 * `supabase/migrations/20261116010500_abwesenheit_an_einer_stelle.sql`.
 *
 * Gegenprobe: vorher lieferte `kalender_abruf` den Einsatz auch am Tag, an
 * dem die Person ganztags krank ist; „Mein Einsatzplan“ blendete ihn aus —
 * zwei Auskünfte für denselben Tag. „Bleibt gleich“: stundenweise Abwesenheit
 * lässt den Einsatz stehen; der Gesamtplan der Leitung zeigt weiter alle
 * Eingeteilten; `wochenplan_abwesend` antwortet wie bisher.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const B = 'abo-abwesend-p9';
let chefin: Konto;
let anna: Konto;

const heute = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });
const tagPlus = (n: number) => {
  const d = new Date(`${heute()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function abruf(schluessel: string) {
  const { data, error } = await admin.rpc('kalender_abruf', {
    p_schluessel_hash: createHash('sha256').update(schluessel).digest('hex'),
  });
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}

beforeAll(async () => {
  await betriebAnlegen(B);
  await admin.from('companies').update({ kalender_abo_erlaubt: true, modules: null }).eq('id', B);
  chefin = await konto(B, 'Geschäftsführung', 'p9chef');
  anna = await konto(B, 'Mitarbeiter', 'p9anna');
  await admin.from('users').update({ name: 'Anna Monteurin' }).eq('id', anna.uid);
  await admin.from('projects').insert({ company_id: B, project_number: 'P9-1', customer_name: 'Familie Huber', status: 'Aktiv' });
  await admin.from('assignments').insert([
    { company_id: B, date: tagPlus(3), project_number: 'P9-1', user_id: anna.uid, user_name: 'Anna Monteurin' },
    { company_id: B, date: tagPlus(4), project_number: 'P9-1', user_id: anna.uid, user_name: 'Anna Monteurin' },
    { company_id: B, date: tagPlus(5), project_number: 'P9-1', user_id: anna.uid, user_name: 'Anna Monteurin' },
  ]);
  // Ganztags krank am 3. Tag, Zeitausgleich nachmittags am 4.
  const { error } = await admin.from('krankmeldungen').insert({ company_id: B, user_id: anna.uid, user_name: 'Anna Monteurin', von: tagPlus(3), bis: tagPlus(3) });
  if (error) throw new Error(error.message);
  const { error: za } = await admin.from('vacations').insert({
    company_id: B, user_id: anna.uid, user_name: 'Anna Monteurin', von: tagPlus(4), bis: tagPlus(4), tage: 0,
    status: 'Genehmigt', art: 'Zeitausgleich', za_von: '13:00', za_bis: '17:00',
  });
  if (za) throw new Error(za.message);
}, 120_000);

afterAll(async () => {
  await admin.from('kalender_abos').delete().eq('company_id', B);
  await admin.from('krankmeldungen').delete().eq('company_id', B);
  await admin.from('vacations').delete().eq('company_id', B);
  await admin.from('assignments').delete().eq('company_id', B);
});

describe('eigenes Abo', () => {
  it('ohne den Einsatz am ganztägigen Abwesenheitstag — stundenweise bleibt er', async () => {
    const { data: schluessel, error } = await anna.client.rpc('kalender_abo_anlegen');
    expect(error).toBeNull();
    const d = await abruf(schluessel as string);
    expect((d.einsaetze as { datum: string }[]).map((e) => e.datum)).toEqual([tagPlus(4), tagPlus(5)]);
  });
});

describe('bleibt gleich', () => {
  it('der Gesamtplan der Leitung zeigt alle Eingeteilten, auch am Abwesenheitstag', async () => {
    const { data: schluessel } = await chefin.client.rpc('kalender_abo_anlegen', { p_art: 'gesamt' });
    const d = await abruf(schluessel as string);
    expect((d.baustellen as { datum: string }[]).map((b) => b.datum)).toEqual([tagPlus(3), tagPlus(4), tagPlus(5)]);
  });

  it('wochenplan_abwesend nennt der Leitung Grund und Zeiten wie bisher', async () => {
    const { data } = await chefin.client.rpc('wochenplan_abwesend', { p_von: tagPlus(0), p_bis: tagPlus(10) });
    const zeilen = (data as { von: string; grund: string | null; zeiten: string | null }[])
      .map((z) => [z.von, z.grund, z.zeiten]).sort();
    // Krank sieht die Geschäftsführung (Büro), ZA mit Uhrzeit.
    expect(zeilen).toEqual([[tagPlus(3), 'Krank', null], [tagPlus(4), 'ZA', '13:00–17:00']]);
  });
});
