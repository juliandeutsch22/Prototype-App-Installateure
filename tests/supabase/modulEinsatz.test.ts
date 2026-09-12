/**
 * Einsatzplanung und Rüstliste auf Postgres.
 *
 * Zwei Vorgänge, die in Firestore je ein Batch waren und hier je eine
 * Datenbankfunktion sind. Geprüft wird deshalb vor allem das, was ein Batch
 * zugesagt hat und eine Funktion halten muss: entweder ganz oder gar nicht.
 *
 * Der zweite Schwerpunkt ist die Abhakliste. Sie ist nach Positionskennung
 * abgelegt — ginge beim Speichern eine Kennung verloren, wären sämtliche
 * Haken der Monteure weg, und zwar lautlos.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as einsaetze from '@/lib/db/pg/assignments';
import * as ruest from '@/lib/db/pg/einsatzMaterial';
import { clientEinreichen, NACHFASSEN_MS, type WithId } from '@/lib/db/pg/kern';
import type { RuestPosition, EinsatzMaterial } from '@/types';

const BETRIEB = 'einsatz-a';
const TAG = '2026-05-04';
const BAU = 'B-100';

let planer: Konto;
let anton: Konto;
let berta: Konto;

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  planer = await konto(BETRIEB, 'Projektleiter', 'planer');
  anton = await konto(BETRIEB, 'Mitarbeiter', 'anton');
  berta = await konto(BETRIEB, 'Mitarbeiter', 'berta');
  clientEinreichen(planer.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

/** Räumt Einteilung UND Rüstliste eines Tages ab — ohne Rücksicht auf Rechte. */
async function leeren(tag = TAG): Promise<void> {
  await admin.from('assignments').delete().eq('company_id', BETRIEB).eq('date', tag);
  await admin.from('einsatz_material').delete().eq('company_id', BETRIEB).eq('date', tag);
}

const zeile = (k: Konto, rest: Record<string, unknown> = {}) => ({
  date: TAG,
  projectNumber: BAU,
  userId: k.uid,
  userName: k.rolle,
  asHelper: false,
  createdBy: planer.uid,
  ...rest,
});

const position = (id: string, name: string, menge = 1): RuestPosition => ({ id, name, menge });

/** Der zuletzt gemeldete Stand. `Array.prototype.at` liegt ausserhalb des Ziels. */
const letzter = <T>(staende: T[]): T => staende[staende.length - 1];

