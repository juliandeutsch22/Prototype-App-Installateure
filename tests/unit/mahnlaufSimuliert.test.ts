/**
 * Testbericht 30.09.2026, M23 — der Mahnlauf mit simuliertem Datum.
 *
 * Im Test war er nirgends zu sehen: es gab keine überfällige Rechnung. Hier
 * läuft eine Rechnung Tag für Tag durch alle Stufen — mit Fristen, Spesen je
 * Kundenart, Zinsen für Verbraucher und Unternehmer und fehlendem
 * Basiszinssatz. Das Datum ist ein Übergabewert (`heute`), nicht die Uhr.
 */
import { describe, it, expect } from 'vitest';
import { mahnlauf } from '@/features/invoices/mahnlauf';
import { darfMahnen, verzugszinsen } from '@/features/invoices/mahnung';
import type { Invoice } from '@/types';

const SAETZE = { mahnspesen: [0, 10, 20], mahnspesenVerbraucher: [0, 5, 10] };

const rechnung = (p: Partial<Invoice> = {}): Invoice & { id: string } =>
  ({
    id: 'r1', companyId: 'perl', invoiceNumber: 'RE-2026-0100', projectNumber: '2026-001',
    customerName: 'Familie Huber', invoiceDate: '2026-09-01', dueDate: '2026-09-15',
    totalNetto: 1000, totalVat: 200, totalBrutto: 1200, paymentStatus: 'Offen', ...p,
  }) as unknown as Invoice & { id: string };

/** Die Rechnung nach einer Mahnung: Stufe, Tag und Frist. */
const gemahnt = (r: Invoice & { id: string }, stufe: 1 | 2 | 3, am: string, frist: string) =>
  ({ ...r, mahnstufe: stufe, gemahntAm: am, mahnfrist: frist, paymentStatus: 'Überfällig' }) as Invoice & { id: string };

describe('Eine Privatrechnung durch alle Stufen', () => {
  let r = rechnung();

  it('am Zahlungsziel noch nicht, am Tag danach Stufe 1 (Erinnerung, ohne Spesen)', () => {
    expect(mahnlauf([r], '2026-09-15', SAETZE).zeilen).toHaveLength(0);
    const lauf = mahnlauf([r], '2026-09-16', SAETZE);
    expect(lauf.zeilen[0]).toMatchObject({ stufe: 1, tageUeberfaellig: 1, offen: 1200, spesen: 0 });
  });

  it('während der Frist der Erinnerung nicht wieder', () => {
    r = gemahnt(r, 1, '2026-09-16', '2026-09-23');
    expect(darfMahnen(r, '2026-09-23').moeglich).toBe(false);
    expect(mahnlauf([r], '2026-09-23', SAETZE).zeilen).toHaveLength(0);
  });

  it('danach Stufe 2 mit den Spesen für Privatkunden und 4 % Zinsen', () => {
    const lauf = mahnlauf([r], '2026-09-24', SAETZE, () => false);
    expect(lauf.zeilen[0]).toMatchObject({ stufe: 2, spesen: 5 });
    const zins = verzugszinsen({ stufe: 2, rest: 1200, faellig: r.dueDate, bis: '2026-09-24', unternehmer: false });
    expect(zins).toMatchObject({ art: 'berechnet', satz: 4, tage: 9, grundlage: '§ 1000 ABGB' });
  });

  it('Stufe 3, dann ausgereizt — getrennt genannt, nicht verschluckt', () => {
    r = gemahnt(r, 2, '2026-09-24', '2026-10-01');
    expect(mahnlauf([r], '2026-10-02', SAETZE, () => false).zeilen[0]).toMatchObject({ stufe: 3, spesen: 10 });
    r = gemahnt(r, 3, '2026-10-02', '2026-10-09');
    const lauf = mahnlauf([r], '2026-10-20', SAETZE, () => false);
    expect(lauf.zeilen).toHaveLength(0);
    expect(lauf.ausgereizt.map((x) => x.id)).toEqual(['r1']);
  });
});

describe('Eine Firmenrechnung', () => {
  const firma = rechnung({ id: 'f1', customerVatId: 'ATU12345678' });

  it('verrechnet die Spesen für Firmenkunden', () => {
    const r = gemahnt(firma, 1, '2026-09-16', '2026-09-23');
    expect(mahnlauf([r], '2026-09-24', SAETZE).zeilen[0]).toMatchObject({ stufe: 2, spesen: 10 });
  });

  it('rechnet Zinsen nach § 456 UGB mit gültigem Basiszinssatz', () => {
    const zins = verzugszinsen({
      stufe: 2, rest: 1200, faellig: '2026-09-15', bis: '2026-09-24', unternehmer: true,
      basiszinssatz: 1.53, basiszinssatzAb: '2026-07-01',
    });
    expect(zins).toMatchObject({ art: 'berechnet', satz: 10.73, grundlage: '§ 456 UGB' });
  });

  it('sagt „fehlt“, wenn kein Basiszinssatz fürs laufende Halbjahr hinterlegt ist', () => {
    expect(verzugszinsen({ stufe: 2, rest: 1200, faellig: '2026-09-15', bis: '2026-09-24', unternehmer: true }))
      .toEqual({ art: 'fehlt' });
    // Ein alter Satz aus dem Halbjahr davor gilt nicht.
    expect(verzugszinsen({
      stufe: 2, rest: 1200, faellig: '2026-09-15', bis: '2026-09-24', unternehmer: true,
      basiszinssatz: 1.58, basiszinssatzAb: '2026-01-01',
    })).toEqual({ art: 'fehlt' });
  });
});

describe('Was nicht in den Lauf gehört', () => {
  it('bezahlt, storniert oder mit Rest null', () => {
    const heute = '2026-10-20';
    expect(mahnlauf([
      rechnung({ id: 'b', paymentStatus: 'Bezahlt', bezahltBetrag: 1200 }),
      rechnung({ id: 's', paymentStatus: 'Storniert' }),
    ], heute, SAETZE).zeilen).toHaveLength(0);
  });
});

/*
  Runde 3, „Selbst prüfen“: der Rücklass im Mahnlauf. Solange er nicht fällig
  ist, steht er nicht in der Forderung; ab seiner Fälligkeit wird er mitgemahnt.
*/
describe('Eine Rechnung mit Haftrücklass', () => {
  const mitRuecklass = rechnung({
    id: 'h1', ruecklassArt: 'haft', ruecklassProzent: 5, ruecklassBetrag: 60, ruecklassBis: '2027-09-01',
  });

  it('mahnt vor der Fälligkeit des Rücklasses nur den übrigen Betrag', () => {
    expect(mahnlauf([mitRuecklass], '2026-09-16', SAETZE).zeilen[0]).toMatchObject({ stufe: 1, offen: 1140 });
  });

  it('nach einer Zahlung des übrigen Betrags ist nichts zu mahnen, solange der Rücklass nicht fällig ist', () => {
    const bezahlt = { ...mitRuecklass, bezahltBetrag: 1140 } as Invoice & { id: string };
    expect(mahnlauf([bezahlt], '2026-10-20', SAETZE).zeilen).toHaveLength(0);
    // Ab seiner Fälligkeit wird er gemahnt — gezählt ab dem Tag, an dem er fällig wurde.
    const lauf = mahnlauf([bezahlt], '2027-09-03', SAETZE);
    expect(lauf.zeilen[0]).toMatchObject({ stufe: 1, offen: 60, tageUeberfaellig: 2 });
  });
});
