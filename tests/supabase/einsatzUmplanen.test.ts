/**
 * UMPLANEN IM WOCHENPLAN (E88) — `einsatz_umplanen` und `einsatz_entfernen`.
 *
 * Eine Zeile wandert auf einen anderen Tag oder zu einer anderen Person,
 * oder wird kopiert. Abgewiesen wird mit Grund, was auch „Auch an den
 * folgenden Tagen“ (E85) ausließe: Feiertag, Betriebsurlaub, ganztags
 * abwesend; dazu dieselbe Person zweimal auf derselben Baustelle. Die
 * Rüstliste bekommt an beiden Tagen die Mannschaft, wie sie danach steht.
 *
 * Die Tage liegen im Dezember 2027, weit weg von heute und morgen (B6).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { admin, betriebAnlegen, einblickBeginnen, konto, plattformkonto, type Konto } from './helfer';

const BETRIEB = 'umplanen-a';
const FREMD = 'umplanen-b';
const BAU = 'B-UMPLAN-1';
const ANDERE = 'B-UMPLAN-2';

let planer: Konto;
let monteur: Konto;
let kollegin: Konto;
let chefin: Konto;
let fremd: Konto;
let plattform: Konto;

async function einsatz(uid: string, name: string, datum: string, baustelle = BAU): Promise<string> {
  const { data, error } = await admin.from('assignments').insert({
    company_id: BETRIEB, date: datum, project_number: baustelle, user_id: uid, user_name: name,
    as_helper: true, comment: 'Bad', created_by: planer.uid, zeit_von: '07:00', zeit_bis: '15:30',
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

const umplanen = (k: Konto, id: string, datum: string, uid: string, kopieren = false) =>
  k.client.rpc('einsatz_umplanen', { p_id: id, p_datum: datum, p_user: uid, p_kopieren: kopieren });

async function zeile(id: string) {
  const { data } = await admin.from('assignments')
    .select('date, user_id, user_name, project_number, as_helper, comment, zeit_von, zeit_bis').eq('id', id).maybeSingle();
  return data;
}

async function aufraeumen() {
  await admin.from('assignments').delete().in('company_id', [BETRIEB, FREMD]);
  await admin.from('einsatz_material').delete().in('company_id', [BETRIEB, FREMD]);
  await admin.from('betriebsurlaube').delete().in('company_id', [BETRIEB, FREMD]);
  await admin.from('vacations').delete().in('company_id', [BETRIEB, FREMD]);
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  planer = await konto(BETRIEB, 'Projektleiter', 'upplan');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'upmon');
  kollegin = await konto(BETRIEB, 'Mitarbeiter', 'upkol');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'upchef');
  fremd = await konto(FREMD, 'Geschäftsführung', 'upfremd');
  plattform = await plattformkonto('up-support');
  for (const k of [monteur, kollegin]) {
    await admin.from('users').update({ name: k === monteur ? 'Max Monteur' : 'Erna Kollegin' }).eq('id', k.uid);
  }
}, 120_000);

beforeEach(aufraeumen);
afterAll(aufraeumen);

describe('verschieben', () => {
  it('auf einen anderen Tag und zu einer anderen Person — Baustelle, Zeit, Aufgabe und Helfer bleiben', async () => {
    const id = await einsatz(monteur.uid, 'Max Monteur', '2027-12-06');
    const { data, error } = await umplanen(planer, id, '2027-12-07', kollegin.uid);
    expect(error).toBeNull();
    expect(data).toEqual([{ id, anderswo: false }]);
    expect(await zeile(id)).toEqual({
      date: '2027-12-07', user_id: kollegin.uid, user_name: 'Erna Kollegin', project_number: BAU,
      as_helper: true, comment: 'Bad', zeit_von: '07:00:00', zeit_bis: '15:30:00',
    });
  });

  it('Gegenprobe: auf dieselbe Stelle — nichts geändert, kein Fehler', async () => {
    const id = await einsatz(monteur.uid, 'Max Monteur', '2027-12-06');
    const { error } = await umplanen(planer, id, '2027-12-06', monteur.uid);
    expect(error).toBeNull();
    expect((await zeile(id))?.date).toBe('2027-12-06');
  });

  it('auf einen Tag, an dem die Person schon anderswo steht: erlaubt und gemeldet', async () => {
    const id = await einsatz(monteur.uid, 'Max Monteur', '2027-12-06');
    await einsatz(monteur.uid, 'Max Monteur', '2027-12-07', ANDERE);
    const { data, error } = await umplanen(planer, id, '2027-12-07', monteur.uid);
    expect(error).toBeNull();
    expect(data).toEqual([{ id, anderswo: true }]);
  });
});

describe('abgewiesen, mit Grund — und nichts geändert', () => {
  it('Feiertag (8.12., Mariä Empfängnis)', async () => {
    const id = await einsatz(monteur.uid, 'Max Monteur', '2027-12-06');
    const { error } = await umplanen(planer, id, '2027-12-08', monteur.uid);
    expect(error?.message).toMatch(/Am 08\.12\.2027 ist Feiertag/);
    expect((await zeile(id))?.date).toBe('2027-12-06');
  });

  it('Betriebsurlaub', async () => {
    await admin.from('betriebsurlaube').insert({ company_id: BETRIEB, von: '2027-12-10', bis: '2027-12-10', bezeichnung: 'Inventur' });
    const id = await einsatz(monteur.uid, 'Max Monteur', '2027-12-06');
    const { error } = await umplanen(planer, id, '2027-12-10', monteur.uid);
    expect(error?.message).toMatch(/Am 10\.12\.2027 ist Betriebsurlaub \(Inventur\)/);
    expect((await zeile(id))?.date).toBe('2027-12-06');
  });

  it('ganztags abwesend', async () => {
    await admin.from('vacations').insert({
      company_id: BETRIEB, user_id: kollegin.uid, user_name: 'Erna Kollegin', von: '2027-12-09', bis: '2027-12-09', tage: 1, status: 'Genehmigt',
    });
    const id = await einsatz(monteur.uid, 'Max Monteur', '2027-12-06');
    const { error } = await umplanen(planer, id, '2027-12-09', kollegin.uid);
    expect(error?.message).toMatch(/Erna Kollegin ist am 09\.12\.2027 abwesend \(Urlaub\)/);
    expect((await zeile(id))?.user_id).toBe(monteur.uid);
  });

  it('dieselbe Person schon auf derselben Baustelle', async () => {
    const id = await einsatz(monteur.uid, 'Max Monteur', '2027-12-06');
    await einsatz(monteur.uid, 'Max Monteur', '2027-12-07');
    const { error } = await umplanen(planer, id, '2027-12-07', monteur.uid);
    expect(error?.message).toMatch(/Max Monteur ist am 07\.12\.2027 schon auf dieser Baustelle/);
    expect((await zeile(id))?.date).toBe('2027-12-06');
  });

  it('nach dem Austritt (E87)', async () => {
    await admin.from('users').update({ eintritt: '2027-01-01', app_start_date: '2027-01-01', austritt: '2027-12-06' }).eq('id', kollegin.uid);
    try {
      const id = await einsatz(monteur.uid, 'Max Monteur', '2027-12-06');
      const { error } = await umplanen(planer, id, '2027-12-07', kollegin.uid);
      expect(error?.message).toMatch(/Erna Kollegin ist am 07\.12\.2027 nicht mehr im Betrieb \(ausgetreten\)/);
      expect((await zeile(id))?.user_id).toBe(monteur.uid);
    } finally {
      await admin.from('users').update({ austritt: null }).eq('id', kollegin.uid);
    }
  });
});

describe('kopieren', () => {
  it('eine neue Zeile am Zieltag, die alte bleibt', async () => {
    const id = await einsatz(monteur.uid, 'Max Monteur', '2027-12-06');
    const { data, error } = await umplanen(planer, id, '2027-12-07', monteur.uid, true);
    expect(error).toBeNull();
    const neu = (data as { id: string }[])[0].id;
    expect(neu).not.toBe(id);
    expect((await zeile(id))?.date).toBe('2027-12-06');
    expect(await zeile(neu)).toMatchObject({ date: '2027-12-07', user_id: monteur.uid, as_helper: true, comment: 'Bad', zeit_von: '07:00:00' });
  });

  it('auch kopieren weist dieselbe Person auf derselben Baustelle ab', async () => {
    const id = await einsatz(monteur.uid, 'Max Monteur', '2027-12-06');
    const { error } = await umplanen(planer, id, '2027-12-06', monteur.uid, true);
    expect(error?.message).toMatch(/schon auf dieser Baustelle/);
  });
});

describe('die Rüstliste geht mit', () => {
  it('der alte Tag verliert die Person, der neue bekommt sie', async () => {
    const id = await einsatz(monteur.uid, 'Max Monteur', '2027-12-06');
    await einsatz(kollegin.uid, 'Erna Kollegin', '2027-12-06');
    await admin.from('einsatz_material').insert([
      { company_id: BETRIEB, date: '2027-12-06', project_number: BAU, uids: [monteur.uid, kollegin.uid] },
      { company_id: BETRIEB, date: '2027-12-07', project_number: BAU, uids: [] },
    ]);
    expect((await umplanen(planer, id, '2027-12-07', monteur.uid)).error).toBeNull();
    const { data } = await admin.from('einsatz_material').select('date, uids').eq('company_id', BETRIEB).order('date');
    expect(data).toEqual([
      { date: '2027-12-06', uids: [kollegin.uid] },
      { date: '2027-12-07', uids: [monteur.uid] },
    ]);
  });

  it('entfernen nimmt die Person aus der Rüstliste', async () => {
    const id = await einsatz(monteur.uid, 'Max Monteur', '2027-12-06');
    await einsatz(kollegin.uid, 'Erna Kollegin', '2027-12-06');
    await admin.from('einsatz_material').insert({ company_id: BETRIEB, date: '2027-12-06', project_number: BAU, uids: [monteur.uid, kollegin.uid] });
    const { error } = await planer.client.rpc('einsatz_entfernen', { p_id: id });
    expect(error).toBeNull();
    expect(await zeile(id)).toBeNull();
    const { data } = await admin.from('einsatz_material').select('uids').eq('company_id', BETRIEB).single();
    expect(data?.uids).toEqual([kollegin.uid]);
  });

  it('ein schon entfernter Einsatz: ein klarer Fehler statt Stille', async () => {
    const id = await einsatz(monteur.uid, 'Max Monteur', '2027-12-06');
    await admin.from('assignments').delete().eq('id', id);
    expect((await planer.client.rpc('einsatz_entfernen', { p_id: id })).error?.message).toMatch(/gibt es nicht mehr/);
    expect((await umplanen(planer, id, '2027-12-07', monteur.uid)).error?.message).toMatch(/gibt es nicht mehr/);
  });
});

describe('wer darf', () => {
  it('der Monteur nicht', async () => {
    const id = await einsatz(monteur.uid, 'Max Monteur', '2027-12-06');
    const { error } = await umplanen(monteur, id, '2027-12-07', monteur.uid);
    expect(error?.code).toBe('42501');
    expect((await monteur.client.rpc('einsatz_entfernen', { p_id: id })).error?.code).toBe('42501');
    expect((await zeile(id))?.date).toBe('2027-12-06');
  });

  it('ein fremder Betrieb findet den Einsatz nicht', async () => {
    const id = await einsatz(monteur.uid, 'Max Monteur', '2027-12-06');
    expect((await umplanen(fremd, id, '2027-12-07', monteur.uid)).error?.message).toMatch(/gibt es nicht mehr/);
    expect((await fremd.client.rpc('einsatz_entfernen', { p_id: id })).error?.message).toMatch(/gibt es nicht mehr/);
    expect((await zeile(id))?.date).toBe('2027-12-06');
  });

  it('keine Person aus einem fremden Betrieb', async () => {
    const id = await einsatz(monteur.uid, 'Max Monteur', '2027-12-06');
    expect((await umplanen(planer, id, '2027-12-07', fremd.uid)).error?.message).toMatch(/nicht aktiv/);
  });

  it('nicht im Einblick des Supports', async () => {
    const id = await einsatz(monteur.uid, 'Max Monteur', '2027-12-06');
    const { data: freigabe } = await chefin.client.from('support_freigaben').insert({
      company_id: BETRIEB, gewaehrt_von: chefin.uid, grund: 'Planung prüfen', stufe: 'mitarbeiten',
      gilt_bis: new Date(Date.now() + 3_600_000).toISOString(),
    }).select('id').single();
    try {
      await einblickBeginnen(plattform, BETRIEB, freigabe!.id);
      const { error } = await umplanen(plattform, id, '2027-12-07', monteur.uid);
      expect(error?.code).toBe('42501');
      expect(error?.message).toMatch(/im Einblick nicht/);
      expect((await zeile(id))?.date).toBe('2027-12-06');
    } finally {
      await admin.from('support_zugriffe').delete().eq('company_id', BETRIEB);
      await admin.from('support_freigaben').delete().eq('company_id', BETRIEB);
    }
  });
});
