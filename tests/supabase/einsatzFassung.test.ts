/**
 * DIE FASSUNG DES PAARES (Durchsicht 15.11.2026, P1) —
 * `supabase/migrations/20261115500000_einsatz_fassung.sql`.
 *
 * Einsatz und Rüstliste werden je Paar aus Tag und Baustelle als Ganzes
 * ersetzt. Zwei Planer, die vom selben Stand ausgehen, überschrieben sich
 * bisher still: wer zuletzt speicherte, gewann. Jetzt schickt das Formular
 * mit, worauf seine Eingabe beruht, und die Datenbank lehnt ab, wenn das
 * Paar inzwischen anders aussieht (`SL409`, mit dem neuen Stand im Detail).
 * Ohne Grundlage bleibt alles wie bisher — so ruft die alte App.
 *
 * Gegenprobe: ohne die Migration kennt die Datenbank `p_grundlage` nicht;
 * das erste Speichern mit Grundlage scheitert, die Prüfungen sind rot.
 *
 * Die Tage liegen im Dezember 2027, weit weg von heute und morgen.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as einsaetze from '@/lib/db/pg/assignments';
import * as ruest from '@/lib/db/pg/einsatzMaterial';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { PaarGeaendert, type EinteilungsZeile } from '@/lib/db/paarFassung';

const BETRIEB = 'fassung-a';
const TAG = '2027-12-09';
const BAU = 'B-FASSUNG-1';

let planer: Konto;
let chefin: Konto;
let anton: Konto;
let berta: Konto;

const zeile = (k: Konto, rest: Record<string, unknown> = {}) => ({
  date: TAG,
  projectNumber: BAU,
  userId: k.uid,
  userName: k.rolle,
  asHelper: false,
  comment: 'Vorwand setzen',
  zeitVon: '07:30',
  zeitBis: null,
  createdBy: planer.uid,
  ...rest,
});
/** Wie das Formular die Zeile als Grundlage schickt. */
const stand = (k: Konto, aufgabe = 'Vorwand setzen', von = '07:30'): EinteilungsZeile => [k.uid, false, aufgabe, von, ''];

/** Speichern als diese Person — die Datenschicht arbeitet mit dem eingereichten Client. */
async function als<T>(k: Konto, f: () => Promise<T>): Promise<T> {
  clientEinreichen(k.client);
  try {
    return await f();
  } finally {
    clientEinreichen(null);
  }
}

async function einteilung(): Promise<{ user_id: string; comment: string | null }[]> {
  const { data } = await admin.from('assignments').select('user_id, comment')
    .eq('company_id', BETRIEB).eq('date', TAG).eq('project_number', BAU).order('user_id');
  return (data ?? []) as { user_id: string; comment: string | null }[];
}

async function aufraeumen() {
  await admin.from('assignments').delete().eq('company_id', BETRIEB);
  await admin.from('einsatz_material').delete().eq('company_id', BETRIEB);
  await admin.from('material_orders').delete().eq('company_id', BETRIEB);
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  planer = await konto(BETRIEB, 'Projektleiter', 'faplan');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'fachef');
  anton = await konto(BETRIEB, 'Mitarbeiter', 'faanton');
  berta = await konto(BETRIEB, 'Mitarbeiter', 'faberta');
}, 120_000);

beforeEach(aufraeumen);
afterAll(async () => {
  await aufraeumen();
  clientEinreichen(null);
});

