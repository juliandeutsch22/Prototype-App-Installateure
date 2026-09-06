import { describe, it, expect, beforeEach } from 'vitest';
import { scheinVorbereiten } from '../../functions/src/scheinVorbereiten';
import { neueDatenbank, type FakeDb } from './ersatz/firestore';
import { HttpsError, rufAuf } from './ersatz/funktionen';

/**
 * Die Zeiten für den Handwerksschein — serverseitig zusammengestellt.
 *
 * WAS HIER AUF DEM SPIEL STEHT, ist zweierlei. Erstens der Beleg: der Kunde
 * unterschreibt für alle, die auf seiner Baustelle waren. Fehlt ein Kollege,
 * fehlen seine Stunden auf der Rechnung. Zweitens der Datenschutz: Zeiteinträge
 * tragen Kranken- und Urlaubstage und damit Gesundheitsdaten nach Art. 9
 * DSGVO. Die Function umgeht die Rules — sie darf deshalb NUR
 * Anwesenheitszeiten EINER Baustelle an EINEM Tag herausgeben.
 *
 * Beide Zusagen standen bisher nur im Kommentar.
 */

let db: FakeDb;
const TAG = '2026-09-04';

function ruf(data: Record<string, unknown>, companyId: string | null = 'perl') {
  return rufAuf<never, { zeiten: Array<Record<string, unknown>> }>(scheinVorbereiten, {
    data: data as never,
    auth: companyId ? { uid: 'monteur', token: { companyId } } : undefined,
  });
}

async function scheitert(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toThrow(HttpsError);
  await p.catch((e) => expect((e as HttpsError).code).toBe(code));
}

function eintrag(zusatz: Record<string, unknown>) {
  return {
    companyId: 'perl',
    date: TAG,
    status: 'Anwesend',
    projectNumber: 'B-001',
    userName: 'Max',
    startTime: '07:00',
    endTime: '16:00',
    breakDuration: 30,
    ...zusatz,
  };
}

beforeEach(() => {
  db = neueDatenbank();
});

describe('Der Zugang', () => {
  it('verlangt eine Anmeldung', async () => {
    await scheitert(ruf({ projectNumber: 'B-001', datum: TAG }, null), 'unauthenticated');
  });

  it('verlangt Baustelle und ein gültiges Datum', async () => {
    await scheitert(ruf({ datum: TAG }), 'invalid-argument');
    await scheitert(ruf({ projectNumber: 'B-001' }), 'invalid-argument');
    await scheitert(ruf({ projectNumber: 'B-001', datum: '4.9.2026' }), 'invalid-argument');
  });
});

describe('Was auf den Schein kommt', () => {
  it('sammelt die ganze Mannschaft des Tages', async () => {
    // Der Kunde unterschreibt für alle, die dort waren — nicht nur für den,
    // der gerade das Tablet hält.
    db.seed('timeEntries', {
      a: eintrag({ userName: 'Max' }),
      b: eintrag({ userName: 'Anna', startTime: '08:00', endTime: '12:00', breakDuration: 0 }),
    });
    const r = await ruf({ projectNumber: 'B-001', datum: TAG });
    expect(r.zeiten.map((z) => z.mitarbeiter)).toEqual(['Anna', 'Max']);
    expect(r.zeiten[0]).toMatchObject({ von: '08:00', bis: '12:00', minuten: 240 });
    expect(r.zeiten[1].minuten).toBe(510);
  });

  it('sortiert nach Namen, nicht nach Zufall', async () => {
    // Ohne feste Ordnung stünde bei jedem Öffnen eine andere Reihenfolge auf
    // demselben Beleg.
    db.seed('timeEntries', {
      z: eintrag({ userName: 'Örtel' }),
      a: eintrag({ userName: 'Zauner' }),
      m: eintrag({ userName: 'Auer' }),
    });
    const r = await ruf({ projectNumber: 'B-001', datum: TAG });
    expect(r.zeiten.map((z) => z.mitarbeiter)).toEqual(['Auer', 'Örtel', 'Zauner']);
  });

  it('gleicht ein führendes „PR-" aus Altbeständen an', async () => {
    db.seed('timeEntries', { a: eintrag({ projectNumber: 'PR-B-001' }) });
    const r = await ruf({ projectNumber: 'b-001', datum: TAG });
    expect(r.zeiten).toHaveLength(1);
  });

  it('trägt Tätigkeit und Helferkennzeichen mit', async () => {
    db.seed('timeEntries', {
      a: eintrag({ comment: 'Rohbruch', isHelper: true }),
    });
    const r = await ruf({ projectNumber: 'B-001', datum: TAG });
    expect(r.zeiten[0]).toMatchObject({ taetigkeit: 'Rohbruch', helfer: true });
  });
});