describe('Einteilung', () => {
  it('schreibt, ersetzt und zählt richtig', async () => {
    await leeren();
    await einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(anton), zeile(berta)]);
    expect(await einsaetze.listAssignmentsForDate(BETRIEB, TAG)).toHaveLength(2);

    // Speichern heisst ERSETZEN, nicht anhängen: wer herausgenommen wurde,
    // ist weg — sonst stünde er weiter auf der Baustelle.
    await einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(anton, { asHelper: true })]);
    const danach = await einsaetze.listAssignmentsForDate(BETRIEB, TAG);
    expect(danach).toHaveLength(1);
    expect(danach[0]).toMatchObject({ userId: anton.uid, asHelper: true, projectNumber: BAU });
  });

  it('lässt eine andere Baustelle desselben Tages in Ruhe', async () => {
    await leeren();
    await einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(anton)]);
    await einsaetze.saveAssignments(BETRIEB, TAG, 'B-200', [zeile(berta, { projectNumber: 'B-200' })]);

    const alle = await einsaetze.listAssignmentsForDate(BETRIEB, TAG);
    expect(alle.map((a) => a.projectNumber).sort()).toEqual(['B-100', 'B-200']);
  });

  it('geht ganz durch oder gar nicht', async () => {
    /*
      DER GRUND FÜR DIE DATENBANKFUNKTION. Löschen und Schreiben waren in
      Firestore ein Batch; bräche etwas dazwischen ab, wäre der Tag für diese
      Baustelle leer — und niemand erführe davon. Hier scheitert die zweite
      Zeile an einem Mitarbeiter, den es nicht gibt.
    */
    await leeren();
    await einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(anton)]);

    const erfunden = { ...zeile(berta), userId: crypto.randomUUID() };
    await expect(
      einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(berta), erfunden]),
    ).rejects.toThrow();

    const danach = await einsaetze.listAssignmentsForDate(BETRIEB, TAG);
    expect(danach).toHaveLength(1);
    expect(danach[0].userId).toBe(anton.uid);
  });

  it('zieht die Mitarbeiterliste der Rüstliste mit', async () => {
    /*
      An `uids` hängt die Entscheidung, ob ein Monteur abhaken darf. Liefe
      das Nachziehen getrennt und ginge dazwischen etwas schief, sähe der
      neue Kollege das Material und käme beim Antippen nicht durch.
    */
    await leeren();
    await einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(anton)]);
    await ruest.saveEinsatzMaterial(
      BETRIEB, TAG, BAU, [position('p1', 'Rohr')], [anton.uid], 'Planer',
    );

    await einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(berta)]);
    const liste = await ruest.getEinsatzMaterial(BETRIEB, TAG, BAU);
    expect(liste!.uids).toEqual([berta.uid]);
  });

  it('einen einzelnen Einsatz entfernen', async () => {
    await leeren();
    await einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(anton), zeile(berta)]);
    const [erster] = await einsaetze.listAssignmentsForDate(BETRIEB, TAG);
    await einsaetze.deleteAssignment(erster.id);
    expect(await einsaetze.listAssignmentsForDate(BETRIEB, TAG)).toHaveLength(1);
  });

  it('einteilen darf nur die Leitung', async () => {
    await leeren();
    clientEinreichen(anton.client);
    await expect(
      einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(anton)]),
    ).rejects.toThrow();
    clientEinreichen(planer.client);
    expect(await einsaetze.listAssignmentsForDate(BETRIEB, TAG)).toEqual([]);
  });
});

describe('Einteilung lesen', () => {
  const TAGE = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04'];

  beforeAll(async () => {
    for (const t of TAGE) {
      await leeren(t);
      await einsaetze.saveAssignments(BETRIEB, t, BAU, [zeile(anton, { date: t }), zeile(berta, { date: t })]);
    }
  }, 60_000);

  it('die anstehenden Einsätze beginnen beim Stichtag', async () => {
    const rows = await einsaetze.listUpcomingAssignments(BETRIEB, anton.uid, '2026-06-03');
    expect(rows.map((r) => r.date)).toEqual(['2026-06-03', '2026-06-04']);
  });

  it('schneidet vorne nicht ab, sondern hinten', async () => {
    /*
      Wird die Grenze erreicht, muss der NÄCHSTE Einsatz erhalten bleiben und
      der am weitesten entfernte fehlen — sonst weiss der Monteur morgen
      früh nicht, wo er hinfährt.
    */
    const rows = await einsaetze.listUpcomingAssignments(BETRIEB, anton.uid, '2026-06-01', 2);
    expect(rows.map((r) => r.date)).toEqual(['2026-06-01', '2026-06-02']);
  });

  it('liefert nur die Einsätze des gefragten Mitarbeiters', async () => {
    const rows = await einsaetze.listUpcomingAssignments(BETRIEB, anton.uid, '2026-06-01');
    expect(rows.every((r) => r.userId === anton.uid)).toBe(true);
    expect(rows).toHaveLength(4);
  });

  it('der Zeitraum ist beidseitig geschlossen', async () => {
    const rows = await einsaetze.listAssignmentsForUserInRange(
      BETRIEB, berta.uid, '2026-06-02', '2026-06-03',
    );
    expect(rows.map((r) => r.date).sort()).toEqual(['2026-06-02', '2026-06-03']);
  });
});

