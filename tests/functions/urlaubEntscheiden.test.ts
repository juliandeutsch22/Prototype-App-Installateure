import { describe, it, expect, beforeEach } from 'vitest';
import { urlaubEntscheiden } from '../../functions/src/urlaubEntscheiden';
import { neueDatenbank, SERVERZEIT, type FakeDb, type Dok } from './ersatz/firestore';
import { HttpsError, rufAuf } from './ersatz/funktionen';

/**
 * Über einen Urlaubsantrag entscheiden — die Function, nicht die Ansicht.
 *
 * WARUM DIESE ALS ERSTE. Sie ist die einzige Stelle im ganzen Projekt, an der
 * ein Aufruf FREMDE Zeiteinträge schreibt und löscht. Läuft sie falsch, sind
 * Urlaubstage weg oder doppelt — und das fällt frühestens beim Lohnzettel auf,
 * wenn überhaupt. Sie lief bisher ohne einen einzigen Test.
 *
 * Geprüft wird der echte Handler; nur Firestore ist nachgebaut.
 */

let db: FakeDb;

/** Ein Zeitraum ohne Feiertage: Mo 2026-09-07 bis Fr 2026-09-11. */
const VON = '2026-09-07';
const BIS = '2026-09-11';

function grunddaten(zusatz?: { firma?: Dok; antrag?: Dok; nutzer?: Dok }) {
  db.seed('companies', { perl: { name: 'Perl', ...(zusatz?.firma ?? {}) } });
  db.seed('users', {
    u1: { companyId: 'perl', uid: 'monteur', name: 'Max', ...(zusatz?.nutzer ?? {}) },
  });
  db.seed('vacations', {
    a1: {
      companyId: 'perl',
      userId: 'monteur',
      userName: 'Max',
      von: VON,
      bis: BIS,
      status: 'Beantragt',
      ...(zusatz?.antrag ?? {}),
    },
  });
}

function ruf(
  data: Record<string, unknown>,
  auth: { uid: string; role: string; companyId?: string } | null = {
    uid: 'chef',
    role: 'Geschäftsführung',
  },
) {
  const req = {
    data,
    auth: auth
      ? { uid: auth.uid, token: { companyId: auth.companyId ?? 'perl', role: auth.role } }
      : undefined,
  };
  return rufAuf<never, {
    status: string;
    angelegt: number;
    uebersprungen: number;
    entfernt: number;
  }>(urlaubEntscheiden, req as never);
}

/** Die Ablehnung samt ihrer ART prüfen — „wirft irgendwas" wäre zu wenig. */
async function scheitert(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toThrow(HttpsError);
  await p.catch((e) => expect((e as HttpsError).code).toBe(code));
}

beforeEach(() => {
  db = neueDatenbank();
});

describe('Wer überhaupt entscheiden darf', () => {
  it('weist einen Aufruf ohne Anmeldung ab', async () => {
    grunddaten();
    await scheitert(ruf({ vacationId: 'a1', entscheidung: 'Genehmigt' }, null), 'unauthenticated');
  });

  it('verlangt Antrag und Entscheidung', async () => {
    grunddaten();
    await scheitert(ruf({ entscheidung: 'Genehmigt' }), 'invalid-argument');
    await scheitert(ruf({ vacationId: 'a1' }), 'invalid-argument');
  });

  it('lässt die Geschäftsführung immer entscheiden', async () => {
    grunddaten({ firma: { vacationApprovers: ['jemand-anderes'] } });
    const r = await ruf({ vacationId: 'a1', entscheidung: 'Genehmigt' });
    expect(r.status).toBe('Genehmigt');
  });

  it('lässt die hinterlegte Bürokraft entscheiden', async () => {
    /*
      Der eigentliche Grund, warum diese Function überhaupt serverseitig
      läuft: sobald die Geschäftsführung frei festlegen kann, WER genehmigt,
      bräuchte diese Person sonst Leserecht auf alle Zeiteinträge — also auf
      Kranken- und Urlaubstage.
    */
    grunddaten({ firma: { vacationApprovers: ['buero'] } });
    const r = await ruf(
      { vacationId: 'a1', entscheidung: 'Genehmigt' },
      { uid: 'buero', role: 'Verwaltung' },
    );
    expect(r.status).toBe('Genehmigt');
  });

  it('weist ab, wer nicht hinterlegt ist', async () => {
    grunddaten({ firma: { vacationApprovers: ['buero'] } });
    await scheitert(
      ruf({ vacationId: 'a1', entscheidung: 'Genehmigt' }, { uid: 'jemand', role: 'Verwaltung' }),
      'permission-denied',
    );
  });

  it('lässt ohne Festlegung die Buchhaltung entscheiden', async () => {
    // Das Einführen der Einstellung darf niemandem stillschweigend Rechte
    // entzogen haben.
    grunddaten();
    const r = await ruf(
      { vacationId: 'a1', entscheidung: 'Genehmigt' },
      { uid: 'buch', role: 'Buchhaltung' },
    );
    expect(r.status).toBe('Genehmigt');
  });

  it('nimmt der Buchhaltung das Recht, sobald jemand hinterlegt ist', async () => {
    grunddaten({ firma: { vacationApprovers: ['buero'] } });
    await scheitert(
      ruf({ vacationId: 'a1', entscheidung: 'Genehmigt' }, { uid: 'buch', role: 'Buchhaltung' }),
      'permission-denied',
    );
  });

  it('hält die Mandantengrenze — die Function ist an die Rules nicht gebunden', async () => {
    /*
      Der wichtigste Test der Datei. Diese Function läuft mit Admin-Rechten;
      was `firestore.rules` verbietet, hält sie hier NICHT auf. Die Grenze
      steht allein in diesem Vergleich.
    */
    grunddaten();
    await scheitert(
      ruf(
        { vacationId: 'a1', entscheidung: 'Genehmigt' },
        { uid: 'fremd', role: 'Geschäftsführung', companyId: 'andere-firma' },
      ),
      'permission-denied',
    );
    expect(db.alles('timeEntries')).toEqual({});
  });

  it('meldet einen Antrag, den es nicht gibt', async () => {
    grunddaten();
    await scheitert(ruf({ vacationId: 'gibtesnicht', entscheidung: 'Genehmigt' }), 'not-found');
  });
});

