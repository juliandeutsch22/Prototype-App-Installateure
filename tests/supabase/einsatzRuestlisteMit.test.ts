/**
 * DIE RÜSTLISTE GEHT MIT (Durchsicht 15.11.2026, P2) —
 * `supabase/migrations/20261116010000_einsatz_ruestliste_mit.sql`.
 *
 * Gegenprobe: ohne die Migration blieb die Liste beim Verschieben am alten
 * Tag (Tests „zieht mit“, „Vermerk“), beim Entfernen des Letzten kam keine
 * Frage (SL428) und nichts wurde aufgelöst, und auf eine andere Person
 * verschoben behielt der Einsatz das Helfer-Kennzeichen. Was gleich bleiben
 * muss, prüfen die Tests „bleibt gleich“: wer zurückbleibt, behält die
 * Liste; Kopieren nimmt keine mit; die alte App (ohne Wahl) behält sie.
 *
 * Die Tage liegen im Dezember 2027, weit weg von heute und morgen (B6).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'ruestmit-a';
const BAU = 'B-RUESTMIT-1';
const MO = '2027-12-06';
const DI = '2027-12-07';
const MI = '2027-12-09';

let planer: Konto;
let anton: Konto;
let bernd: Konto;
let helga: Konto;

async function einsatz(k: Konto, name: string, datum: string, helfer = false): Promise<string> {
  const { data, error } = await admin.from('assignments').insert({
    company_id: BETRIEB, date: datum, project_number: BAU, user_id: k.uid, user_name: name,
    as_helper: helfer, comment: 'Bad', created_by: planer.uid,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function liste(datum: string, uids: string[], positionen: { id: string; name: string; menge: number }[], geladen: Record<string, unknown> = {}) {
  const { data, error } = await admin.from('einsatz_material').insert({
    company_id: BETRIEB, date: datum, project_number: BAU, uids, geladen,
  }).select('id').single();
  if (error) throw new Error(error.message);
  if (positionen.length > 0) {
    const { error: e } = await admin.from('einsatz_material_positionen').insert(positionen.map((p, i) => ({
      ...p, company_id: BETRIEB, einsatz_material_id: data.id, position: i,
    })));
    if (e) throw new Error(e.message);
  }
  return data.id as string;
}

async function anforderung(listeId: string, position: string, fuer: Konto, mehr: Record<string, unknown> = {}) {
  const { data, error } = await admin.from('material_orders').insert({
    id: crypto.randomUUID(), company_id: BETRIEB, material_name: 'Therme', quantity: 1, project_number: BAU,
    status: 'Offen', transaction_type: 'order', user_id: fuer.uid, user_name: 'x',
    ruestliste_id: listeId, ruest_position: position, note: `Für den Einsatz am 06.12.2027 · angelegt von Planer`,
    ...mehr,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

const listen = async () =>
  (await admin.from('einsatz_material').select('id, date, uids, geladen').eq('company_id', BETRIEB).order('date')).data ?? [];
const positionen = async (listeId: string) =>
  (await admin.from('einsatz_material_positionen').select('id, name, position').eq('einsatz_material_id', listeId).order('position')).data ?? [];
const order = async (id: string) =>
  (await admin.from('material_orders').select('ruestliste_id, ruest_position, user_id, note, status').eq('id', id).maybeSingle()).data;

const umplanen = (id: string, datum: string, k: Konto, kopieren = false) =>
  planer.client.rpc('einsatz_umplanen', { p_id: id, p_datum: datum, p_user: k.uid, p_kopieren: kopieren });

async function aufraeumen() {
  await admin.from('material_orders').delete().eq('company_id', BETRIEB);
  await admin.from('assignments').delete().eq('company_id', BETRIEB);
  await admin.from('einsatz_material').delete().eq('company_id', BETRIEB);
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  planer = await konto(BETRIEB, 'Projektleiter', 'rmplan');
  anton = await konto(BETRIEB, 'Mitarbeiter', 'rmanton');
  bernd = await konto(BETRIEB, 'Mitarbeiter', 'rmbernd');
  helga = await konto(BETRIEB, 'Mitarbeiter', 'rmhelga');
  await admin.from('users').update({ name: 'Anton Fach', einstufung: 'facharbeiter' }).eq('id', anton.uid);
  await admin.from('users').update({ name: 'Bernd Fach' }).eq('id', bernd.uid);
  await admin.from('users').update({ name: 'Helga Helfer', einstufung: 'helfer' }).eq('id', helga.uid);
}, 120_000);

beforeEach(aufraeumen);
afterAll(aufraeumen);

describe('verschieben', () => {
  it('der Letzte wandert: die Liste zieht mit, samt Anforderung und Vermerk', async () => {
    const id = await einsatz(anton, 'Anton Fach', MO);
    const l = await liste(MO, [anton.uid], [{ id: 'p1', name: 'Therme', menge: 1 }]);
    const o = await anforderung(l, 'p1', anton);
    const { data, error } = await umplanen(id, MI, anton);
    expect(error).toBeNull();
    expect(data).toEqual([{ id, anderswo: false, ruestliste: 'mitgezogen' }]);
    expect(await listen()).toEqual([{ id: l, date: MI, uids: [anton.uid], geladen: {} }]);
    expect(await order(o)).toMatchObject({ ruestliste_id: l, ruest_position: 'p1', note: 'Für den Einsatz am 09.12.2027 · angelegt von Planer' });
  });

  it('„Rückgängig“ (zurück verschieben) holt die Liste wieder zurück', async () => {
    const id = await einsatz(anton, 'Anton Fach', MO);
    const l = await liste(MO, [anton.uid], [{ id: 'p1', name: 'Therme', menge: 1 }]);
    await umplanen(id, MI, anton);
    const { data } = await umplanen(id, MO, anton);
    expect(data).toEqual([{ id, anderswo: false, ruestliste: 'mitgezogen' }]);
    expect((await listen()).map((x) => [x.id, x.date])).toEqual([[l, MO]]);
  });

  it('bleibt gleich: bleibt jemand zurück, bleibt die Liste — mit ihm als Mannschaft', async () => {
    const id = await einsatz(anton, 'Anton Fach', MO);
    await einsatz(bernd, 'Bernd Fach', MO);
    const l = await liste(MO, [anton.uid, bernd.uid], [{ id: 'p1', name: 'Therme', menge: 1 }]);
    const { data } = await umplanen(id, MI, anton);
    expect(data).toEqual([{ id, anderswo: false, ruestliste: null }]);
    expect(await listen()).toEqual([{ id: l, date: MO, uids: [bernd.uid], geladen: {} }]);
  });

  it('steht am Zieltag schon eine Liste, kommen die Positionen dazu — Haken und Anforderung wandern mit', async () => {
    const id = await einsatz(anton, 'Anton Fach', MO);
    await einsatz(bernd, 'Bernd Fach', MI);
    const alt = await liste(MO, [anton.uid], [{ id: 'p1', name: 'Therme', menge: 1 }], { p1: { von: anton.uid } });
    const ziel = await liste(MI, [bernd.uid], [{ id: 'p1', name: 'Rohr', menge: 3 }]);
    const o = await anforderung(alt, 'p1', anton);
    const { data } = await umplanen(id, MI, anton);
    expect(data).toEqual([{ id, anderswo: false, ruestliste: 'zusammengefuehrt' }]);
    const l = await listen();
    expect(l.map((x) => x.id)).toEqual([ziel]);
    const pos = await positionen(ziel);
    expect(pos.map((p) => [p.name, p.position])).toEqual([['Rohr', 0], ['Therme', 1]]);
    const therme = pos.find((p) => p.name === 'Therme')!;
    // Die Kennung gab es am Ziel schon: die Position bekam eine neue, Haken und Anforderung folgen ihr.
    expect(therme.id).not.toBe('p1');
    expect(l[0].geladen).toEqual({ [therme.id]: { von: anton.uid } });
    expect(await order(o)).toMatchObject({ ruestliste_id: ziel, ruest_position: therme.id });
  });

  it('bleibt gleich: kopieren nimmt die Liste nicht mit (E85)', async () => {
    const id = await einsatz(anton, 'Anton Fach', MO);
    const l = await liste(MO, [anton.uid], [{ id: 'p1', name: 'Therme', menge: 1 }]);
    const { data } = await umplanen(id, DI, anton, true);
    expect((data as { ruestliste: string | null }[])[0].ruestliste).toBeNull();
    expect(await listen()).toEqual([{ id: l, date: MO, uids: [anton.uid], geladen: {} }]);
  });
});

describe('andere Person', () => {
  it('das Helfer-Kennzeichen kommt von der neuen Person — Helfer mit, Facharbeiter ohne', async () => {
    const id = await einsatz(anton, 'Anton Fach', MO);
    await umplanen(id, MO, helga);
    expect((await admin.from('assignments').select('as_helper').eq('id', id).single()).data?.as_helper).toBe(true);
    await umplanen(id, MO, bernd);
    expect((await admin.from('assignments').select('as_helper').eq('id', id).single()).data?.as_helper).toBe(false);
    const kopie = (await umplanen(id, DI, helga, true)).data as { id: string }[];
    expect((await admin.from('assignments').select('as_helper').eq('id', kopie[0].id).single()).data?.as_helper).toBe(true);
  });

  it('die offene Fehlmenge holt ab, wer jetzt eingeteilt ist — Erledigtes bleibt, wie es war', async () => {
    const id = await einsatz(anton, 'Anton Fach', MO);
    await einsatz(helga, 'Helga Helfer', MO, true);
    const l = await liste(MO, [anton.uid, helga.uid], [{ id: 'p1', name: 'Therme', menge: 1 }]);
    const offen = await anforderung(l, 'p1', anton);
    const erledigt = await anforderung(l, 'p1', anton, { status: 'Erledigt' });
    await umplanen(id, MO, bernd);
    // Bernd (Facharbeiter) vor Helga (Helfer), wie beim Anlegen im Formular.
    expect((await order(offen))?.user_id).toBe(bernd.uid);
    expect((await order(erledigt))?.user_id).toBe(anton.uid);
  });
});

describe('der Letzte geht: Rüstliste auflösen?', () => {
  async function vorbereiten() {
    const id = await einsatz(anton, 'Anton Fach', MO);
    const l = await liste(MO, [anton.uid], [{ id: 'p1', name: 'Therme', menge: 1 }, { id: 'p2', name: 'Rohr', menge: 2 }]);
    const offen = await anforderung(l, 'p1', anton);
    const inArbeit = await anforderung(l, 'p2', anton, { status: 'In Bearbeitung' });
    return { id, l, offen, inArbeit };
  }

  it('„fragen“: abgelehnt mit SL428 und dem, was daran hängt — nichts ist geschrieben', async () => {
    const { id, l } = await vorbereiten();
    const { error } = await planer.client.rpc('einsatz_entfernen', { p_id: id, p_ruestliste: 'fragen' });
    expect(error?.code).toBe('SL428');
    expect(JSON.parse(error?.details ?? '{}')).toEqual({ positionen: 2, anforderungen: 1, in_arbeit: 1 });
    expect((await admin.from('assignments').select('id').eq('id', id)).data).toHaveLength(1);
    expect((await listen()).map((x) => x.id)).toEqual([l]);
  });

  it('„aufloesen“: Liste weg, offene Anforderung zurückgezogen, was das Lager in Arbeit hat, bleibt', async () => {
    const { id, offen, inArbeit } = await vorbereiten();
    const { data, error } = await planer.client.rpc('einsatz_entfernen', { p_id: id, p_ruestliste: 'aufloesen' });
    expect(error).toBeNull();
    expect(data).toEqual({ ruestliste: 'aufgeloest', anforderungen: 1, in_arbeit: 1 });
    expect(await listen()).toEqual([]);
    expect(await order(offen)).toBeNull();
    expect((await order(inArbeit))?.status).toBe('In Bearbeitung');
  });

  it('„behalten“ und ohne Wahl (alte App): die Liste bleibt, ohne Mannschaft', async () => {
    const { id, l } = await vorbereiten();
    const { data } = await planer.client.rpc('einsatz_entfernen', { p_id: id, p_ruestliste: 'behalten' });
    expect(data).toEqual({ ruestliste: 'behalten', in_arbeit: 1 });
    expect(await listen()).toEqual([{ id: l, date: MO, uids: [], geladen: {} }]);

    await aufraeumen();
    const zwei = await vorbereiten();
    expect((await planer.client.rpc('einsatz_entfernen', { p_id: zwei.id })).error).toBeNull();
    expect((await listen()).map((x) => [x.id, x.uids])).toEqual([[zwei.l, []]]);
  });

  it('dasselbe für „Einsatz löschen“ im Formular (`einsatz_loeschen`)', async () => {
    const { id } = await vorbereiten();
    expect((await planer.client.rpc('einsatz_loeschen', { p_id: id, p_ruestliste: 'fragen' })).error?.code).toBe('SL428');
    const { data } = await planer.client.rpc('einsatz_loeschen', { p_id: id, p_ruestliste: 'aufloesen' });
    expect(data).toEqual({ ruestliste: 'aufgeloest', anforderungen: 1, in_arbeit: 1 });
    expect(await listen()).toEqual([]);
  });

  it('bleibt gleich: wer nicht der Letzte ist, wird ohne Frage gelöscht — die Mannschaft der Liste schrumpft', async () => {
    const id = await einsatz(anton, 'Anton Fach', MO);
    await einsatz(bernd, 'Bernd Fach', MO);
    const l = await liste(MO, [anton.uid, bernd.uid], [{ id: 'p1', name: 'Therme', menge: 1 }]);
    const { data, error } = await planer.client.rpc('einsatz_loeschen', { p_id: id, p_ruestliste: 'fragen' });
    expect(error).toBeNull();
    expect(data).toBeNull();
    expect(await listen()).toEqual([{ id: l, date: MO, uids: [bernd.uid], geladen: {} }]);
  });

  it('der Monteur darf weder fragen noch auflösen', async () => {
    const { id } = await vorbereiten();
    expect((await anton.client.rpc('einsatz_entfernen', { p_id: id, p_ruestliste: 'aufloesen' })).error?.code).toBe('42501');
    expect((await anton.client.rpc('einsatz_loeschen', { p_id: id, p_ruestliste: 'aufloesen' })).error?.code).toBe('P0002');
    expect((await listen())).toHaveLength(1);
  });
});
