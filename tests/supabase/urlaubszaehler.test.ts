/**
 * Testbericht 30.09.2026, G13 — der Urlaubszähler im Menü zählt nur, was die
 * Person entscheiden darf.
 *
 * Über den eigenen Antrag entscheidet jemand anderer, sobald es so jemanden
 * gibt (Vier-Augen-Prinzip). Vorher zählte das Abzeichen ihn trotzdem mit.
 * Gegenprobe: gibt es niemanden sonst, entscheidet die Person selbst — dann
 * zählt er weiter.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'zaehler-g13';
const ALLEIN = 'zaehler-g13-allein';
let chef: Konto;
let buch: Konto;
let einzel: Konto;

async function urlaubsZahl(k: Konto): Promise<number> {
  const { data, error } = await k.client.rpc('offene_posten', { p_heute: '2026-09-30' });
  if (error) throw new Error(error.message);
  const z = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
  return Number(z.urlaub);
}

async function antrag(betrieb: string, uid: string) {
  const { error } = await admin.from('vacations').insert({
    company_id: betrieb, user_id: uid, user_name: 'Wer auch immer',
    von: '2026-11-02', bis: '2026-11-06', tage: 5, status: 'Beantragt',
  });
  if (error) throw new Error(error.message);
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(ALLEIN);
  chef = await konto(BETRIEB, 'Geschäftsführung', 'g13chef');
  buch = await konto(BETRIEB, 'Buchhaltung', 'g13buch');
  einzel = await konto(ALLEIN, 'Geschäftsführung', 'g13allein');
  await antrag(BETRIEB, buch.uid);
  await antrag(ALLEIN, einzel.uid);
}, 60_000);

describe('Der eigene Antrag', () => {
  it('zählt nicht, wenn jemand anderer ihn entscheidet', async () => {
    expect(await urlaubsZahl(buch)).toBe(0);
  });

  it('bei dem, der entscheidet, zählt er', async () => {
    expect(await urlaubsZahl(chef)).toBe(1);
  });

  it('Gegenprobe: ist niemand anderer da, zählt er weiter', async () => {
    expect(await urlaubsZahl(einzel)).toBe(1);
  });
});
