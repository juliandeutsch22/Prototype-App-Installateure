import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { datenAusleitung, datenAusleitungJetzt } from '../../functions/src/ausleitung';
import { neueDatenbank, type FakeDb } from './ersatz/firestore';
import { neuerBucket, type FakeBucket } from './ersatz/storage';
import {
  HttpsError,
  laufeGeplant,
  protokoll,
  protokollLeeren,
  rufAuf,
} from './ersatz/funktionen';

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
  return rufAuf<never, { zeilen: number; pfad: string; geraeumt: number }>(datenAusleitungJetzt, {
    data: {} as never,
    auth: companyId ? { uid: 'chef', token: { companyId, role: rolle } } : undefined,
  });
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
    await laufeGeplant(datenAusleitung);

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

    await expect(laufeGeplant(datenAusleitung)).resolves.toBeUndefined();
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