describe('Einsatz: zwei Planer vom selben Stand', () => {
  it('der zweite wird abgewiesen — mit dem neuen Stand, und es bleibt beim ersten', async () => {
    // Beide sehen ein leeres Paar.
    await als(planer, () => einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(anton)], { einteilung: [] }));
    const fehler = await als(chefin, () =>
      einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(berta, { comment: 'Silikon' })], { einteilung: [] }),
    ).catch((e: unknown) => e);

    expect(fehler).toBeInstanceOf(PaarGeaendert);
    expect((fehler as PaarGeaendert).teil).toBe('einteilung');
    expect((fehler as PaarGeaendert).stand).toEqual([stand(anton)]);
    expect(await einteilung()).toEqual([{ user_id: anton.uid, comment: 'Vorwand setzen' }]);
  });

  it('„Meine Eingabe behalten“: mit dem gemeldeten Stand als Grundlage geht es durch', async () => {
    await als(planer, () => einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(anton)], { einteilung: [] }));
    const fehler = (await als(chefin, () =>
      einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(berta)], { einteilung: [] }),
    ).catch((e: unknown) => e)) as PaarGeaendert;

    await als(chefin, () =>
      einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(berta)], { einteilung: fehler.stand as EinteilungsZeile[] }),
    );
    expect(await einteilung()).toEqual([{ user_id: berta.uid, comment: 'Vorwand setzen' }]);
  });

  it('derselbe Inhalt mit neuen Kennungen ist keine Änderung — Uhrzeit mit Sekunden, Reihenfolge egal', async () => {
    await als(planer, () => einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(anton), zeile(berta)]));
    // Noch einmal gespeichert: alles weg, alles neu — andere Kennungen, gleicher Inhalt.
    await als(planer, () => einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(berta), zeile(anton)]));
    await als(chefin, () =>
      einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(anton, { comment: 'Fertig' })], {
        einteilung: [stand(berta), stand(anton)],
      }),
    );
    expect(await einteilung()).toEqual([{ user_id: anton.uid, comment: 'Fertig' }]);
  });

  it('eine andere Person bei gleicher Kennung (Umplanen) ist eine Änderung', async () => {
    await als(planer, () => einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(anton)]));
    const { data } = await admin.from('assignments').select('id').eq('company_id', BETRIEB).eq('date', TAG).single();
    await admin.from('assignments').update({ user_id: berta.uid }).eq('id', (data as { id: string }).id);

    const fehler = await als(chefin, () =>
      einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(anton)], { einteilung: [stand(anton)] }),
    ).catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(PaarGeaendert);
  });

  it('gleichzeitig vom selben Stand: genau einer kommt durch', async () => {
    const zwei = await Promise.allSettled([
      planer.client.rpc('einsatz_speichern', {
        p_datum: TAG, p_baustelle: BAU, p_grundlage: { einteilung: [] },
        p_zeilen: [{ user_id: anton.uid, user_name: 'Anton', as_helper: false, comment: 'A', created_by: planer.uid }],
      }).then(({ error }) => { if (error) throw error; }),
      chefin.client.rpc('einsatz_speichern', {
        p_datum: TAG, p_baustelle: BAU, p_grundlage: { einteilung: [] },
        p_zeilen: [{ user_id: berta.uid, user_name: 'Berta', as_helper: false, comment: 'B', created_by: chefin.uid }],
      }).then(({ error }) => { if (error) throw error; }),
    ]);
    expect(zwei.filter((z) => z.status === 'fulfilled')).toHaveLength(1);
    const abgewiesen = zwei.find((z) => z.status === 'rejected') as PromiseRejectedResult;
    expect((abgewiesen.reason as { code?: string }).code).toBe('SL409');
    expect(await einteilung()).toHaveLength(1);
  });
});

describe('Einsatz: ohne Grundlage wie bisher (alte App)', () => {
  it('überschreibt, ohne zu fragen — der alte Aufruf mit drei Namen läuft weiter', async () => {
    await als(planer, () => einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(anton)]));
    const { error } = await chefin.client.rpc('einsatz_speichern', {
      p_datum: TAG, p_baustelle: BAU,
      p_zeilen: [{ user_id: berta.uid, user_name: 'Berta', as_helper: false, comment: 'Silikon', created_by: chefin.uid }],
    });
    expect(error).toBeNull();
    expect(await einteilung()).toEqual([{ user_id: berta.uid, comment: 'Silikon' }]);
  });
});

