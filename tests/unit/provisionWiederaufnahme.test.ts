// @vitest-environment jsdom
import { it, expect, vi, beforeEach } from 'vitest';
import { provisionUser } from '@/lib/auth/provisionUser';
const { konto, profil } = vi.hoisted(() => ({ konto: vi.fn(), profil: vi.fn() }));
vi.mock('@/lib/auth/sitzung', () => ({ kontoAnlage: konto, passwortZuruecksetzen: vi.fn() }));
vi.mock('@/lib/db/users', () => ({ createUserDocEinmalig: profil, createUserDoc: profil }));
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); konto.mockResolvedValue({ uid: 'uid', startpasswortNoetig: false }); profil.mockResolvedValue(undefined); });
it('verwendet nach einem Profilfehler dieselbe Vorgangskennung und dasselbe Anfangspasswort', async () => {
  const p = { name: 'Max', email: 'max@betrieb.test', role: 'Mitarbeiter' as const, active: true };
  profil.mockRejectedValueOnce(new Error('Profilfehler'));
  await expect(provisionUser('betrieb', p)).rejects.toThrow();
  const erste = konto.mock.calls[0];
  expect(erste[2]).toMatch(/^[0-9a-f-]{36}$/);
  const ergebnis = await provisionUser('betrieb', p);
  expect(konto.mock.calls[1]).toEqual(erste);
  expect(ergebnis.tempPassword).toBe(erste[1]);
  expect(profil).toHaveBeenLastCalledWith('betrieb', 'uid', p);
  expect(sessionStorage.length).toBe(0);
});

it('zeigt nach verlorenem Vorgang kein erfundenes Passwort und stellt das Profil fertig', async () => {
  konto.mockResolvedValue({ uid: 'uid', startpasswortNoetig: true });
  const ergebnis = await provisionUser('betrieb', { name: 'Max', email: 'max@betrieb.test', role: 'Mitarbeiter', active: true });
  expect(profil).toHaveBeenCalled();
  expect(ergebnis).toMatchObject({ uid: 'uid', tempPassword: '', startpasswortNoetig: true });
});
