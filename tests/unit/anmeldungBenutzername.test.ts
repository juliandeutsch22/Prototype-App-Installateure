/**
 * Die Anmeldeschicht mit Benutzernamen — was tatsächlich beim Anmeldedienst ankommt.
 *
 * DER GEFÄHRLICHE FALL IST DER STILLE: `resetPasswordForEmail` nimmt eine
 * Kunstadresse OHNE Fehler an. Ginge der Aufruf durch, stünde in der App
 * „Mail versendet" — und es kommt nie eine an.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { kunstadresse } from '@shared/benutzername';

const anmelden = vi.fn<[{ email: string; password: string }], Promise<{ error: null }>>(
  async () => ({ error: null }),
);
const zuruecksetzen = vi.fn<[string], Promise<{ error: null }>>(async () => ({ error: null }));
const aendern = vi.fn<[unknown], Promise<{ error: null }>>(async () => ({ error: null }));
let metadaten: Record<string, unknown> = {};

vi.mock('@/lib/supabase', () => ({
  merkenSetzen: vi.fn(),
  supabaseClient: () => ({
    auth: {
      signInWithPassword: anmelden,
      resetPasswordForEmail: zuruecksetzen,
      updateUser: aendern,
      getSession: () =>
        Promise.resolve({ data: { session: { user: { user_metadata: metadaten } } } }),
    },
  }),
}));

const sitzung = await import('@/lib/auth/pg/sitzung');

beforeEach(() => {
  anmelden.mockClear();
  zuruecksetzen.mockClear();
  aendern.mockClear();
  metadaten = {};
});

describe('Anmelden', () => {
  it('mit Benutzername geht als Kunstadresse hinaus', async () => {
    await sitzung.anmelden('Manfred.Huber', 'geheim-123', true);
    expect(anmelden.mock.calls[0][0]).toEqual({
      email: kunstadresse('manfred.huber'), password: 'geheim-123',
    });
  });

  it('mit Adresse bleibt die Adresse', async () => {
    await sitzung.anmelden('petra@perl.at', 'geheim-123', true);
    expect(anmelden.mock.calls[0][0].email).toBe('petra@perl.at');
  });
});

describe('Passwort vergessen', () => {
  it('schickt für einen Benutzernamen NICHTS los — und sagt es', async () => {
    await expect(sitzung.passwortZuruecksetzen('manfred.huber')).rejects.toThrow(/keinen Link/);
    await expect(sitzung.passwortZuruecksetzen(kunstadresse('manfred.huber')))
      .rejects.toThrow(/keinen Link/);
    expect(zuruecksetzen).not.toHaveBeenCalled();
  });

  it('schickt für eine Adresse den Link wie bisher', async () => {
    await sitzung.passwortZuruecksetzen('petra@perl.at');
    expect(zuruecksetzen).toHaveBeenCalledWith('petra@perl.at');
  });
});

describe('Das Startpasswort', () => {
  it('gilt nur bei wörtlich `true`', async () => {
    expect(await sitzung.startpasswortOffen()).toBe(false);
    metadaten = { startpasswort: 'ja' };
    expect(await sitzung.startpasswortOffen()).toBe(false);
    metadaten = { startpasswort: true };
    expect(await sitzung.startpasswortOffen()).toBe(true);
  });

  it('ist mit dem eigenen Passwort erledigt', async () => {
    await sitzung.passwortSetzen('mein-eigenes-1');
    expect(aendern).toHaveBeenCalledWith({
      password: 'mein-eigenes-1', data: { startpasswort: false },
    });
  });
});