describe('Rüstliste', () => {
  const pos = (id: string, menge: number) => ({ id, name: 'Eckventil 1/2', menge, einheit: 'Stk' });

  it('vom selben Stand: die zweite wird abgewiesen, die erste bleibt', async () => {
    await als(planer, () => ruest.saveEinsatzMaterial(BETRIEB, TAG, BAU, [pos('r1', 4)], [anton.uid], planer.uid, undefined, []));
    const fehler = await als(chefin, () =>
      ruest.saveEinsatzMaterial(BETRIEB, TAG, BAU, [pos('r2', 1)], [anton.uid], chefin.uid, undefined, []),
    ).catch((e: unknown) => e);

    expect(fehler).toBeInstanceOf(PaarGeaendert);
    expect((fehler as PaarGeaendert).teil).toBe('liste');
    expect((fehler as PaarGeaendert).stand).toEqual([['r1', '', 'Eckventil 1/2', 4, 'Stk']]);
    const liste = await ruest.getEinsatzMaterial(BETRIEB, TAG, BAU, admin);
    expect(liste?.positionen.map((p) => p.id)).toEqual(['r1']);
  });

  it('gleicher Stand geht durch — die Menge als Zahl, ohne Rücksicht auf Nachkommastellen', async () => {
    await als(planer, () => ruest.saveEinsatzMaterial(BETRIEB, TAG, BAU, [pos('r1', 2)], [anton.uid], planer.uid));
    await als(chefin, () =>
      ruest.saveEinsatzMaterial(BETRIEB, TAG, BAU, [pos('r1', 3)], [anton.uid], chefin.uid, undefined, [
        ['r1', '', 'Eckventil 1/2', 2, 'Stk'],
      ]),
    );
    const liste = await ruest.getEinsatzMaterial(BETRIEB, TAG, BAU, admin);
    expect(liste?.positionen.map((p) => p.menge)).toEqual([3]);
  });

  it('ohne Grundlage wie bisher', async () => {
    await als(planer, () => ruest.saveEinsatzMaterial(BETRIEB, TAG, BAU, [pos('r1', 4)], [anton.uid], planer.uid));
    await als(chefin, () => ruest.saveEinsatzMaterial(BETRIEB, TAG, BAU, [pos('r2', 1)], [anton.uid], chefin.uid));
    const liste = await ruest.getEinsatzMaterial(BETRIEB, TAG, BAU, admin);
    expect(liste?.positionen.map((p) => p.id)).toEqual(['r2']);
  });

  it('die Rüstliste in der Grundlage des Einsatzes: weicht sie ab, ist auch der Einsatz nicht geschrieben', async () => {
    await als(planer, () => einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(anton)]));
    await als(planer, () => ruest.saveEinsatzMaterial(BETRIEB, TAG, BAU, [pos('r1', 4)], [anton.uid], planer.uid));

    const fehler = await als(chefin, () =>
      einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(berta)], { einteilung: [stand(anton)], liste: [] }),
    ).catch((e: unknown) => e);
    expect((fehler as PaarGeaendert).teil).toBe('liste');
    expect(await einteilung()).toEqual([{ user_id: anton.uid, comment: 'Vorwand setzen' }]);
  });
});

