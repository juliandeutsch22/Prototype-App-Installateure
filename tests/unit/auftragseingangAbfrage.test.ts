/**
 * Die Liste des Auftragseingangs (M02b) — was gefragt wird: welcher Stand,
 * welche Suche, in welcher Reihenfolge und wo die nächste Seite beginnt.
 * Gegen die echte Datenbank blättert `tests/supabase/auftragseingang.test.ts`;
 * hier steht die Abfrage selbst.
 *
 * Gegenprobe: ohne `pg/auftragseingaenge.ts` gibt es nichts zu importieren —
 * rot; mit einer Liste, die nach Eingang allein sortierte, die erste Prüfung.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Aufruf = [string, ...unknown[]];
let aufrufe: Aufruf[] = [];
let antwort: { data: unknown[] | null; error: { message: string } | null } = { data: [], error: null };

/** Ein Baukasten wie der von supabase-js: jeder Schritt wird festgehalten, am Ende kommt die Antwort. */
function baukasten(): unknown {
  const b: Record<string, unknown> = {};
  for (const name of ['from', 'select', 'eq', 'or', 'order', 'limit', 'maybeSingle']) {
    b[name] = (...args: unknown[]) => {
      aufrufe.push([name, ...args]);
      return b;
    };
  }
  b.then = (ok: (w: unknown) => unknown) => Promise.resolve(antwort).then(ok);
  return b;
}

const zaehlen = vi.fn(async () => 0);
const rpc = vi.fn(async () => ({ data: null as unknown, error: null as { message: string } | null }));
vi.mock('@/lib/db/pg/kern', () => ({
  derClient: () => ({ from: (t: string) => { aufrufe.push(['from', t]); return baukasten(); }, rpc }),
  zaehlen: (...a: unknown[]) => zaehlen(...(a as [])),
  abfragen: vi.fn(async () => []),
  anlegen: vi.fn(async () => 'neu'),
  aendern: vi.fn(async () => undefined),
  loeschen: vi.fn(async () => undefined),
}));

const { listEingaenge, zaehleOffeneEingaenge, eingangZuBaustelle, EINGANG_SEITE } = await import('@/lib/db/pg/auftragseingaenge');

const ID = '11111111-1111-4111-8111-111111111111';
const zeile = (i: number, rang = 2) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, nummer: `EG-2026-${String(i).padStart(4, '0')}`,
  dringlichkeit_rang: rang, am_roh: `2026-11-07 09:00:00.${String(i).padStart(6, '0')}+00`, eingegangen_am: '2026-11-07T09:00:00Z',
  stand: 'offen', quelle: 'telefon', anliegen: 'Tropft', dringlichkeit: 'normal',
});

beforeEach(() => {
  aufrufe = [];
  antwort = { data: [], error: null };
  zaehlen.mockClear();
  rpc.mockClear();
});

const schritte = (name: string) => aufrufe.filter((a) => a[0] === name).map((a) => a.slice(1));

