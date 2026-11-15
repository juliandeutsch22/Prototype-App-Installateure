/**
 * AUSTRITT IN EINEM ZUG (Durchsicht 15.11.2026, Z2) gegen die Datenbank:
 * der Saldo endet am Austrittstag, `austritt_folgen` nennt, was danach noch
 * offen ist, und eine laufende Zeitsitzung beendet das Büro erst nach dem
 * Austritt.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = `austritt-zug-${randomUUID().slice(0, 6)}`;
let buero: Konto;
let monteur: Konto;

const eintrag = (uid: string, date: string, status: string, rest: Record<string, unknown> = {}) => ({
  id: randomUUID(), company_id: BETRIEB, user_id: uid, user_name: 'Anton', date, status, break_duration: 0, ...rest,
});

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buero = await konto(BETRIEB, 'Buchhaltung', 'az-buero');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'az-anton');
  await admin.from('users').update({
    app_start_date: '2026-06-01', eintritt: '2026-06-01', weekly_target_hours: 40, work_days: [1, 2, 3, 4, 5], initial_overtime: 0,
  }).eq('id', monteur.uid);
  const zeilen = [];
  for (const t of ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-05', '2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12']) {
    zeilen.push(eintrag(monteur.uid, t, 'Anwesend', { start_time: '07:00', end_time: '15:30', break_duration: 30 }));
  }
  // Urlaub nach dem Austritt, stehen geblieben.
  for (const t of ['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18']) zeilen.push(eintrag(monteur.uid, t, 'Urlaub'));
  const { error } = await admin.from('time_entries').insert(zeilen);
  if (error) throw new Error(error.message);
  await admin.from('vacations').insert({
    id: randomUUID(), company_id: BETRIEB, user_id: monteur.uid, user_name: 'Anton', von: '2026-08-03', bis: '2026-08-07',
    tage: 5, status: 'Beantragt', art: 'Urlaub',
  });
  await admin.from('zeitsitzungen').insert({
    id: randomUUID(), company_id: BETRIEB, user_id: monteur.uid, stand: 'laeuft',
    segmente: [{ id: randomUUID(), art: 'arbeit', von: '2026-06-12T05:00:00Z', baustelle: '' }],
  });
}, 60_000);

describe('Austritt in einem Zug', () => {
  it('nennt, was nach dem Tag noch gebucht, beantragt und am Laufen ist', async () => {
    const { data, error } = await buero.client.rpc('austritt_folgen', { p_user: monteur.uid, p_tag: '2026-06-12' });
    expect(error).toBeNull();
    expect(data.buchungen).toEqual([{ status: 'Urlaub', anzahl: 4, von: '2026-06-15', bis: '2026-06-18' }]);
    expect(data.urlaub.map((u: { status: string }) => u.status)).toEqual(['Beantragt']);
    expect(data.sitzung.stand).toBe('laeuft');
  });

  it('Gegenprobe: der Monteur sieht das nicht', async () => {
    const { error } = await monteur.client.rpc('austritt_folgen', { p_user: monteur.uid, p_tag: '2026-06-12' });
    expect(error?.code).toBe('42501');
  });

  it('vor dem Austritt beendet das Büro die Sitzung nicht — sie gehört der Person', async () => {
    const { error } = await buero.client.rpc('zeitsitzung_beenden_fuer', { p_user: monteur.uid });
    expect(error?.code).toBe('22023');
  });

  it('der Saldo endet am Austrittstag: der Urlaub danach schreibt nichts gut', async () => {
    const { error } = await admin.from('users').update({ austritt: '2026-06-12', active: false }).eq('id', monteur.uid);
    expect(error).toBeNull();
    const { data } = await buero.client.rpc('zeitkonto_salden', { p_user: monteur.uid });
    expect(Number(data[0].saldo_h)).toBe(0);
    expect(data[0].tage_ohne_buchung).toBe(0);
  });

  it('nach dem Austritt beendet das Büro die laufende Sitzung, mit Grund', async () => {
    const { error } = await buero.client.rpc('zeitsitzung_beenden_fuer', { p_user: monteur.uid });
    expect(error).toBeNull();
    const { data } = await admin.from('zeitsitzungen').select('stand, grund').eq('user_id', monteur.uid).single();
    expect(data!.stand).toBe('verworfen');
    expect(data!.grund).toMatch(/Nach dem Austritt vom Büro beendet/);
  });
});
