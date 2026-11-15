/**
 * Rechnungsdatum, Nummernjahr und Mahntag kommen vom Server
 * (Durchsicht 15.11.2026, G5).
 *
 * Vorher nahm `rechnung_ausstellen` Datum und Jahr ungeprüft vom Gerät: ein
 * Tablet mit leerer Pufferbatterie stellte „RE-2020-1001“ vom 01.01.2020
 * aus, eingefroren. Ohne `20261116050200_rechnungsdatum_vom_server.sql`
 * sind die erste und die letzte Prüfung rot.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, mahnInhalt, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { objektAlsZeile } from '@/lib/db/pg/felder';

const BETRIEB = 'datum-g5';

let buch: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'g5buch');
  clientEinreichen(buch.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

function heute(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date());
}
const JAHR = Number(heute().slice(0, 4));

const entwurf = (tag: string, faellig = tag) => ({
  projectNumber: 'B-G5', customerName: 'Familie Huber', address: 'Gartengasse 4, 8200 Gleisdorf',
  invoiceDate: tag, leistungVon: tag, leistungBis: tag, dueDate: faellig,
  subtotalNetto: 100, totalNetto: 100, totalVat: 20, totalBrutto: 120, vatRate: 0.2,
  paymentStatus: 'Offen' as const,
  positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 100, netto: 100 }],
});

async function anzahl(): Promise<number> {
  const { count } = await admin.from('invoices').select('id', { count: 'exact', head: true }).eq('company_id', BETRIEB);
  return count ?? 0;
}

describe('Rechnungsdatum vom Server (G5)', () => {
  it('ein Gerät mit falscher Uhr bekommt eine Absage — kein Beleg, keine Nummer verbraucht', async () => {
    const vorher = await anzahl();
    await expect(rechnungen.rechnungAusstellen(BETRIEB, entwurf('2020-01-01'), { praefix: 'RE' }))
      .rejects.toThrow(/nicht der heutige Tag/);
    expect(await anzahl()).toBe(vorher);
    const { data: zaehler } = await admin.from('number_counters')
      .select('*').eq('company_id', BETRIEB).eq('jahr', 2020);
    expect(zaehler ?? []).toEqual([]);
  });

  it('mit dem heutigen Tag: Datum und Jahr der Nummer vom Server', async () => {
    const r = await rechnungen.rechnungAusstellen(BETRIEB, entwurf(heute()), { praefix: 'RE' });
    expect(r.invoiceDate).toBe(heute());
    expect(r.invoiceNumber).toMatch(new RegExp(`^RE-${JAHR}-\\d{4,}$`));
  });

  it('die alte App schickt ihr Jahr mit — es zählt nicht mehr, das Datum entscheidet', async () => {
    const roh = entwurf(heute());
    const { positions, ...kopf } = roh;
    const { data, error } = await buch.client.rpc('rechnung_ausstellen', {
      p_kopf: objektAlsZeile('invoices', kopf),
      p_positionen: positions.map((p) => objektAlsZeile('invoice_lines', p)),
      p_belege: {},
      p_praefix: 'RE',
      p_jahr: 2019,
      p_wunsch: null,
    });
    expect(error).toBeNull();
    expect((data as { invoice_number: string }).invoice_number).toMatch(new RegExp(`^RE-${JAHR}-`));
  });

  it('ausdrücklich (Übernahme, Prüfung) bleibt ein anderes Datum möglich — das Jahr folgt ihm', async () => {
    const r = await rechnungen.rechnungAusstellen(
      BETRIEB, entwurf(`${JAHR - 1}-12-30`, `${JAHR}-01-13`), { praefix: 'RE', datumAusdruecklich: true },
    );
    expect(r.invoiceDate).toBe(`${JAHR - 1}-12-30`);
    expect(r.invoiceNumber).toMatch(new RegExp(`^RE-${JAHR - 1}-`));
  });

  it('der Mahntag: nur heute, sonst keine Mahnung', async () => {
    const tag = heute();
    const r = await rechnungen.rechnungAusstellen(
      BETRIEB, entwurf(`${JAHR - 1}-01-10`, `${JAHR - 1}-01-24`), { praefix: 'RE', datumAusdruecklich: true },
    );
    await expect(rechnungen.mahnungFesthalten(r.id, {
      stufe: 1, gemahntAm: '2020-01-01', frist: '2020-01-08', spesen: 0, inhalt: mahnInhalt(1, '2020-01-01', '2020-01-08'),
    })).rejects.toThrow(/nicht der heutige Tag/);
    await expect(rechnungen.mahnungFesthalten(r.id, {
      stufe: 1, gemahntAm: tag, frist: tag, spesen: 0, inhalt: mahnInhalt(1, tag, tag),
    })).resolves.toBeTruthy();
  });
});
