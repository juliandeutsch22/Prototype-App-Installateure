/**
 * Welche Seite nach dem Passwort kommt — auch für die Buchhaltung
 * (11.10.2026, Plan 17 C).
 *
 * Die Grenze steht in der Datenbank (`app.zwei_faktor_rolle`, geprüft in
 * tests/supabase/zweiFaktorBuchhaltung.test.ts). Die App muss aber wissen,
 * dass sie fragen soll: fragte sie bei der Buchhaltung nicht, käme deren
 * Konto bei eingeschalteter Pflicht in eine App, in der jede Abfrage leer
 * ausfällt — statt auf die Seite zum Einrichten.
 *
 * Gegenprobe: gegen den Stand davor kommt die Buchhaltung ohne Einrichtung
 * durch (rot). Gleich bleiben Leitung (einrichten) und Verwaltung (keiner).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let rolle = '';
let stand: Record<string, unknown> = {};
const rpc = vi.fn(async () => ({ data: stand, error: null }));

vi.mock('@/lib/supabase', () => ({
  supabaseClient: () => ({
    rpc,
    auth: {
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }) },
      getSession: async () => ({ data: { session: { user: { app_metadata: { role: rolle } } } } }),
    },
  }),
}));

const { zweiterFaktorBedarf, ZWEI_FAKTOR_ROLLEN } = await import('@/lib/auth/pg/zweiFaktor');

beforeEach(() => {
  rpc.mockClear();
  stand = { pflicht: true, eingerichtet: false };
});

describe('Zweiter Faktor: wer gefragt wird', () => {
  it('die Buchhaltung richtet ihn ein, wenn der Betrieb ihn verlangt', async () => {
    rolle = 'Buchhaltung';
    expect(await zweiterFaktorBedarf()).toBe('einrichten');
    expect(rpc).toHaveBeenCalledWith('mein_zweiter_faktor');
  });

  it('ohne Pflicht im Betrieb kommt sie ohne weiter', async () => {
    rolle = 'Buchhaltung';
    stand = { pflicht: false, eingerichtet: false };
    expect(await zweiterFaktorBedarf()).toBe('keiner');
  });

  it('Leitung wie bisher, Verwaltung und Monteur ohne Nachfrage', async () => {
    rolle = 'Geschäftsführung';
    expect(await zweiterFaktorBedarf()).toBe('einrichten');
    rolle = 'Administrator';
    expect(await zweiterFaktorBedarf()).toBe('einrichten');
    rpc.mockClear();
    for (const r of ['Verwaltung', 'Projektleiter', 'Mitarbeiter']) {
      rolle = r;
      expect(await zweiterFaktorBedarf()).toBe('keiner');
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('dieselben Rollen wie in der Datenbank', () => {
    expect(ZWEI_FAKTOR_ROLLEN).toEqual(['Administrator', 'Geschäftsführung', 'Buchhaltung']);
  });
});
