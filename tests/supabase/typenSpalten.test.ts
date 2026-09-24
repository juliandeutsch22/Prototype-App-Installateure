/**
 * Jedes Feld der App-Typen hat eine Spalte — oder einen benannten Grund,
 * warum nicht.
 *
 * GEFUNDEN IM BETRIEB: `TimeEntry.lastEditedAt` stammte aus der
 * Firestore-Zeit, eine Spalte dazu gab es in Postgres nie. Solange niemand es
 * schrieb, fiel das nicht auf. Die Mitarbeiterübersicht schrieb es bei jeder
 * Buchung für einen anderen — PostgREST wies ab (PGRST204), und die App
 * meldete „gespeichert". Ein Feld im Typ ist eine Einladung, es zu schreiben.
 *
 * Gelesen wird der Quelltext der Typen, nicht ein Laufzeitobjekt: TypeScript
 * hinterlässt zur Laufzeit keine Felder. Grob, aber ausreichend — geprüft
 * werden nur die obersten Felder der Schnittstellen, die eine Tabelle
 * abbilden.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { alsSpalte } from '@/lib/db/pg/felder';

const VERBINDUNG =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** Welche Schnittstelle welche Tabelle abbildet. */
const TABELLE_VON: Record<string, string> = {
  Company: 'companies',
  AppUser: 'users',
  UserPrefs: 'user_prefs',
  Quote: 'quotes',
  WorkSheet: 'work_sheets',
  Customer: 'customers',
  Project: 'projects',
  Material: 'materials',
  MaterialOrder: 'material_orders',
  EinkaufPosten: 'einkauf_posten',
  EinsatzMaterial: 'einsatz_material',
  TimeEntry: 'time_entries',
  Vacation: 'vacations',
  Assignment: 'assignments',
  Invoice: 'invoices',
  Zahlungseingang: 'zahlungseingaenge',
  Wartung: 'wartungen',
  FollowUp: 'follow_ups',
  BaustellenDokument: 'project_documents',
};

/**
 * Felder ohne eigene Spalte — jedes mit seinem Grund. Wer hier etwas
 * einträgt, muss sagen, wo die Daten stattdessen liegen.
 */
const OHNE_SPALTE: Record<string, string> = {
  'AppUser.uid': 'ist `users.id`',
  'Quote.positions': 'Tabelle `quote_lines`',
  'Quote.discount': 'Spalten `discount_*`',
  'Invoice.positions': 'Tabelle `invoice_lines`',
  'Invoice.discount': 'Spalten `discount_*`',
  'Invoice.linkedEntries': 'Tabelle `invoice_coverage`',
  'Invoice.linkedOrders': 'Tabelle `invoice_coverage`',
  'Invoice.linkedWorkSheets': 'Tabelle `invoice_coverage`',
  'WorkSheet.zeiten': 'Tabelle `work_sheet_hours`',
  'WorkSheet.material': 'Tabelle `work_sheet_material`',
  'WorkSheet.unterschriften': 'Spalten `unterschrift_*`',
  'WorkSheet.fotos': 'Tabelle `work_sheet_photos`',
  'EinsatzMaterial.positionen': 'Tabelle `einsatz_material_positionen`',
};

/** Die obersten Felder einer Schnittstelle, aus dem Quelltext. */
function felderVon(quelle: string, name: string): string[] {
  const kopf = new RegExp(`export interface ${name}\\b[^{]*\\{`).exec(quelle);
  expect(kopf, `Schnittstelle ${name} nicht gefunden`).not.toBeNull();
  let i = kopf!.index + kopf![0].length;
  const anfang = i;
  for (let tiefe = 1; tiefe > 0; i += 1) {
    if (quelle[i] === '{') tiefe += 1;
    else if (quelle[i] === '}') tiefe -= 1;
  }
  const rumpf = quelle.slice(anfang, i - 1);
  return [...rumpf.matchAll(/^ {2}(\w+)\??:/gm)].map((t) => t[1]);
}

let db: Client;
beforeAll(async () => {
  db = new Client({ connectionString: VERBINDUNG });
  await db.connect();
}, 30_000);
afterAll(async () => { await db?.end(); });

describe('Die App-Typen gegen das Schema', () => {
  it('führen kein Feld, zu dem es keine Spalte und keinen Grund gibt', async () => {
    const { rows } = await db.query<{ tabelle: string; spalte: string }>(`
      select table_name as tabelle, column_name as spalte
        from information_schema.columns where table_schema = 'public'
    `);
    const echt = new Set(rows.map((r) => `${r.tabelle}.${r.spalte}`));
    const quelle = readFileSync(resolve(process.cwd(), 'src/types/index.ts'), 'utf8');

    const verwaist: string[] = [];
    for (const [name, tabelle] of Object.entries(TABELLE_VON)) {
      for (const feld of felderVon(quelle, name)) {
        if (feld === 'id' || OHNE_SPALTE[`${name}.${feld}`]) continue;
        if (!echt.has(`${tabelle}.${alsSpalte(feld)}`)) verwaist.push(`${name}.${feld}`);
      }
    }
    expect(verwaist).toEqual([]);
  });

  it('führt keine Ausnahme, die gar nicht mehr gebraucht wird', async () => {
    // Sonst sammeln sich hier Gründe für Felder, die es längst nicht mehr gibt.
    const quelle = readFileSync(resolve(process.cwd(), 'src/types/index.ts'), 'utf8');
    const ueberfluessig = Object.keys(OHNE_SPALTE).filter((schluessel) => {
      const [name, feld] = schluessel.split('.');
      return !felderVon(quelle, name).includes(feld);
    });
    expect(ueberfluessig).toEqual([]);
  });
});
