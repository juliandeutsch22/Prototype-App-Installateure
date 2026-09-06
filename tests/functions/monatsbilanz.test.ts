import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  bilanzNachziehen,
  bilanzenNachtlauf,
  bilanzenNeuAufbauen,
} from '../../functions/src/monatsbilanz';
import { neueDatenbank, SERVERZEIT, type FakeDb } from './ersatz/firestore';
import {
  HttpsError,
  laufeGeplant,
  loeseAus,
  protokoll,
  protokollLeeren,
  rufAuf,
  type SchreibEreignis,
} from './ersatz/funktionen';

/**
 * Die Monatsbilanzen — der Stundensaldo, der auf dem Lohnzettel landet.
 *
 * DREI ZUSAGEN tragen diese Umsetzung, und alle drei standen bisher nur im
 * Kommentar:
 *
 *  1. NEU RECHNEN STATT HOCHZÄHLEN. Firestore-Trigger laufen MINDESTENS
 *     einmal. Ein `+= delta` verzählte sich bei einem Wiederholungslauf
 *     unbemerkt und dauerhaft.
 *  2. VOLLSTÄNDIG ERSETZEN. Ein gelöschter letzter Eintrag muss die Bilanz
 *     auf null bringen, nicht den alten Wert stehen lassen.
 *  3. DER MARKER ZULETZT. Bricht der Aufbau vorher ab, fehlt er, und der
 *     Client rechnet direkt weiter: langsamer, aber richtig. Umgekehrt wäre
 *     es ein lautlos zu niedriger Saldo — also ein falscher Lohnzettel.
 */

let db: FakeDb;

const TAG = { companyId: 'perl', userId: 'monteur', status: 'Anwesend' };

function schreibEreignis(
  vorher: Record<string, unknown> | null,
  nachher: Record<string, unknown> | null,
) {
  return {
    data: {
      before: vorher ? { exists: true, data: () => vorher } : { exists: false, data: () => undefined },
      after: nachher ? { exists: true, data: () => nachher } : { exists: false, data: () => undefined },
    },
    params: { id: 'e1' },
  } as SchreibEreignis<Record<string, unknown>>;
}

beforeEach(() => {
  db = neueDatenbank();
  protokollLeeren();
});