describe('Ablehnen', () => {
  it('verlangt einen Grund', async () => {
    // Eine Ablehnung ohne Begründung ist für den, der sie bekommt, nicht von
    // Willkür zu unterscheiden.
    grunddaten();
    await scheitert(ruf({ vacationId: 'a1', entscheidung: 'Abgelehnt' }), 'invalid-argument');
    await scheitert(
      ruf({ vacationId: 'a1', entscheidung: 'Abgelehnt', grund: 'ab' }),
      'invalid-argument',
    );
  });

  it('rührt das Zeitkonto nicht an', async () => {
    grunddaten();
    const r = await ruf({
      vacationId: 'a1',
      entscheidung: 'Abgelehnt',
      grund: 'Baustelle läuft',
    });
    expect(r).toEqual({ status: 'Abgelehnt', angelegt: 0, uebersprungen: 0, entfernt: 0 });
    expect(db.alles('timeEntries')).toEqual({});
    expect(db.alles('vacations').a1).toMatchObject({
      status: 'Abgelehnt',
      grund: 'Baustelle läuft',
      updatedAt: SERVERZEIT,
    });
  });

  it('lehnt nicht zweimal ab', async () => {
    grunddaten({ antrag: { status: 'Genehmigt' } });
    await scheitert(
      ruf({ vacationId: 'a1', entscheidung: 'Abgelehnt', grund: 'doch nicht' }),
      'failed-precondition',
    );
  });
});

