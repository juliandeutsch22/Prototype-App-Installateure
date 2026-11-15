/**
 * M9 (Entscheidung des Auftraggebers, 15.11.2026): EIN AUSGELAUFENER ARTIKEL
 * IST NICHT „KNAPP“ — auch mit Mindestmenge, gleich ob vom Katalog oder von
 * Hand ausgelaufen. Er wird nicht mehr nachbestellt.
 *
 * Gegenprobe: ohne 20261116060100 gibt `lager_knapp` beide ausgelaufenen
 * Artikel zurück, und die App-Regel (`istKnapp`) wiche von der Datenbank ab.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { lagerFrei, lagerKnapp, listLagerartikel } from '@/lib/db/pg/materials';
import { istKnapp } from '@/features/orders/lagerartikel';

const BETRIEB = 'm9-ausgelaufen';
const GRENZE = 5;
let lager: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  lager = await konto(BETRIEB, 'Verwaltung', 'm9-lager');
  const { error } = await admin.from('materials').insert([
    { id: randomUUID(), company_id: BETRIEB, name: 'Fitting alt (Katalog)', unit: 'Stk', stock: 2, lagerartikel: true, mindestmenge: 10, ausgelaufen: true },
    { id: randomUUID(), company_id: BETRIEB, name: 'Fitting alt (von Hand)', unit: 'Stk', stock: 1, lagerartikel: true, ausgelaufen: true, ausgelaufen_von_hand: true },
    { id: randomUUID(), company_id: BETRIEB, name: 'Fitting neu', unit: 'Stk', stock: 2, lagerartikel: true, mindestmenge: 10 },
    { id: randomUUID(), company_id: BETRIEB, name: 'Fitting voll', unit: 'Stk', stock: 20, lagerartikel: true, mindestmenge: 10 },
  ]);
  if (error) throw new Error(error.message);
  clientEinreichen(lager.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('M9: ausgelaufen ist nicht knapp', () => {
  it('die Startseite (`lager_knapp`) nennt nur den nicht ausgelaufenen Artikel unter Mindestmenge', async () => {
    expect((await lagerKnapp(GRENZE)).map((a) => a.name)).toEqual(['Fitting neu']);
  });

  it('App und Datenbank rechnen dieselbe Regel', async () => {
    const artikel = await listLagerartikel(BETRIEB);
    const frei = await lagerFrei(artikel.map((m) => m.id));
    const app = artikel
      .filter((m) => istKnapp(frei.get(m.id)?.frei ?? m.stock, m, GRENZE))
      .map((m) => m.name);
    expect(app).toEqual(['Fitting neu']);
    // Die ausgelaufenen bleiben im Lager sichtbar — nur ohne Warnung.
    expect(artikel.map((m) => m.name).sort()).toEqual(
      ['Fitting alt (Katalog)', 'Fitting alt (von Hand)', 'Fitting neu', 'Fitting voll'],
    );
  });
});
