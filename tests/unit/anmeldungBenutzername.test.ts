/**
 * Die Anmeldeschicht mit Benutzernamen — was tatsächlich beim Anmeldedienst ankommt.
 *
 * DER GEFÄHRLICHE FALL IST DER STILLE: `resetPasswordForEmail` nimmt eine
 * Kunstadresse OHNE Fehler an. Ginge der Aufruf durch, stünde in der App
 * „Mail versendet" — und es kommt nie eine an.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { kunstadresse } from '@shared/benutzername';

const anmelden = vi.fn<(a0: { email: string; password: string }) => Promise<{ error: null }>>(
  async () => ({ error: null }),
);
const zuruecksetzen = vi.fn<(a0: string) => Promise<{ error: null }>>(async () => ({ error: null }));
const aendern = vi.fn<(a0: unknown) => Promise<{ error: { message: string; code?: string } | null }>>(
  async () => ({ error: null }),
);
let metadaten: Record<string, unknown> = {};

/** Der Prüf-Client für das aktuelle Passwort — getrennt vom Haupt-Client. */
const pruefAnmelden = vi.fn<(a0: { email: string; password: string }) => Promise<{ error: { message: string } | null }>>(
  async () => ({ error: null }),
);
const pruefAbmelden = vi.fn<(a0: { scope: string }) => Promise<{ error: null }>>(async () => ({ error: null }));

vi.mock('@/lib/supabase', () => ({
  merkenSetzen: vi.fn(),
  pruefClient: () => ({ auth: { signInWithPassword: pruefAnmelden, signOut: pruefAbmelden } }),
  supabaseClient: () => ({
    auth: {
      signInWithPassword: anmelden,
      resetPasswordForEmail: zuruecksetzen,
      updateUser: aendern,
      getSession: () =>
        Promise.resolve({
          data: { session: { user: { email: 'petra@perl.at', user_metadata: metadaten } } },
        }),
    },
  }),
}));

const sitzung = await import('@/lib/auth/pg/sitzung');

beforeEach(() => {
  anmelden.mockClear();
  zuruecksetzen.mockClear();
  aendern.mockClear().mockResolvedValue({ error: null });
  pruefAnmelden.mockClear().mockResolvedValue({ error: null });
  pruefAbmelden.mockClear();
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

describe('Passwort ändern verlangt das aktuelle (Launch-Check 25.09.2026, K7)', () => {
  it('prüft es mit dem Prüf-Client, nicht mit der laufenden Sitzung', async () => {
    await sitzung.passwortSetzen('neu-und-lang', 'alt-und-lang');
    expect(pruefAnmelden).toHaveBeenCalledWith({ email: 'petra@perl.at', password: 'alt-und-lang' });
    expect(anmelden).not.toHaveBeenCalled();
    // Nur die Prüfsitzung endet — `global` meldete auch dieses Gerät ab.
    expect(pruefAbmelden).toHaveBeenCalledWith({ scope: 'local' });
    expect(aendern).toHaveBeenCalled();
  });

  it('ändert nichts, wenn das aktuelle nicht stimmt — und sagt es auf Deutsch', async () => {
    pruefAnmelden.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    await expect(sitzung.passwortSetzen('neu-und-lang', 'falsch')).rejects.toThrow(
      'Das aktuelle Passwort stimmt nicht.',
    );
    expect(aendern).not.toHaveBeenCalled();
  });

  it('fragt nach einem Rücksetzlink nicht — dort kennt niemand das alte', async () => {
    await sitzung.passwortSetzen('neu-und-lang');
    expect(pruefAnmelden).not.toHaveBeenCalled();
    expect(aendern).toHaveBeenCalled();
  });
});

describe('Passwort ändern mit `secure_password_change` (offene Punkte B5)', () => {
  /*
    Der Dienst lässt eine Sitzung, die älter als ein Tag ist, kein Passwort
    mehr ändern. Den Einmalcode, den er dafür will, bekommt ein
    Benutzernamen-Konto nie — also meldet sich die App mit dem eben
    geprüften Passwort frisch an und ändert dann.
  */
  const nochmal = { message: 'Password update requires reauthentication', code: 'reauthentication_needed' };

  it('meldet sich frisch an — mit dem eben geprüften Passwort — und ändert dann', async () => {
    aendern.mockResolvedValueOnce({ error: nochmal });
    await sitzung.passwortSetzen('neu-und-lang', 'alt-und-lang');
    expect(anmelden).toHaveBeenCalledWith({ email: 'petra@perl.at', password: 'alt-und-lang' });
    expect(aendern).toHaveBeenCalledTimes(2);
  });

  it('ohne aktuelles Passwort sagt es, was zu tun ist, statt es zu erraten', async () => {
    aendern.mockResolvedValueOnce({ error: nochmal });
    await expect(sitzung.passwortSetzen('neu-und-lang')).rejects.toThrow(/abmelden und neu anmelden/);
    expect(anmelden).not.toHaveBeenCalled();
  });

  it('Gegenprobe: ein anderer Fehler führt zu keiner neuen Anmeldung', async () => {
    aendern.mockResolvedValueOnce({ error: { message: 'Password should be at least 8 characters.' } });
    await expect(sitzung.passwortSetzen('kurz', 'alt-und-lang')).rejects.toThrow(/at least 8/);
    expect(anmelden).not.toHaveBeenCalled();
    expect(aendern).toHaveBeenCalledTimes(1);
  });
});