/*
  DIE ANDEREN WEGE NEHMEN DIESELBE SPERRE JE PAAR. Umplanen, Löschen,
  Folgetage und Speichern desselben Paares laufen nacheinander: entweder
  sieht die Prüfung des Speicherns, was vorher geschah, oder der andere Weg
  findet seine Zeile nicht mehr. Still überschrieben wird nichts.
*/
describe('Umplanen, Löschen, Folgetage und Speichern auf dasselbe Paar', () => {
  const MORGEN = '2027-12-10';
  const fehlercode = (r: PromiseSettledResult<unknown>) =>
    r.status === 'rejected' ? (r.reason as { code?: string }).code : undefined;

  async function antonsZeile(): Promise<string> {
    await als(planer, () => einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(anton)]));
    const { data } = await admin.from('assignments').select('id')
      .eq('company_id', BETRIEB).eq('date', TAG).eq('user_id', anton.uid).single();
    return (data as { id: string }).id;
  }

  /** Speichern auf der Grundlage „Anton ist eingeteilt“ — Anton und Berta. */
  const speichern = (k: Konto): Promise<void> => Promise.resolve(k.client.rpc('einsatz_speichern', {
    p_datum: TAG, p_baustelle: BAU, p_grundlage: { einteilung: [stand(anton)] },
    p_zeilen: [
      { user_id: anton.uid, user_name: 'Anton', as_helper: false, comment: 'Vorwand setzen', zeit_von: '07:30', created_by: k.uid },
      { user_id: berta.uid, user_name: 'Berta', as_helper: false, comment: 'Vorwand setzen', zeit_von: '07:30', created_by: k.uid },
    ],
  }).then(({ error }) => { if (error) throw error; }));

  it('Umplanen weg vom Paar und Speichern gleichzeitig: genau eins gilt, das andere wird abgewiesen', async () => {
    const id = await antonsZeile();
    const [gespeichert, umgeplant] = await Promise.allSettled([
      speichern(planer),
      chefin.client.rpc('einsatz_umplanen', { p_id: id, p_datum: MORGEN, p_user: anton.uid, p_kopieren: false })
        .then(({ error }) => { if (error) throw error; }),
    ]);
    const hier = await einteilung();
    if (gespeichert.status === 'fulfilled') {
      // Gespeichert zuerst: die alte Zeile gibt es nicht mehr, Umplanen findet sie nicht.
      expect(fehlercode(umgeplant)).toBe('P0002');
      expect(hier.map((z) => z.user_id).sort()).toEqual([anton.uid, berta.uid].sort());
    } else {
      // Umgeplant zuerst: die Prüfung sieht, dass Anton fehlt — nichts wird überschrieben.
      expect(fehlercode(gespeichert)).toBe('SL409');
      expect(umgeplant.status).toBe('fulfilled');
      expect(hier).toEqual([]);
    }
  });

  it('nach dem Umplanen sieht das Speichern auf altem Stand die Änderung', async () => {
    const id = await antonsZeile();
    const { error } = await chefin.client.rpc('einsatz_umplanen', { p_id: id, p_datum: MORGEN, p_user: anton.uid, p_kopieren: false });
    expect(error).toBeNull();
    const fehler = await speichern(planer).catch((e: unknown) => e);
    expect((fehler as { code?: string }).code).toBe('SL409');
    expect(await einteilung()).toEqual([]);
  });

  it('Löschen aus der App und Speichern gleichzeitig: genau eins gilt', async () => {
    const id = await antonsZeile();
    const [gespeichert, geloescht] = await Promise.allSettled([
      speichern(planer),
      als(chefin, () => einsaetze.deleteAssignment(id)),
    ]);
    expect([gespeichert.status, geloescht.status].filter((s) => s === 'fulfilled')).toHaveLength(1);
    if (gespeichert.status === 'rejected') {
      expect(fehlercode(gespeichert)).toBe('SL409');
      expect(await einteilung()).toEqual([]);
    } else {
      expect((await einteilung()).map((z) => z.user_id).sort()).toEqual([anton.uid, berta.uid].sort());
    }
  });

  it('Löschen aus der App: Rechte und Meldung wie beim direkten Löschen in der Tabelle', async () => {
    const id = await antonsZeile();
    // Ein Monteur sieht die Zeile, darf sie aber nicht löschen.
    await expect(als(anton, () => einsaetze.deleteAssignment(id))).rejects.toThrow(/Kein Datensatz in assignments geändert/);
    await expect(als(planer, () => einsaetze.deleteAssignment('00000000-0000-0000-0000-000000000000')))
      .rejects.toThrow(/Kein Datensatz in assignments geändert/);
    await als(planer, () => einsaetze.deleteAssignment(id));
    expect(await einteilung()).toEqual([]);
  });

  it('Folgetage und Speichern desselben Tages gleichzeitig: nacheinander, keine stille Überschreibung', async () => {
    await als(planer, () => einsaetze.saveAssignments(BETRIEB, MORGEN, BAU, [zeile(anton, { date: MORGEN })]));
    const zeilen = [{ user_id: berta.uid, user_name: 'Berta', as_helper: false, comment: 'Vorwand setzen', created_by: planer.uid }];
    const [folge, gespeichert] = await Promise.allSettled([
      chefin.client.rpc('einsatz_folgetage', { p_von: MORGEN, p_bis: MORGEN, p_baustelle: BAU, p_zeilen: zeilen, p_nur_werktage: true })
        .then(({ error }) => { if (error) throw error; }),
      planer.client.rpc('einsatz_speichern', {
        p_datum: MORGEN, p_baustelle: BAU, p_grundlage: { einteilung: [stand(anton)] },
        p_zeilen: [{ user_id: anton.uid, user_name: 'Anton', as_helper: false, comment: 'Fertig', zeit_von: '07:30', created_by: planer.uid }],
      }).then(({ error }) => { if (error) throw error; }),
    ]);
    expect(folge.status).toBe('fulfilled');
    const { data } = await admin.from('assignments').select('user_id, comment')
      .eq('company_id', BETRIEB).eq('date', MORGEN).eq('project_number', BAU);
    const da = (data ?? []) as { user_id: string; comment: string }[];
    // So oder so stehen beide: Berta aus den Folgetagen geht nie still verloren.
    expect(da.map((z) => z.user_id).sort()).toEqual([anton.uid, berta.uid].sort());
    if (gespeichert.status === 'rejected') {
      // Folgetage zuerst: das Speichern sieht Berta und schreibt nicht.
      expect(fehlercode(gespeichert)).toBe('SL409');
    } else {
      // Speichern zuerst, dann ergänzen die Folgetage.
      expect(da.find((z) => z.user_id === anton.uid)?.comment).toBe('Fertig');
    }
  });
});