describe('Rüstliste', () => {
  it('behält Kennung und Reihenfolge der Positionen', async () => {
    /*
      DIE KENNUNG KOMMT VOM GERÄT. An ihr hängt `geladen`; vergäbe die
      Datenbank eigene, wäre nach jedem Speichern der Planung jeder Haken
      weg. Die Reihenfolge steht in einer Spalte, nicht im Zufall der
      Rückgabe.
    */
    await leeren();
    const positionen = [position('pa', 'Rohr 22mm', 2.5), position('pb', 'Fitting'), position('pc', 'Dichtung')];
    await ruest.saveEinsatzMaterial(BETRIEB, TAG, BAU, positionen, [anton.uid], 'Planer');

    const liste = await ruest.getEinsatzMaterial(BETRIEB, TAG, BAU);
    expect(liste!.positionen.map((p) => p.id)).toEqual(['pa', 'pb', 'pc']);
    expect(liste!.positionen[0]).toMatchObject({ name: 'Rohr 22mm', menge: 2.5 });
    expect(liste!.updatedBy).toBe('Planer');

    /*
      UMSORTIEREN IST DIE EIGENTLICHE PRÜFUNG. Dass frisch angelegte Zeilen in
      der Reihenfolge zurückkommen, in der sie geschrieben wurden, beweist
      nichts — das tun sie auch ohne jede Sortierspalte. Erst wenn dieselben
      Positionen in anderer Folge gespeichert werden, zeigt sich, ob die
      Reihenfolge wirklich in `position` steht.
    */
    await ruest.saveEinsatzMaterial(
      BETRIEB, TAG, BAU,
      [positionen[2], positionen[0], positionen[1]],
      [anton.uid], 'Planer',
    );
    const neu = await ruest.getEinsatzMaterial(BETRIEB, TAG, BAU);
    expect(neu!.positionen.map((p) => p.id)).toEqual(['pc', 'pa', 'pb']);
  });

  it('eine Liste ohne Positionen wird gelöscht, nicht leer gespeichert', async () => {
    await leeren();
    await ruest.saveEinsatzMaterial(BETRIEB, TAG, BAU, [position('pa', 'Rohr')], [anton.uid], 'Planer');
    expect(await ruest.getEinsatzMaterial(BETRIEB, TAG, BAU)).not.toBeNull();

    await ruest.saveEinsatzMaterial(BETRIEB, TAG, BAU, [], [anton.uid], 'Planer');
    expect(await ruest.getEinsatzMaterial(BETRIEB, TAG, BAU)).toBeNull();
  });

  it('hält die Haken über ein Speichern der Planung hinweg', async () => {
    await leeren();
    await einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(anton)]);
    await ruest.saveEinsatzMaterial(
      BETRIEB, TAG, BAU, [position('pa', 'Rohr'), position('pb', 'Fitting')], [anton.uid], 'Planer',
    );

    clientEinreichen(anton.client);
    await ruest.ladenUmschalten(BETRIEB, TAG, BAU, 'pa', true, 'Anton');
    clientEinreichen(planer.client);

    // Der Planer ändert die Menge einer anderen Position.
    await ruest.saveEinsatzMaterial(
      BETRIEB, TAG, BAU, [position('pa', 'Rohr'), position('pb', 'Fitting', 4)], [anton.uid], 'Planer',
    );

    const liste = await ruest.getEinsatzMaterial(BETRIEB, TAG, BAU);
    expect(liste!.geladen).toHaveProperty('pa');
    expect(liste!.geladen!.pa.von).toBe('Anton');
    expect(liste!.positionen[1].menge).toBe(4);

    /*
      Der Haken muss auf eine Position ZEIGEN, nicht bloss dastehen. Vergäbe
      die Datenbank beim Speichern neue Positionskennungen, bliebe `geladen`
      unverändert und trotzdem wäre jeder Haken ins Leere gesetzt — in der
      Ansicht sähe die Liste danach unabgehakt aus.
    */
    const kennungen = liste!.positionen.map((p) => p.id);
    for (const k of Object.keys(liste!.geladen ?? {})) expect(kennungen).toContain(k);
  });

  it('räumt Haken zu Positionen weg, die es nicht mehr gibt', async () => {
    /*
      Sonst bliebe „eingeladen" an einem Artikel hängen, der gar nicht mehr
      auf der Liste steht — unsichtbar, bis ihn jemand wieder aufnimmt und
      der Haken schon da ist.
    */
    await leeren();
    await einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(anton)]);
    await ruest.saveEinsatzMaterial(
      BETRIEB, TAG, BAU, [position('pa', 'Rohr'), position('pb', 'Fitting')], [anton.uid], 'Planer',
    );
    clientEinreichen(anton.client);
    await ruest.ladenUmschalten(BETRIEB, TAG, BAU, 'pa', true, 'Anton');
    await ruest.ladenUmschalten(BETRIEB, TAG, BAU, 'pb', true, 'Anton');
    clientEinreichen(planer.client);

    await ruest.saveEinsatzMaterial(BETRIEB, TAG, BAU, [position('pb', 'Fitting')], [anton.uid], 'Planer');

    const liste = await ruest.getEinsatzMaterial(BETRIEB, TAG, BAU);
    expect(Object.keys(liste!.geladen ?? {})).toEqual(['pb']);
    const { count } = await admin
      .from('einsatz_material_positionen')
      .select('id', { count: 'exact', head: true })
      .eq('einsatz_material_id', liste!.id);
    expect(count).toBe(1);
  });

  it('trennt die Rüstlisten zweier Baustellen desselben Tages', async () => {
    await leeren();
    await ruest.saveEinsatzMaterial(BETRIEB, TAG, BAU, [position('pa', 'Rohr')], [anton.uid], 'Planer');
    await ruest.saveEinsatzMaterial(BETRIEB, TAG, 'B-200', [position('pz', 'Kessel')], [berta.uid], 'Planer');

    const tag = await ruest.listEinsatzMaterialForDate(BETRIEB, TAG);
    expect(tag).toHaveLength(2);
    const nach = Object.fromEntries(tag.map((l) => [l.projectNumber, l.positionen.map((p) => p.id)]));
    expect(nach).toEqual({ 'B-100': ['pa'], 'B-200': ['pz'] });
  });

  it('planen darf nur die Leitung', async () => {
    await leeren();
    clientEinreichen(anton.client);
    await expect(
      ruest.saveEinsatzMaterial(BETRIEB, TAG, BAU, [position('pa', 'Rohr')], [anton.uid], 'Anton'),
    ).rejects.toThrow();
    clientEinreichen(planer.client);
    expect(await ruest.getEinsatzMaterial(BETRIEB, TAG, BAU)).toBeNull();
  });
});

