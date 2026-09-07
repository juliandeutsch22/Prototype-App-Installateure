import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { datenAusleitung, datenAusleitungJetzt } from '../../functions/src/ausleitung';
import { neueDatenbank, type FakeDb } from './ersatz/firestore';
import { neuerBucket, type FakeBucket } from './ersatz/storage';
import { HttpsError, protokoll, protokollLeeren, type AufrufKontext } from './ersatz/funktionen';

/**
 * Die nächtliche Ausleitung — die einzige Lücke, die nicht die App betrifft,
 * sondern den Betrieb.
 *
 * Bisher lag alles ausschliesslich in Firestore. Fällt das Projekt aus, wird
 * der Zugang gesperrt oder löscht jemand versehentlich eine Sammlung, sind
 * Rechnungen, Zeitkonten und Kundenstamm nicht greifbar.
 *
 * Der PLAN dahinter — was aufbewahrt und was geräumt wird — ist in
 * `tests/unit/ausleitung.test.ts` geprüft. Was hier fehlte, ist der Lauf
 * selbst: schreibt er wirklich jede Zeile, hält er die Mandanten
 * auseinander, und übersteht er einen Mandanten, der scheitert?
 */

let db: FakeDb;
let bucket: FakeBucket;

beforeEach(() => {
  db = neueDatenbank();
  bucket = neuerBucket();
  protokollLeeren();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-05T02:30:00'));
});
afterEach(() => {
  vi.useRealTimers();
});

function zeilen(pfad: string) {
  return (bucket.dateien.get(pfad)?.inhalt ?? '')
    .split('\n')
    .filter(Boolean)
    .map((z) => JSON.parse(z) as { sammlung: string; daten: Record<string, unknown> });
}

function jetzt(rolle: string, companyId: string | null = 'perl') {
  return datenAusleitungJetzt({
    data: {},
    auth: companyId ? { uid: 'chef', token: { companyId, role: rolle } } : undefined,
  } as AufrufKontext<unknown>) as Promise<{ zeilen: number; pfad: string; geraeumt: number }>;
}

describe('Der Lauf von Hand', () => {
  it('ist der Leitung vorbehalten', async () => {
    await expect(jetzt('Buchhaltung')).rejects.toThrow(HttpsError);
    await expect(jetzt('Mitarbeiter')).rejects.toThrow(HttpsError);
    await expect(jetzt('Geschäftsführung', null)).rejects.toThrow(HttpsError);
  });

  it('schreibt jede Zeile, mit ihrer Sammlung', async () => {
    db.seed('companies', { perl: { name: 'Perl' } });
    db.seed('customers', { k1: { companyId: 'perl', name: 'Huber' } });
    db.seed('invoices', { r1: { companyId: 'perl', nummer: '2026-0001' } });

    const r = await jetzt('Geschäftsführung');
    expect(r.pfad).toBe('ausleitung/perl/2026-09-05.jsonl');
    expect(r.zeilen).toBe(3);

    const inhalt = zeilen(r.pfad);
    expect(inhalt.map((z) => z.sammlung).sort()).toEqual(['companies', 'customers', 'invoices']);
    expect(inhalt.find((z) => z.sammlung === 'invoices')?.daten).toMatchObject({
      nummer: '2026-0001',
    });
  });

  it('leitet NUR den eigenen Mandanten aus', async () => {
    // Der Zeitplan nimmt alle, dieser Aufruf nicht.
    db.seed('companies', { perl: { name: 'Perl' }, andere: { name: 'Fremd' } });
    db.seed('customers', {
      k1: { companyId: 'perl', name: 'Huber' },
      k2: { companyId: 'andere', name: 'Fremdkunde' },
    });
    const r = await jetzt('Administrator');
    expect(zeilen(r.pfad).map((z) => z.daten.name)).toEqual(['Perl', 'Huber']);
  });

  it('legt die Datei als zeilenweises JSON ab', async () => {
    // Damit sich der Stand schreiben und wieder einlesen lässt, ohne ihn je
    // vollständig im Speicher zu halten.
    db.seed('companies', { perl: { name: 'Perl' } });
    const r = await jetzt('Geschäftsführung');
    expect(bucket.dateien.get(r.pfad)?.contentType).toBe('application/x-ndjson');
  });
});

describe('Der nächtliche Lauf', () => {
  it('nimmt jeden Mandanten in seine eigene Datei', async () => {
    db.seed('companies', { perl: { name: 'Perl' }, huber: { name: 'Huber GmbH' } });
    db.seed('projects', {
      p1: { companyId: 'perl', nr: 'B-001' },
      p2: { companyId: 'huber', nr: 'H-001' },
    });
    await datenAusleitung();

    expect([...bucket.dateien.keys()].sort()).toEqual([
      'ausleitung/huber/2026-09-05.jsonl',
      'ausleitung/perl/2026-09-05.jsonl',
    ]);
    expect(zeilen('ausleitung/perl/2026-09-05.jsonl').map((z) => z.daten.nr)).toEqual([
      undefined,
      'B-001',
    ]);
  });

  it('lässt einen gescheiterten Mandanten die übrigen nicht mitreissen', async () => {
    /*
      Sonst hinge die Sicherung des ganzen Betriebs an dem Mandanten, bei dem
      gerade etwas klemmt — und niemand merkte es, weil der Lauf einfach
      früher endet.
    */
    db.seed('companies', { kaputt: { name: 'Kaputt' }, perl: { name: 'Perl' } });
    bucket.scheitertBei = 'ausleitung/kaputt/2026-09-05.jsonl';

    await expect(datenAusleitung()).resolves.toBeUndefined();
    expect([...bucket.dateien.keys()]).toEqual(['ausleitung/perl/2026-09-05.jsonl']);
    expect(protokoll.some((p) => p.stufe === 'error')).toBe(true);
  });
});

