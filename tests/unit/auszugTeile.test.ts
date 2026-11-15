/**
 * K4 (Durchsicht 15.11.2026): Auszug und Datenauskunft in Teilen.
 *
 * Die Datenbank gibt die Datei als Folge von Stücken heraus (`pfad` +
 * `element` oder `wert`); hier wird geprüft, dass daraus GENAU die Gestalt
 * entsteht, die der Abruf in einem Stück hatte — und dass nichts still
 * fehlt. Dass die Stücke dieselben Daten enthalten wie `betrieb_auszug` und
 * `person_auskunft`, prüft `tests/supabase/auszugInTeilen.test.ts`.
 *
 * GEGENPROBE (Erwartung): ohne `auszugTeile.ts` und `auszugHolen` gibt es
 * keinen Weg über 8 MB; mit einem Schreiber, der den Behälter nicht wieder
 * öffnen erkennt, ist „falsche Reihenfolge“ rot, und ohne die Zählung ist
 * „unvollständig“ rot.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonAusTeilen, type AuszugZeile } from '@/lib/auszugTeile';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabaseClient: () => ({ rpc }) }));

const { auszugHolen, betriebAuszugDatei } = await import('@/lib/db/pg/auszugTeile');

function zusammen(zeilen: AuszugZeile[]): { text: string; kopf: Record<string, unknown> } {
  const j = jsonAusTeilen();
  for (const z of zeilen) j.zeile(z);
  const { teile, kopf } = j.fertig();
  return { text: teile.join(''), kopf };
}

describe('Die Datei aus Teilen', () => {
  it('ergibt die Gestalt des Abrufs in einem Stück — Betrieb', () => {
    const { text, kopf } = zusammen([
      { pfad: ['companyId'], wert: 'perl' },
      { pfad: ['exportedAt'], wert: '2026-11-16T01:00:00.000Z' },
      { pfad: ['data', 'companies'], element: { id: 'perl', name: 'Perl' } },
      { pfad: ['data', 'customers'], element: { id: 1, name: 'Huber', notes: 'Zeile\nmit "Zeichen"' } },
      { pfad: ['data', 'customers'], element: { id: 2, name: 'Berger' } },
      { pfad: ['data', 'invoices'], wert: [] },
      { pfad: ['data', 'projects'], element: { id: 3 } },
      { pfad: ['anzahl'], wert: { companies: 1, customers: 2, invoices: 0, projects: 1 } },
    ]);
    expect(JSON.parse(text)).toEqual({
      companyId: 'perl',
      exportedAt: '2026-11-16T01:00:00.000Z',
      data: {
        companies: [{ id: 'perl', name: 'Perl' }],
        customers: [{ id: 1, name: 'Huber', notes: 'Zeile\nmit "Zeichen"' }, { id: 2, name: 'Berger' }],
        invoices: [],
        projects: [{ id: 3 }],
      },
      anzahl: { companies: 1, customers: 2, invoices: 0, projects: 1 },
    });
    expect(kopf).toEqual({
      companyId: 'perl',
      exportedAt: '2026-11-16T01:00:00.000Z',
      anzahl: { companies: 1, customers: 2, invoices: 0, projects: 1 },
    });
  });

  it('ergibt die Gestalt des Abrufs in einem Stück — Person, mit Werten zwischen den Listen', () => {
    const { text } = zusammen([
      { pfad: ['anzahl'], wert: { scheine: 2 } },
      { pfad: ['art'], wert: 'kunde' },
      { pfad: ['daten', 'angebote'], wert: [] },
      { pfad: ['daten', 'geburtsdatum'], wert: null },
      { pfad: ['daten', 'scheine'], element: { id: 'a', unterschrift_kunde: 'data:image/png;base64,AAAA' } },
      { pfad: ['daten', 'scheine'], element: { id: 'b' } },
      { pfad: ['daten', 'stammdaten'], wert: { name: 'Hausverwaltung' } },
      { pfad: ['person'], wert: 'Hausverwaltung' },
    ]);
    expect(JSON.parse(text)).toEqual({
      anzahl: { scheine: 2 },
      art: 'kunde',
      daten: {
        angebote: [],
        geburtsdatum: null,
        scheine: [{ id: 'a', unterschrift_kunde: 'data:image/png;base64,AAAA' }, { id: 'b' }],
        stammdaten: { name: 'Hausverwaltung' },
      },
      person: 'Hausverwaltung',
    });
  });

  it('eine leere Datei ist ein leeres Objekt', () => {
    expect(JSON.parse(zusammen([]).text)).toEqual({});
  });

  it('kommt ein Stück für eine schon geschlossene Liste, bricht es ab statt einen Schlüssel doppelt zu schreiben', () => {
    const j = jsonAusTeilen();
    j.zeile({ pfad: ['data', 'customers'], element: { id: 1 } });
    j.zeile({ pfad: ['data', 'projects'], element: { id: 2 } });
    expect(() => j.zeile({ pfad: ['data', 'customers'], element: { id: 3 } })).toThrow(/falscher Reihenfolge/);
  });
});

describe('Das Abholen', () => {
  const seiten: Record<number, AuszugZeile[]> = {
    1: [{ pfad: ['companyId'], wert: 'perl' }, { pfad: ['data', 'customers'], element: { id: 1 } }],
    2: [{ pfad: ['data', 'customers'], element: { id: 2 } }, { pfad: ['anzahl'], wert: { customers: 2 } }],
  };

  beforeEach(() => {
    rpc.mockReset().mockImplementation(async (name: string, a?: { p_seite?: number }) => {
      if (name === 'betrieb_auszug_start') return { data: { lauf: 'lauf-1', seiten: 2, zeilen: 4, bytes: 100 }, error: null };
      if (name === 'auszug_teil') return { data: seiten[a!.p_seite!], error: null };
      return { data: null, error: null };
    });
  });

  it('holt Seite für Seite, meldet den Fortschritt und verwirft die Kopie danach', async () => {
    const fortschritt = vi.fn();
    const { blob, kopf } = await betriebAuszugDatei(fortschritt);
    expect(JSON.parse(await blob.text())).toEqual({
      companyId: 'perl', data: { customers: [{ id: 1 }, { id: 2 }] }, anzahl: { customers: 2 },
    });
    expect(kopf.anzahl).toEqual({ customers: 2 });
    expect(fortschritt.mock.calls).toEqual([[0, 2], [1, 2], [2, 2]]);
    expect(rpc).toHaveBeenLastCalledWith('auszug_verwerfen', { p_lauf: 'lauf-1' });
  });

  it('fehlt ein Teil, gibt es keine Datei — eine halbe Auskunft ginge als ganze hinaus', async () => {
    await expect(
      auszugHolen(async () => ({ lauf: 'lauf-1', seiten: 2, zeilen: 5, bytes: 100 })),
    ).rejects.toThrow(/nicht vollständig/);
    expect(rpc).toHaveBeenLastCalledWith('auszug_verwerfen', { p_lauf: 'lauf-1' });
  });

  it('eine Absage der Datenbank kommt mit ihrem Text an, und die Kopie wird trotzdem verworfen', async () => {
    rpc.mockImplementation(async (name: string) => (name === 'auszug_teil'
      ? { data: null, error: { message: 'Dieser Teil liegt nicht mehr bereit. Bitte den Download neu beginnen.' } }
      : { data: null, error: null }));
    await expect(
      auszugHolen(async () => ({ lauf: 'lauf-2', seiten: 1, zeilen: 1, bytes: 1 })),
    ).rejects.toThrow('nicht mehr bereit');
    expect(rpc).toHaveBeenLastCalledWith('auszug_verwerfen', { p_lauf: 'lauf-2' });
  });
});
