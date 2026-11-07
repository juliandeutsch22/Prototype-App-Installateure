/** Audit: Einkaufs-Leseliste mit vielen Artikel-IDs.
 * Nur synthetische UUIDs und ein lesender Dummy-Client; kein Produktivzugriff.
 * it.fails bedeutet ausdrücklich: noch unbehobener Defekt.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { katalogFuer } from '@/lib/db/pg/einkauf';

function leererLeser(): SupabaseClient {
  const builder = {
    eq() { return this; },
    in() { return this; },
    order() { return this; },
    range: async () => ({ data: [], error: null, count: 0 }),
  };
  return { from: () => ({ select: () => builder }) } as unknown as SupabaseClient;
}
afterEach(() => clientEinreichen(null));
describe('Audit: Artikelnummern einer großen Einkaufsliste', () => {
  it('fragt drei unterschiedliche Artikel wie bisher ab', async () => {
    clientEinreichen(leererLeser());
    const ids = Array.from({ length: 3 }, () => crypto.randomUUID());
    await expect(katalogFuer('audit', ids)).resolves.toEqual(new Map());
  });
  it.fails('lehnt 103 unterschiedliche Artikel-UUIDs nicht schon vor dem Server-Aufruf ab', async () => {
    clientEinreichen(leererLeser());
    const ids = Array.from({ length: 103 }, () => crypto.randomUUID());
    await expect(katalogFuer('audit', ids)).resolves.toEqual(new Map());
  });
});