describe('Eine Buchung zieht ihren Monat nach', () => {
  it('rechnet die Bilanz aus allen Einträgen des Monats', async () => {
    db.seed('timeEntries', {
      a: { ...TAG, date: '2026-09-07', startTime: '07:00', endTime: '16:00', breakDuration: 30 },
      b: { ...TAG, date: '2026-09-08', startTime: '07:00', endTime: '12:00', breakDuration: 0 },
      andererMonat: { ...TAG, date: '2026-08-31', startTime: '07:00', endTime: '16:00' },
    });
    await loeseAus(bilanzNachziehen, schreibEreignis(null, { ...TAG, date: '2026-09-07' }));

    const b = db.alles('monthlyStats')['perl_monteur_2026-09'];
    expect(b).toMatchObject({ companyId: 'perl', userId: 'monteur' });
    // 8,5 h + 5 h — und der Eintrag vom 31.08. bleibt draussen.
    expect(b.anwesendMin).toBe(510 + 300);
    expect(b.aktualisiert).toBe(SERVERZEIT);
  });

  it('rechnet neu statt hochzuzählen — zweimal laufen ändert nichts', async () => {
    /*
      Der Kern der Zusage. Firestore-Trigger laufen MINDESTENS einmal; ein
      Wiederholungslauf ist der Normalfall, nicht die Ausnahme. Verzählte er
      sich dabei, stünde der Saldo dauerhaft daneben — und niemand könnte
      sagen, seit wann.
    */
    db.seed('timeEntries', {
      a: { ...TAG, date: '2026-09-07', startTime: '07:00', endTime: '16:00', breakDuration: 30 },
    });
    const ev = schreibEreignis(null, { ...TAG, date: '2026-09-07' });
    await loeseAus(bilanzNachziehen, ev);
    const einmal = db.alles('monthlyStats')['perl_monteur_2026-09'].anwesendMin;
    await loeseAus(bilanzNachziehen, ev);
    await loeseAus(bilanzNachziehen, ev);
    expect(db.alles('monthlyStats')['perl_monteur_2026-09'].anwesendMin).toBe(einmal);
  });

  it('setzt die Bilanz auf null, wenn der letzte Eintrag verschwindet', async () => {
    // Vollständig ersetzen, nicht zusammenführen. Sonst bliebe der alte Wert
    // stehen und der Mitarbeiter bekäme Stunden bezahlt, die er storniert hat.
    db.seed('timeEntries', {
      a: { ...TAG, date: '2026-09-07', startTime: '07:00', endTime: '16:00', breakDuration: 30 },
    });
    await loeseAus(bilanzNachziehen, schreibEreignis(null, { ...TAG, date: '2026-09-07' }));
    expect(db.alles('monthlyStats')['perl_monteur_2026-09'].anwesendMin).toBeGreaterThan(0);

    db.inhalt('timeEntries').delete('a');
    await loeseAus(bilanzNachziehen, schreibEreignis({ ...TAG, date: '2026-09-07' }, null));
    expect(db.alles('monthlyStats')['perl_monteur_2026-09'].anwesendMin).toBe(0);
  });

  it('ersetzt die Bilanz vollständig — ein Altfeld bleibt nicht stehen', async () => {
    /*
      DIESER TEST ENTSTAND AUS EINER GEGENPROBE, DIE ZUNÄCHST DURCHGING.

      `set(..., { merge: false })` gegen `{ merge: true }` zu tauschen ändert
      am Ergebnis NICHTS, solange die Bilanz immer dieselben Felder liefert —
      sie überschreiben sich dann gegenseitig. Der Unterschied zeigt sich erst
      an einem Feld, das die heutige Rechnung gar nicht mehr kennt: mit
      `merge` bliebe es mit seinem alten Wert stehen.

      Genau das ist der Fall, für den die Zusage da ist. Eine Bilanz aus einer
      früheren Fassung trüge einen Wert, den niemand mehr pflegt — und der
      Client läse ihn weiter, als wäre er von heute.
    */
    db.seed('monthlyStats', {
      'perl_monteur_2026-09': {
        companyId: 'perl',
        userId: 'monteur',
        anwesendMin: 9999,
        altesFeldAusFrueherenTagen: 'steht hier seit 2024',
      },
    });
    db.seed('timeEntries', {
      a: { ...TAG, date: '2026-09-07', startTime: '07:00', endTime: '16:00', breakDuration: 30 },
    });
    await loeseAus(bilanzNachziehen, schreibEreignis(null, { ...TAG, date: '2026-09-07' }));

    const b = db.alles('monthlyStats')['perl_monteur_2026-09'];
    expect(b.anwesendMin).toBe(510);
    expect(b).not.toHaveProperty('altesFeldAusFrueherenTagen');
  });

  it('zieht BEIDE Monate nach, wenn eine Buchung verschoben wird', async () => {
    /*
      Sonst bliebe der Herkunftsmonat auf dem alten Wert stehen: die Stunden
      stünden zweimal im Zeitkonto, einmal im alten und einmal im neuen Monat.
    */
    db.seed('timeEntries', {
      a: { ...TAG, date: '2026-10-01', startTime: '07:00', endTime: '16:00', breakDuration: 30 },
    });
    await loeseAus(bilanzNachziehen, 
      schreibEreignis({ ...TAG, date: '2026-09-30' }, { ...TAG, date: '2026-10-01' }),
    );
    expect(Object.keys(db.alles('monthlyStats')).sort()).toEqual([
      'perl_monteur_2026-09',
      'perl_monteur_2026-10',
    ]);
    expect(db.alles('monthlyStats')['perl_monteur_2026-09'].anwesendMin).toBe(0);
    expect(db.alles('monthlyStats')['perl_monteur_2026-10'].anwesendMin).toBe(510);
  });

  it('tut nichts ohne Mandanten', async () => {
    await loeseAus(bilanzNachziehen, schreibEreignis(null, { userId: 'x', date: '2026-09-07' }));
    expect(db.schreibt).toHaveLength(0);
  });

  it('lässt einen fehlgeschlagenen Monat den anderen nicht mitreissen', async () => {
    // Der nächtliche Lauf holt ihn ohnehin nach.
    const kaputt = vi.spyOn(db, 'collection');
    let rufe = 0;
    kaputt.mockImplementation((name: string) => {
      if (name === 'monthlyStats' && rufe++ === 0) throw new Error('Firestore weg');
      return Object.getPrototypeOf(db).collection.call(db, name);
    });
    await expect(
      loeseAus(
        bilanzNachziehen,
        schreibEreignis({ ...TAG, date: '2026-09-30' }, { ...TAG, date: '2026-10-01' }),
      ),
    ).resolves.toBeUndefined();
    kaputt.mockRestore();
    expect(protokoll.some((p) => p.stufe === 'error')).toBe(true);
  });
});

