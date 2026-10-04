/**
 * Termine, die kein Einsatz sind (Plan 10.4) — gegen den laufenden Stapel.
 * Jede Grenze mit ihrer Gegenprobe:
 *   - wer liest (Leitung, Verwaltung, Teilnehmer, am Tag auf der Baustelle
 *     Eingeteilte; nicht Buchhaltung, nicht die übrigen Monteure, kein
 *     fremder Betrieb),
 *   - wer schreibt (Leitung und Verwaltung; nicht Monteur, nicht Buchhaltung),
 *   - woran ein Termin hängt (genau eines von Baustelle und Kunde, beide aus
 *     dem eigenen Betrieb) und wer teilnimmt (nur eigene Leute),
 *   - die neue Baustellennummer zieht mit, die gelöschte Baustelle nimmt ihn mit,
 *   - Datenauskunft und Löschung einer Person.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, deaktivieren, konto, type Konto } from './helfer';

const BETRIEB = 'termin-a';
const FREMD = 'termin-b';
const TAG = '2026-11-17';

let chefin: Konto;
let pl: Konto;
let verw: Konto;
let buch: Konto;
let anna: Konto;
let bert: Konto;
let carl: Konto;
let fremdVerw: Konto;
let kunde: string;
let fremdKunde: string;
const BAUSTELLE = 'T-100';
const ANDERE = 'T-200';

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'chefin');
  pl = await konto(BETRIEB, 'Projektleiter', 'pl');
  verw = await konto(BETRIEB, 'Verwaltung', 'verw');
  buch = await konto(BETRIEB, 'Buchhaltung', 'buch');
  anna = await konto(BETRIEB, 'Mitarbeiter', 'anna');
  bert = await konto(BETRIEB, 'Mitarbeiter', 'bert');
  carl = await konto(BETRIEB, 'Mitarbeiter', 'carl');
  fremdVerw = await konto(FREMD, 'Verwaltung', 'fremd');

  const k = await admin.from('customers').insert({ company_id: BETRIEB, name: 'Familie Huber' }).select('id').single();
  kunde = k.data!.id as string;
  const f = await admin.from('customers').insert({ company_id: FREMD, name: 'Fremdkunde' }).select('id').single();
  fremdKunde = f.data!.id as string;
  for (const nr of [BAUSTELLE, ANDERE]) {
    const { error } = await admin.from('projects').insert({
      company_id: BETRIEB, project_number: nr, customer_name: 'Familie Huber', customer_id: kunde, status: 'Aktiv',
    });
    if (error) throw new Error(error.message);
  }
  // Bert ist am Tag der Lieferung auf der Baustelle, Carl auf einer anderen.
  await admin.from('assignments').insert([
    { company_id: BETRIEB, date: TAG, project_number: BAUSTELLE, user_id: bert.uid },
    { company_id: BETRIEB, date: TAG, project_number: ANDERE, user_id: carl.uid },
  ]);
}, 120_000);

type Termin = {
  art?: string; datum?: string; zeit_von?: string | null; zeit_bis?: string | null;
  project_number?: string | null; customer_id?: string | null; teilnehmer?: string[]; notiz?: string | null;
};

async function anlegen(k: Konto, t: Termin) {
  return k.client.from('termine')
    .insert({ company_id: k.betrieb, art: 'Lieferung', datum: TAG, ...t })
    .select('id').single();
}

async function neu(k: Konto, t: Termin): Promise<string> {
  const { data, error } = await anlegen(k, t);
  if (error) throw new Error(error.message);
  return data!.id as string;
}

async function sieht(k: Konto, id: string): Promise<boolean> {
  const { data, error } = await k.client.from('termine').select('id').eq('id', id);
  if (error) throw new Error(error.message);
  return (data ?? []).length === 1;
}

describe('Wer einen Termin sieht', () => {
  let lieferung: string;
  beforeAll(async () => {
    lieferung = await neu(verw, {
      zeit_von: '08:00', zeit_bis: '10:00', project_number: BAUSTELLE, teilnehmer: [anna.uid], notiz: 'Wannen',
    });
  });

  it('Leitung, Projektleitung und Verwaltung', async () => {
    expect(await sieht(chefin, lieferung)).toBe(true);
    expect(await sieht(pl, lieferung)).toBe(true);
    expect(await sieht(verw, lieferung)).toBe(true);
  });

  it('der Teilnehmer und wer an dem Tag auf der Baustelle eingeteilt ist', async () => {
    expect(await sieht(anna, lieferung)).toBe(true);
    expect(await sieht(bert, lieferung)).toBe(true);
  });

  it('nicht: Monteur auf einer anderen Baustelle, Buchhaltung, fremder Betrieb', async () => {
    expect(await sieht(carl, lieferung)).toBe(false);
    expect(await sieht(buch, lieferung)).toBe(false);
    expect(await sieht(fremdVerw, lieferung)).toBe(false);
  });

  it('eingeteilt an einem ANDEREN Tag reicht nicht', async () => {
    const morgen = await neu(verw, { datum: '2026-11-18', project_number: BAUSTELLE });
    expect(await sieht(bert, morgen)).toBe(false);
    expect(await sieht(pl, morgen)).toBe(true);
  });

  it('die Buchhaltung als Teilnehmerin sieht ihn doch', async () => {
    const id = await neu(chefin, { art: 'Behörde', customer_id: kunde, teilnehmer: [buch.uid] });
    expect(await sieht(buch, id)).toBe(true);
  });
});

describe('Wer schreibt', () => {
  it('die Verwaltung legt an — angelegt von steht fest, was der Client schickt, zählt nicht', async () => {
    const { data, error } = await anlegen(verw, {
      art: 'Besichtigung', customer_id: kunde, angelegt_von_uid: anna.uid, angelegt_von_name: 'Falsch',
    } as Termin);
    expect(error).toBeNull();
    const { data: t } = await admin.from('termine').select('angelegt_von_uid, angelegt_von_name').eq('id', data!.id).single();
    const { data: u } = await admin.from('users').select('name').eq('id', verw.uid).single();
    expect(t).toEqual({ angelegt_von_uid: verw.uid, angelegt_von_name: u!.name });
  });

  it('Projektleitung ändert, Verwaltung löscht', async () => {
    const id = await neu(chefin, { project_number: BAUSTELLE });
    const { error: aendern } = await pl.client.from('termine').update({ zeit_von: '09:00' }).eq('id', id);
    expect(aendern).toBeNull();
    const { data } = await admin.from('termine').select('zeit_von').eq('id', id).single();
    expect(data!.zeit_von).toBe('09:00:00');
    const { error: weg, count } = await verw.client.from('termine').delete({ count: 'exact' }).eq('id', id);
    expect(weg).toBeNull();
    expect(count).toBe(1);
  });

  it('nicht der Monteur — auch nicht als Teilnehmer — und nicht die Buchhaltung', async () => {
    const { error: a } = await anlegen(anna, { project_number: BAUSTELLE });
    expect(a?.code).toBe('42501');
    const { error: b } = await anlegen(buch, { project_number: BAUSTELLE });
    expect(b?.code).toBe('42501');

    const id = await neu(verw, { project_number: BAUSTELLE, teilnehmer: [anna.uid] });
    const { count: geaendert } = await anna.client.from('termine').update({ notiz: 'x' }, { count: 'exact' }).eq('id', id);
    expect(geaendert).toBe(0);
    const { count: geloescht } = await anna.client.from('termine').delete({ count: 'exact' }).eq('id', id);
    expect(geloescht).toBe(0);
    expect(await sieht(verw, id)).toBe(true);
  });

  it('ein Termin bucht nichts', async () => {
    const vorher = await admin.from('time_entries').select('id', { count: 'exact', head: true }).eq('company_id', BETRIEB);
    await neu(verw, { project_number: BAUSTELLE, teilnehmer: [anna.uid, bert.uid] });
    const nachher = await admin.from('time_entries').select('id', { count: 'exact', head: true }).eq('company_id', BETRIEB);
    expect(nachher.count).toBe(vorher.count);
  });
});

describe('Woran ein Termin hängt', () => {
  it('ohne Baustelle beim Kunden — die Besichtigung vor dem Angebot', async () => {
    const id = await neu(verw, { art: 'Besichtigung', customer_id: kunde });
    const { data } = await admin.from('termine').select('project_number, customer_id').eq('id', id).single();
    expect(data).toEqual({ project_number: null, customer_id: kunde });
  });

  it('genau eines: nicht beides, nicht keines', async () => {
    const { error: beides } = await anlegen(verw, { project_number: BAUSTELLE, customer_id: kunde });
    expect(beides?.code).toBe('23514');
    const { error: keines } = await anlegen(verw, {});
    expect(keines?.code).toBe('23514');
  });

  it('eine Baustelle, die es im Betrieb nicht gibt, und ein fremder Kunde werden abgewiesen', async () => {
    const { error: b } = await anlegen(verw, { project_number: 'GIBT-ES-NICHT' });
    expect(b?.message).toContain('Diese Baustelle gibt es in diesem Betrieb nicht');
    const { error: k } = await anlegen(verw, { customer_id: fremdKunde });
    expect(k?.message).toContain('Diesen Kunden gibt es in diesem Betrieb nicht');
  });

  it('nur Personen des eigenen Betriebs als Teilnehmer', async () => {
    const { error } = await anlegen(verw, { project_number: BAUSTELLE, teilnehmer: [fremdVerw.uid] });
    expect(error?.message).toContain('Diese Person gehört nicht zu diesem Betrieb');
  });

  it('„bis" vor „von" gibt es nicht', async () => {
    const { error } = await anlegen(verw, { project_number: BAUSTELLE, zeit_von: '10:00', zeit_bis: '08:00' });
    expect(error?.code).toBe('23514');
  });

  it('eine unbekannte Art gibt es nicht', async () => {
    const { error } = await anlegen(verw, { art: 'Party', project_number: BAUSTELLE });
    expect(error?.code).toBe('23514');
  });
});

describe('Wo es ist — auch für den, der keine Kunden liest', () => {
  it('Name und Adresse des Kunden stehen am Termin, und der teilnehmende Monteur liest sie', async () => {
    await admin.from('customers').update({ address: 'Ringstraße 3, 2700 Wiener Neustadt' }).eq('id', kunde);
    const id = await neu(verw, { art: 'Besichtigung', customer_id: kunde, teilnehmer: [anna.uid] });
    // Gegenprobe: den Kunden selbst liest der Monteur nicht.
    const { data: k } = await anna.client.from('customers').select('id').eq('id', kunde);
    expect(k).toEqual([]);
    const { data } = await anna.client.from('termine').select('ort_name, ort_adresse').eq('id', id).single();
    expect(data).toEqual({ ort_name: 'Familie Huber', ort_adresse: 'Ringstraße 3, 2700 Wiener Neustadt' });
  });

  it('was der Client als Ort schickt, zählt nicht', async () => {
    const id = await neu(verw, { customer_id: kunde, ort_name: 'Falsch', ort_adresse: 'Nirgendwo' } as Termin);
    const { data } = await admin.from('termine').select('ort_name').eq('id', id).single();
    expect(data!.ort_name).toBe('Familie Huber');
  });

  it('zieht der Kunde um oder heißt anders, zieht der Termin nach', async () => {
    const { data: k } = await admin.from('customers').insert({ company_id: BETRIEB, name: 'Alt', address: 'Altgasse 1' }).select('id').single();
    const id = await neu(verw, { art: 'Besichtigung', customer_id: k!.id as string });
    await admin.from('customers').update({ name: 'Neu', address: 'Neugasse 2' }).eq('id', k!.id);
    const { data } = await admin.from('termine').select('ort_name, ort_adresse').eq('id', id).single();
    expect(data).toEqual({ ort_name: 'Neu', ort_adresse: 'Neugasse 2' });
  });

  it('bekommt die Baustelle eine neue Adresse, zieht der Termin nach', async () => {
    const { data: p } = await admin.from('projects')
      .insert({ company_id: BETRIEB, project_number: 'T-500', customer_name: 'Familie Huber', address: 'Altgasse 1', status: 'Aktiv' })
      .select('id').single();
    const id = await neu(verw, { project_number: 'T-500' });
    const vorher = await admin.from('termine').select('ort_adresse').eq('id', id).single();
    expect(vorher.data!.ort_adresse).toBe('Altgasse 1');
    await admin.from('projects').update({ address: 'Neugasse 2' }).eq('id', p!.id);
    const { data } = await admin.from('termine').select('ort_name, ort_adresse').eq('id', id).single();
    expect(data).toEqual({ ort_name: 'Familie Huber', ort_adresse: 'Neugasse 2' });
  });
});

describe('Die Baustelle ändert sich', () => {
  it('bekommt sie eine neue Nummer, zieht der Termin mit — und bleibt für den Eingeteilten sichtbar', async () => {
    const { data: p } = await admin.from('projects')
      .insert({ company_id: BETRIEB, project_number: 'T-300', customer_name: 'Familie Huber', status: 'Aktiv' })
      .select('id').single();
    await admin.from('assignments').insert({ company_id: BETRIEB, date: TAG, project_number: 'T-300', user_id: anna.uid });
    const id = await neu(verw, { project_number: 'T-300' });
    const { error } = await chefin.client.rpc('baustelle_umnummern', { p_projekt: p!.id, p_neu: 'T-301' });
    expect(error).toBeNull();
    const { data } = await admin.from('termine').select('project_number').eq('id', id).single();
    expect(data!.project_number).toBe('T-301');
    expect(await sieht(anna, id)).toBe(true);
  });

  it('wird sie gelöscht, geht der Termin mit', async () => {
    const { data: p } = await admin.from('projects')
      .insert({ company_id: BETRIEB, project_number: 'T-400', customer_name: 'Familie Huber', status: 'Aktiv' })
      .select('id').single();
    const id = await neu(verw, { project_number: 'T-400' });
    await admin.from('projects').delete().eq('id', p!.id);
    const { data } = await admin.from('termine').select('id').eq('id', id);
    expect(data).toEqual([]);
  });
});

describe('Datenauskunft und Löschung', () => {
  it('die Auskunft eines Mitarbeiters nennt seine Termine, ohne die übrigen Teilnehmer', async () => {
    const id = await neu(verw, { art: 'Abnahme', datum: '2026-12-01', project_number: BAUSTELLE, teilnehmer: [carl.uid, bert.uid], notiz: 'Abnahme Bad' });
    const { data, error } = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: carl.uid });
    expect(error).toBeNull();
    const termine = (data as { daten: { termine: Record<string, unknown>[] } }).daten.termine;
    expect(termine).toContainEqual({
      art: 'Abnahme', datum: '2026-12-01', von: null, bis: null, baustelle: BAUSTELLE, notiz: 'Abnahme Bad',
    });
    expect(JSON.stringify(termine)).not.toContain(bert.uid);
    expect(id).toBeTruthy();
  });

  it('die Auskunft eines Kunden nennt die Termine bei ihm und auf seinen Baustellen', async () => {
    const { data, error } = await chefin.client.rpc('person_auskunft', { p_art: 'kunde', p_id: kunde });
    expect(error).toBeNull();
    const termine = (data as { daten: { termine: { baustelle: string | null }[] } }).daten.termine;
    expect(termine.some((t) => t.baustelle === null)).toBe(true);
    expect(termine.some((t) => t.baustelle === BAUSTELLE)).toBe(true);
  });

  it('die Löschung eines Mitarbeiters trägt ihn aus jedem Termin aus — der Termin bleibt', async () => {
    const id = await neu(verw, { datum: '2026-12-02', project_number: BAUSTELLE, teilnehmer: [carl.uid, anna.uid] });
    await deaktivieren(carl.uid);
    const probe = await chefin.client.rpc('person_loeschen', { p_art: 'mitarbeiter', p_id: carl.uid, p_nur_pruefen: true });
    expect((probe.data as { sofort: { termine: number } }).sofort.termine).toBeGreaterThanOrEqual(2);
    const { error } = await chefin.client.rpc('person_loeschen', { p_art: 'mitarbeiter', p_id: carl.uid, p_nur_pruefen: false });
    expect(error).toBeNull();
    const { data } = await admin.from('termine').select('teilnehmer').eq('id', id).single();
    expect(data!.teilnehmer).toEqual([anna.uid]);
    const { data: rest } = await admin.from('termine').select('id').eq('company_id', BETRIEB).contains('teilnehmer', [carl.uid]);
    expect(rest).toEqual([]);
  });

  it('die Löschung eines Kunden nimmt seine Termine ohne Baustelle mit — die auf der Baustelle bleiben', async () => {
    const { data: k } = await admin.from('customers').insert({ company_id: BETRIEB, name: 'Ohne Belege' }).select('id').single();
    const beimKunden = await neu(verw, { art: 'Besichtigung', customer_id: k!.id as string });
    const aufBaustelle = await neu(verw, { project_number: ANDERE });
    const probe = await chefin.client.rpc('person_loeschen', { p_art: 'kunde', p_id: k!.id, p_nur_pruefen: true });
    expect((probe.data as { sofort: { termine: number } }).sofort.termine).toBe(1);
    const { error } = await chefin.client.rpc('person_loeschen', { p_art: 'kunde', p_id: k!.id, p_nur_pruefen: false });
    expect(error).toBeNull();
    const { data } = await admin.from('termine').select('id').in('id', [beimKunden, aufBaustelle]);
    expect(data).toEqual([{ id: aufBaustelle }]);
  });
});
