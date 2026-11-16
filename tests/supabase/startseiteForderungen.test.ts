/**
 * DIE OFFENEN FORDERUNGEN DER STARTSEITE VOM SERVER (Edge Function
 * `startseite-forderungen`, Durchsicht 15.11.2026, Budget B3).
 *
 * Die Startseite holte jede offene Rechnung und rechnete im Browser Mahnlauf,
 * „überfällig, nicht mahnbar“, bald fällige Rücklässe und die Kacheln. Jetzt
 * rechnet die Function mit DERSELBEN Fassung der Regeln (`shared/forderungen.ts`)
 * und schickt Zahlen und die ersten drei je Abschnitt.
 *
 * Geprüft wird „bleibt gleich“: Zahlen und Zeilen der Function sind die der
 * bisherigen Rechnung über alle offenen Köpfe (`listUnpaidInvoiceKoepfe`,
 * `mahnlauf`, die Formeln der Kacheln) — mit Mahnstufen, laufender Frist,
 * ausgereizter dritter Mahnung, Rücklass und den Mahnspesen des Betriebs.
 * Dazu: nur der eigene Betrieb, ohne Anmeldung nichts.
 *
 * Gegenprobe: ohne die Function (404) rot; eine eigene Fassung der Regeln, die
 * etwa die laufende Frist nicht kennt, zählte die Mahnungen anders (rot).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { admin, API, ANON, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { listUnpaidInvoiceKoepfe } from '@/lib/db/pg/invoices';
import { mahnlauf } from '@/features/invoices/mahnlauf';
import { istUeberfaellig, mahnbar, offenerRest } from '@/features/invoices/zahlstand';
import type { ForderungsStand } from '@shared/forderungen';

const A = 'forderungen-a';
const B = 'forderungen-b';
const HEUTE = '2026-11-16';
const SAETZE = { mahnspesen: [0, 10, 20], mahnspesenVerbraucher: [0, 5, 10] };
let chef: Konto;
let fremd: Konto;

async function vomServer(k: Konto, heute = HEUTE): Promise<{ status: number; stand: ForderungsStand }> {
  const r = await fetch(`${API}/functions/v1/startseite-forderungen`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${k.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ heute }),
  });
  return { status: r.status, stand: (await r.json()) as ForderungsStand };
}

beforeAll(async () => {
  await betriebAnlegen(A);
  await betriebAnlegen(B);
  await admin.from('companies').update({ rates: SAETZE }).eq('id', A);
  chef = await konto(A, 'Geschäftsführung', 'fo-chef');
  fremd = await konto(B, 'Geschäftsführung', 'fo-fremd');
  let nr = 0;
  const r = (p: Record<string, unknown>) => ({
    id: randomUUID(), company_id: A, invoice_number: `RE-2026-${String(++nr).padStart(4, '0')}`, project_number: 'PR-1',
    customer_name: `Kunde ${nr}`, invoice_date: '2026-08-01', due_date: '2026-09-01', total_netto: 1000, total_vat: 200,
    total_brutto: 1200, payment_status: 'Offen', bezahlt_betrag: 0, mahnstufe: 0, gemahnt_am: null, mahnfrist: null,
    ruecklass_betrag: null, ruecklass_bis: null, customer_vat_id: null, ...p,
  });
  const zeilen = [
    // Mahnbar, verschieden lange überfällig und unterschiedlich hoch.
    ...Array.from({ length: 5 }, (_, i) => r({ due_date: `2026-10-0${i + 1}`, total_brutto: 1200 + i * 100 })),
    r({ customer_vat_id: 'ATU12345678', due_date: '2026-09-15' }),
    // Erste Mahnung heraus, Frist läuft noch: überfällig, nicht mahnbar.
    r({ mahnstufe: 1, gemahnt_am: '2026-11-10', mahnfrist: '2026-11-20', due_date: '2026-10-01' }),
    // Dritte Mahnung heraus: ausgereizt.
    r({ mahnstufe: 3, gemahnt_am: '2026-10-01', mahnfrist: '2026-10-08', due_date: '2026-08-15' }),
    // Teilbezahlt, mahnbar über den Rest.
    r({ payment_status: 'Teilbezahlt', bezahlt_betrag: 700, due_date: '2026-10-20' }),
    // Noch nicht fällig.
    r({ due_date: '2026-12-01' }),
    // Bezahlt bis auf den Rücklass, der in drei Wochen fällig wird.
    r({ payment_status: 'Teilbezahlt', bezahlt_betrag: 1140, ruecklass_betrag: 60, ruecklass_bis: '2026-12-05', due_date: '2026-09-01' }),
    // Nicht offen: gehört in keine Zahl.
    r({ payment_status: 'Bezahlt', bezahlt_betrag: 1200 }),
    r({ payment_status: 'Storniert' }),
  ];
  const { error } = await admin.from('invoices').insert(zeilen);
  if (error) throw new Error(error.message);
  const f = await admin.from('invoices').insert(r({ company_id: B, customer_name: 'Fremd', invoice_number: 'RE-B-1' }));
  if (f.error) throw new Error(f.error.message);
  clientEinreichen(chef.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('Offene Forderungen der Startseite vom Server', () => {
  it('bleibt gleich: Zahlen und erste Zeilen wie die bisherige Rechnung über alle offenen Köpfe', async () => {
    const { status, stand } = await vomServer(chef);
    expect(status).toBe(200);
    const koepfe = await listUnpaidInvoiceKoepfe(A);
    const lauf = mahnlauf(koepfe, HEUTE, SAETZE);
    const ueber = koepfe.filter((i) => istUeberfaellig(i, HEUTE));
    const offen = koepfe.filter((i) => !istUeberfaellig(i, HEUTE));
    const faellig = ueber.reduce((s, i) => s + mahnbar(i, HEUTE).rest, 0);
    const imLauf = new Set(lauf.zeilen.map((z) => z.rechnung.id));

    expect(stand.mahnungen.anzahl).toBe(lauf.zeilen.length);
    expect(stand.mahnungen.zeilen.map((z) => [z.rechnung.id, z.stufe, z.spesen, z.offen])).toEqual(
      lauf.zeilen.slice(0, 3).map((z) => [z.rechnung.id, z.stufe, z.spesen, z.offen]));
    expect(stand.ueberfaelligNichtMahnbar.anzahl).toBe(ueber.filter((i) => !imLauf.has(i.id)).length);
    expect(stand.kennzahlen).toEqual({
      offenSumme: offen.reduce((s, i) => s + offenerRest(i), 0) + ueber.reduce((s, i) => s + offenerRest(i), 0) - faellig,
      offenAnzahl: offen.length + ueber.filter((i) => offenerRest(i) - mahnbar(i, HEUTE).rest > 0.005).length,
      faelligSumme: faellig,
      ueberAnzahl: ueber.length,
      aeltesteFaellig: [...ueber].map((i) => mahnbar(i, HEUTE).faellig ?? i.dueDate).sort()[0],
    });
    // Was die Daten erwarten lassen: sieben mahnbar (fünf, der Unternehmer, die teilbezahlte), zwei nicht.
    expect(stand.mahnungen.anzahl).toBe(7);
    expect(stand.ueberfaelligNichtMahnbar.zeilen.map((z) => z.ausgereizt).sort()).toEqual([false, true]);
    expect(stand.ruecklassBald).toMatchObject({ anzahl: 1, summe: 60 });
  });

  it('gibt je Abschnitt höchstens drei Zeilen', async () => {
    const { stand } = await vomServer(chef);
    expect(stand.mahnungen.zeilen).toHaveLength(3);
    expect(JSON.stringify(stand).length).toBeLessThan(10_000);
  });

  it('Rechte: nur der eigene Betrieb; ohne Anmeldung nichts', async () => {
    const { stand } = await vomServer(fremd);
    expect(stand.kennzahlen.ueberAnzahl).toBe(1);
    expect(stand.mahnungen.zeilen.map((z) => z.rechnung.customerName)).toEqual(['Fremd']);
    const ohne = await fetch(`${API}/functions/v1/startseite-forderungen`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: '{}',
    });
    expect(ohne.status).toBe(401);
  });
});