describe('Alte Stände wegräumen', () => {
  it('räumt, was älter ist als die Frist', async () => {
    db.seed('companies', { perl: { name: 'Perl' } });
    bucket.vorhanden(
      'ausleitung/perl/2026-06-01.jsonl',
      'ausleitung/perl/2026-09-01.jsonl',
    );
    const r = await jetzt('Geschäftsführung');
    expect(r.geraeumt).toBe(1);
    expect(bucket.geloescht).toEqual(['ausleitung/perl/2026-06-01.jsonl']);
  });

  it('lässt fremde Dateien im Bucket in Ruhe', async () => {
    // Der Bucket ist ohne weitere Einstellung der Standard-Bucket DESSELBEN
    // Projekts. Dort liegt möglicherweise anderes.
    db.seed('companies', { perl: { name: 'Perl' } });
    bucket.vorhanden('ausleitung/perl/notizen.txt', 'ausleitung/perl/2026-06-01.jsonl');
    await jetzt('Geschäftsführung');
    expect(bucket.geloescht).toEqual(['ausleitung/perl/2026-06-01.jsonl']);
  });

  it('räumt den Stand eines anderen Mandanten nicht mit', async () => {
    db.seed('companies', { perl: { name: 'Perl' }, andere: { name: 'Fremd' } });
    bucket.vorhanden('ausleitung/andere/2026-06-01.jsonl');
    await jetzt('Geschäftsführung');
    expect(bucket.geloescht).toEqual([]);
  });
});

/**
 * Was der Lauf über sich selbst festhält.
 *
 * Vorher endete ein Fehlschlag im Google-Protokoll — und dorthin sieht in
 * einem Installationsbetrieb niemand. Die Sicherung konnte wochenlang
 * ausfallen; bemerkt hätte man es an dem Tag, an dem man sie braucht.
 */
describe('Der Lauf hält seinen Ausgang fest', () => {
  it('schreibt den Erfolg mit der Zeilenzahl', async () => {
    db.seed('companies', { perl: { name: 'Perl' } });
    db.seed('customers', { k1: { companyId: 'perl', name: 'Huber' } });
    await datenAusleitung();

    const stand = db.alles('systemLaeufe').perl_ausleitung;
    expect(stand).toMatchObject({ companyId: 'perl', art: 'ausleitung', erfolg: true });
    expect(stand.kennzahl).toBe(2);
    expect(stand.zuletztErfolg).toBeGreaterThan(0);
  });

  it('schreibt AUCH den Fehlschlag', async () => {
    /*
      Nur den Erfolg festzuhalten hiesse: ein Betrieb, bei dem seit Wochen
      nichts läuft, sieht aus wie einer, der gerade erst eingerichtet wurde.
      Der Unterschied zwischen „noch nie" und „seit drei Wochen nicht mehr"
      ist genau der, auf den es ankommt.
    */
    db.seed('companies', { perl: { name: 'Perl' } });
    bucket.scheitertBei = 'ausleitung/perl/2026-09-05.jsonl';
    await datenAusleitung();

    const stand = db.alles('systemLaeufe').perl_ausleitung;
    expect(stand).toMatchObject({ erfolg: false });
    expect(String(stand.meldung)).toContain('Bucket');
  });

  it('löscht mit einem Fehlschlag NICHT den letzten Erfolg', async () => {
    /*
      Der Wert, den die Überwachung beurteilt, ist `zuletztErfolg`. Ersetzte
      der Fehlschlag das ganze Dokument, stünde danach „noch nie gelaufen" —
      und das ist etwas anderes als „seit gestern nicht mehr".
    */
    db.seed('companies', { perl: { name: 'Perl' } });
    await datenAusleitung();
    const ersterErfolg = db.alles('systemLaeufe').perl_ausleitung.zuletztErfolg;

    bucket.scheitertBei = 'ausleitung/perl/2026-09-05.jsonl';
    await datenAusleitung();

    const stand = db.alles('systemLaeufe').perl_ausleitung;
    expect(stand.erfolg).toBe(false);
    expect(stand.zuletztErfolg).toBe(ersterErfolg);
  });

  it('hält auch den Lauf VON HAND fest', async () => {
    // Sonst stünde nach einer eben erst ausgelösten Sicherung weiter
    // „überfällig" da.
    db.seed('companies', { perl: { name: 'Perl' } });
    await jetzt('Geschäftsführung');
    expect(db.alles('systemLaeufe').perl_ausleitung).toMatchObject({ erfolg: true });
  });

  it('hält jeden Mandanten für sich fest', async () => {
    // Ein Betrieb, bei dem alles scheitert, verschwände sonst in der Summe
    // der anderen.
    db.seed('companies', { perl: { name: 'Perl' }, kaputt: { name: 'Kaputt' } });
    bucket.scheitertBei = 'ausleitung/kaputt/2026-09-05.jsonl';
    await datenAusleitung();

    expect(db.alles('systemLaeufe').perl_ausleitung.erfolg).toBe(true);
    expect(db.alles('systemLaeufe').kaputt_ausleitung.erfolg).toBe(false);
  });
});
