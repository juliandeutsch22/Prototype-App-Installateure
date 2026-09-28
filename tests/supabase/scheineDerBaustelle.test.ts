/**
 * Die Scheine EINER Baustelle — alle, neueste zuerst, in jeder Schreibweise
 * (offene Punkte C3).
 *
 * Rechnung und Nachkalkulation lesen hier. Vorher hörte die Abfrage bei
 * hundert Scheinen auf, ohne Reihenfolge, und fand nur die exakte Nummer:
 * der hunderterste Schein fehlte still, und ein Schein mit „PR-" aus dem
 * Altbestand fehlte immer — während die Rechnungen derselben Baustelle in
 * beiden Schreibweisen gefunden wurden.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as scheine from '@/lib/db/pg/workSheets';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'scheine-baustelle';
const VIELE = 120;

let chef: Konto;

const tag = (i: number) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);

function kopf(nummer: string, datum: string) {
  return {
    id: crypto.randomUUID(), company_id: BETRIEB, project_number: nummer,
    customer_name: 'Familie Huber', datum, status: 'Entwurf', abrechnung: 'Regie',
    erstellt_von_uid: chef.uid, erstellt_von_name: 'Chef',
  };
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chef = await konto(BETRIEB, 'Geschäftsführung', 'chef');
  clientEinreichen(chef.client);

  const zeilen = [
    ...Array.from({ length: VIELE }, (_, i) => kopf('2026-042', tag(i))),
    // Aus dem Altbestand: dieselbe Baustelle, mit „PR-" geschrieben — der jüngste.
    kopf('PR-2026-042', tag(VIELE)),
    // Gegenproben: eine andere Baustelle, und eine, die nur ähnlich aussieht.
    kopf('2026-043', tag(VIELE + 1)),
    kopf('2026-0420', tag(VIELE + 2)),
  ];
  const { error } = await admin.from('work_sheets').insert(zeilen);
  if (error) throw new Error(error.message);
}, 120_000);

afterAll(async () => {
  clientEinreichen(null);
  await admin.from('work_sheets').delete().eq('company_id', BETRIEB);
});

describe('Die Scheine einer Baustelle', () => {
  it('kommen alle — auch über hundert —, neueste zuerst', async () => {
    const liste = await scheine.listWorkSheetsForProject(BETRIEB, '2026-042');
    expect(liste).toHaveLength(VIELE + 1);
    const daten = liste.map((s) => s.datum);
    expect(daten).toEqual([...daten].sort().reverse());
  });

  it('in beiden Schreibweisen, gleich wie gefragt wird', async () => {
    const ohne = await scheine.listWorkSheetsForProject(BETRIEB, '2026-042');
    const mit = await scheine.listWorkSheetsForProject(BETRIEB, 'PR-2026-042');
    expect(ohne[0]).toMatchObject({ projectNumber: 'PR-2026-042', datum: tag(VIELE) });
    expect(mit.map((s) => s.id).sort()).toEqual(ohne.map((s) => s.id).sort());
  });

  it('Gegenprobe: keine andere Baustelle, auch keine ähnlich geschriebene', async () => {
    const nummern = new Set(
      (await scheine.listWorkSheetsForProject(BETRIEB, '2026-042')).map((s) => s.projectNumber),
    );
    expect([...nummern].sort()).toEqual(['2026-042', 'PR-2026-042']);
  });

  it('mit Grenze die jüngsten — so, wie die Suche fragt', async () => {
    const fuenf = await scheine.listWorkSheetsForProject(BETRIEB, '2026-042', 5);
    expect(fuenf.map((s) => s.datum)).toEqual([VIELE, VIELE - 1, VIELE - 2, VIELE - 3, VIELE - 4].map(tag));
  });

  it('eine leere Nummer findet nichts, statt alles', async () => {
    expect(await scheine.listWorkSheetsForProject(BETRIEB, '  ')).toEqual([]);
  });
});
