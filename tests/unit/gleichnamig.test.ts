/**
 * Gleichnamige Kunden — eine Prüfung für Kundenliste und Auftragseingang
 * (M11, M02b). Gleich bleibt der Satz der Kundenliste; der Eingang sagt am
 * Ende, was statt des Anlegens geht.
 *
 * Gegenprobe: ohne `gleichnamig.ts` gibt es nichts zu importieren — rot.
 */
import { describe, it, expect, vi } from 'vitest';

const searchCustomers = vi.fn(async () => [
  { id: 'a', companyId: 'perl', name: 'Familie  HUBER', address: 'Hauptplatz 1' },
  { id: 'b', companyId: 'perl', name: 'Familie Hubertus' },
]);
vi.mock('@/lib/db/customers', () => ({ searchCustomers: (...a: unknown[]) => searchCustomers(...(a as [])) }));

const { gleichnamigeKunden, rueckfrageText, schluessel } = await import('@/features/customers/gleichnamig');

describe('gleichnamig', () => {
  it('fragt den Server und nimmt nur den gleichen Namen — Groß-/Kleinschreibung und Leerraum egal', async () => {
    expect(schluessel('  Familie   Huber ')).toBe('familie huber');
    expect((await gleichnamigeKunden('perl', ' Familie Huber ')).map((k) => k.id)).toEqual(['a']);
    expect(searchCustomers).toHaveBeenCalledWith('perl', 'Familie Huber', 50);
  });

  it('gleich geblieben: der Satz der Kundenliste; der Eingang nennt seinen anderen Weg', () => {
    const gleiche = [{ name: 'Familie Huber', address: 'Hauptplatz 1' }, { name: 'Familie Huber' }];
    expect(rueckfrageText('Familie Huber', gleiche)).toBe(
      'Es gibt schon „Familie Huber“ (Hauptplatz 1), „Familie Huber“ (ohne Adresse). Ist „Familie Huber“ ein anderer Kunde, trotzdem anlegen; sonst den bestehenden bearbeiten.');
    expect(rueckfrageText('X', Array.from({ length: 5 }, () => ({ name: 'X' })), 'sonst übernehmen'))
      .toBe('Es gibt schon „X“ (ohne Adresse), „X“ (ohne Adresse), „X“ (ohne Adresse) und 2 weitere. Ist „X“ ein anderer Kunde, trotzdem anlegen; sonst übernehmen.');
  });
});
