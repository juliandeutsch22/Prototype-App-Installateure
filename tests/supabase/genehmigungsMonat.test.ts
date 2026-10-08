import { beforeAll, describe, expect, it } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const betrieb = 'genehmigungsmonat';
let chef: Konto, genehmiger: Konto, monteur: Konto, fremd: Konto;
const args = { p_von: '2026-10-01', p_bis: '2026-10-31' };
beforeAll(async () => {
  await betriebAnlegen(betrieb);
  await betriebAnlegen(`${betrieb}-fremd`);
  chef = await konto(betrieb, 'Geschäftsführung', 'monatchef');
  genehmiger = await konto(betrieb, 'Mitarbeiter', 'monatgenehmiger');
  monteur = await konto(betrieb, 'Mitarbeiter', 'monatmonteur');
  fremd = await konto(`${betrieb}-fremd`, 'Geschäftsführung', 'monatfremd');
  expect((await admin.from('companies').update({ vacation_approvers: [genehmiger.uid], wochenplan_fuer_alle: false })
    .eq('id', betrieb)).error).toBeNull();
  expect((await admin.from('vacations').insert([
    { company_id: betrieb, user_id: monteur.uid, user_name: 'Milan', von: '2026-09-30', bis: '2026-10-02', tage: 3, status: 'Genehmigt' },
    { company_id: betrieb, user_id: monteur.uid, user_name: 'Milan', von: '2026-10-05', bis: '2026-10-05', tage: 1, status: 'Beantragt' },
    { company_id: betrieb, user_id: monteur.uid, user_name: 'Milan', von: '2026-11-01', bis: '2026-11-02', tage: 1, status: 'Genehmigt' },
  ])).error).toBeNull();
  expect((await admin.from('krankmeldungen').insert({ company_id: betrieb, user_id: monteur.uid,
    user_name: 'Milan', von: '2026-10-07', bis: '2026-10-08' })).error).toBeNull();
});

describe('Monat für Genehmigende mit unverändertem Schutz der Gründe', () => {
  it('beschränkt auf den Monat und genehmigte Abwesenheiten', async () => {
    const r = await chef.client.rpc('genehmigung_abwesend', args);
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(2);
    expect(r.data).toContainEqual(expect.objectContaining({ userId: monteur.uid, von: '2026-10-01', bis: '2026-10-02', grund: 'Urlaub' }));
    expect(r.data).toContainEqual(expect.objectContaining({ userId: monteur.uid, grund: 'Krank' }));
  });
  it('lässt ausdrücklich bestimmte Genehmigende auch ohne allgemeinen Wochenplanzugriff hinein', async () => {
    const r = await genehmiger.client.rpc('genehmigung_abwesend', args);
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(2);
    expect(r.data.every((a: { grund: string | null }) => a.grund === null)).toBe(true);
    expect(r.data.every((a: { userId: string; name: string }) => a.userId === monteur.uid && !!a.name)).toBe(true);
  });
  it('weist nicht genehmigende Personen und überlange Zeiträume ab', async () => {
    expect((await monteur.client.rpc('genehmigung_abwesend', args)).error?.code).toBe('42501');
    expect((await chef.client.rpc('genehmigung_abwesend', { p_von: '2026-01-01', p_bis: '2026-12-31' })).error?.code).toBe('22023');
    expect((await chef.client.rpc('genehmigung_abwesend', { p_von: '2026-10-02', p_bis: '2026-10-01' })).error?.code).toBe('22023');
  });
  it('liest ausschließlich den eigenen Betrieb', async () => {
    const r = await fremd.client.rpc('genehmigung_abwesend', args);
    expect(r.error).toBeNull();
    expect(r.data).toEqual([]);
  });
});