describe('Der nächtliche Lauf', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function heuteIst(datum: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${datum}T04:00:00`));
  }

  it('rechnet laufenden Monat und Vormonat', async () => {
    /*
      Der Vormonat ist bewusst dabei: eine Buchung, die am Monatsersten für
      den Letzten des Vormonats nachgetragen wird, ist der Normalfall. Ohne
      ihn bliebe eine verlorene Aktualisierung dort für immer stehen.
    */
    heuteIst('2026-10-05');
    db.seed('users', { u1: { companyId: 'perl', uid: 'monteur', app_start_date: '2020-01-01' } });
    await laufeGeplant(bilanzenNachtlauf);
    expect(Object.keys(db.alles('monthlyStats')).sort()).toEqual([
      'perl_monteur_2026-09',
      'perl_monteur_2026-10',
    ]);
  });

  it('nimmt Altbestände OHNE active-Feld mit', async () => {
    /*
      `where('active','!=',false)` sah richtig aus und war es nicht: Firestore
      liefert bei `!=` ausschliesslich Dokumente, die das Feld überhaupt
      HABEN. Übernommene Altbestände wären nie nachgezogen worden — still,
      ohne Meldung, und der Saldo stünde dauerhaft daneben.
    */
    heuteIst('2026-10-05');
    db.seed('users', { u1: { companyId: 'perl', uid: 'ohneFeld', app_start_date: '2020-01-01' } });
    await laufeGeplant(bilanzenNachtlauf);
    expect(Object.keys(db.alles('monthlyStats'))).toHaveLength(2);
  });

  it('überspringt deaktivierte Konten', async () => {
    heuteIst('2026-10-05');
    db.seed('users', {
      u1: { companyId: 'perl', uid: 'weg', app_start_date: '2020-01-01', active: false },
    });
    await laufeGeplant(bilanzenNachtlauf);
    expect(db.alles('monthlyStats')).toEqual({});
  });

  it('rechnet keine Monate vor dem Eintritt', async () => {
    // Sie gibt es nicht. Eine Bilanz darüber wäre eine Null, die aussieht wie
    // ein Monat ohne Buchungen.
    heuteIst('2026-10-05');
    db.seed('users', { u1: { companyId: 'perl', uid: 'neu', app_start_date: '2026-10-01' } });
    await laufeGeplant(bilanzenNachtlauf);
    expect(Object.keys(db.alles('monthlyStats'))).toEqual(['perl_neu_2026-10']);
  });

  it('überspringt Konten ohne Eintrittsdatum', async () => {
    heuteIst('2026-10-05');
    db.seed('users', { u1: { companyId: 'perl', uid: 'ohneStart' } });
    await laufeGeplant(bilanzenNachtlauf);
    expect(db.alles('monthlyStats')).toEqual({});
  });
});

describe('Der Erstaufbau', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function ruf(rolle: string) {
    return rufAuf<never, { mitarbeiter: number; bilanzen: number }>(bilanzenNeuAufbauen, {
      data: {} as never,
      auth: { uid: 'chef', token: { companyId: 'perl', role: rolle } },
    });
  }

  it('ist der Leitung vorbehalten', async () => {
    // Der Lauf liest die gesamte Buchungsgeschichte — genau das, was im
    // laufenden Betrieb vermieden werden soll.
    await expect(ruf('Buchhaltung')).rejects.toThrow(HttpsError);
    await expect(ruf('Projektleiter')).rejects.toThrow(HttpsError);
  });

  it('setzt den Vollständigkeits-Marker ZULETZT', async () => {
    /*
      Die Reihenfolge ist die ganze Zusage. Der Client darf die Bilanzen nur
      verwenden, wenn er WEISS, dass sie lückenlos sind — fehlte ein Monat,
      wäre der Saldo lautlos zu niedrig. Stünde der Marker vor den Bilanzen,
      wäre genau dieser Zustand nach einem Abbruch der Normalfall.
    */
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T10:00:00'));
    db.seed('users', { u1: { companyId: 'perl', uid: 'monteur', app_start_date: '2026-01-10' } });

    const r = await ruf('Geschäftsführung');
    expect(r).toEqual({ mitarbeiter: 1, bilanzen: 3 });

    const pfade = db.schreibt.map((s) => s.pfad);
    expect(pfade).toEqual([
      'monthlyStats/perl_monteur_2026-01',
      'monthlyStats/perl_monteur_2026-02',
      'monthlyStats/perl_monteur_2026-03',
      'monthlyStatsMeta/perl_monteur',
    ]);
    expect(db.alles('monthlyStatsMeta').perl_monteur).toMatchObject({
      vollstaendigAb: '2026-01',
    });
  });

  it('lässt den fremden Mandanten aus', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T10:00:00'));
    db.seed('users', {
      u1: { companyId: 'perl', uid: 'monteur', app_start_date: '2026-03-01' },
      u2: { companyId: 'andere', uid: 'fremd', app_start_date: '2026-03-01' },
    });
    const r = await ruf('Administrator');
    expect(r.mitarbeiter).toBe(1);
    expect(Object.keys(db.alles('monthlyStatsMeta'))).toEqual(['perl_monteur']);
  });
});
