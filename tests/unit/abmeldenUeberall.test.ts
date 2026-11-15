/**
 * K2 (Durchsicht 15.11.2026): „Auf allen Geräten abmelden“ nimmt die
 * Push-Anmeldungen des Kontos mit — VOR dem Abmelden, solange die eigene
 * Sitzung noch gilt.
 *
 * GEGENPROBE (Erwartung): mit dem alten `abmelden()` (nur `signOut`) sind
 * „ruft vorher“ und „scheitert er, bleibt die Anmeldung“ rot; „nur dieses
 * Gerät“ ist in beiden Fassungen grün.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ablauf: string[] = [];
const rpc = vi.fn<(name: string) => Promise<{ error: { message: string } | null }>>();
const signOut = vi.fn<(a: { scope: string }) => Promise<{ error: null }>>();

vi.mock('@/lib/supabase', () => ({
  merkenSetzen: vi.fn(),
  pruefClient: vi.fn(),
  supabaseClient: () => ({ rpc, auth: { signOut } }),
}));

const sitzung = await import('@/lib/auth/pg/sitzung');

beforeEach(() => {
  ablauf.length = 0;
  rpc.mockReset().mockImplementation(async (name) => {
    ablauf.push(`rpc:${name}`);
    return { error: null };
  });
  signOut.mockReset().mockImplementation(async ({ scope }) => {
    ablauf.push(`signOut:${scope}`);
    return { error: null };
  });
});

describe('Auf allen Geräten abmelden', () => {
  it('räumt erst die Geräte für Meldungen ab, dann meldet es überall ab', async () => {
    await sitzung.abmelden(true);
    expect(ablauf).toEqual(['rpc:push_geraete_abmelden', 'signOut:global']);
  });

  it('scheitert das Abräumen, bleibt die Anmeldung — mit einer Meldung', async () => {
    rpc.mockResolvedValueOnce({ error: { message: 'Netzwerkfehler' } });
    await expect(sitzung.abmelden(true)).rejects.toThrow('Netzwerkfehler');
    expect(signOut).not.toHaveBeenCalled();
  });

  it('bleibt gleich: nur dieses Gerät fragt die Datenbank nicht', async () => {
    await sitzung.abmelden();
    expect(ablauf).toEqual(['signOut:local']);
  });
});
