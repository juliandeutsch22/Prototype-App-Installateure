/**
 * K7 (Durchsicht 15.11.2026): was der Support beim Absender einer Meldung
 * liest. Bei einem Benutzernamen-Konto stand nur der Name da — dass es keine
 * Adresse gibt und die Rückfrage über den Betrieb gehen muss, sah er nicht.
 *
 * GEGENPROBE (Erwartung): mit dem alten `absender` ist der erste Fall rot
 * (nur der Name), die beiden anderen grün.
 */
import { describe, it, expect, vi } from 'vitest';
import { kunstadresse } from '@shared/benutzername';

vi.mock('@/lib/supabase', () => ({ supabaseClient: () => ({}) }));
const { absender } = await import('@/lib/db/pg/fehlerprotokoll');

describe('Der Absender einer Meldung', () => {
  it('ohne E-Mail: keine Kunstadresse, sondern der Weg über den Betrieb', () => {
    const text = absender('Hans Monteur', kunstadresse('hans.monteur'));
    expect(text).toBe('Hans Monteur · ohne E-Mail, Rückfrage über den Betrieb');
    expect(text).not.toContain('.invalid');
  });

  it('bleibt gleich mit E-Mail: Name und Adresse', () => {
    expect(absender('Eva Büro', 'eva@perl.at')).toBe('Eva Büro · eva@perl.at');
  });

  it('bleibt gleich ohne Namen: nichts', () => {
    expect(absender(null, 'eva@perl.at')).toBeUndefined();
  });
});
