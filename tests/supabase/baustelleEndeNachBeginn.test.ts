/**
 * Testbericht 30.09.2026, M13 — eine Baustelle mit Ende vor dem Beginn weist
 * die Datenbank ab, gleich über welchen Weg. Gegenprobe: gleicher Tag geht,
 * und ohne Änderung eines Datums wird nicht geprüft.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'bau-m13';
let chefin: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'm13gf');
}, 60_000);

function baustelle(nummer: string, beginn: string | null, ende: string | null) {
  return {
    company_id: BETRIEB, project_number: nummer, customer_name: 'Kundin', status: 'Aktiv',
    start_date: beginn, end_date: ende,
  };
}

describe('Ende vor Beginn (M13)', () => {
  it('beim Anlegen: abgewiesen, mit Grund', async () => {
    const { error } = await chefin.client.from('projects').insert(baustelle('M13-1', '2026-10-05', '2026-10-01'));
    expect(error?.message).toMatch(/Das Ende \(01\.10\.2026\) liegt vor dem Beginn \(05\.10\.2026\)/);
  });

  it('Gegenprobe: Ende am selben Tag oder später geht', async () => {
    const a = await chefin.client.from('projects').insert(baustelle('M13-2', '2026-10-05', '2026-10-05'));
    expect(a.error).toBeNull();
    const b = await chefin.client.from('projects').insert(baustelle('M13-3', '2026-10-05', '2026-10-20'));
    expect(b.error).toBeNull();
  });

  it('ohne eines der beiden Daten gibt es nichts zu prüfen', async () => {
    const { error } = await chefin.client.from('projects').insert(baustelle('M13-4', null, '2026-10-01'));
    expect(error).toBeNull();
  });

  it('beim Ändern: das Ende vor den Beginn zu ziehen wird abgewiesen', async () => {
    const { error } = await chefin.client.from('projects')
      .update({ end_date: '2026-10-01' }).eq('company_id', BETRIEB).eq('project_number', 'M13-3');
    expect(error?.message).toMatch(/liegt vor dem Beginn/);
  });

  it('gilt auch für den Dienst-Schlüssel — jeder Weg, eine Regel', async () => {
    const { error } = await admin.from('projects')
      .update({ start_date: '2026-10-25' }).eq('company_id', BETRIEB).eq('project_number', 'M13-3');
    expect(error?.message).toMatch(/liegt vor dem Beginn/);
  });

  it('Gegenprobe: wer kein Datum anfasst, wird nicht geprüft', async () => {
    const { error } = await chefin.client.from('projects')
      .update({ customer_name: 'Kundin Neu' }).eq('company_id', BETRIEB).eq('project_number', 'M13-3');
    expect(error).toBeNull();
  });
});

// Testbericht 30.09.2026, G4 — die freiwillige Bezeichnung der Baustelle.
describe('Bezeichnung der Baustelle (G4)', () => {
  it('lässt sich speichern und bleibt leer, wenn niemand sie setzt', async () => {
    const mit = await chefin.client.from('projects')
      .insert({ ...baustelle('G4-1', null, null), bezeichnung: 'Bad 2. OG' }).select('bezeichnung').single();
    expect(mit.error).toBeNull();
    expect(mit.data?.bezeichnung).toBe('Bad 2. OG');
    const ohne = await chefin.client.from('projects').insert(baustelle('G4-2', null, null)).select('bezeichnung').single();
    expect(ohne.data?.bezeichnung).toBeNull();
  });

  it('höchstens 120 Zeichen', async () => {
    const { error } = await chefin.client.from('projects')
      .insert({ ...baustelle('G4-3', null, null), bezeichnung: 'x'.repeat(121) });
    expect(error?.code).toBe('23514');
  });
});

// Testbericht 30.09.2026, M16 — die dritte Abrechnungsart.
describe('Abrechnung Einheitspreis (M16)', () => {
  it('eine Baustelle nach Einheitspreis lässt sich anlegen', async () => {
    const { error } = await chefin.client.from('projects')
      .insert({ ...baustelle('M16-1', null, null), billing_mode: 'Einheitspreis' });
    expect(error).toBeNull();
  });

  it('Gegenprobe: ein unbekannter Wert wird weiter abgewiesen', async () => {
    const { error } = await chefin.client.from('projects')
      .insert({ ...baustelle('M16-2', null, null), billing_mode: 'Stundenlohn' });
    expect(error?.code).toBe('23514');
  });
});
