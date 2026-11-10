import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { updateProject } from '@/lib/db/projects';

/*
  WAS BEIM ÄNDERN EINER BAUSTELLE IN DER ZEILE LANDET (Befund 09.11.2026).

  Die Akte meldete „Baustelle gespeichert“, wenn das Stundenbudget geleert
  oder die Abrechnung auf „nicht festgelegt“ gestellt wurde — geschickt wurde
  `undefined`, und das fällt beim Umsetzen in die Zeile heraus. Geprüft wird
  hier die Zeile, die tatsächlich an die Datenbank geht: `null` muss darin
  stehen, ein weggelassenes Feld darf nicht darin stehen.
*/
let geschickt: Record<string, unknown>[] = [];

const leitung = {
  from: () => ({
    update: (zeile: Record<string, unknown>) => {
      geschickt.push(zeile);
      return { eq: async () => ({ error: null, count: 1 }) };
    },
  }),
} as unknown as SupabaseClient;

beforeEach(() => {
  geschickt = [];
  clientEinreichen(leitung);
});

afterEach(() => {
  clientEinreichen(null);
});

describe('Baustelle ändern — leeren heißt leeren', () => {
  it('ein geleertes Stundenbudget und „nicht festgelegt“ gehen als null in die Zeile', async () => {
    await updateProject('b1', { estimatedHours: null, billingMode: null });
    expect(geschickt).toHaveLength(1);
    expect(geschickt[0]).toHaveProperty('estimated_hours', null);
    expect(geschickt[0]).toHaveProperty('billing_mode', null);
  });

  it('Gegenprobe: ein eingetragenes Budget und eine Abrechnungsart gehen unverändert mit', async () => {
    await updateProject('b1', { estimatedHours: 40, billingMode: 'Pauschal' });
    expect(geschickt[0]).toMatchObject({ estimated_hours: 40, billing_mode: 'Pauschal' });
  });

  it('Gleichbleiben: wer die Felder nicht mitschickt, leert sie nicht', async () => {
    // Ein Teil-Update (etwa nur der Status) darf Budget und Abrechnung nicht anrühren.
    await updateProject('b1', { status: 'Abgeschlossen', estimatedHours: undefined });
    expect(geschickt[0]).toEqual({ status: 'Abgeschlossen' });
  });

  it('Gleichbleiben: ein geleertes Datum wird weiter zu null (M13)', async () => {
    await updateProject('b1', { endDate: '' });
    expect(geschickt[0]).toEqual({ end_date: null });
  });
});
