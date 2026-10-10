import { describe, it, expect } from 'vitest';
import { istUeberfaellig, mahnbar, offenerRuecklass, ruecklassFaelligAm, zahlstand } from '@/features/invoices/zahlstand';
import { darfMahnen } from '@/features/invoices/mahnung';
import { mahnlauf } from '@/features/invoices/mahnlauf';
import { haftruecklassBisVorschlag, ruecklassArtFuer, ruecklassBetrag } from '@/features/invoices/ruecklass';
import { ruecklaesseBald, ruecklassWirdFaellig } from '@/features/dashboard/start/regeln';
import { skontoZumAusgleich, zugesagterSkonto } from '@/features/invoices/skonto';
import type { Invoice } from '@/types';

/**
 * Haft- und Deckungsrücklass (Stand-Datei 11.1, Punkt 5; ROADMAP 10.3).
 * „Fertig heißt: eine Rechnung mit Rücklass weist volle USt aus, der
 * Mahnlauf mahnt den Rücklass nicht, und vor der Fälligkeit steht er auf der
 * Startseite.“
 */

const HEUTE = '2026-10-05';

/** 12.000 € brutto, 5 % Haftrücklass = 600 €, Zahlungsziel lange vorbei. */
const rechnung = (p: Partial<Invoice> = {}): Invoice & { id: string } => ({
  id: 'r1',
  companyId: 'perl',
  invoiceNumber: 'RE-2026-0100',
  projectNumber: 'B-1',
  customerName: 'Bauträger Nord',
  invoiceDate: '2026-08-01',
  dueDate: '2026-08-31',
  totalNetto: 10000,
  totalVat: 2000,
  totalBrutto: 12000,
  vatRate: 0.2,
  paymentStatus: 'Offen',
  bezahltBetrag: 0,
  ruecklassArt: 'haft',
  ruecklassProzent: 5,
  ruecklassBetrag: 600,
  ruecklassBis: '2029-08-01',
  ...p,
}) as Invoice & { id: string };

describe('Betrag und Vorschläge', () => {
  it('rechnet von der ganzen Leistung, höchstens die Forderung', () => {
    expect(ruecklassBetrag({ grundlageBrutto: 12000, prozent: 5, forderungBrutto: 12000 })).toBe(600);
    // Schlussrechnung: 3 % von 30.000 €, gefordert sind nach den Teilrechnungen nur noch 500 €.
    expect(ruecklassBetrag({ grundlageBrutto: 30000, prozent: 3, forderungBrutto: 500 })).toBe(500);
    expect(ruecklassBetrag({ grundlageBrutto: 1234.56, prozent: 2.5, forderungBrutto: 1234.56 })).toBe(30.86);
  });

  it('Haft auf Rechnung und Schlussrechnung, Deckung auf Teilrechnung, keiner auf Anzahlung', () => {
    expect(ruecklassArtFuer('einzel')).toBe('haft');
    expect(ruecklassArtFuer('schluss')).toBe('haft');
    expect(ruecklassArtFuer('teil')).toBe('deckung');
    expect(ruecklassArtFuer('anzahlung')).toBeNull();
    expect(haftruecklassBisVorschlag('2026-10-05')).toBe('2029-10-05');
  });
});

describe('Was zu mahnen ist', () => {
  it('Zahlungen tilgen zuerst den übrigen Betrag; offen bleibt der Rücklass', () => {
    const r = rechnung({ bezahltBetrag: 11400, paymentStatus: 'Teilbezahlt' });
    expect(zahlstand(r).rest).toBe(600);
    expect(offenerRuecklass(r)).toBe(600);
    expect(mahnbar(r, HEUTE).rest).toBe(0);
    expect(istUeberfaellig(r, HEUTE)).toBe(false);
    expect(darfMahnen(r, HEUTE)).toMatchObject({ moeglich: false, grund: expect.stringContaining('01.08.2029') });
  });

  it('ohne Zahlung wird nur der übrige Betrag gemahnt', () => {
    const r = rechnung();
    expect(mahnbar(r, HEUTE)).toEqual({ rest: 11400, faellig: '2026-08-31' });
    expect(istUeberfaellig(r, HEUTE)).toBe(true);
    expect(mahnlauf([r], HEUTE, undefined).zeilen[0]).toMatchObject({ offen: 11400 });
  });

  it('nach der Fälligkeit ist der Rücklass zu mahnen — ab seiner Fälligkeit', () => {
    const r = rechnung({ bezahltBetrag: 11400, paymentStatus: 'Teilbezahlt', ruecklassBis: '2026-09-15' });
    expect(mahnbar(r, HEUTE)).toEqual({ rest: 600, faellig: '2026-09-15' });
    expect(istUeberfaellig(r, HEUTE)).toBe(true);
    expect(mahnlauf([r], HEUTE, undefined).zeilen[0]).toMatchObject({ offen: 600, tageUeberfaellig: 20 });
  });

  it('Gegenprobe: ohne Rücklass bleibt alles wie vorher', () => {
    const r = rechnung({ ruecklassArt: null, ruecklassProzent: null, ruecklassBetrag: null, ruecklassBis: null, bezahltBetrag: 11400, paymentStatus: 'Teilbezahlt' });
    expect(offenerRuecklass(r)).toBe(0);
    expect(mahnbar(r, HEUTE)).toEqual({ rest: 600, faellig: '2026-08-31' });
    expect(istUeberfaellig(r, HEUTE)).toBe(true);
  });
});