describe('Abhaken', () => {
  beforeAll(async () => {
    await leeren();
    await einsaetze.saveAssignments(BETRIEB, TAG, BAU, [zeile(anton)]);
    await ruest.saveEinsatzMaterial(
      BETRIEB, TAG, BAU, [position('pa', 'Rohr'), position('pb', 'Fitting')], [anton.uid], 'Planer',
    );
  }, 60_000);

  afterAll(() => clientEinreichen(planer.client));

  it('der eingeteilte Monteur setzt und löst den Haken', async () => {
    clientEinreichen(anton.client);
    await ruest.ladenUmschalten(BETRIEB, TAG, BAU, 'pa', true, 'Anton');
    let liste = await ruest.getEinsatzMaterial(BETRIEB, TAG, BAU);
    expect(liste!.geladen!.pa).toMatchObject({ von: 'Anton' });
    expect(typeof liste!.geladen!.pa.am).toBe('number');

    await ruest.ladenUmschalten(BETRIEB, TAG, BAU, 'pa', false, 'Anton');
    liste = await ruest.getEinsatzMaterial(BETRIEB, TAG, BAU);
    expect(liste!.geladen ?? {}).toEqual({});
  });

  it('wer nicht eingeteilt ist, kommt nicht durch', async () => {
    clientEinreichen(berta.client);
    await expect(ruest.ladenUmschalten(BETRIEB, TAG, BAU, 'pb', true, 'Berta')).rejects.toThrow();
    clientEinreichen(planer.client);
    const liste = await ruest.getEinsatzMaterial(BETRIEB, TAG, BAU);
    expect(liste!.geladen ?? {}).toEqual({});
  });

  it('abhaken ohne Rüstliste ist ein Fehler, kein stiller Erfolg', async () => {
    /*
      Ohne die Prüfung wäre ein Haken auf einer Liste, die es nicht gibt, von
      aussen nicht von einem geglückten zu unterscheiden: der Monteur sieht
      seinen Haken, und beim nächsten Laden ist er weg.
    */
    clientEinreichen(anton.client);
    await expect(
      ruest.ladenUmschalten(BETRIEB, '2026-05-05', BAU, 'pa', true, 'Anton'),
    ).rejects.toThrow();
    clientEinreichen(planer.client);
  });
});

