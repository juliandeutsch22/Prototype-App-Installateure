/**
 * NACHTRAG: EIN ANGEBOT AN EINE BESTEHENDE BAUSTELLE (Durchsicht 15.11.2026, A3 / F6).
 *
 * Vorher legte jede Annahme eine neue Baustelle an — auch der Nachtrag zu
 * einer laufenden; das Budget der bestehenden wuchs nicht mit. Ohne die
 * Migration `20261116040500` fehlt `angebot_annehmen_mit_ziel`, und ein
 * zweites Annehmen buchte über das „Anhängen“ nichts — die Prüfungen sind rot.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const A = 'a3-nachtrag';
let chefin: Konto;
let kunde = '';
let anderer = '';
let lauf = 0;

const BILD = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

async function angebot(stunden: number, extra: Record<string, unknown> = {}): Promise<string> {
  lauf += 1;
  const { data, error } = await chefin.client.rpc('angebot_speichern', {
    p_id: null,
    p_kopf: {
      quote_number: `AN-A3-${Date.now()}-${lauf}`, customer_id: kunde, customer_name: 'Familie Nach',
      quote_date: '2026-11-10', valid_until: '2099-12-31', vat_rate: 0.2, status: 'Versendet',
      kalkulierte_stunden: stunden, ...extra,
    },
    p_positionen: [{ label: 'Montage', qty: stunden || 1, unit: 'h', unit_price: 70, netto: 70 * (stunden || 1), ist_arbeitszeit: stunden > 0 }],
  });
  if (error) throw new Error(error.message);
  return String(data);
}

const mitZiel = (id: string, baustelle: string | null, abrechnung = 'Pauschal') =>
  chefin.client.rpc('angebot_annehmen_mit_ziel', { p_angebot: id, p_praefix: 'NT', p_abrechnung: abrechnung, p_baustelle: baustelle });

async function hauptauftrag(stunden = 10) {
  const id = await angebot(stunden);
  const { data: nummer, error } = await mitZiel(id, null);
  if (error) throw new Error(error.message);
  const p = (await admin.from('projects').select('*').eq('company_id', A).eq('project_number', nummer).single()).data as
    { id: string; project_number: string; estimated_hours: string | null; status: string };
  return { angebot: id, baustelle: p };
}
const projekt = async (id: string) =>
  (await admin.from('projects').select('*').eq('id', id).single()).data as Record<string, unknown>;
const zeile = async (id: string) =>
  (await admin.from('quotes').select('*').eq('id', id).single()).data as Record<string, unknown>;

beforeAll(async () => {
  await betriebAnlegen(A, 'Nachtrag Installationen');
  chefin = await konto(A, 'Geschäftsführung', 'a3-chefin');
  const k = await admin.from('customers').insert([{ company_id: A, name: 'Familie Nach' }, { company_id: A, name: 'Hausverwaltung Fremd' }]).select('id, name');
  const rows = k.data as { id: string; name: string }[];
  kunde = rows.find((r) => r.name === 'Familie Nach')!.id;
  anderer = rows.find((r) => r.name === 'Hausverwaltung Fremd')!.id;
}, 60_000);

describe('Nachtrag an eine Baustelle', () => {
  it('hängt an, statt eine zweite Baustelle anzulegen — das Budget wächst, das Angebot steht in der Akte', async () => {
    const { baustelle } = await hauptauftrag(10);
    const vorher = (await admin.from('projects').select('id').eq('company_id', A)).data!.length;
    const n = await angebot(4);
    const { data, error } = await mitZiel(n, baustelle.id);
    expect(error).toBeNull();
    expect(data).toBe(baustelle.project_number);
    expect((await admin.from('projects').select('id').eq('company_id', A)).data!.length).toBe(vorher);
    expect(Number((await projekt(baustelle.id)).estimated_hours)).toBe(14);
    expect(await zeile(n)).toMatchObject({ status: 'Angenommen', nachtrag: true, project_id: baustelle.id });
    // Nach verlorener Antwort noch einmal: dieselbe Baustelle, kein zweites Mal Budget.
    expect((await mitZiel(n, baustelle.id)).data).toBe(baustelle.project_number);
    expect(Number((await projekt(baustelle.id)).estimated_hours)).toBe(14);
  });

  it('ein vorher zugeordnetes Angebot hängt auch über den alten Weg und über den Link an', async () => {
    const { baustelle } = await hauptauftrag(8);
    const intern = await angebot(2, { project_number: baustelle.project_number });
    const r = await chefin.client.rpc('angebot_annehmen', { p_angebot: intern, p_praefix: 'NT', p_abrechnung: 'Pauschal' });
    expect(r.data).toBe(baustelle.project_number);
    expect(Number((await projekt(baustelle.id)).estimated_hours)).toBe(10);

    const ueberLink = await angebot(3, { project_number: baustelle.project_number });
    const { data: link } = await chefin.client.rpc('angebot_link_erzeugen', {
      p_angebot: ueberLink, p_abrechnung: 'Regie', p_praefix: 'NT', p_gueltig_bis: null,
    });
    const s = (link as { schluessel: string }).schluessel;
    const a = await admin.rpc('angebot_link_annehmen', { p_hash: sha(s), p_name: 'Nina Nach', p_unterschrift: BILD, p_bestaetigt: true });
    expect(a.error).toBeNull();
    expect(Number((await projekt(baustelle.id)).estimated_hours)).toBe(13);
    expect(await zeile(ueberLink)).toMatchObject({ nachtrag: true, project_id: baustelle.id });
    const { data: journal } = await admin.from('aenderungsjournal').select('aenderungen, von_name')
      .eq('objektart', 'baustelle').eq('objekt_id', baustelle.id).eq('von_name', 'Kunde über Link: Nina Nach');
    expect(journal).toEqual([{ aenderungen: { estimated_hours: { alt: 10, neu: 13 } }, von_name: 'Kunde über Link: Nina Nach' }]);
  });

  it('eine abgeschlossene Baustelle wird mit dem Nachtrag wieder aktiv', async () => {
    const { baustelle } = await hauptauftrag(5);
    await admin.from('projects').update({ status: 'Abgeschlossen' }).eq('id', baustelle.id);
    expect((await mitZiel(await angebot(1), baustelle.id)).error).toBeNull();
    expect(await projekt(baustelle.id)).toMatchObject({ status: 'Aktiv' });
  });

  it('nur an eine Baustelle desselben Kunden', async () => {
    const { baustelle } = await hauptauftrag(5);
    const fremd = await angebot(1, { customer_id: anderer, customer_name: 'Hausverwaltung Fremd' });
    const { error } = await mitZiel(fremd, baustelle.id);
    expect(error?.message).toMatch(/ein Nachtrag geht nur an eine Baustelle desselben Kunden/);
    expect(await zeile(fremd)).toMatchObject({ status: 'Versendet', project_number: null });
  });

  it('„neue Baustelle“ gilt, auch wenn das Angebot vorher einer zugeordnet war', async () => {
    const { baustelle } = await hauptauftrag(5);
    const q = await angebot(2, { project_number: baustelle.project_number });
    const { data } = await mitZiel(q, null, 'Regie');
    expect(data).not.toBe(baustelle.project_number);
    expect(await zeile(q)).toMatchObject({ nachtrag: false, status: 'Angenommen' });
    expect(Number((await projekt(baustelle.id)).estimated_hours)).toBe(5);
  });

  it('die Rücknahme eines Nachtrags zieht seine Stunden ab — die Baustelle bleibt', async () => {
    const { baustelle } = await hauptauftrag(6);
    const n = await angebot(4);
    await mitZiel(n, baustelle.id);
    const r = await chefin.client.rpc('angebot_annahme_zuruecknehmen', { p_angebot: n, p_grund: 'Nachtrag storniert' });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ ergebnis: 'nachtrag_entfernt', baustelle_id: baustelle.id });
    expect(await projekt(baustelle.id)).toMatchObject({ status: 'Aktiv' });
    expect(Number((await projekt(baustelle.id)).estimated_hours)).toBe(6);
    expect(await zeile(n)).toMatchObject({ status: 'Versendet', nachtrag: false, project_id: null });
  });

  it('bleibt gleich: ohne Baustelle entsteht wie bisher eine neue, mit dem Budget des Angebots', async () => {
    const { baustelle } = await hauptauftrag(7);
    expect(baustelle).toMatchObject({ status: 'Aktiv' });
    expect(Number(baustelle.estimated_hours)).toBe(7);
  });
});