describe('Startseite', () => {
  it('nennt den Rücklass ab 30 Tage vor der Fälligkeit', () => {
    const bald = rechnung({ bezahltBetrag: 11400, paymentStatus: 'Teilbezahlt', ruecklassBis: '2026-10-20' });
    const spaeter = rechnung({ id: 'r2', bezahltBetrag: 11400, paymentStatus: 'Teilbezahlt', ruecklassBis: '2026-11-20' });
    expect(ruecklaesseBald([bald, spaeter], HEUTE).map((r) => r.id)).toEqual(['r1']);
    expect(ruecklassWirdFaellig([bald], HEUTE)?.zeilen[0]).toMatchObject({
      detail: expect.stringContaining('Haftrücklass'),
      status: { text: 'fällig 20.10.', ton: 'warn' },
    });
  });

  it('Gegenprobe: bezahlt, storniert oder schon fällig steht er hier nicht', () => {
    const bezahlt = rechnung({ bezahltBetrag: 12000, paymentStatus: 'Bezahlt', ruecklassBis: '2026-10-20' });
    const storniert = rechnung({ paymentStatus: 'Storniert', ruecklassBis: '2026-10-20' });
    const faellig = rechnung({ bezahltBetrag: 11400, paymentStatus: 'Teilbezahlt', ruecklassBis: '2026-10-01' });
    expect(ruecklaesseBald([bezahlt, storniert, faellig], HEUTE)).toEqual([]);
  });
});

describe('Abgelöst durch Bankgarantie (10.10.2026)', () => {
  const bezahlt = { bezahltBetrag: 11400, paymentStatus: 'Teilbezahlt' as const };

  it('fällig ab der Ablöse, wenn sie vor dem vereinbarten Tag liegt', () => {
    const r = rechnung({ ...bezahlt, ruecklassGarantieAm: '2026-10-01' });
    expect(ruecklassFaelligAm(r)).toBe('2026-10-01');
    expect(mahnbar(r, HEUTE)).toEqual({ rest: 600, faellig: '2026-10-01' });
    expect(istUeberfaellig(r, HEUTE)).toBe(true);
    expect(darfMahnen(r, HEUTE).moeglich).toBe(true);
  });

  it('eine Ablöse in den nächsten 30 Tagen steht auf der Startseite — mit ihrem Tag', () => {
    const r = rechnung({ ...bezahlt, ruecklassGarantieAm: '2026-10-20' });
    expect(ruecklaesseBald([r], HEUTE).map((x) => x.id)).toEqual(['r1']);
    expect(ruecklassWirdFaellig([r], HEUTE)?.zeilen[0].status).toEqual({ text: 'fällig 20.10.', ton: 'warn' });
  });

  it('Gegenprobe: ohne Ablöse der vereinbarte Tag — der Rücklass ist nicht zu mahnen', () => {
    const r = rechnung(bezahlt);
    expect(ruecklassFaelligAm(r)).toBe('2029-08-01');
    expect(mahnbar(r, HEUTE).rest).toBe(0);
    expect(darfMahnen(r, HEUTE)).toMatchObject({ moeglich: false, grund: expect.stringContaining('01.08.2029') });
  });
});

describe('Skonto auf den Zahlbetrag (10.10.2026)', () => {
  /* 12.000 € mit 600 € Rücklass und 2 % Skonto: zugesagt sind 2 % von 11.400 € = 228 €. */
  const mitSkonto = (p: Partial<Invoice> = {}) =>
    rechnung({ skontoProzent: 2, skontoBis: '2026-08-10', ...p });

  it('zugesagt sind 2 % vom Zahlbetrag, nicht vom Rechnungsbetrag', () => {
    expect(zugesagterSkonto(mitSkonto())).toBe(228);
  });

  it('behält der Kunde den Rücklass ein, gleicht der Skonto nur den Teil darüber aus', () => {
    // 11.400 − 228 = 11.172 gezahlt; offen bleiben 828 = 600 Rücklass + 228 Skonto.
    expect(skontoZumAusgleich(mitSkonto(), '2026-08-09', 11172)).toBe(228);
  });

  it('zahlt er den Rücklass gleich mit, ist der ganze Rest der Skonto', () => {
    expect(skontoZumAusgleich(mitSkonto(), '2026-08-09', 11772)).toBe(228);
  });

  it('zu wenig gezahlt oder nach der Frist: kein Skonto', () => {
    expect(skontoZumAusgleich(mitSkonto(), '2026-08-09', 11000)).toBeNull();
    expect(skontoZumAusgleich(mitSkonto(), '2026-08-11', 11172)).toBeNull();
  });

  it('Gegenprobe: ohne Rücklass wie bisher — 2 % vom Rechnungsbetrag', () => {
    const r = mitSkonto({ ruecklassArt: null, ruecklassProzent: null, ruecklassBetrag: null, ruecklassBis: null });
    expect(zugesagterSkonto(r)).toBe(240);
    expect(skontoZumAusgleich(r, '2026-08-09', 11760)).toBe(240);
  });
});
