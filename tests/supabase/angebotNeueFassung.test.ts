/**
 * Testbericht 30.09.2026, M17 — ein versendetes Angebot wird als neue Fassung
 * überarbeitet: eigener Entwurf, eigene Nummer, Verweis auf den Vorgänger.
 * Gegenprobe: der Vorgänger selbst bleibt unveränderbar, und ein Verweis auf
 * ein Angebot eines anderen Betriebs geht nicht.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { betriebAnlegen, konto, type Konto } from './helfer';

const A = 'fassung-a';
const B = 'fassung-b';
let chefinA: Konto;
let chefinB: Konto;
let alt = '';
let fremd = '';

function kopf(nummer: string, extra: Record<string, unknown> = {}) {
  return {
    quote_number: nummer, customer_name: 'Familie Huber',
    quote_date: '2099-03-01', valid_until: '2099-03-31', vat_rate: 0.2, ...extra,
  };
}
const ZEILE = [{ label: 'Arbeitszeit', qty: 2, unit: 'h', unit_price: 80, netto: 160, ist_arbeitszeit: true }];

beforeAll(async () => {
  await betriebAnlegen(A);
  await betriebAnlegen(B);
  chefinA = await konto(A, 'Geschäftsführung', 'fassagf');
  chefinB = await konto(B, 'Geschäftsführung', 'fassbgf');
  const a = await chefinA.client.rpc('angebot_speichern', {
    p_id: null, p_kopf: kopf('AN-2099-0001', { status: 'Versendet' }), p_positionen: ZEILE,
  });
  if (a.error) throw new Error(a.error.message);
  alt = String(a.data);
  const b = await chefinB.client.rpc('angebot_speichern', { p_id: null, p_kopf: kopf('AN-2099-0001'), p_positionen: ZEILE });
  if (b.error) throw new Error(b.error.message);
  fremd = String(b.data);
}, 60_000);

describe('Neue Fassung (M17)', () => {
  it('ein neuer Entwurf mit Verweis auf das versendete Angebot', async () => {
    const { data, error } = await chefinA.client.rpc('angebot_speichern', {
      p_id: null, p_kopf: kopf('AN-2099-0002', { vorgaenger_id: alt }), p_positionen: ZEILE,
    });
    expect(error).toBeNull();
    const neu = await chefinA.client.from('quotes').select('status, vorgaenger_id').eq('id', String(data)).single();
    expect(neu.data).toEqual({ status: 'Entwurf', vorgaenger_id: alt });
  });

  it('Gegenprobe: das versendete selbst ändert sich weiterhin nicht', async () => {
    const { error } = await chefinA.client.rpc('angebot_speichern', {
      p_id: alt, p_kopf: { notes: 'geändert' }, p_positionen: null,
    });
    expect(error?.message).toMatch(/Nur ein Entwurf lässt sich ändern/);
  });

  it('kein Verweis auf ein Angebot eines anderen Betriebs', async () => {
    const { error } = await chefinA.client.rpc('angebot_speichern', {
      p_id: null, p_kopf: kopf('AN-2099-0003', { vorgaenger_id: fremd }), p_positionen: ZEILE,
    });
    expect(error?.message).toMatch(/gibt es in diesem Betrieb nicht/);
  });
});
