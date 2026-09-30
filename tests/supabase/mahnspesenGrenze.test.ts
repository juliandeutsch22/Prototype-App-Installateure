/**
 * Testbericht 30.09.2026, M22 — Mahnspesen an Firmenkunden höchstens 40 € je
 * Rechnung (§ 458 UGB), in der Datenbank geprüft, gleich über welchen Weg.
 * Gegenprobe: bis 40 € geht es, und an Privatkunden sperrt die Datenbank
 * nichts (dort warnt nur die Maske).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'mahn-m22';
let chefin: Konto;
let buch: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'm22gf');
  buch = await konto(BETRIEB, 'Buchhaltung', 'm22buch');
  const { error } = await admin.from('companies')
    .update({ rates: { fach: 65, helper: 45, nightSurcharge: 0.5, emergencySurcharge: 1, vatRate: 0.2, dueDays: 14 } })
    .eq('id', BETRIEB);
  if (error) throw new Error(error.message);
}, 60_000);

async function rates(): Promise<Record<string, unknown>> {
  const { data } = await admin.from('companies').select('rates').eq('id', BETRIEB).single();
  return (data?.rates ?? {}) as Record<string, unknown>;
}

describe('Die Leitung schreibt die Sätze direkt', () => {
  it('über 40 € an Firmenkunden: abgewiesen', async () => {
    const { error } = await chefin.client.from('companies')
      .update({ rates: { ...(await rates()), mahnspesen: [10, 20, 30] } }).eq('id', BETRIEB);
    expect(error?.message).toMatch(/höchstens 40 € je Rechnung/);
  });

  it('bis 40 € geht es', async () => {
    const { error } = await chefin.client.from('companies')
      .update({ rates: { ...(await rates()), mahnspesen: [0, 15, 25] } }).eq('id', BETRIEB);
    expect(error).toBeNull();
  });

  it('an Privatkunden sperrt die Datenbank nichts', async () => {
    const { error } = await chefin.client.from('companies')
      .update({ rates: { ...(await rates()), mahnspesenVerbraucher: [10, 1000, 1500] } }).eq('id', BETRIEB);
    expect(error).toBeNull();
  });
});

describe('Die Buchhaltung über ihre Funktion', () => {
  it('über 40 € an Firmenkunden: abgewiesen', async () => {
    const { error } = await buch.client.rpc('rechnungsvorgaben_speichern', { p_vorgaben: { mahnspesen: [50, 0, 0] } });
    expect(error?.message).toMatch(/höchstens 40 € je Rechnung/);
  });
});
