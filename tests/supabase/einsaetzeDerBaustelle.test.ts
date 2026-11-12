/**
 * DIE EINSÄTZE EINER BAUSTELLE (E83) — die Abfrage der Baustellenakte.
 *
 * Geprüft wird, was die Akte daraus liest: die nächsten ab heute aufsteigend,
 * die letzten davor absteigend, je mit Grenze, nur diese Baustelle und nur
 * der eigene Betrieb. Davon hängt die Hauptaktion ab: „keiner“ heißt
 * „Einsatz planen“ — ein fremder oder abgeschnittener Treffer darf das
 * nicht verdecken.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { einsaetzeDerBaustelle } from '@/lib/db/pg/assignments';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'einsatz-akte-a';
const FREMD = 'einsatz-akte-b';
const BAU = 'B-AKTE-1';
const HEUTE = '2026-06-10';

let planer: Konto;
let fremd: Konto;

async function einsatz(betrieb: string, k: Konto, date: string, projectNumber = BAU) {
  const { error } = await admin.from('assignments').insert({
    company_id: betrieb, user_id: k.uid, user_name: 'x', project_number: projectNumber, date, as_helper: false, created_by: k.uid,
  });
  if (error) throw new Error(error.message);
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  planer = await konto(BETRIEB, 'Projektleiter', 'aktplan');
  fremd = await konto(FREMD, 'Projektleiter', 'aktfremd');
  await admin.from('assignments').delete().in('company_id', [BETRIEB, FREMD]);
  for (const d of ['2026-06-01', '2026-06-05', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-20']) await einsatz(BETRIEB, planer, d);
  await einsatz(BETRIEB, planer, '2026-06-12', 'B-ANDERE');
  await einsatz(FREMD, fremd, '2026-06-15');
}, 120_000);

afterAll(async () => {
  clientEinreichen(null);
  await admin.from('assignments').delete().in('company_id', [BETRIEB, FREMD]);
});

describe('einsaetzeDerBaustelle', () => {
  it('heute zählt zu den nächsten; die nächsten aufsteigend, die letzten absteigend', async () => {
    clientEinreichen(planer.client);
    const r = await einsaetzeDerBaustelle(BETRIEB, BAU, HEUTE);
    expect(r.kommend.map((a) => a.date)).toEqual(['2026-06-10', '2026-06-11', '2026-06-20']);
    expect(r.vorher.map((a) => a.date)).toEqual(['2026-06-09', '2026-06-05', '2026-06-01']);
  });

  it('mit Grenze je Richtung — die nächsten zuerst, nicht die fernsten', async () => {
    clientEinreichen(planer.client);
    const r = await einsaetzeDerBaustelle(BETRIEB, BAU, HEUTE, 2);
    expect(r.kommend.map((a) => a.date)).toEqual(['2026-06-10', '2026-06-11']);
    expect(r.vorher.map((a) => a.date)).toEqual(['2026-06-09', '2026-06-05']);
  });

  it('nur diese Baustelle', async () => {
    clientEinreichen(planer.client);
    const r = await einsaetzeDerBaustelle(BETRIEB, BAU, HEUTE);
    expect([...r.kommend, ...r.vorher].every((a) => a.projectNumber === BAU)).toBe(true);
  });

  it('eine Baustelle ohne Einsatz: beide leer — die Akte heißt dann „Einsatz planen“', async () => {
    clientEinreichen(planer.client);
    expect(await einsaetzeDerBaustelle(BETRIEB, 'B-NIE', HEUTE)).toEqual({ kommend: [], vorher: [] });
  });

  it('ein fremder Betrieb sieht nichts davon, auch nicht mit derselben Nummer', async () => {
    clientEinreichen(fremd.client);
    const eigene = await einsaetzeDerBaustelle(FREMD, BAU, HEUTE);
    expect(eigene.kommend.map((a) => a.date)).toEqual(['2026-06-15']);
    const fremdeAbfrage = await einsaetzeDerBaustelle(BETRIEB, BAU, HEUTE);
    expect(fremdeAbfrage).toEqual({ kommend: [], vorher: [] });
  });
});
