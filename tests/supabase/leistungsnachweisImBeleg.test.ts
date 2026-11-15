/**
 * Der Leistungsnachweis wird beim Ausstellen als Teil des Belegs
 * festgehalten (Durchsicht 15.11.2026, G6).
 *
 * Vorher stand nirgends, ob er angehängt war, und Nachdruck und Belegarchiv
 * druckten die Rechnung ohne ihn. Ohne
 * `20261116050400_leistungsnachweis_im_beleg.sql` gibt es die Spalte nicht.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { clientEinreichen } from '@/lib/db/pg/kern';
import type { LeistungsnachweisZeile } from '@/types';

const BETRIEB = 'nachweis-g6';

let buch: Konto;
let chefin: Konto;
let monteur: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'g6buch');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'g6chef');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'g6mont');
  clientEinreichen(buch.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

function heute(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date());
}

const entwurf = (leistungsnachweis: LeistungsnachweisZeile[] | null) => ({
  projectNumber: 'B-G6', customerName: 'Familie Huber', address: 'Gartengasse 4, 8200 Gleisdorf',
  invoiceDate: heute(), leistungVon: heute(), leistungBis: heute(), dueDate: heute(),
  subtotalNetto: 100, totalNetto: 100, totalVat: 20, totalBrutto: 120, vatRate: 0.2,
  paymentStatus: 'Offen' as const,
  positions: [{ label: 'Facharbeit', qty: 2, unit: 'h', unitPrice: 50, netto: 100 }],
  leistungsnachweis,
});

describe('Leistungsnachweis im Beleg (G6)', () => {
  const zeilen = (): LeistungsnachweisZeile[] => [{
    uid: monteur.uid, datum: heute(), mitarbeiter: 'Max Monteur', typ: 'Fachkraft', taetigkeit: 'Bad, Rohinstallation', minuten: 120,
  }];

  it('steht an der Rechnung, wie er gedruckt wurde — und bleibt so', async () => {
    const r = await rechnungen.rechnungAusstellen(BETRIEB, entwurf(zeilen()), { praefix: 'RE' });
    const [gelesen] = await rechnungen.listInvoicesByIds(BETRIEB, [r.id]);
    expect(gelesen.leistungsnachweis).toEqual(zeilen());
    const { error } = await buch.client.from('invoices').update({ leistungsnachweis: [] }).eq('id', r.id);
    expect(error?.message).toMatch(/nicht mehr ändern/);
  });

  it('ohne Nachweis (kein Haken) und mit leerer Liste: keiner', async () => {
    const ohne = await rechnungen.rechnungAusstellen(BETRIEB, entwurf(null), { praefix: 'RE' });
    const leer = await rechnungen.rechnungAusstellen(BETRIEB, entwurf([]), { praefix: 'RE' });
    const { data } = await admin.from('invoices').select('id, leistungsnachweis').in('id', [ohne.id, leer.id]);
    expect((data ?? []).map((z) => z.leistungsnachweis)).toEqual([null, null]);
  });

  it('steht in der Datenauskunft der Person — ihre Zeilen, mit Rechnung', async () => {
    const r = await rechnungen.rechnungAusstellen(BETRIEB, entwurf(zeilen()), { praefix: 'RE' });
    const { data, error } = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: monteur.uid });
    expect(error).toBeNull();
    const liste = (data as { daten: { leistungsnachweise: { rechnung: string; minuten: number }[] } }).daten.leistungsnachweise;
    expect(liste).toContainEqual(expect.objectContaining({ rechnung: r.invoiceNumber, minuten: 120, taetigkeit: 'Bad, Rohinstallation' }));
  });
});