describe('Rüstliste live', () => {
  /*
    DAS ABONNEMENT HÖRT AM KOPF, nicht an den Positionen — und holt bei jeder
    Meldung den ganzen Tag neu. Das trägt nur, solange JEDES Speichern den
    Kopf berührt. Genau das steht hier auf dem Prüfstand: eine Änderung, die
    nur Positionen betrifft (eine Menge), muss ankommen.
  */
  /*
    Warum so lange gewartet wird, bevor geschrieben wird: `SUBSCRIBED` sagt,
    dass der KANAL steht — nicht, dass die Datenbank schon meldet. Dazwischen
    liegen einige hundert Millisekunden, und von aussen ist dieser Zustand
    nicht zu beobachten. Wer früher schreibt, prüft die Anlaufzeit und nicht
    den Code; das Ergebnis flattert und sagt nichts.
  */
  const abwarten = () => warte(NACHFASSEN_MS + 1800);

  it('meldet auch eine Änderung, die nur eine Position betrifft', async () => {
    await leeren();
    clientEinreichen(planer.client);
    await ruest.saveEinsatzMaterial(
      BETRIEB, TAG, BAU, [position('pa', 'Rohr', 1)], [anton.uid], 'Planer',
    );

    const staende: WithId<EinsatzMaterial>[][] = [];
    const stopp = ruest.subscribeEinsatzMaterialForDate(
      BETRIEB, TAG, (rows) => staende.push(rows), (e) => { throw e; },
    );
    try {
      await abwarten();
      expect(letzter(staende)[0].positionen[0].menge).toBe(1);

      const vorher = staende.length;
      await ruest.saveEinsatzMaterial(
        BETRIEB, TAG, BAU, [position('pa', 'Rohr', 7)], [anton.uid], 'Planer',
      );

      for (let i = 0; i < 40 && staende.length === vorher; i += 1) await warte(100);
      expect(staende.length).toBeGreaterThan(vorher);
      expect(letzter(staende)[0].positionen[0].menge).toBe(7);
    } finally {
      stopp();
    }
  }, 30_000);

  it('meldet, wenn die Liste gelöscht wird', async () => {
    await leeren();
    clientEinreichen(planer.client);
    await ruest.saveEinsatzMaterial(BETRIEB, TAG, BAU, [position('pa', 'Rohr')], [anton.uid], 'Planer');

    const staende: WithId<EinsatzMaterial>[][] = [];
    const stopp = ruest.subscribeEinsatzMaterialForDate(
      BETRIEB, TAG, (rows) => staende.push(rows), (e) => { throw e; },
    );
    try {
      await abwarten();
      const vorher = staende.length;
      await ruest.saveEinsatzMaterial(BETRIEB, TAG, BAU, [], [anton.uid], 'Planer');

      for (let i = 0; i < 40 && letzter(staende).length > 0; i += 1) await warte(100);
      expect(staende.length).toBeGreaterThan(vorher);
      expect(letzter(staende)).toEqual([]);
    } finally {
      stopp();
    }
  }, 30_000);
});
