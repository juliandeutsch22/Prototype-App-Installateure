/**
 * Grenzen aus den Verläufen geschlossen (Stand 18, G, 12.10.2026) — gegen die
 * echte Datenbank, `20261012300000_grenzen_verlaeufe.sql`.
 *
 * G2: Wer einen Urlaub genehmigt (einen Sonderurlaub bestätigt) hat, bleibt
 * nach einer Rücknahme stehen — und zählt in seiner Datenauskunft mit.
 * G3: Ein falscher Wartungstag wird berichtigt, nicht verdoppelt.
 *
 * Gegenprobe: ohne die Migration fehlen Spalten und Funktion (rot), und
 * die Genehmigung eines später zurückgenommenen Antrags fehlt in der
 * Datenauskunft des Genehmigenden. Gleich bleibt: Ablehnungen setzen keinen
 * Genehmigenden; ein im Formular geänderter Tag ohne Berichtigung trägt wie
 * bisher eine weitere Ausführung ein; frühere Ausführungen bleiben.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as wartungen from '@/lib/db/pg/wartungen';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'grenzen-g';
const ANDERER = 'grenzen-g2';

let chef: Konto;
let verwalterin: Konto;
let monteur: Konto;
let fremd: Konto;
let kunde: string;

async function zeile(tabelle: string, id: string, spalten: string) {
  const { data, error } = await admin.from(tabelle).select(spalten).eq('id', id).single();
  if (error) throw new Error(error.message);
  return data as unknown as Record<string, string | null>;
}

async function name(k: Konto): Promise<string> {
  return (await zeile('users', k.uid, 'name')).name as string;
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(ANDERER);
  chef = await konto(BETRIEB, 'Geschäftsführung', 'gchef');
  verwalterin = await konto(BETRIEB, 'Administrator', 'gadm');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'gmont');
  fremd = await konto(ANDERER, 'Geschäftsführung', 'gfremd');
  const { data, error } = await admin.from('customers').insert({ company_id: BETRIEB, name: 'Familie Gruber' })
    .select('id').single();
  if (error) throw new Error(error.message);
  kunde = (data as { id: string }).id;
}, 180_000);

describe('G2: wer genehmigt hat, bleibt nach der Rücknahme', () => {
  async function antrag(von: string): Promise<string> {
    const { data, error } = await admin.from('vacations').insert({
      company_id: BETRIEB, user_id: monteur.uid, user_name: 'Monteur', von, bis: von, tage: 1, status: 'Beantragt',
    }).select('id').single();
    if (error) throw new Error(error.message);
    return (data as { id: string }).id;
  }

  it('Urlaub: genehmigt von der Chefin, zurückgenommen von der Verwalterin', async () => {
    const id = await antrag('2027-04-05');
    // Den Namen schickt die App mit, wie in `callUrlaubEntscheiden`.
    expect((await chef.client.rpc('urlaub_entscheiden', {
      p_antrag: id, p_entscheidung: 'Genehmigt', p_grund: '', p_entscheider_name: 'Eva Chef',
    })).error).toBeNull();
    expect((await verwalterin.client.rpc('urlaub_entscheiden', {
      p_antrag: id, p_entscheidung: 'Storniert', p_grund: 'Großauftrag', p_entscheider_name: 'Vera Verwaltung',
    })).error).toBeNull();
    const z = await zeile('vacations', id, 'status, genehmigt_von_uid, genehmigt_von_name, entschieden_von_uid, entschieden_von_name');
    expect(z).toEqual({
      status: 'Storniert', genehmigt_von_uid: chef.uid, genehmigt_von_name: 'Eva Chef',
      entschieden_von_uid: verwalterin.uid, entschieden_von_name: 'Vera Verwaltung',
    });
  });

  it('Sonderurlaub: bestätigt von der Chefin, zurückgenommen von der Verwalterin', async () => {
    const { data, error } = await monteur.client.rpc('freistellung_beantragen', {
      p_art: 'dienstverhinderung', p_anlass: 'musterung', p_ereignis: '2027-04-12', p_von: '2027-04-12', p_bis: '2027-04-12',
      p_zeit_von: null, p_zeit_bis: null, p_kind_unter_12: false, p_zusatzwoche: false, p_notiz: null,
    });
    expect(error).toBeNull();
    const id = data as string;
    const entscheiden = (k: Konto, e: string, grund = '') => k.client.rpc('freistellung_entscheiden', {
      p_id: id, p_entscheidung: e, p_grund: grund, p_nachweis_geprueft: true, p_kuerzung: null,
    });
    expect((await entscheiden(chef, 'Bestätigt')).error).toBeNull();
    expect((await entscheiden(verwalterin, 'Storniert', 'doch nicht')).error).toBeNull();
    expect(await zeile('freistellungen', id, 'status, bestaetigt_von_uid, bestaetigt_von_name')).toEqual({
      status: 'Storniert', bestaetigt_von_uid: chef.uid, bestaetigt_von_name: await name(chef),
    });
  });

  it('gleich geblieben: eine Ablehnung setzt niemanden als Genehmigenden', async () => {
    const id = await antrag('2027-04-06');
    await chef.client.rpc('urlaub_entscheiden', { p_antrag: id, p_entscheidung: 'Abgelehnt', p_grund: 'Engpass' });
    expect(await zeile('vacations', id, 'genehmigt_von_uid, genehmigt_von_name'))
      .toEqual({ genehmigt_von_uid: null, genehmigt_von_name: null });
  });

  it('in der Datenauskunft zählt die Genehmigung bei der Chefin — auch nach der Rücknahme', async () => {
    const { data, error } = await chef.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: chef.uid });
    expect(error).toBeNull();
    const zahlen = (data as { als_bearbeiter: Record<string, number> }).als_bearbeiter;
    // Zwei Urlaube (genehmigt+zurückgenommen, abgelehnt), ein Sonderurlaub — keiner davon steht noch auf ihr als letzte Entscheidung außer der Ablehnung.
    expect(zahlen.urlaube_entschieden).toBe(2);
    expect(zahlen.freistellungen_entschieden).toBe(1);
  });
});

describe('G3: ein falscher Wartungstag wird berichtigt, nicht verdoppelt', () => {
  const vereinbarung = (anlage: string) => ({
    customerId: kunde, customerName: 'Familie Gruber', anlage, intervallMonate: 12, faelligAm: '2027-03-01', aktiv: true,
  });

  async function ausfuehrungen(id: string) {
    const { data } = await admin.from('wartung_ausfuehrungen').select('am, baustelle').eq('wartung_id', id).order('am');
    return data ?? [];
  }

  async function anlegen(anlage: string): Promise<string> {
    clientEinreichen(chef.client);
    return wartungen.createWartung(BETRIEB, vereinbarung(anlage) as Parameters<typeof wartungen.createWartung>[1]);
  }

  it('ersetzt die Ausführung am falschen Tag — die Baustelle geht mit, frühere bleiben', async () => {
    const id = await anlegen('Gastherme');
    await wartungen.wartungErledigt(id, { erledigtAm: '2025-03-03', intervallMonate: 12 });
    await wartungen.wartungErledigt(id, { erledigtAm: '2026-03-30', intervallMonate: 12, projectNumber: 'B-2026-0042' });
    expect(await ausfuehrungen(id)).toEqual([
      { am: '2025-03-03', baustelle: null },
      { am: '2026-03-30', baustelle: 'B-2026-0042' },
    ]);

    await wartungen.wartungTagBerichtigen(id, '2026-03-03');
    expect(await ausfuehrungen(id)).toEqual([
      { am: '2025-03-03', baustelle: null },
      { am: '2026-03-03', baustelle: 'B-2026-0042' },
    ]);
    expect((await zeile('wartungen', id, 'zuletzt_am')).zuletzt_am).toBe('2026-03-03');
    clientEinreichen(null);
  });

  it('fällt der richtige Tag auf eine vorhandene Ausführung, bleibt es eine', async () => {
    const id = await anlegen('Boiler');
    await wartungen.wartungErledigt(id, { erledigtAm: '2025-05-05', intervallMonate: 12 });
    await wartungen.wartungErledigt(id, { erledigtAm: '2026-05-05', intervallMonate: 12, projectNumber: 'B-2026-0050' });
    await wartungen.wartungTagBerichtigen(id, '2025-05-05');
    expect(await ausfuehrungen(id)).toEqual([{ am: '2025-05-05', baustelle: 'B-2026-0050' }]);
    clientEinreichen(null);
  });

  it('gleich geblieben: ohne Berichtigung trägt ein geänderter Tag eine weitere Ausführung ein', async () => {
    const id = await anlegen('Speicher');
    await wartungen.wartungErledigt(id, { erledigtAm: '2026-06-30', intervallMonate: 12 });
    await wartungen.updateWartung(id, { zuletztAm: '2026-06-03' });
    expect((await ausfuehrungen(id)).map((a) => a.am)).toEqual(['2026-06-03', '2026-06-30']);
    clientEinreichen(null);
  });

  it('nur die Führung im eigenen Betrieb', async () => {
    const id = await anlegen('Pumpe');
    await wartungen.wartungErledigt(id, { erledigtAm: '2026-07-07', intervallMonate: 12 });
    clientEinreichen(null);

    const vomMonteur = await monteur.client.rpc('wartung_tag_berichtigen', { p_wartung: id, p_am: '2026-07-01' });
    expect(vomMonteur.error?.code).toBe('42501');
    const vonFremd = await fremd.client.rpc('wartung_tag_berichtigen', { p_wartung: id, p_am: '2026-07-01' });
    expect(vonFremd.error?.code).toBe('P0002');
    const ohneTag = await chef.client.rpc('wartung_tag_berichtigen', { p_wartung: id, p_am: null });
    expect(ohneTag.error?.code).toBe('22023');
    expect((await ausfuehrungen(id)).map((a) => a.am)).toEqual(['2026-07-07']);
  });

  it('gleich geblieben: ohne bisherigen Tag ist der neue einfach die erste Ausführung', async () => {
    const id = await anlegen('Wärmepumpe');
    await wartungen.wartungTagBerichtigen(id, '2026-08-08');
    expect(await ausfuehrungen(id)).toEqual([{ am: '2026-08-08', baustelle: null }]);
    clientEinreichen(null);
  });
});
