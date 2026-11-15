/**
 * „ZEIT NACHTRAGEN“ OHNE FESTE ZAHL (Durchsicht 15.11.2026, P6) —
 * `listOwnWorkSheetsSince` gegen die echte Datenbank.
 *
 * Gegenprobe: bis dahin endete die Abfrage bei 20 Scheinen (absteigend nach
 * Datum). Mit 25 eigenen Scheinen im Fenster fehlten die fünf ältesten — und
 * mit ihnen die Erinnerung an Stunden, die nie gebucht wurden. „Bleibt
 * gleich“: wer eine Grenze nennt, bekommt sie; fremde und ältere Scheine
 * kommen nicht mit.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as scheine from '@/lib/db/pg/workSheets';
import { clientEinreichen } from '@/lib/db/pg/kern';

const B = 'eigene-scheine-p6';
let monteur: Konto;
let kollege: Konto;

function schein(k: Konto, datum: string) {
  return {
    id: crypto.randomUUID(), company_id: B, project_number: 'P6-1', customer_name: 'Familie Huber', datum,
    status: 'Unterschrieben', abrechnung: 'Regie', erstellt_von_uid: k.uid, erstellt_von_name: 'Max',
  };
}

beforeAll(async () => {
  await betriebAnlegen(B);
  monteur = await konto(B, 'Mitarbeiter', 'p6-mon');
  kollege = await konto(B, 'Mitarbeiter', 'p6-kol');
  // Vier Scheine am Tag über gut sechs Arbeitstage — wie ein Kundendiensttechniker.
  const zeilen = Array.from({ length: 25 }, (_, i) => schein(monteur, `2026-11-${String(2 + Math.floor(i / 4)).padStart(2, '0')}`));
  zeilen.push(schein(kollege, '2026-11-05'), schein(monteur, '2026-10-20'));
  const { error } = await admin.from('work_sheets').insert(zeilen);
  if (error) throw new Error(error.message);
  clientEinreichen(monteur.client);
}, 120_000);

afterAll(async () => {
  clientEinreichen(null);
  await admin.from('work_sheets').delete().eq('company_id', B);
});

describe('die eigenen Scheine seit einem Tag', () => {
  it('alle 25 im Fenster, auch über 20 — der älteste mit', async () => {
    const rows = await scheine.listOwnWorkSheetsSince(B, monteur.uid, '2026-11-01');
    expect(rows).toHaveLength(25);
    expect(rows[rows.length - 1]?.datum).toBe('2026-11-02');
  });

  it('bleibt gleich: eine genannte Grenze gilt; Fremdes und Älteres bleibt draußen', async () => {
    expect(await scheine.listOwnWorkSheetsSince(B, monteur.uid, '2026-11-01', 3)).toHaveLength(3);
    const rows = await scheine.listOwnWorkSheetsSince(B, monteur.uid, '2026-11-01');
    expect(rows.every((s) => s.erstelltVonUid === monteur.uid && s.datum >= '2026-11-01')).toBe(true);
  });
});
