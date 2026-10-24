// @vitest-environment jsdom
import { it, expect, vi, beforeEach } from 'vitest';
import { provisionUser } from '@/lib/auth/provisionUser';
const { konto, profil, geburt } = vi.hoisted(() => ({ konto: vi.fn(), profil: vi.fn(), geburt: vi.fn() }));
vi.mock('@/lib/auth/sitzung', () => ({ kontoAnlage: konto, passwortZuruecksetzen: vi.fn() }));
vi.mock('@/lib/db/users', () => ({ createUserDocEinmalig: profil, createUserDoc: profil }));
vi.mock('@/lib/db/arbeitszeitGrenzen', () => ({ setGeburtsdatum: geburt }));
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); konto.mockResolvedValue({ uid: 'uid', startpasswortNoetig: false }); profil.mockResolvedValue(undefined); geburt.mockResolvedValue(undefined); });
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

/*
  DAS GEBURTSDATUM BEI DER ANLAGE (A7, 24.10.2026): nach dem Profil, vor dem
  Abschluss des Vorgangs. Scheitert es, nimmt der zweite Versuch dasselbe
  Konto und schreibt es erneut.
*/
it('schreibt das Geburtsdatum nach dem Profil — und nach einem Fehler beim zweiten Versuch', async () => {
  const p = { name: 'Lena', email: 'lena@betrieb.test', role: 'Mitarbeiter' as const, active: true };
  geburt.mockRejectedValueOnce(new Error('kein Netz'));
  await expect(provisionUser('betrieb', p, '2010-01-15')).rejects.toThrow(/Geburtsdatum konnte nicht gespeichert werden/);
  expect(sessionStorage.length).toBe(1);
  await provisionUser('betrieb', p, '2010-01-15');
  expect(konto.mock.calls[1]).toEqual(konto.mock.calls[0]);
  expect(geburt).toHaveBeenLastCalledWith('betrieb', 'uid', '2010-01-15');
  expect(profil.mock.invocationCallOrder[1]).toBeLessThan(geburt.mock.invocationCallOrder[1]);
  expect(sessionStorage.length).toBe(0);
});

it('gleich bleibt: ohne Geburtsdatum wird keines geschrieben', async () => {
  await provisionUser('betrieb', { name: 'Max', email: 'max@betrieb.test', role: 'Mitarbeiter', active: true });
  expect(geburt).not.toHaveBeenCalled();
});
