import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({
  auth: {
    mfa: { getAuthenticatorAssuranceLevel: vi.fn() },
    getSession: vi.fn(),
  },
  rpc: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabaseClient: () => client }));
import { zweiterFaktorBedarf } from '@/lib/auth/pg/zweiFaktor';

beforeEach(() => {
  vi.clearAllMocks();
  client.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null,
  });
  client.auth.getSession.mockResolvedValue({ data: { session: { user: { app_metadata: { role: 'Buchhaltung' } } } } });
  client.rpc.mockResolvedValue({ data: { angeboten: true, pflicht: true, eingerichtet: false }, error: null });
});

describe('Anmeldung der Buchhaltung', () => {
  it('verlangt für Buchhaltung keinen Faktor, auch bei veralteter Betriebspflicht', async () => {
    expect(await zweiterFaktorBedarf()).toBe('keiner');
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it('lässt ohne Betriebspflicht die bisherige Anmeldung bestehen', async () => {
    client.rpc.mockResolvedValue({ data: { angeboten: true, pflicht: false, eingerichtet: false }, error: null });
    expect(await zweiterFaktorBedarf()).toBe('keiner');
  });
  it('verlangt bei eingerichtetem Faktor den Code', async () => {
    client.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
    expect(await zweiterFaktorBedarf()).toBe('pruefen');
  });
  it('fordert bei bestätigter gespeicherter Sitzung keinen neuen Code und keine neue Einrichtung', async () => {
    client.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null });
    expect(await zweiterFaktorBedarf()).toBe('keiner');
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it('verlangt die einmalige Einrichtung ausschließlich für den globalen Administrator', async () => {
    client.auth.getSession.mockResolvedValue({ data: { session: { user: { app_metadata: { plattform_admin: true } } } } });
    expect(await zweiterFaktorBedarf()).toBe('einrichten');
  });
});
