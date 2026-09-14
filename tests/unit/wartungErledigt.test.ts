import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * WAS BEIM EINTRAGEN EINER ERLEDIGTEN WARTUNG TATSÄCHLICH GESCHRIEBEN WIRD.
 *
 * Der Ansichtstest kommt an diese Frage nicht heran: er ersetzt die
 * Datenschicht durch einen Doppelgänger und sieht nur, DASS sie gerufen wird.
 * Genau daran ist beim Gegenlesen eine Mutation durchgerutscht — der neue
 * Termin fiel aus der Nutzlast heraus, und kein einziger Test bemerkte es.
 *
 * Das ist der teuerste Fehler, den dieser Bereich haben kann. Die Wartung
 * stünde als erledigt da, mit dem alten Termin: dauerhaft überfällig, obwohl
 * sie gemacht wurde. Nach zwei solchen Zeilen glaubt niemand mehr der Liste.
 */

const updateDoc = vi.fn();
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, sammlung: string, id: string) => ({ pfad: `${sammlung}/${id}` }),
  updateDoc: (...a: unknown[]) => updateDoc(...a),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  serverTimestamp: () => 'SERVERZEIT',
}));
vi.mock('@/lib/firebase', () => ({ db: {} }));
const queryTenant = vi.fn();
vi.mock('@/lib/db/fs/core', () => ({
  queryTenant: (...a: unknown[]) => queryTenant(...a),
  createInTenant: vi.fn(),
  deleteInTenant: vi.fn(),
  /*
    Nachgebaut wie die echte Fassung, weil es genau auf zwei Dinge ankommt:
    `undefined` fällt heraus (Firestore lehnt es hart ab), und `updatedAt`
    kommt dazu. Die Nutzlast dieser Funktion ist der Gegenstand des Tests.
  */
  updateInTenant: async (sammlung: string, id: string, daten: Record<string, unknown>) => {
    const rein: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(daten)) if (v !== undefined) rein[k] = v;
    updateDoc({ pfad: `${sammlung}/${id}` }, { ...rein, updatedAt: 'SERVERZEIT' });
  },
}));

const { wartungErledigt, listFaelligeWartungen } = await import('@/lib/db/wartungen');

beforeEach(() => updateDoc.mockReset().mockResolvedValue(undefined));

