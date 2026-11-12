/**
 * DER MATERIALSTAND EINER BAUSTELLE (E84) — gezählt in der Datenbank, mit
 * den Rechten der Anforderungen: Verwaltung, Buchhaltung, Führung ja; der
 * Monteur und ein fremder Betrieb bekommen nichts (nicht „null“).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { baustelleMaterialstand } from '@/lib/db/pg/projects';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'materialstand-a';
const FREMD = 'materialstand-b';
const BAU = 'PR-2026-0777';

let buero: Konto;
let monteur: Konto;
let fremd: Konto;

async function anforderung(status: string, rest: Record<string, unknown> = {}) {
  const { error } = await admin.from('material_orders').insert({
    id: crypto.randomUUID(), company_id: BETRIEB, material_name: 'Kugelhahn', quantity: 1, status, transaction_type: 'order',
    user_id: monteur.uid, user_name: 'Max', project_number: BAU, ...rest,
  });
  if (error) throw new Error(error.message);
}

async function schein(mitMaterial: number, status = 'Unterschrieben', nummer = BAU) {
  const id = crypto.randomUUID();
  const { error } = await admin.from('work_sheets').insert({
    id, company_id: BETRIEB, project_number: nummer, customer_name: 'Familie Huber', datum: '2026-05-04', status: 'Entwurf', abrechnung: 'Regie',
    erstellt_von_uid: monteur.uid, erstellt_von_name: 'Max',
  });
  if (error) throw new Error(error.message);
  for (let i = 0; i < mitMaterial; i++) {
    const m = await admin.from('work_sheet_material').insert({ company_id: BETRIEB, work_sheet_id: id, position: i, name: `Teil ${i}`, menge: 2 });
    if (m.error) throw new Error(m.error.message);
  }
  if (status !== 'Entwurf') {
    const u = await admin.from('work_sheets').update({ status }).eq('id', id);
    if (u.error) throw new Error(u.error.message);
  }
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  buero = await konto(BETRIEB, 'Verwaltung', 'mstbuero');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'mstmon');
  fremd = await konto(FREMD, 'Verwaltung', 'mstfremd');
  await anforderung('Offen');
  await anforderung('In Bearbeitung');
  // In anderer Schreibweise derselben Baustelle angefordert: zählt mit.
  await anforderung('Abholbereit', { project_number: '2026-0777' });
  await anforderung('Erledigt');
  await anforderung('Erledigt', { project_number: 'pr-2026-0777' });
  await anforderung('Erledigt', { transaction_type: 'return' });
  // Eine andere Baustelle: zählt nicht.
  await anforderung('Offen', { project_number: 'PR-2026-0001' });
  await schein(2);
  await schein(1);
  await schein(0);
  await schein(3, 'Entwurf');
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('baustelle_materialstand', () => {
  it('zählt Anforderungen nach Stand, Rückgaben und Scheine mit Material', async () => {
    clientEinreichen(buero.client);
    const s = await baustelleMaterialstand(BETRIEB, BAU);
    expect(s).toMatchObject({ angefordert: 2, abholbereit: 1, abgeholt: 2, zurueck: 1, scheineMitMaterial: 2, positionen: 3 });
    expect(s!.zuletzt).not.toBeNull();
  });

  it('dieselbe Antwort für jede Schreibweise der Nummer', async () => {
    clientEinreichen(buero.client);
    expect(await baustelleMaterialstand(BETRIEB, '2026-0777')).toMatchObject({ angefordert: 2, abgeholt: 2 });
  });

  it('eine Baustelle ohne alles: Nullen, nicht nichts', async () => {
    clientEinreichen(buero.client);
    expect(await baustelleMaterialstand(BETRIEB, 'PR-2026-9999')).toEqual({
      angefordert: 0, abholbereit: 0, abgeholt: 0, zurueck: 0, zuletzt: null, scheineMitMaterial: 0, positionen: 0,
    });
  });

  it('der Monteur bekommt nichts — wie bei den Anforderungen anderer', async () => {
    clientEinreichen(monteur.client);
    expect(await baustelleMaterialstand(BETRIEB, BAU)).toBeNull();
  });

  it('ein fremder Betrieb bekommt nichts, auch mit der richtigen Kennung', async () => {
    clientEinreichen(fremd.client);
    expect(await baustelleMaterialstand(BETRIEB, BAU)).toBeNull();
  });

});
