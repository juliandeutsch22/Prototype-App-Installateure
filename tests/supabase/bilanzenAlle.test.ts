/**
 * Die Bilanzen aller Personen in einer Abfrage (19.10.2026) — für den
 * Gesamtsaldo in der Mitarbeiterübersicht. Geprüft gegen die echte Sicht:
 * jede Zeile trägt ihre Person, der Monat grenzt ein, und der Zeilenschutz
 * der Sicht greift durch — die Buchhaltung sieht alle, ein Monteur nur sich.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { listBilanzen, listBilanzenAlle } from '@/lib/db/pg/monatsbilanzen';

const BETRIEB = 'bilanzen-alle';
let buchhaltung: Konto;
let mia: Konto;
let max: Konto;

const buchung = (uid: string, date: string) => ({
  id: randomUUID(), company_id: BETRIEB, user_id: uid, user_name: uid, date, status: 'Anwesend',
  start_time: '07:00', end_time: '15:30', break_duration: 30,
});

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buchhaltung = await konto(BETRIEB, 'Buchhaltung', 'ba-buch');
  mia = await konto(BETRIEB, 'Mitarbeiter', 'ba-mia');
  max = await konto(BETRIEB, 'Mitarbeiter', 'ba-max');
  const { error } = await admin.from('time_entries').insert([
    buchung(mia.uid, '2026-08-03'), buchung(mia.uid, '2026-09-01'),
    buchung(max.uid, '2026-09-02'), buchung(max.uid, '2026-10-01'),
  ]);
  if (error) throw new Error(error.message);
}, 60_000);

afterAll(() => clientEinreichen(null));

describe('Bilanzen aller Personen', () => {
  it('die Buchhaltung bekommt alle ab dem Monat, jede Zeile mit ihrer Person', async () => {
    clientEinreichen(buchhaltung.client);
    const zeilen = await listBilanzenAlle(BETRIEB, '2026-09');
    expect(zeilen.map((z) => `${z.userId === mia.uid ? 'mia' : 'max'}:${z.monat}:${z.anwesendMin}`).sort())
      .toEqual(['max:2026-09:480', 'max:2026-10:480', 'mia:2026-09:480']);
  });

  it('dieselben Zahlen wie je Person einzeln', async () => {
    clientEinreichen(buchhaltung.client);
    const alle = await listBilanzenAlle(BETRIEB, '2026-08');
    const nurMia = await listBilanzen(BETRIEB, mia.uid, '2026-08');
    expect(alle.filter((z) => z.userId === mia.uid)).toEqual(nurMia.map((b) => ({ ...b, userId: mia.uid })));
  });

  it('Gegenprobe: ein Monteur sieht nur seine eigenen', async () => {
    clientEinreichen(mia.client);
    const zeilen = await listBilanzenAlle(BETRIEB, '2026-01');
    expect(zeilen.length).toBe(2);
    expect(zeilen.every((z) => z.userId === mia.uid)).toBe(true);
  });
});