describe('Eine erledigte Wartung eintragen', () => {
  it('hält den Tag fest UND setzt den nächsten Termin', async () => {
    await wartungErledigt('w1', { erledigtAm: '2026-06-01', intervallMonate: 12 });

    expect(updateDoc).toHaveBeenCalledWith(
      { pfad: 'wartungen/w1' },
      {
        zuletztAm: '2026-06-01',
        faelligAm: '2027-06-01',
        intervallMonate: 12,
        // Immer mitgeschrieben, auch wenn nie eine eingeplant war: eine
        // Fallunterscheidung dafür wäre mehr Maschinerie als das leere Feld
        // kostet — und der eine Fall, in dem sie fehlte, wäre der teure.
        offeneBaustelle: '',
        updatedAt: 'SERVERZEIT',
      },
    );
  });

  /*
    Das Intervall wird MITGESCHRIEBEN, nicht nur zum Rechnen benutzt. Wer beim
    Eintragen von zwei Jahren auf eines wechselt, meint die Vereinbarung, nicht
    diesen einen Termin — stünde im Dokument weiter das alte Intervall, ginge
    die Änderung beim nächsten Mal verloren.
  */
  it('übernimmt ein im Dialog geändertes Intervall in die Vereinbarung', async () => {
    await wartungErledigt('w2', { erledigtAm: '2026-06-01', intervallMonate: 24 });

    const nutzlast = updateDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(nutzlast.intervallMonate).toBe(24);
    expect(nutzlast.faelligAm).toBe('2028-06-01');
  });

  it('schreibt die Baustelle nur, wenn eine angegeben wurde', async () => {
    await wartungErledigt('w3', {
      erledigtAm: '2026-06-01',
      intervallMonate: 12,
      projectNumber: '2026-014',
    });
    expect((updateDoc.mock.calls[0][1] as Record<string, unknown>).letzteBaustelle).toBe('2026-014');

    updateDoc.mockClear();
    await wartungErledigt('w4', { erledigtAm: '2026-06-01', intervallMonate: 12 });
    expect(updateDoc.mock.calls[0][1]).not.toHaveProperty('letzteBaustelle');
  });

  /*
    DIE EINGEPLANTE BAUSTELLE IST MIT DEM EINTRAG GEWESEN. Bliebe sie stehen,
    zeigte die Liste die Wartung bis zum nächsten Termin als „eingeplant",
    obwohl der Einsatz vorbei ist — und beim nächsten Mal führe der Monteur
    auf eine abgeschlossene Baustelle.

    Leerstring, nicht `undefined`: `updateInTenant` wirft `undefined` heraus,
    das Feld bliebe also unverändert stehen. Genau daran ist eine Mutation
    durchgerutscht, bis dieser Test dazukam.
  */
  it('räumt die eingeplante Baustelle im selben Schreibvorgang weg', async () => {
    await wartungErledigt('w7', {
      erledigtAm: '2026-06-01',
      intervallMonate: 12,
      projectNumber: '2026-014',
    });
    const nutzlast = updateDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(nutzlast.offeneBaustelle).toBe('');
    // Und sie ist zugleich in die Historie gewandert, nicht bloss verschwunden.
    expect(nutzlast.letzteBaustelle).toBe('2026-014');
  });

  /*
    Der Monatsanschlag gilt auch hier — und zwar über dieselbe Funktion.
    Stünde in der Datenschicht eine zweite Terminrechnung, liefe sie irgendwann
    auseinander.
  */
  it('rechnet den Termin mit dem Anschlag am Monatsende', async () => {
    await wartungErledigt('w5', { erledigtAm: '2026-08-31', intervallMonate: 6 });
    expect((updateDoc.mock.calls[0][1] as Record<string, unknown>).faelligAm).toBe('2027-02-28');
  });

  it('trägt gar nichts ein, wenn das Intervall unbrauchbar ist', async () => {
    await expect(
      wartungErledigt('w6', { erledigtAm: '2026-06-01', intervallMonate: 0 }),
    ).rejects.toThrow(/Monate/);
    expect(updateDoc).not.toHaveBeenCalled();
  });
});

/**
 * Die Abfrage „was ist fällig".
 *
 * Sie holt absichtlich mehr, als sie zeigt: der Ruht-Filter läuft im Browser,
 * weil Firestore Dokumente NICHT findet, denen das Feld ganz fehlt. Eine
 * Vereinbarung ohne `aktiv` verschwände sonst still aus der Liste — und
 * Schweigen ist hier der teure Fall.
 */
describe('Fällige Wartungen holen', () => {
  beforeEach(() => queryTenant.mockReset());

  it('lässt ruhende Vereinbarungen aus, obwohl ihr Termin längst vorbei ist', async () => {
    queryTenant.mockResolvedValue([
      { id: 'a', faelligAm: '2025-01-01', aktiv: false },
      { id: 'b', faelligAm: '2026-05-01', aktiv: true },
      // Ohne das Feld — der Fall, an dem eine reine Abfrage vorbeiliefe.
      { id: 'c', faelligAm: '2026-05-02' },
    ]);

    const treffer = await listFaelligeWartungen('perl', '2026-06-01');
    expect(treffer.map((w) => w.id)).toEqual(['b', 'c']);
  });

  it('fragt mit Stichtag und Obergrenze, nicht den ganzen Bestand', async () => {
    queryTenant.mockResolvedValue([]);
    await listFaelligeWartungen('perl', '2026-06-01', 50);

    const [sammlung, companyId] = queryTenant.mock.calls[0];
    expect(sammlung).toBe('wartungen');
    expect(companyId).toBe('perl');
    // where/orderBy/limit sind gemockt; geprüft wird, DASS drei Einschränkungen
    // mitgehen — ohne sie läge hier der gesamte Bestand des Betriebs.
    expect(queryTenant.mock.calls[0].length).toBe(5);
  });
});
