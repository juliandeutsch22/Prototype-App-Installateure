/**
 * Jeder Erstellungsversuch trägt eine Kennung, die die Datenbank mitschreibt
 * (Durchsicht 15.11.2026, G2).
 *
 * Vorher ließ sich nach einer unterbrochenen Antwort nicht sicher sagen, ob
 * die Rechnung entstanden war — die Ansicht sperrte das Erstellen bis zum
 * Neuladen (Grenze 2 in `docs/ui-umbau/premium-2026-10-28.md`). Ohne
 * `20261116050300_erstellungsversuch.sql` gibt es `rechnung_versuch_klaeren`
 * nicht, und derselbe Versuch zweimal ergäbe zwei Rechnungen.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'versuch-g2';

let buch: Konto;
let monteur: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'g2buch');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'g2mont');
  clientEinreichen(buch.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

function heute(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date());
}

const entwurf = () => ({
  projectNumber: 'B-G2', customerName: 'Familie Huber', address: 'Gartengasse 4, 8200 Gleisdorf',
  invoiceDate: heute(), leistungVon: heute(), leistungBis: heute(), dueDate: heute(),
  subtotalNetto: 100, totalNetto: 100, totalVat: 20, totalBrutto: 120, vatRate: 0.2,
  paymentStatus: 'Offen' as const,
  positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 100, netto: 100 }],
});

async function anzahl(versuch: string): Promise<number> {
  const { count } = await admin.from('invoices').select('id', { count: 'exact', head: true })
    .eq('company_id', BETRIEB).eq('erstellungsversuch', versuch);
  return count ?? 0;
}

describe('Erstellungsversuch (G2)', () => {
  it('derselbe Versuch zweimal: eine Rechnung, keine zweite Nummer', async () => {
    const v = crypto.randomUUID();
    const erst = await rechnungen.rechnungAusstellen(BETRIEB, entwurf(), { praefix: 'RE', versuch: v });
    const wieder = await rechnungen.rechnungAusstellen(BETRIEB, entwurf(), { praefix: 'RE', versuch: v });
    expect(wieder).toMatchObject({ id: erst.id, invoiceNumber: erst.invoiceNumber, bereits: true });
    expect(await anzahl(v)).toBe(1);
    // Die nächste Rechnung schließt lückenlos an.
    const naechste = await rechnungen.rechnungAusstellen(BETRIEB, entwurf(), { praefix: 'RE', versuch: crypto.randomUUID() });
    const lfd = (n: string) => Number(n.split('-').pop());
    expect(lfd(naechste.invoiceNumber)).toBe(lfd(erst.invoiceNumber) + 1);
  });

  it('Klärung: entstanden — mit Nummer', async () => {
    const v = crypto.randomUUID();
    const r = await rechnungen.rechnungAusstellen(BETRIEB, entwurf(), { praefix: 'RE', versuch: v });
    await expect(rechnungen.rechnungVersuchKlaeren(v)).resolves.toMatchObject({
      entstanden: true, id: r.id, invoiceNumber: r.invoiceNumber,
    });
  });

  it('Klärung: nicht entstanden ist endgültig — der verspätete Aufruf legt nichts mehr an', async () => {
    const v = crypto.randomUUID();
    await expect(rechnungen.rechnungVersuchKlaeren(v)).resolves.toEqual({ entstanden: false });
    await expect(rechnungen.rechnungAusstellen(BETRIEB, entwurf(), { praefix: 'RE', versuch: v }))
      .rejects.toThrow(/nicht entstanden.*geklärt/);
    expect(await anzahl(v)).toBe(0);
  });

  it('Ausstellen und Klären zugleich: nie „nicht entstanden“ neben einer Rechnung', async () => {
    for (let runde = 0; runde < 5; runde++) {
      const v = crypto.randomUUID();
      const [aus, klar] = await Promise.allSettled([
        rechnungen.rechnungAusstellen(BETRIEB, entwurf(), { praefix: 'RE', versuch: v }),
        rechnungen.rechnungVersuchKlaeren(v),
      ]);
      expect(klar.status).toBe('fulfilled');
      const entstanden = (klar as PromiseFulfilledResult<{ entstanden: boolean }>).value.entstanden;
      expect(aus.status === 'fulfilled').toBe(entstanden);
      expect(await anzahl(v)).toBe(entstanden ? 1 : 0);
    }
  }, 30_000);

  it('wer nicht ausstellt, klärt nicht', async () => {
    const { error } = await monteur.client.rpc('rechnung_versuch_klaeren', { p_versuch: crypto.randomUUID() });
    expect(error?.code).toBe('42501');
  });

  // Bleibt gleich: ohne Kennung (alte App) wie bisher.
  it('ohne Kennung: wie bisher, die Rechnung trägt keine', async () => {
    const r = await rechnungen.rechnungAusstellen(BETRIEB, entwurf(), { praefix: 'RE' });
    const { data } = await admin.from('invoices').select('erstellungsversuch').eq('id', r.id).single();
    expect(data!.erstellungsversuch).toBeNull();
  });

  it('die Kennung gehört zum Beleg: danach nicht mehr änderbar', async () => {
    const r = await rechnungen.rechnungAusstellen(BETRIEB, entwurf(), { praefix: 'RE', versuch: crypto.randomUUID() });
    const { error } = await buch.client.from('invoices').update({ erstellungsversuch: crypto.randomUUID() }).eq('id', r.id);
    expect(error?.message).toMatch(/nicht mehr ändern/);
  });
});