describe('Genehmigen', () => {
  it('schreibt für jeden Arbeitstag einen Urlaubstag', async () => {
    grunddaten();
    const r = await ruf({ vacationId: 'a1', entscheidung: 'Genehmigt' });
    expect(r).toMatchObject({ status: 'Genehmigt', angelegt: 5, uebersprungen: 0 });

    const tage = Object.values(db.alles('timeEntries'));
    expect(tage).toHaveLength(5);
    expect(tage.map((t) => t.date).sort()).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
    ]);
    expect(tage[0]).toMatchObject({
      companyId: 'perl',
      status: 'Urlaub',
      userId: 'monteur',
      userName: 'Max',
      vacationId: 'a1',
    });
  });

  it('rechnet mit den Arbeitstagen des BETROFFENEN, nicht des Entscheidenden', async () => {
    /*
      Sonst bekäme ein Teilzeitmitarbeiter fünf Tage abgezogen statt drei —
      und niemand sähe, warum sein Urlaubskonto schneller leer ist.
    */
    grunddaten({ nutzer: { workDays: [1, 2, 3] } });
    const r = await ruf({ vacationId: 'a1', entscheidung: 'Genehmigt' });
    expect(r.angelegt).toBe(3);
    expect(Object.values(db.alles('timeEntries')).map((t) => t.date).sort()).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
    ]);
  });

  it('überspringt einen Tag, an dem schon gebucht ist — und überschreibt ihn nicht', async () => {
    /*
      Eine erfasste Arbeitsleistung darf eine Genehmigung nicht stillschweigend
      wegwerfen. Wäre der Tag überschrieben, stünde die Baustelle ohne Stunden
      da — und die Rechnung an den Kunden wäre um einen Tag zu klein.
    */
    grunddaten();
    db.seed('timeEntries', {
      vorhanden: {
        companyId: 'perl',
        userId: 'monteur',
        date: '2026-09-09',
        status: 'Anwesend',
        startTime: '07:00',
        endTime: '16:00',
      },
    });
    const r = await ruf({ vacationId: 'a1', entscheidung: 'Genehmigt' });
    expect(r).toMatchObject({ angelegt: 4, uebersprungen: 1 });
    expect(db.alles('timeEntries').vorhanden).toMatchObject({
      status: 'Anwesend',
      startTime: '07:00',
    });
  });

  it('schreibt Antrag und Tage in EINEM Vorgang', async () => {
    // Zwei getrennte Schreibvorgänge hätten einen Zustand dazwischen
    // erlaubt: Antrag genehmigt, Tage fehlen.
    grunddaten();
    await ruf({ vacationId: 'a1', entscheidung: 'Genehmigt' });
    expect(db.commits).toBe(1);
  });

  it('weist einen Zeitraum ohne Arbeitstag ab', async () => {
    // Sa/So — ein Urlaub über null Tage wäre eine stille Nullbuchung.
    grunddaten({ antrag: { von: '2026-09-05', bis: '2026-09-06' } });
    await scheitert(ruf({ vacationId: 'a1', entscheidung: 'Genehmigt' }), 'failed-precondition');
  });

  it('weist einen zu langen Zeitraum ab, statt den Batch zu sprengen', async () => {
    // Firestore nimmt 500 Schreibvorgänge je Batch. Darüber schlüge der
    // Commit fehl — und der Antrag stünde als unentschieden da.
    grunddaten({ antrag: { von: '2026-01-01', bis: '2029-01-01' } });
    await scheitert(ruf({ vacationId: 'a1', entscheidung: 'Genehmigt' }), 'invalid-argument');
    expect(db.alles('timeEntries')).toEqual({});
  });

  it('genehmigt nicht zweimal', async () => {
    // Sonst stünden die Urlaubstage doppelt im Zeitkonto.
    grunddaten({ antrag: { status: 'Genehmigt' } });
    await scheitert(ruf({ vacationId: 'a1', entscheidung: 'Genehmigt' }), 'failed-precondition');
  });

  it('braucht Zeitraum und Antragsteller im Antrag', async () => {
    grunddaten({ antrag: { userId: undefined } });
    await scheitert(ruf({ vacationId: 'a1', entscheidung: 'Genehmigt' }), 'failed-precondition');
  });
});

describe('Zurücknehmen', () => {
  it('entfernt nur die selbst erzeugten Tage', async () => {
    /*
      Gefunden werden sie über die `vacationId`, nicht über den Zeitraum. Ein
      von Hand gebuchter Urlaubstag im selben Zeitraum — etwa ein alter
      Resturlaub — darf nicht mit verschwinden.
    */
    grunddaten({ antrag: { status: 'Genehmigt' } });
    db.seed('timeEntries', {
      ausAntrag: { companyId: 'perl', userId: 'monteur', date: VON, vacationId: 'a1' },
      vonHand: { companyId: 'perl', userId: 'monteur', date: BIS, status: 'Urlaub' },
      andererAntrag: { companyId: 'perl', userId: 'monteur', date: BIS, vacationId: 'a2' },
    });
    const r = await ruf({ vacationId: 'a1', entscheidung: 'Storniert', grund: 'Krank geworden' });
    expect(r).toMatchObject({ status: 'Storniert', entfernt: 1 });
    expect(Object.keys(db.alles('timeEntries')).sort()).toEqual(['andererAntrag', 'vonHand']);
  });

  it('nimmt nur einen genehmigten Urlaub zurück', async () => {
    grunddaten();
    await scheitert(
      ruf({ vacationId: 'a1', entscheidung: 'Storniert', grund: 'Doch nicht' }),
      'failed-precondition',
    );
  });

  it('verlangt auch hier einen Grund', async () => {
    grunddaten({ antrag: { status: 'Genehmigt' } });
    await scheitert(ruf({ vacationId: 'a1', entscheidung: 'Storniert' }), 'invalid-argument');
  });

  it('hält den Mandanten auch beim Einsammeln', async () => {
    // Ein gleichnamiger Antrag in einer anderen Firma darf nicht mit
    // abgeräumt werden.
    grunddaten({ antrag: { status: 'Genehmigt' } });
    db.seed('timeEntries', {
      fremd: { companyId: 'andere', userId: 'monteur', date: VON, vacationId: 'a1' },
    });
    const r = await ruf({ vacationId: 'a1', entscheidung: 'Storniert', grund: 'Krank geworden' });
    expect(r.entfernt).toBe(0);
    expect(db.alles('timeEntries').fremd).toBeDefined();
  });
});
