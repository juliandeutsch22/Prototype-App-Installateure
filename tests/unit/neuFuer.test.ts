/**
 * „Neu für diesen Kunden“ (Durchsicht 15.11.2026, V3): Angebot, Baustelle,
 * Eingang und Wartung beginnen in der Akte, mit Kunde und Ort vorbelegt.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db/customers', () => ({ listCustomersByIds: vi.fn(async () => []) }));
vi.mock('@/lib/db/liegenschaften', () => ({ getLiegenschaft: vi.fn(async () => null) }));
const { neuFuerAdresse, neuFuerLesen, neuFuerMenue, ohneNeuFuer } = await import('@/features/customers/neuFuer');

describe('Neu für diesen Kunden (V3)', () => {
  it('die Vorbelegung reist in der Adresse und geht danach wieder weg', () => {
    const adresse = neuFuerAdresse('/quotes', { kunde: 'k1', liegenschaft: 'l1' });
    expect(adresse).toBe('/quotes?neu=fuer&kunde=k1&liegenschaft=l1');
    const p = new URLSearchParams(adresse.split('?')[1] + '&ansicht=alle');
    expect(neuFuerLesen(p)).toEqual({ kunde: 'k1', liegenschaft: 'l1' });
    expect(ohneNeuFuer(p).toString()).toBe('ansicht=alle');
    expect(neuFuerLesen(new URLSearchParams('kunde=k1'))).toBeNull();
  });

  it('das Menü bietet nur an, was die Rolle anlegen darf', () => {
    const titel = (rolle: Parameters<typeof neuFuerMenue>[0]) =>
      neuFuerMenue(rolle, undefined, { kunde: 'k1' }, () => undefined).map((i) => i.label);
    expect(titel('Geschäftsführung')).toEqual(['Neuer Eingang', 'Neues Angebot', 'Neue Baustelle', 'Neue Wartung']);
    expect(titel('Verwaltung')).toEqual(['Neuer Eingang']);
    expect(titel('Mitarbeiter')).toEqual([]);
  });
});
