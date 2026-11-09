/**
 * SCHEINE IN EINER VERRECHNETEN PAUSCHALE (Befund 09.11.2026) — gegen die
 * echte Datenbank, über `scheineAufRechnung`, die Stelle, die Startseite,
 * Rechnungen, Scheinliste und Baustellenakte gleich fragen.
 *
 * Ein Schein einer Pauschal- oder Einheitspreisbaustelle, der erst nach ihrer
 * Einzel- oder Schlussrechnung unterschrieben wird, steht auf keiner Rechnung
 * und kann auf keine mehr kommen: die Vorschau verweigert jede weitere
 * („Pauschale bereits verrechnet …“). Er stand für immer unter „nicht
 * verrechnet“. Jetzt gilt er als in der Pauschale enthalten.
 *
 * Gegenprobe: ohne die Änderung in `scheineAufRechnung` fehlen die Scheine
 * der Pauschal- und der Einheitspreisbaustelle in der Antwort; die Prüfungen
 * zur Erhaltung (Regie, Pauschale ohne Schlussrechnung, Storno, Entwurf)
 * sind mit und ohne grün.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { clientEinreichen } from '@/lib/db/pg/kern';

const B = 'pausch-unverr-a';
let buch: Konto;

async function baustelle(nummer: string, billing_mode: string) {
  const { error } = await admin.from('projects').insert({
    company_id: B, project_number: nummer, customer_name: 'Familie Huber', status: 'Aktiv', billing_mode,
  });
  if (error) throw new Error(error.message);
}

async function schein(nummer: string, status = 'Unterschrieben'): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await admin.from('work_sheets').insert({
    id, company_id: B, project_number: nummer, customer_name: 'Familie Huber',
    datum: '2026-10-20', status, abrechnung: 'Pauschal', erstellt_von_uid: buch.uid, erstellt_von_name: 'Büro',
  });
  if (error) throw new Error(error.message);
  return id;
}

async function rechnung(nummer: string, art: string, laufend: number, payment_status = 'Offen'): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await admin.from('invoices').insert({
    id, company_id: B, invoice_number: `RE-2026-${laufend}`, project_number: nummer, customer_name: 'Familie Huber',
    invoice_date: '2026-10-15', due_date: '2026-10-29', total_netto: 1000, total_vat: 200, total_brutto: 1200,
    payment_status, art,
  });
  if (error) throw new Error(error.message);
  return id;
}

beforeAll(async () => {
  await betriebAnlegen(B);
  buch = await konto(B, 'Buchhaltung', 'pausch-unverr-buch');
  clientEinreichen(buch.client);
  await baustelle('PU-PAUSCH', 'Pauschal');
  await baustelle('PR-PU-EP', 'Einheitspreis');
  await baustelle('PU-REGIE', 'Regie');
  await baustelle('PU-OHNE', 'Pauschal');
  await baustelle('PU-STORNO', 'Pauschal');
  await rechnung('PU-PAUSCH', 'schluss', 9001);
  await rechnung('PU-EP', 'einzel', 9002);            // andere Schreibweise als die Baustelle
  await rechnung('PU-REGIE', 'einzel', 9003);
  await rechnung('PU-OHNE', 'anzahlung', 9004);
  await rechnung('PU-OHNE', 'teil', 9005);
  await rechnung('PU-STORNO', 'schluss', 9006, 'Storniert');
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('In der Pauschale enthalten', () => {
  it('Pauschale mit Schlussrechnung: ein später unterschriebener Schein gilt als verrechnet', async () => {
    const s = await schein('PU-PAUSCH');
    expect(await rechnungen.scheineAufRechnung(B, [s])).toEqual([s]);
  });

  it('ebenso nach der Einzelrechnung einer Einheitspreisbaustelle — in jeder Schreibweise der Nummer', async () => {
    const s = await schein('PU-EP');
    expect(await rechnungen.scheineAufRechnung(B, [s])).toEqual([s]);
  });
});

describe('Erhaltung', () => {
  it('Regie bleibt offen — dort lässt sich der Schein noch verrechnen', async () => {
    const s = await schein('PU-REGIE');
    expect(await rechnungen.scheineAufRechnung(B, [s])).toEqual([]);
  });

  it('Pauschale ohne Einzel- oder Schlussrechnung (nur Anzahlung und Teilrechnung) bleibt offen', async () => {
    const s = await schein('PU-OHNE');
    expect(await rechnungen.scheineAufRechnung(B, [s])).toEqual([]);
  });

  it('eine stornierte Schlussrechnung verrechnet nichts', async () => {
    const s = await schein('PU-STORNO');
    expect(await rechnungen.scheineAufRechnung(B, [s])).toEqual([]);
  });

  it('ein Entwurf ist nicht unterschrieben und zählt nicht', async () => {
    const s = await schein('PU-PAUSCH', 'Entwurf');
    expect(await rechnungen.scheineAufRechnung(B, [s])).toEqual([]);
  });

  it('gemischt: jeder Schein bekommt seine Antwort', async () => {
    const [p, r, o] = [await schein('PU-PAUSCH'), await schein('PU-REGIE'), await schein('PU-OHNE')];
    expect(await rechnungen.scheineAufRechnung(B, [p, r, o, crypto.randomUUID()])).toEqual([p]);
  });
});
