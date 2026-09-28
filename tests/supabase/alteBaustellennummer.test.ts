/**
 * Eine alte Baustellennummer findet ihre Baustelle (offene Punkte C8).
 *
 * Nachgestellt wird der Fall aus dem Alltag: der Monteur bucht im Keller auf
 * die alte Nummer, das Büro nummeriert in der Zwischenzeit um, und die
 * Buchung kommt erst danach an — so, wie das Ausgangsfach sie nachsendet:
 * mit der Sitzung des Monteurs und einer Kennung vom Gerät.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, buchung, konto, type Konto } from './helfer';

const BETRIEB = 'altnummer-a';
const FREMD = 'altnummer-b';

let leitung: Konto;
let monteur: Konto;
let fremd: Konto;

let zaehler = 0;
const nummer = () => `A-${Date.now()}-${(zaehler += 1)}`;

async function baustelle(nr: string, betrieb = BETRIEB): Promise<string> {
  const { data, error } = await admin.from('projects')
    .insert({ company_id: betrieb, project_number: nr, customer_name: 'Familie Huber', status: 'Aktiv' })
    .select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function umnummern(id: string, neu: string): Promise<void> {
  const { error } = await leitung.client.rpc('baustelle_umnummern', { p_projekt: id, p_neu: neu });
  if (error) throw new Error(error.message);
}

// Je Buchung ein eigener Tag — die Tagesregeln der Zeiterfassung sollen
// hier nicht mitreden.
let tag = 0;
const naechsterTag = () => new Date(Date.UTC(2026, 2, 1 + (tag += 1))).toISOString().slice(0, 10);

/** Eine Buchung, wie sie das Ausgangsfach nachsendet: upsert auf die Gerätekennung. */
async function nachsenden(nr: string, k: Konto = monteur) {
  const zeile = buchung(k, naechsterTag(), { project_number: nr });
  const { error } = await k.client.from('time_entries').upsert(zeile, { onConflict: 'id' });
  expect(error).toBeNull();
  const { data } = await admin.from('time_entries')
    .select('project_number, project_id').eq('id', zeile.id).single();
  return data as { project_number: string; project_id: string | null };
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  leitung = await konto(BETRIEB, 'Projektleiter', 'leitung');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'monteur');
  fremd = await konto(FREMD, 'Mitarbeiter', 'fremd');
}, 120_000);

describe('Nach dem Umnummern', () => {
  it('landet eine Buchung auf die alte Nummer bei der Baustelle — mit der heutigen Nummer', async () => {
    const alt = nummer();
    const neu = nummer();
    const id = await baustelle(alt);
    await umnummern(id, neu);

    expect(await nachsenden(alt)).toEqual({ project_number: neu, project_id: id });
  });

  it('auch eine Anforderung', async () => {
    const alt = nummer();
    const neu = nummer();
    const id = await baustelle(alt);
    await umnummern(id, neu);

    const kennung = crypto.randomUUID();
    const { error } = await monteur.client.from('material_orders').upsert({
      id: kennung, company_id: BETRIEB, material_name: 'Eckventil', quantity: 2,
      project_number: alt, status: 'Offen', transaction_type: 'order', user_id: monteur.uid,
    }, { onConflict: 'id' });
    expect(error).toBeNull();
    const { data } = await admin.from('material_orders')
      .select('project_number, project_id').eq('id', kennung).single();
    expect(data).toEqual({ project_number: neu, project_id: id });
  });

  it('führt nach zweimal Umnummern von der ersten Nummer zur heutigen', async () => {
    const erste = nummer();
    const zweite = nummer();
    const dritte = nummer();
    const id = await baustelle(erste);
    await umnummern(id, zweite);
    await umnummern(id, dritte);

    expect(await nachsenden(erste)).toEqual({ project_number: dritte, project_id: id });
    expect(await nachsenden(zweite)).toEqual({ project_number: dritte, project_id: id });
  });

  it('übersetzt auch ein nachgesendetes Ändern, das die Nummer setzt', async () => {
    const alt = nummer();
    const neu = nummer();
    const id = await baustelle(alt);
    const vorher = await nachsenden(nummer()); // eine Buchung ohne Baustelle
    expect(vorher.project_id).toBeNull();
    await umnummern(id, neu);

    const { data: zeile } = await admin.from('time_entries').select('id')
      .eq('project_number', vorher.project_number).single();
    const { error } = await monteur.client.from('time_entries')
      .update({ project_number: alt }).eq('id', zeile!.id);
    expect(error).toBeNull();
    const { data } = await admin.from('time_entries')
      .select('project_number, project_id').eq('id', zeile!.id).single();
    expect(data).toEqual({ project_number: neu, project_id: id });
  });
});

describe('Gegenproben', () => {
  it('eine Nummer, die es nie gab, bleibt, wie getippt', async () => {
    const nie = nummer();
    expect(await nachsenden(nie)).toEqual({ project_number: nie, project_id: null });
  });

  it('gehört die alte Nummer heute einer anderen Baustelle, gewinnt die heutige', async () => {
    const alt = nummer();
    const neu = nummer();
    const erste = await baustelle(alt);
    await umnummern(erste, neu);
    const zweite = await baustelle(alt);

    expect(await nachsenden(alt)).toEqual({ project_number: alt, project_id: zweite });
  });

  it('die alte Nummer eines fremden Betriebs übersetzt nichts', async () => {
    const alt = nummer();
    const id = await baustelle(alt, FREMD);
    const { error } = await admin.from('projects').update({ project_number: nummer() }).eq('id', id);
    expect(error).toBeNull();

    expect(await nachsenden(alt)).toEqual({ project_number: alt, project_id: null });
  });

  it('das Gedächtnis schreibt nur die Datenbank selbst', async () => {
    const id = await baustelle(nummer());
    const { error } = await leitung.client.from('baustelle_alte_nummern')
      .insert({ company_id: BETRIEB, nummer: nummer(), project_id: id });
    expect(error).not.toBeNull();
  });

  it('ein fremder Betrieb liest es nicht', async () => {
    const alt = nummer();
    const id = await baustelle(alt);
    await umnummern(id, nummer());
    const { data } = await fremd.client.from('baustelle_alte_nummern').select('nummer').eq('nummer', alt);
    expect(data).toEqual([]);
  });
});
