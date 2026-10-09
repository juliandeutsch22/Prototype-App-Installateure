/**
 * SCHEINLISTEN OHNE UNTERSCHRIFTSBILDER (Analyse 09.10.2026, Maßnahme 2).
 *
 * Ein unterschriebener Schein trägt zwei PNG-Bilder. Die Listen (Startseite,
 * Rechnungen, Scheinliste, Akte, Nachkalkulation, Zeiterfassung) zeigen
 * davon nur, wer unterschrieben hat; geholt wurden die Bilder trotzdem —
 * bei hundert Scheinen mehrere Megabyte. Jetzt kommen sie nur noch mit dem
 * einzelnen Schein (`getWorkSheet`), den das PDF holt.
 *
 * Gegenprobe: gegen den Stand davor trägt jede Liste das Bild (rot).
 * Gleich bleibt: alles andere am Schein ist in Liste und Einzelabruf dasselbe.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { betriebAnlegen, konto, type Konto } from './helfer';
import * as scheine from '@/lib/db/pg/workSheets';
import { clientEinreichen } from '@/lib/db/pg/kern';
import type { WorkSheet, WorkSheetUnterschrift } from '@/types';

const BETRIEB = 'schliste-a';
const BILD = `data:image/png;base64,${'A'.repeat(20_000)}`;
let anton: Konto;
let chef: Konto;
let id = '';

const strich = (name: string): WorkSheetUnterschrift => ({ name, bild: BILD, geraetZeit: 1776000000000 });

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  anton = await konto(BETRIEB, 'Mitarbeiter', 'schlanton');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'schlchef');
  clientEinreichen(anton.client);
  id = await scheine.createWorkSheet(BETRIEB, {
    projectNumber: 'B-77', customerName: 'Familie Huber', datum: '2026-04-13', status: 'Entwurf',
    abrechnung: 'Regie', notizen: 'Dichtung getauscht',
    zeiten: [{ datum: '2026-04-13', mitarbeiter: 'Anton', von: '07:00', bis: '09:00', pauseMin: 0, minuten: 120 }],
    material: [{ name: 'Dichtung', menge: 2 }],
    erstelltVonUid: anton.uid, erstelltVonName: 'Anton',
  } as Parameters<typeof scheine.createWorkSheet>[1]);
  await scheine.signWorkSheet(id, strich('Anton'), strich('Huber'));
}, 120_000);

afterAll(() => clientEinreichen(null));

/** Der Schein ohne die Bilder — so muss ihn jede Liste liefern. */
function ohneBilder(s: WorkSheet): WorkSheet {
  const u = s.unterschriften!;
  return {
    ...s,
    unterschriften: {
      monteur: { name: u.monteur!.name, geraetZeit: u.monteur!.geraetZeit },
      kunde: { name: u.kunde!.name, geraetZeit: u.kunde!.geraetZeit },
    },
  };
}

describe('Scheinlisten', () => {
  const listen: [string, () => Promise<WorkSheet[]>][] = [
    ['jüngste', () => scheine.listRecentWorkSheets(BETRIEB, 10)],
    ['eigene seit', () => scheine.listOwnWorkSheetsSince(BETRIEB, anton.uid, '2026-01-01')],
    ['unterschriebene im Zeitraum', () => scheine.listSignedWorkSheetsInRange(BETRIEB, '2026-04-01', '2026-04-30')],
    ['der Baustelle', () => scheine.listWorkSheetsForProject(BETRIEB, 'B-77')],
    ['im Zeitraum', () => scheine.listWorkSheetsInRange(BETRIEB, '2026-04-01', '2026-04-30')],
    ['Suche', () => scheine.searchWorkSheets(BETRIEB, 'Huber')],
  ];

  for (const [was, holen] of listen) {
    it(`${was}: ohne Bilder, sonst derselbe Schein wie einzeln geholt`, async () => {
      clientEinreichen(chef.client);
      const ganz = (await scheine.getWorkSheet(id))!;
      const inListe = (await holen()).find((s) => s.id === id)!;
      expect(inListe.unterschriften?.kunde?.bild).toBeUndefined();
      expect(inListe.unterschriften?.monteur?.bild).toBeUndefined();
      expect(inListe).toEqual(ohneBilder(ganz));
    });
  }

  it('der einzelne Schein trägt die Bilder — für das PDF', async () => {
    clientEinreichen(chef.client);
    const ganz = (await scheine.getWorkSheet(id))!;
    expect(ganz.unterschriften?.kunde?.bild).toBe(BILD);
    expect(ganz.unterschriften?.monteur?.bild).toBe(BILD);
  });

  it('ein Entwurf ohne Unterschrift bleibt in der Liste ohne Unterschriften', async () => {
    clientEinreichen(anton.client);
    const entwurf = await scheine.createWorkSheet(BETRIEB, {
      projectNumber: 'B-78', customerName: 'Meier', datum: '2026-04-14', status: 'Entwurf', abrechnung: 'Regie',
      zeiten: [], material: [], erstelltVonUid: anton.uid, erstelltVonName: 'Anton',
    } as Parameters<typeof scheine.createWorkSheet>[1]);
    const s = (await scheine.listWorkSheetsForProject(BETRIEB, 'B-78')).find((x) => x.id === entwurf)!;
    expect(s.unterschriften).toBeUndefined();
  });

  it('LISTENSPALTEN nennt jede Spalte der Tabelle außer den beiden Unterschriften', async () => {
    // Sonst fehlte eine neue Spalte still in allen Listen.
    const db = new Client({
      connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    });
    await db.connect();
    try {
      const { rows } = await db.query<{ column_name: string }>(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'work_sheets' order by column_name`,
      );
      const tabelle = rows.map((r) => r.column_name).filter((c) => !['unterschrift_monteur', 'unterschrift_kunde'].includes(c));
      expect([...scheine.LISTENSPALTEN].sort()).toEqual(tabelle);
    } finally {
      await db.end();
    }
  });
});
