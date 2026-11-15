/**
 * „WARTUNG ERLEDIGT“ OHNE BAUSTELLE HAT KEINE BAUSTELLE (Durchsicht
 * 15.11.2026, A13 / Befund B14) — gegen eine echte Datenbank.
 *
 * Vorher erbte eine ohne Baustelle eingetragene Ausführung die Baustelle der
 * vorigen Wartung. Gegenprobe: ohne `20261116045000` sind die mit „rot ohne
 * die Änderung“ markierten Fälle rot (die Ausführung trägt `B-…-alt`, und
 * `wartung_erledigt_eintragen` gibt es nicht); die „bleibt gleich“-Fälle
 * sind vorher und nachher grün.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as wartungen from '@/lib/db/pg/wartungen';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'a13-wartung';
const FREMD = 'a13-wartung-fremd';
const L = crypto.randomUUID().slice(0, 6);

let chef: Konto;
let monteur: Konto;
let fremd: Konto;
let kunde: string;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  chef = await konto(BETRIEB, 'Geschäftsführung', 'a13chef');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'a13mont');
  fremd = await konto(FREMD, 'Geschäftsführung', 'a13fremd');
  const { data, error } = await admin.from('customers').insert({ company_id: BETRIEB, name: 'Familie Gruber' })
    .select('id').single();
  if (error) throw new Error(error.message);
  kunde = (data as { id: string }).id;
}, 180_000);

afterAll(() => clientEinreichen(null));

async function anlegen(anlage: string): Promise<string> {
  clientEinreichen(chef.client);
  return wartungen.createWartung(BETRIEB, {
    customerId: kunde, customerName: 'Familie Gruber', anlage, intervallMonate: 12,
    faelligAm: '2025-10-01', aktiv: true,
  } as Parameters<typeof wartungen.createWartung>[1]);
}

async function ausfuehrungen(id: string) {
  const { data, error } = await admin.from('wartung_ausfuehrungen').select('am, baustelle')
    .eq('wartung_id', id).order('am');
  if (error) throw new Error(error.message);
  return data as { am: string; baustelle: string | null }[];
}

async function zeile(id: string) {
  const { data, error } = await admin.from('wartungen')
    .select('letzte_baustelle, offene_baustelle, zuletzt_am, faellig_am, intervall_monate').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}

describe('A13 — der Bezug einer erledigten Wartung', () => {
  it('rot ohne die Änderung: ohne Baustelle erledigt, steht die Ausführung ohne Baustelle', async () => {
    const id = await anlegen('Gastherme');
    const alt = `B-${L}-alt`;
    await wartungen.wartungEingeplant(id, alt);
    await wartungen.wartungErledigt(id, { erledigtAm: '2025-10-20', intervallMonate: 12, projectNumber: alt });
    await wartungen.wartungErledigt(id, { erledigtAm: '2026-10-19', intervallMonate: 12 });
    expect(await ausfuehrungen(id)).toEqual([
      { am: '2025-10-20', baustelle: alt },
      { am: '2026-10-19', baustelle: null },
    ]);
    expect(await zeile(id)).toMatchObject({
      letzte_baustelle: null, offene_baustelle: null, zuletzt_am: '2026-10-19', faellig_am: '2027-10-19',
    });
    clientEinreichen(null);
  });

  it('rot ohne die Änderung: die alte App (Zeilenänderung ohne Baustelle) erbt keine Baustelle mehr', async () => {
    const id = await anlegen('Boiler');
    const alt = `B-${L}-alt2`;
    await wartungen.wartungErledigt(id, { erledigtAm: '2025-05-05', intervallMonate: 12, projectNumber: alt });
    // So schrieb die alte App: das leere Feld fiel weg.
    const { error } = await chef.client.from('wartungen')
      .update({ zuletzt_am: '2026-05-04', faellig_am: '2027-05-04', offene_baustelle: null }).eq('id', id);
    expect(error).toBeNull();
    expect(await ausfuehrungen(id)).toEqual([
      { am: '2025-05-05', baustelle: alt },
      { am: '2026-05-04', baustelle: null },
    ]);
    clientEinreichen(null);
  });

  it('bleibt gleich: die alte App, erledigt auf der eingeplanten Baustelle, behält den Bezug', async () => {
    const id = await anlegen('Speicher');
    const nr = `B-${L}-jahr`;
    await wartungen.wartungEingeplant(id, nr);
    await wartungen.wartungErledigt(id, { erledigtAm: '2025-06-06', intervallMonate: 12, projectNumber: nr });
    await wartungen.wartungEingeplant(id, nr);
    const { error } = await chef.client.from('wartungen')
      .update({ zuletzt_am: '2026-06-05', faellig_am: '2027-06-05', offene_baustelle: null, letzte_baustelle: nr }).eq('id', id);
    expect(error).toBeNull();
    expect(await ausfuehrungen(id)).toEqual([
      { am: '2025-06-06', baustelle: nr },
      { am: '2026-06-05', baustelle: nr },
    ]);
    clientEinreichen(null);
  });

  it('bleibt gleich: ausdrücklich dieselbe Baustelle wie zuvor zählt — auch ungeplant', async () => {
    const id = await anlegen('Wärmepumpe');
    const nr = `B-${L}-dauer`;
    await wartungen.wartungErledigt(id, { erledigtAm: '2025-07-07', intervallMonate: 12, projectNumber: nr });
    await wartungen.wartungErledigt(id, { erledigtAm: '2026-07-06', intervallMonate: 12, projectNumber: nr });
    expect(await ausfuehrungen(id)).toEqual([
      { am: '2025-07-07', baustelle: nr },
      { am: '2026-07-06', baustelle: nr },
    ]);
    clientEinreichen(null);
  });

  it('bleibt gleich: „berichtigen“ behält die Baustelle des berichtigten Durchgangs', async () => {
    const id = await anlegen('Pumpe');
    const nr = `B-${L}-ber`;
    await wartungen.wartungErledigt(id, { erledigtAm: '2026-03-30', intervallMonate: 12, projectNumber: nr });
    await wartungen.wartungTagBerichtigen(id, '2026-03-03');
    expect(await ausfuehrungen(id)).toEqual([{ am: '2026-03-03', baustelle: nr }]);
    expect((await zeile(id)).letzte_baustelle).toBe(nr);
    clientEinreichen(null);
  });

  it('nur die Führung im eigenen Betrieb, und ein brauchbares Intervall', async () => {
    const id = await anlegen('Kessel');
    clientEinreichen(null);
    const args = { p_wartung: id, p_am: '2026-08-08', p_faellig: '2027-08-08', p_intervall: 12, p_baustelle: null };
    const vomMonteur = await monteur.client.rpc('wartung_erledigt_eintragen', args);
    expect(vomMonteur.error?.code).toBe('42501');
    const vonFremd = await fremd.client.rpc('wartung_erledigt_eintragen', args);
    expect(vonFremd.error?.code).toBe('P0002');
    const ohneIntervall = await chef.client.rpc('wartung_erledigt_eintragen', { ...args, p_intervall: 0 });
    expect(ohneIntervall.error?.code).toBe('22023');
    expect(await ausfuehrungen(id)).toEqual([]);
  });
});
