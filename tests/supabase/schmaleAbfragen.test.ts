/**
 * Die schmalen Abfragen der Startseite (Ladezeit, 19.10.2026) — gegen die
 * echte Datenbank. Sie liefern dieselben Zeilen wie die vollen Abfragen, nur
 * mit den Spalten, die „Tage ohne Buchung“, „Baustellen ohne Einsatz“, die
 * Auslastung und „knapp“ brauchen.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { listBuchungstageInRange, listEntriesInRange } from '@/lib/db/pg/timeEntries';
import { listAssignmentsInRange, listEinsatztageInRange } from '@/lib/db/pg/assignments';
import { listLagerartikel, listLagerartikelKurz } from '@/lib/db/pg/materials';

const BETRIEB = 'schmale-abfragen';
let chefin: Konto;
let monteur: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'sa-gf');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'sa-mon');
  const buchung = (date: string) => ({
    id: randomUUID(), company_id: BETRIEB, user_id: monteur.uid, user_name: 'Monteur', date, status: 'Anwesend',
    start_time: '07:00', end_time: '15:30', break_duration: 30, comment: 'Heizung getauscht', customer_name: 'Huber',
  });
  const fehler = [
    (await admin.from('time_entries').insert([buchung('2026-09-01'), buchung('2026-09-02'), buchung('2026-10-05')])).error,
    (await admin.from('assignments').insert([
      { company_id: BETRIEB, date: '2026-09-01', project_number: 'B-1', user_id: monteur.uid, comment: 'Schlüssel beim Nachbarn' },
      { company_id: BETRIEB, date: '2026-09-03', project_number: 'B-2', user_id: monteur.uid },
    ])).error,
    (await admin.from('materials').insert([
      { company_id: BETRIEB, name: 'Kupferrohr 15', unit: 'm', stock: 3, lagerartikel: true, mindestmenge: 10, verkaufspreis: 9.5, warengruppe: 'Rohr' },
      { company_id: BETRIEB, name: 'Katalogartikel', unit: 'Stk', stock: 0, lagerartikel: false },
    ])).error,
  ].filter(Boolean);
  if (fehler.length) throw new Error(fehler.map((f) => f!.message).join('; '));
  clientEinreichen(chefin.client);
}, 60_000);

afterAll(() => clientEinreichen(null));

describe('Schmale Abfragen der Startseite', () => {
  it('Buchungstage: dieselben Zeilen wie die vollen Buchungen, nur Person und Tag', async () => {
    const schmal = await listBuchungstageInRange(BETRIEB, '2026-09-01', '2026-09-30');
    const voll = await listEntriesInRange(BETRIEB, '2026-09-01', '2026-09-30');
    expect(schmal.map((e) => `${e.userId}|${e.date}`).sort()).toEqual(voll.map((e) => `${e.userId}|${e.date}`).sort());
    expect(schmal).toHaveLength(2);
    // Gegenprobe: was die Frage nicht braucht, kommt nicht mit.
    expect(Object.keys(schmal[0]).sort()).toEqual(['date', 'id', 'userId']);
    expect(voll[0]).toHaveProperty('comment', 'Heizung getauscht');
  });

  it('Einsatztage: dieselben Zeilen wie die vollen Einsätze, nur Person, Tag und Baustelle', async () => {
    const schmal = await listEinsatztageInRange(BETRIEB, '2026-09-01', '2026-09-30');
    const voll = await listAssignmentsInRange(BETRIEB, '2026-09-01', '2026-09-30');
    expect(schmal.map((a) => `${a.userId}|${a.date}|${a.projectNumber}`)).toEqual(voll.map((a) => `${a.userId}|${a.date}|${a.projectNumber}`));
    expect(Object.keys(schmal[0]).sort()).toEqual(['date', 'id', 'projectNumber', 'userId']);
  });

  it('Lagerartikel kurz: dieselben Artikel, mit allem, was „knapp“ braucht', async () => {
    const kurz = await listLagerartikelKurz(BETRIEB);
    const voll = await listLagerartikel(BETRIEB);
    expect(kurz.map((m) => m.name)).toEqual(voll.map((m) => m.name));
    expect(kurz[0]).toEqual(expect.objectContaining({ name: 'Kupferrohr 15', unit: 'm', stock: 3, mindestmenge: 10, lagerartikel: true }));
    expect(kurz[0]).not.toHaveProperty('verkaufspreis');
  });
});