describe('listEingaenge', () => {
  it('offen: Notfall, dringend, normal — je der älteste zuerst; eine Seite fester Größe, im eigenen Betrieb', async () => {
    antwort = { data: [zeile(1, 0)], error: null };
    const seite = await listEingaenge('perl', { stand: 'offen' });
    expect(schritte('from')).toEqual([['auftragseingaenge']]);
    expect(schritte('eq')).toEqual([['company_id', 'perl'], ['stand', 'offen']]);
    expect(schritte('order')).toEqual([
      ['dringlichkeit_rang', { ascending: true }],
      ['eingegangen_am', { ascending: true }],
      ['id', { ascending: true }],
    ]);
    expect(schritte('limit')).toEqual([[EINGANG_SEITE]]);
    expect(schritte('or')).toEqual([]);
    expect(seite.zeilen[0]).toMatchObject({ nummer: 'EG-2026-0001', dringlichkeitRang: 0 });
    // Eine nicht volle Seite ist die letzte.
    expect(seite.weiter).toBeNull();
  });

  it('übernommen und abgelehnt: der jüngste zuerst', async () => {
    for (const stand of ['uebernommen', 'abgelehnt'] as const) {
      aufrufe = [];
      await listEingaenge('perl', { stand });
      expect(schritte('eq')).toEqual([['company_id', 'perl'], ['stand', stand]]);
      expect(schritte('order')).toEqual([['eingegangen_am', { ascending: false }], ['id', { ascending: true }]]);
    }
  });

  it('die Suche über Nummer, Kunde, Ort, Anliegen und Nummer des Auftraggebers — entschärft', async () => {
    await listEingaenge('perl', { stand: 'offen', suche: 'Huber, 50%' });
    const muster = '"%Huber, 50\\\\%%"';
    expect(schritte('or')).toEqual([[
      `and(or(nummer.ilike.${muster},kunde_name.ilike.${muster},ort.ilike.${muster},anliegen.ilike.${muster},auftraggeber_nummer.ilike.${muster}))`,
    ]]);
  });

  it('die nächste Seite beginnt hinter der letzten Zeile — in der Reihenfolge des Stands', async () => {
    antwort = { data: Array.from({ length: EINGANG_SEITE }, (_, i) => zeile(i + 1, 1)), error: null };
    const eins = await listEingaenge('perl', { stand: 'offen' });
    const letzte = zeile(EINGANG_SEITE, 1);
    expect(eins.weiter).toEqual({ rang: 1, amRoh: letzte.am_roh, id: letzte.id });

    aufrufe = [];
    antwort = { data: [], error: null };
    await listEingaenge('perl', { stand: 'offen', nach: eins.weiter });
    const am = `"${letzte.am_roh}"`;
    const id = `"${letzte.id}"`;
    expect(schritte('or')).toEqual([[
      `and(or(dringlichkeit_rang.gt.1,and(dringlichkeit_rang.eq.1,eingegangen_am.gt.${am}),`
      + `and(dringlichkeit_rang.eq.1,eingegangen_am.eq.${am},id.gt.${id})))`,
    ]]);

    aufrufe = [];
    await listEingaenge('perl', { stand: 'abgelehnt', nach: eins.weiter, suche: 'x' });
    expect(schritte('or')).toEqual([[
      `and(or(nummer.ilike."%x%",kunde_name.ilike."%x%",ort.ilike."%x%",anliegen.ilike."%x%",auftraggeber_nummer.ilike."%x%"),`
      + `or(eingegangen_am.lt.${am},and(eingegangen_am.eq.${am},id.gt.${id})))`,
    ]]);
  });

  it('nimmt nur eine Kennung und keinen Wert, der die Bedingung verbiegen könnte', async () => {
    await expect(listEingaenge('perl', { stand: 'offen', nach: { rang: 1, amRoh: 'x', id: 'x),stand.eq.offen' } }))
      .rejects.toThrow(/Keine Kennung/);
    await expect(listEingaenge('perl', { stand: 'offen', nach: { rang: 1, amRoh: '2026"),or(true', id: ID } }))
      .rejects.toThrow(/Unbrauchbarer Wert/);
  });

  it('ein Fehler der Datenbank kommt als Fehler, nicht als leere Liste', async () => {
    antwort = { data: null, error: { message: 'kaputt' } };
    await expect(listEingaenge('perl', { stand: 'offen' })).rejects.toThrow('kaputt');
  });
});

describe('zaehleOffeneEingaenge und die Funktionen', () => {
  it('zählt offen, dringend und Notfall auf dem Server', async () => {
    zaehlen.mockResolvedValueOnce(5).mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    expect(await zaehleOffeneEingaenge('perl')).toEqual({ offen: 5, dringend: 2, notfall: 1 });
    expect(zaehlen).toHaveBeenCalledWith('auftragseingaenge', 'perl', {
      wo: [{ art: 'gleich', feld: 'stand', wert: 'offen' }, { art: 'gleich', feld: 'dringlichkeit', wert: 'notfall' }],
    });
  });

  it('zur Baustelle: Vorsatz und Abrechnung gehen mit; ein zweiter Aufruf sagt, dass es sie schon gab', async () => {
    rpc.mockResolvedValueOnce({ data: { project_id: ID, project_number: 'B-2026-0007', neu: false }, error: null });
    expect(await eingangZuBaustelle(ID, 'B', 'Regie')).toEqual({ projectId: ID, projectNumber: 'B-2026-0007', neu: false });
    expect(rpc).toHaveBeenCalledWith('eingang_zu_baustelle', { p_eingang: ID, p_praefix: 'B', p_abrechnung: 'Regie' });
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Einen Eingang übernimmt nur die Führung' } });
    await expect(eingangZuBaustelle(ID, 'B', 'Regie')).rejects.toThrow(/nur die Führung/);
  });
});
