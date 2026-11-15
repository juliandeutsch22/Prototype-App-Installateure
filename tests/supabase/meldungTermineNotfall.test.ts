/**
 * MELDUNGEN FÜR TERMINE UND NOTFÄLLE (Durchsicht 15.11.2026, V8) —
 * `20261116010800_meldung_termine_notfall.sql`.
 *
 * Gegenprobe: ohne die Migration merkt ein Termin niemanden vor (kein
 * Auslöser an `termine`), `push_einsatz` kennt keine Termine, und es gibt
 * weder `push_notfall` noch die Vorgabe `notify_notfall`. „Bleibt gleich“:
 * ein Termin in drei Tagen meldet sich nicht; wer selbst einträgt, bekommt
 * nichts; ein normaler Eingang hat keine Notfall-Empfänger.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const B = 'meldung-v8';
let chefin: Konto;
let pl: Konto;
let verwaltung: Konto;
let monteur: Konto;
let kunde = '';

const heute = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });
const tagPlus = (n: number) => {
  const d = new Date(`${heute()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const vorgemerkt = async (k: Konto) =>
  (await admin.from('user_prefs').select('einsatz_meldung_ab').eq('user_id', k.uid).single()).data?.einsatz_meldung_ab ?? null;

beforeAll(async () => {
  await betriebAnlegen(B);
  chefin = await konto(B, 'Geschäftsführung', 'v8chef');
  pl = await konto(B, 'Projektleiter', 'v8pl');
  verwaltung = await konto(B, 'Verwaltung', 'v8verw');
  monteur = await konto(B, 'Mitarbeiter', 'v8mon');
  await admin.from('users').update({ name: 'Max Monteur' }).eq('id', monteur.uid);
  const { data } = await admin.from('customers').insert({ company_id: B, name: 'Familie Huber' }).select('id').single();
  kunde = data!.id;
}, 120_000);

beforeEach(async () => {
  await admin.from('termine').delete().eq('company_id', B);
  for (const k of [chefin, pl, verwaltung, monteur]) {
    await admin.from('user_prefs').upsert({ user_id: k.uid, company_id: B, notify_einsaetze: true, einsatz_meldung_ab: null, einsatz_meldung_vorher: null });
  }
});

afterAll(async () => {
  await admin.from('termine').delete().eq('company_id', B);
  await admin.from('auftragseingaenge').delete().eq('company_id', B);
});

async function termin(wer: Konto, datum: string, teilnehmer: string[]) {
  const { data, error } = await wer.client.from('termine').insert({
    company_id: B, art: 'Besichtigung', datum, zeit_von: '08:00', customer_id: kunde, ort_name: 'Familie Huber', teilnehmer,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

describe('Termine im Plan der Person', () => {
  it('ein Termin für morgen merkt den Teilnehmer vor — nicht den, der einträgt', async () => {
    await termin(verwaltung, tagPlus(1), [monteur.uid, verwaltung.uid]);
    expect(await vorgemerkt(monteur)).not.toBeNull();
    expect(await vorgemerkt(verwaltung)).toBeNull();
  });

  it('auch Verschieben und Löschen merkt vor (vorher und nachher)', async () => {
    const id = await termin(verwaltung, tagPlus(5), [monteur.uid]);
    expect(await vorgemerkt(monteur)).toBeNull();
    await verwaltung.client.from('termine').update({ datum: tagPlus(1) }).eq('id', id);
    expect(await vorgemerkt(monteur)).not.toBeNull();
    await admin.from('user_prefs').update({ einsatz_meldung_ab: null }).eq('user_id', monteur.uid);
    await verwaltung.client.from('termine').delete().eq('id', id);
    expect(await vorgemerkt(monteur)).not.toBeNull();
  });

  it('bleibt gleich: ein Termin in drei Tagen meldet sich nicht', async () => {
    await termin(verwaltung, tagPlus(3), [monteur.uid]);
    expect(await vorgemerkt(monteur)).toBeNull();
  });

  it('push_einsatz nennt die Termine je Tag', async () => {
    await termin(verwaltung, tagPlus(1), [monteur.uid]);
    const { data, error } = await admin.rpc('push_einsatz', { p_user: monteur.uid });
    expect(error).toBeNull();
    expect((data as { termine_heute: unknown[]; termine_morgen: unknown[] }).termine_heute).toEqual([]);
    expect((data as { termine_morgen: unknown[] }).termine_morgen).toEqual([{ art: 'Besichtigung', wo: 'Familie Huber', von: '08:00' }]);
  });

  it('push_einsatz gibt nur der Dienst heraus', async () => {
    expect((await monteur.client.rpc('push_einsatz', { p_user: monteur.uid })).error).not.toBeNull();
  });
});

describe('Notfall im Auftragseingang', () => {
  async function eingang(dringlichkeit: string): Promise<string> {
    const { data, error } = await verwaltung.client.from('auftragseingaenge').insert({
      company_id: B, quelle: 'telefon', customer_id: kunde, anliegen: 'Rohrbruch', ort: 'Linkgasse 1, 1010 Wien', dringlichkeit,
    }).select('id').single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }

  it('die Führung bekommt ihn — Nummer und Ort, nicht die Verwaltung, die erfasst hat', async () => {
    const id = await eingang('notfall');
    const { data, error } = await admin.rpc('push_notfall', { p_eingang: id });
    expect(error).toBeNull();
    const e = data as { nummer: string; ort: string; empfaenger: string[] };
    expect(e.ort).toBe('Linkgasse 1, 1010 Wien');
    expect(e.nummer).toBeTruthy();
    expect([...e.empfaenger].sort()).toEqual([chefin.uid, pl.uid].sort());
  });

  it('bleibt gleich: ein normaler Eingang hat keine Notfall-Meldung', async () => {
    const id = await eingang('normal');
    expect((await admin.rpc('push_notfall', { p_eingang: id })).data).toBeNull();
  });

  it('die Vorgabe ist ab Werk an', async () => {
    const { data } = await admin.from('user_prefs').select('notify_notfall').eq('user_id', chefin.uid).single();
    expect(data?.notify_notfall).toBe(true);
  });
});
