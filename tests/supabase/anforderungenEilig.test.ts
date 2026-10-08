import { beforeAll, expect, it } from 'vitest';
import { admin, betriebAnlegen, einblickBeginnen, konto, plattformkonto, type Konto } from './helfer';

const betrieb = 'eilanforderungen';
let chef: Konto, pl: Konto, verwaltung: Konto, monteur: Konto, fremd: Konto;
const id = crypto.randomUUID(), fertig = crypto.randomUUID(), retoure = crypto.randomUUID();
beforeAll(async () => {
  await betriebAnlegen(betrieb);
  await betriebAnlegen(`${betrieb}-fremd`);
  chef = await konto(betrieb, 'Geschäftsführung', 'eilchef');
  pl = await konto(betrieb, 'Projektleiter', 'eilpl');
  verwaltung = await konto(betrieb, 'Verwaltung', 'eilverwaltung');
  monteur = await konto(betrieb, 'Mitarbeiter', 'eilmonteur');
  fremd = await konto(`${betrieb}-fremd`, 'Geschäftsführung', 'eilfremd');
  expect((await admin.from('material_orders').insert([
    { id, status: 'Offen', transaction_type: 'order' },
    { id: fertig, status: 'Erledigt', transaction_type: 'order', processed: true },
    { id: retoure, status: 'Offen', transaction_type: 'return', condition: 'neu' },
  ].map((a) => ({ company_id: betrieb, user_id: monteur.uid, user_name: 'Milan',
    material_name: 'Ventil', quantity: 2, is_urgent: false, processed: false, ...a })))).error).toBeNull();
});

it('setzt und entfernt die Priorität durch Büro und Leitung ohne andere Felder zu ändern', async () => {
  const vorher = (await admin.from('material_orders').select('*').eq('id', id).single()).data!;
  for (const k of [chef, pl, verwaltung]) {
    expect((await k.client.rpc('anforderung_eilig', { p_id: id, p_eilig: true })).error).toBeNull();
    expect((await k.client.rpc('anforderung_eilig', { p_id: id, p_eilig: true })).error).toBeNull();
    expect((await k.client.rpc('anforderung_eilig', { p_id: id, p_eilig: false })).error).toBeNull();
  }
  const nachher = (await admin.from('material_orders').select('*').eq('id', id).single()).data!;
  delete vorher.updated_at;
  delete nachher.updated_at;
  expect(nachher).toEqual(vorher);
  expect((await admin.from('lagerbewegungen').select('id').eq('company_id', betrieb)).data).toEqual([]);
});
it('weist Monteur, fremden Betrieb und unbekannte Kennung ab', async () => {
  for (const k of [monteur, fremd]) {
    expect((await k.client.rpc('anforderung_eilig', { p_id: id, p_eilig: true })).error?.code).toBe('42501');
  }
  expect((await chef.client.rpc('anforderung_eilig', { p_id: crypto.randomUUID(), p_eilig: true })).error?.code).toBe('42501');
});
it('ändert keine erledigten Anforderungen oder Retouren', async () => {
  for (const p_id of [fertig, retoure]) {
    expect((await chef.client.rpc('anforderung_eilig', { p_id, p_eilig: true })).error?.code).toBe('55000');
  }
  expect((await chef.client.rpc('anforderung_eilig', { p_id: id, p_eilig: null })).error?.code).toBe('22023');
});
it('erlaubt einem nur lesenden Supportzugang keine Prioritätsänderung', async () => {
  const support = await plattformkonto('eil-support');
  const f = await chef.client.from('support_freigaben').insert({ company_id: betrieb,
    gewaehrt_von: chef.uid, grund: 'Priorität ansehen', stufe: 'ansehen',
    gilt_bis: new Date(Date.now() + 3_600_000).toISOString() }).select('id').single();
  expect(f.error).toBeNull();
  await einblickBeginnen(support, betrieb, f.data!.id);
  expect((await support.client.rpc('anforderung_eilig', { p_id: id, p_eilig: true })).error?.code).toBe('42501');
  expect((await admin.from('material_orders').select('is_urgent').eq('id', id).single()).data?.is_urgent).toBe(false);
});
