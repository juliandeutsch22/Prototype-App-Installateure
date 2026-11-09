/**
 * VERWORFENE ANGEBOTE STEHEN IN KEINER LISTE (M01d) — was die Datenschicht
 * fragt. Gegen die echte Datenbank prüft es `tests/supabase/papierkorb.test.ts`;
 * hier steht, dass JEDE Liste der App die Bedingung mitschickt, und dass die
 * eigene Seite (`getQuote`) und der Papierkorb sie nicht schicken.
 *
 * Gegenprobe: ohne die Bedingung `status <> 'Verworfen'` in
 * `pg/quotes.ts` ist jede Prüfung der ersten Gruppe rot.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Abfrage } from '@/lib/db/pg/kern';

const abfragen = vi.fn<(t: string, c: string, a: Abfrage) => Promise<unknown[]>>(async () => []);
vi.mock('@/lib/db/pg/kern', () => ({
  abfragen: (t: string, c: string, a: Abfrage) => abfragen(t, c, a),
  derClient: () => { throw new Error('nicht gebraucht'); },
  loeschen: vi.fn(),
  zaehlen: vi.fn(async () => 0),
}));

const angebote = await import('@/lib/db/pg/quotes');

const NICHT_VERWORFEN = { art: 'ungleich', feld: 'status', wert: 'Verworfen' };
const ID = '11111111-1111-4111-8111-111111111111';

/** Die Bedingungen der Abfrage auf die Köpfe der Angebote. */
const kopfBedingungen = () => abfragen.mock.calls.find(([t]) => t === 'quotes')?.[2].wo ?? [];

beforeEach(() => abfragen.mockClear());

describe('Jede Angebotsliste lässt den Papierkorb weg', () => {
  const listen: [string, () => Promise<unknown>][] = [
    ['die jüngsten (Angebotsliste)', () => angebote.listRecentQuotes('perl')],
    ['die Suche', () => angebote.sucheAngebote('perl', 'AN-2026')],
    ['die Kundenakte', () => angebote.listQuotesForCustomer('perl', ID)],
    ['die Fassungen', () => angebote.listFassungen('perl', ID)],
    ['die Baustelle', () => angebote.listQuotesForProject('perl', ID)],
    ['die Nachkalkulation', () => angebote.listQuotesForProjects('perl', [ID])],
    ['das Belegarchiv', () => angebote.listQuotesInRange('perl', '2026-01-01', '2026-12-31')],
  ];
  it.each(listen)('%s', async (_name, lauf) => {
    await lauf();
    expect(kopfBedingungen()).toContainEqual(NICHT_VERWORFEN);
  });
});

describe('Gleich bleibt: die eigene Seite und der Papierkorb', () => {
  it('die Angebotsseite holt auch ein verworfenes — sie zeigt es „im Papierkorb“', async () => {
    await angebote.getQuote('perl', ID);
    expect(kopfBedingungen()).toEqual([{ art: 'gleich', feld: 'id', wert: ID }]);
  });

  it('der Papierkorb holt genau die verworfenen, die jüngsten zuerst, ohne Zeitpunkt am Ende', async () => {
    await angebote.listVerworfeneAngebote('perl', 50);
    expect(abfragen.mock.calls[0][2]).toMatchObject({
      wo: [{ art: 'gleich', feld: 'status', wert: 'Verworfen' }],
      sortiere: { feld: 'verworfenAm', absteigend: true, leerZuerst: false },
      grenze: 50,
    });
  });
});

/*
  DIE KUNDENAKTE: DIE JÜNGSTEN ZUERST. Ohne Reihenfolge kam, was die
  Datenbank gerade lieferte, und bei mehr als der Obergrenze fehlten
  beliebige Angebote statt der ältesten. Gegenprobe: ohne `sortiere` in
  `listQuotesForCustomer` ist die Prüfung rot.
*/
describe('Die Angebote eines Kunden', () => {
  it('kommen nach Anlage absteigend, mit der Obergrenze', async () => {
    await angebote.listQuotesForCustomer('perl', ID, 100);
    expect(abfragen.mock.calls.find(([t]) => t === 'quotes')?.[2]).toMatchObject({
      sortiere: { feld: 'createdAt', absteigend: true },
      grenze: 100,
    });
  });
});