describe('Was NICHT herausgegeben wird', () => {
  it('keine Kranken- und Urlaubstage', async () => {
    /*
      Der Kern der Datenschutzzusage. Die Function umgeht die Rules; wären
      diese Einträge dabei, legte sie jedem Monteur die Abwesenheiten seiner
      Kollegen offen — Gesundheitsdaten nach Art. 9 DSGVO.
    */
    db.seed('timeEntries', {
      krank: eintrag({ userName: 'Anna', status: 'Krank' }),
      urlaub: eintrag({ userName: 'Bert', status: 'Urlaub' }),
      da: eintrag({ userName: 'Max' }),
    });
    const r = await ruf({ projectNumber: 'B-001', datum: TAG });
    expect(r.zeiten.map((z) => z.mitarbeiter)).toEqual(['Max']);
  });

  it('keine andere Baustelle', async () => {
    db.seed('timeEntries', {
      hier: eintrag({ userName: 'Max' }),
      woanders: eintrag({ userName: 'Anna', projectNumber: 'B-999' }),
    });
    const r = await ruf({ projectNumber: 'B-001', datum: TAG });
    expect(r.zeiten.map((z) => z.mitarbeiter)).toEqual(['Max']);
  });

  it('kein anderer Tag', async () => {
    db.seed('timeEntries', {
      heute: eintrag({ userName: 'Max' }),
      gestern: eintrag({ userName: 'Anna', date: '2026-09-03' }),
    });
    const r = await ruf({ projectNumber: 'B-001', datum: TAG });
    expect(r.zeiten.map((z) => z.mitarbeiter)).toEqual(['Max']);
  });

  it('kein fremder Mandant', async () => {
    // Die Function läuft mit Admin-Rechten; die Rules halten sie nicht auf.
    db.seed('timeEntries', {
      eigen: eintrag({ userName: 'Max' }),
      fremd: eintrag({ userName: 'Fremder', companyId: 'andere' }),
    });
    const r = await ruf({ projectNumber: 'B-001', datum: TAG });
    expect(r.zeiten.map((z) => z.mitarbeiter)).toEqual(['Max']);
  });

  it('KEIN Material — auch nicht aus Vorbestellungen', async () => {
    /*
      Aus dem Betrieb: „der Schein ist grösstenteils für private Kunden mit
      kleineren Aufträgen, da ist es schwierig, das schon im Voraus zu sagen."
      Die frühere Vorausfüllung las die MaterialANFORDERUNGEN der Baustelle —
      also gerade das noch NICHT abgeholte Material, über den ganzen
      Lebenslauf der Baustelle hinweg. Auf einem Beleg, den der Kunde
      unterschreibt, ist das nicht bloss unpraktisch.
    */
    db.seed('materialOrders', {
      m1: { companyId: 'perl', projectNumber: 'B-001', name: 'Eckventil', status: 'Offen' },
    });
    db.seed('timeEntries', { a: eintrag({}) });
    const r = await ruf({ projectNumber: 'B-001', datum: TAG });
    expect(Object.keys(r)).toEqual(['zeiten']);
  });

  it('gibt eine leere Liste zurück, wenn niemand dort war', async () => {
    // Kein Fehler: der Schein lässt sich trotzdem schreiben und
    // unterschreiben, die Zeiten trägt der Monteur dann von Hand ein.
    const r = await ruf({ projectNumber: 'B-001', datum: TAG });
    expect(r.zeiten).toEqual([]);
  });
});
