/**
 * KUNDE LÖSCHEN NENNT, WAS AM KUNDEN HÄNGT.
 *
 * Vorher zählte `deleteCustomer` nur die Baustellen. Hing ein Angebot, eine
 * Wartung, ein Handwerksschein oder eine Rechnung am Kunden, lief die
 * Prüfung durch, und die Datenbank lehnte auf Englisch ab („violates foreign
 * key constraint …“). Gegen die echte Datenbank prüft es
 * `tests/supabase/modulKunden.test.ts`; hier steht, was gezählt und gesagt
 * wird.
 *
 * Gegenprobe: mit der alten Fassung (nur Baustellen) sind die Prüfungen zu
 * Angebot, Papierkorb, mehreren Arten und der übersetzten Ablehnung rot.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Abfrage } from '@/lib/db/pg/kern';

type Wo = NonNullable<Abfrage['wo']>;
/** Wie viele Zeilen je Tabelle auf den Kunden zeigen — und davon verworfen. */
let bestand: Record<string, number> = {};
let verworfen = 0;
const zaehlen = vi.fn(async (tabelle: string, _c: string, a: Pick<Abfrage, 'wo'>) => {
  const wo = (a.wo ?? []) as Wo;
  if (tabelle === 'quotes' && wo.some((b) => b.art === 'gleich' && b.feld === 'status' && b.wert === 'Verworfen')) return verworfen;
  return bestand[tabelle] ?? 0;
});
const abfragen = vi.fn(async (tabelle: string) =>
  Array.from({ length: bestand[tabelle] ?? 0 }, (_, i) => ({ id: `${tabelle}-${i}` })));
const loeschen = vi.fn<(t: string, id: string) => Promise<void>>(async () => undefined);
vi.mock('@/lib/db/pg/kern', () => ({
  abfragen: (t: string) => abfragen(t),
  zaehlen: (t: string, c: string, a: Pick<Abfrage, 'wo'>) => zaehlen(t, c, a),
  loeschen: (t: string, id: string) => loeschen(t, id),
  anlegen: vi.fn(),
  aendern: vi.fn(),
  derClient: () => { throw new Error('nicht gebraucht'); },
}));

const { deleteCustomer } = await import('@/lib/db/pg/customers');
const { grundAus } = await import('@/lib/fehlerGrund');

beforeEach(() => {
  bestand = {};
  verworfen = 0;
  zaehlen.mockClear();
  loeschen.mockClear();
});

describe('Was hängt, verhindert das Löschen — und wird genannt', () => {
  it('Baustellen wie bisher mit Zahl', async () => {
    bestand = { projects: 1 };
    await expect(deleteCustomer('perl', 'k1')).rejects.toThrow('Der Kunde lässt sich nicht löschen: an ihm hängen noch 1 Baustelle.');
    expect(loeschen).not.toHaveBeenCalled();
  });

  it('ein Angebot allein verhindert es', async () => {
    bestand = { quotes: 2 };
    await expect(deleteCustomer('perl', 'k1')).rejects.toThrow('an ihm hängen noch 2 Angebote.');
    expect(loeschen).not.toHaveBeenCalled();
  });

  it('ein verworfenes Angebot zählt mit — und heisst „im Papierkorb“', async () => {
    bestand = { quotes: 1 };
    verworfen = 1;
    await expect(deleteCustomer('perl', 'k1')).rejects.toThrow('an ihm hängen noch 1 Angebot im Papierkorb.');
  });

  it('nennt alle Arten auf einmal, Angebote mit dem Anteil im Papierkorb', async () => {
    bestand = { projects: 2, quotes: 3, wartungen: 1, work_sheets: 4, invoices: 1 };
    verworfen = 1;
    await expect(deleteCustomer('perl', 'k1')).rejects.toThrow(
      'Der Kunde lässt sich nicht löschen: an ihm hängen noch 2 Baustellen, 3 Angebote (davon 1 im Papierkorb), 1 Wartung, 4 Handwerksscheine und 1 Rechnung.',
    );
  });

  it('zählt je Tabelle über den Kunden — Angebote ohne Statusfilter', async () => {
    await deleteCustomer('perl', 'k1');
    const kunde = { art: 'gleich', feld: 'customerId', wert: 'k1' };
    for (const t of ['projects', 'quotes', 'wartungen', 'work_sheets', 'invoices']) {
      expect(zaehlen).toHaveBeenCalledWith(t, 'perl', { wo: [kunde] });
    }
  });

  it('der Satz kommt durch die Übersetzung der Ansicht unverändert durch', async () => {
    bestand = { quotes: 1, invoices: 2 };
    const fehler = await deleteCustomer('perl', 'k1').catch((e: unknown) => e);
    expect(grundAus(fehler, 'Der Kunde konnte nicht gelöscht werden.')).toBe(
      'Der Kunde lässt sich nicht löschen: an ihm hängen noch 1 Angebot und 2 Rechnungen.',
    );
  });
});

describe('Was die Rolle nicht sieht: die Ablehnung der Datenbank auf Deutsch', () => {
  it.each([
    ['quotes', 'Angebote'],
    ['invoices', 'Rechnungen'],
    ['work_sheets', 'Handwerksscheine'],
    ['wartungen', 'Wartungen'],
    ['projects', 'Baustellen'],
  ])('%s', async (tabelle, art) => {
    loeschen.mockRejectedValueOnce(new Error(
      `update or delete on table "customers" violates foreign key constraint "${tabelle}_customer_id_fkey" on table "${tabelle}"`,
    ));
    await expect(deleteCustomer('perl', 'k1')).rejects.toThrow(`Der Kunde lässt sich nicht löschen: an ihm hängen noch ${art}.`);
  });

  it('Erhaltung: jeder andere Fehler geht unverändert weiter', async () => {
    loeschen.mockRejectedValueOnce(new Error('Failed to fetch'));
    await expect(deleteCustomer('perl', 'k1')).rejects.toThrow('Failed to fetch');
  });

  it('Erhaltung: ohne etwas Hängendes wird gelöscht', async () => {
    await deleteCustomer('perl', 'k1');
    expect(loeschen).toHaveBeenCalledWith('customers', 'k1');
  });
});
