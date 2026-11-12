/**
 * „ZULETZT BENUTZT“ VOM SERVER (E83): weiß das Gerät nichts, nimmt die
 * Vorbelegung die Baustelle der letzten eigenen Buchung — nicht die eines
 * anderen, nicht eine Buchung ohne Baustelle.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, buchung, konto, type Konto } from './helfer';
import { letzteEigeneBaustelle } from '@/lib/db/pg/timeEntries';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'zuletzt-baustelle-a';
let max: Konto;
let eva: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  max = await konto(BETRIEB, 'Mitarbeiter', 'zulmax');
  eva = await konto(BETRIEB, 'Mitarbeiter', 'zuleva');
  const zeilen = [
    buchung(max, '2026-03-02', { project_number: 'B-ALT' }),
    buchung(max, '2026-03-04', { project_number: 'B-NEU' }),
    // Jünger, aber ohne Baustelle (Werkstatt): zählt nicht.
    buchung(max, '2026-03-05', { project_number: '' }),
    buchung(eva, '2026-03-09', { project_number: 'B-EVA' }),
  ];
  const { error } = await admin.from('time_entries').insert(zeilen);
  if (error) throw new Error(error.message);
}, 120_000);

afterAll(async () => {
  clientEinreichen(null);
  await admin.from('time_entries').delete().eq('company_id', BETRIEB);
});

describe('letzteEigeneBaustelle', () => {
  it('die jüngste eigene Buchung mit Baustelle', async () => {
    clientEinreichen(max.client);
    expect(await letzteEigeneBaustelle(BETRIEB, max.uid)).toBe('B-NEU');
  });

  it('jede Person ihre eigene', async () => {
    clientEinreichen(eva.client);
    expect(await letzteEigeneBaustelle(BETRIEB, eva.uid)).toBe('B-EVA');
  });

  it('ohne Buchung mit Baustelle: keine', async () => {
    const neu = await konto(BETRIEB, 'Mitarbeiter', 'zulneu');
    clientEinreichen(neu.client);
    expect(await letzteEigeneBaustelle(BETRIEB, neu.uid)).toBeNull();
  });
});
