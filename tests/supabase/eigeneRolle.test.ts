/**
 * Die eigene Rolle ändert eine zweite Leitung (Prüfbefund 09.11.2026).
 *
 * WAS VORHER GING. Die Geschäftsführung öffnete die eigene Akte, stellte die
 * Rolle auf „Mitarbeiter“ und speicherte. Zeilenschutz und
 * `app.adminrolle_geschuetzt` liessen das durch — die Rolle galt beim Prüfen
 * ja noch. Danach fehlte ihr jedes Recht, die Rolle zurückzustellen; bei nur
 * einer Leitung war der Betrieb ausgesperrt. Das Sperren des eigenen Kontos
 * war längst verriegelt, die Rolle nicht.
 *
 * Hier gegen die echte Datenbank: der Riegel greift beim eigenen Konto, und
 * nur dort. Eine zweite Leitung, der Dienstschlüssel und ein Speichern mit
 * unveränderter Rolle kommen weiter durch.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'er-eigene-rolle';

let chefin: Konto;
let zweite: Konto;
let admin1: Konto;

async function rolleVon(uid: string): Promise<string> {
  const { data, error } = await admin.from('users').select('role').eq('id', uid).single();
  if (error) throw new Error(error.message);
  return (data as { role: string }).role;
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'ergf');
  zweite = await konto(BETRIEB, 'Geschäftsführung', 'ergf2');
  admin1 = await konto(BETRIEB, 'Administrator', 'eradm');
}, 60_000);

describe('Die eigene Rolle', () => {
  it('die Geschäftsführung stuft sich nicht selbst herab — mit Grund', async () => {
    const { error } = await chefin.client.from('users').update({ role: 'Mitarbeiter' }).eq('id', chefin.uid);
    expect(error?.code).toBe('42501');
    expect(error?.message).toMatch(/eigene Rolle ändert eine zweite Leitung/);
    expect(await rolleVon(chefin.uid)).toBe('Geschäftsführung');
  });

  it('ein Administrator ebenso wenig', async () => {
    const { error } = await admin1.client.from('users').update({ role: 'Geschäftsführung' }).eq('id', admin1.uid);
    expect(error?.code).toBe('42501');
    expect(await rolleVon(admin1.uid)).toBe('Administrator');
  });

  it('Gegenprobe: speichern mit unveränderter Rolle geht — die Akte schickt die Rolle immer mit', async () => {
    const { error } = await chefin.client.from('users')
      .update({ role: 'Geschäftsführung', name: 'Chefin Neu' }).eq('id', chefin.uid);
    expect(error).toBeNull();
    const { data } = await admin.from('users').select('name').eq('id', chefin.uid).single();
    expect((data as { name: string }).name).toBe('Chefin Neu');
  });

  it('Gegenprobe: eine zweite Leitung ändert die Rolle der ersten', async () => {
    const { error } = await zweite.client.from('users').update({ role: 'Verwaltung' }).eq('id', chefin.uid);
    expect(error).toBeNull();
    expect(await rolleVon(chefin.uid)).toBe('Verwaltung');
    // Zurück, wieder durch die zweite Leitung.
    expect((await zweite.client.from('users').update({ role: 'Geschäftsführung' }).eq('id', chefin.uid)).error)
      .toBeNull();
  });

  it('Gegenprobe: der Dienstschlüssel darf (Plattform, Anlage, Einrichtung)', async () => {
    expect((await admin.from('users').update({ role: 'Projektleiter' }).eq('id', zweite.uid)).error).toBeNull();
    expect(await rolleVon(zweite.uid)).toBe('Projektleiter');
    expect((await admin.from('users').update({ role: 'Geschäftsführung' }).eq('id', zweite.uid)).error).toBeNull();
  });
});
