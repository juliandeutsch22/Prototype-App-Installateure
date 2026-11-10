/**
 * AUSGEGEBENES MATERIAL ÜBER DIE GANZE LAUFZEIT — für die Nachkalkulation
 * (Befund 09.11.2026), gegen die echte Datenbank.
 *
 * `ausgegebenes_material` zeigt der Rechnung nur, was seit der letzten
 * Rechnung ausgegeben ist. Die Nachkalkulation braucht alles, was das Lager
 * je für die Baustelle ausgegeben hat — auch vor der Schlussrechnung —, für
 * mehrere Baustellen in einem Zug: `ausgegebenes_material_gesamt`.
 *
 * Gegenprobe: ohne `20261110170000_wartung_abo_eingang_lager.sql` gibt es die
 * Funktion nicht — jede Prüfung hier ist rot, außer der zur Erhaltung von
 * `ausgegebenes_material`, die mit und ohne grün ist.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as anforderungen from '@/lib/db/pg/materialOrders';
import { clientEinreichen } from '@/lib/db/pg/kern';

const A = 'ausg-ges-a';
const B = 'ausg-ges-b';

let gf: Konto;
let buch: Konto;
let pl: Konto;
let max: Konto;
let fremd: Konto;

async function anforderung(betrieb: string, k: Konto, teil: Record<string, unknown>) {
  const { error } = await admin.from('material_orders').insert({
    id: crypto.randomUUID(), company_id: betrieb, material_name: 'Kupferrohr 15', quantity: 10, status: 'Erledigt',
    transaction_type: 'order', user_id: k.uid, user_name: 'Max', project_number: '2026-170', ...teil,
  });
  if (error) throw new Error(error.message);
}

beforeAll(async () => {
  await betriebAnlegen(A);
  await betriebAnlegen(B);
  gf = await konto(A, 'Geschäftsführung', 'ausgges-gf');
  buch = await konto(A, 'Buchhaltung', 'ausgges-buch');
  pl = await konto(A, 'Projektleiter', 'ausgges-pl');
  max = await konto(A, 'Mitarbeiter', 'ausgges-max');
  fremd = await konto(B, 'Geschäftsführung', 'ausgges-fremd');

  await anforderung(A, max, {});                                                       // 2026-170: 10
  await anforderung(A, max, { project_number: 'PR-2026-170', quantity: 3 });           // andere Schreibweise
  await anforderung(A, max, { transaction_type: 'return', quantity: 2, condition: 'neu' }); // −2
  await anforderung(A, max, { status: 'Abholbereit', quantity: 99 });                  // nicht abgeholt
  await anforderung(A, max, { project_number: '2026-171', quantity: 5 });              // zweite Baustelle
  await anforderung(A, max, { project_number: '2026-172', quantity: 99 });             // nicht gefragt
  await anforderung(B, fremd, { quantity: 99 });                                        // fremder Betrieb
  // Eine Schlussrechnung über 2026-170: für die Rechnung ist das Material damit abgerechnet.
  const { error } = await admin.from('invoices').insert({
    id: crypto.randomUUID(), company_id: A, invoice_number: 'RE-2026-9170', project_number: '2026-170',
    customer_name: 'Familie Huber', invoice_date: '2099-12-30', leistung_bis: '2099-12-30', due_date: '2099-12-31',
    total_netto: 100, total_vat: 20, total_brutto: 120, payment_status: 'Offen',
  });
  if (error) throw new Error(error.message);
}, 120_000);

afterAll(() => clientEinreichen(null));

const summe = (zeilen: Array<{ menge: number }> | undefined) =>
  Math.round((zeilen ?? []).reduce((s, z) => s + z.menge, 0) * 1000) / 1000;

describe('ausgegebenes_material_gesamt', () => {
  it('alles, was das Lager je ausgab — auch vor der letzten Rechnung, je Baustelle, in beiden Schreibweisen', async () => {
    clientEinreichen(gf.client);
    const je = await anforderungen.ausgegebenesMaterialGesamt(['PR-2026-170', '2026-171']);
    expect([...je.keys()].sort()).toEqual(['2026-170', '2026-171']);
    expect(summe(je.get('2026-170'))).toBe(11);
    expect(je.get('2026-170')!.map((z) => z.art).sort()).toEqual(['anforderung', 'anforderung', 'retoure']);
    expect(summe(je.get('2026-171'))).toBe(5);
  });

  it('Erhaltung: `ausgegebenes_material` zeigt der Rechnung weiter nur, was nach ihr kam', async () => {
    clientEinreichen(buch.client);
    expect(await anforderungen.ausgegebenesMaterial('2026-170')).toEqual([]);
  });

  it('nur wer Rechnungen schreibt — nicht Projektleitung, nicht Monteur; ein fremder Betrieb sieht nichts', async () => {
    clientEinreichen(buch.client);
    expect(summe((await anforderungen.ausgegebenesMaterialGesamt(['2026-170'])).get('2026-170'))).toBe(11);
    for (const k of [pl, max]) {
      clientEinreichen(k.client);
      await expect(anforderungen.ausgegebenesMaterialGesamt(['2026-170']), k.rolle).rejects.toThrow(/wer Rechnungen schreibt/);
    }
    clientEinreichen(fremd.client);
    const fremdes = await anforderungen.ausgegebenesMaterialGesamt(['2026-170']);
    // Der fremde Betrieb sieht nur seine eigene Ausgabe unter dieser Nummer — nicht die von A.
    expect(summe(fremdes.get('2026-170'))).toBe(99);
  });

  it('ohne Baustelle keine Abfrage und kein Fehler', async () => {
    clientEinreichen(gf.client);
    expect((await anforderungen.ausgegebenesMaterialGesamt([])).size).toBe(0);
    expect((await anforderungen.ausgegebenesMaterialGesamt(['  '])).size).toBe(0);
  });
});
