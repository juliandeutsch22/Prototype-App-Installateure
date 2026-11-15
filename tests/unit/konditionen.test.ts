import { describe, it, expect } from 'vitest';
import { betriebsKonditionen, konditionenAbweichungen, zahlungsbedingungen } from '@/features/invoices/konditionen';
import { INVOICE_DEFAULTS } from '@/features/invoices/assemble';

/**
 * Konditionen einer entstehenden Rechnung (Durchsicht 15.11.2026, G1): der
 * Startwert, was die Vorschau unter den Summen nennt und worin die Rechnung
 * vom Betrieb abweicht. Die Verdrahtung in der Ansicht prüft
 * `tests/components/InvoicesView.test.tsx` („Konditionen gelten nur …“).
 */
const BETRIEB = betriebsKonditionen({ fach: 68, helper: 45, nightSurcharge: 0.5, emergencySurcharge: 1, vatRate: 0.2, dueDays: 14 });

describe('betriebsKonditionen', () => {
  it('nimmt die Sätze des Betriebs, sonst die Vorgaben ab Werk', () => {
    expect(betriebsKonditionen(undefined)).toEqual(INVOICE_DEFAULTS);
    expect(betriebsKonditionen({ fach: 72 })).toEqual({ ...INVOICE_DEFAULTS, fach: 72 });
  });

  it('gibt jedes Mal ein eigenes Objekt — eine Änderung in der Maske trifft die Einstellung nicht', () => {
    const satz = { fach: 72 };
    const k = betriebsKonditionen(satz);
    k.fach = 1;
    expect(satz.fach).toBe(72);
    expect(INVOICE_DEFAULTS.fach).toBe(65);
  });
});

describe('konditionenAbweichungen', () => {
  it('nichts, wenn die Rechnung die Sätze des Betriebs hat', () => {
    expect(konditionenAbweichungen({ ...BETRIEB }, BETRIEB)).toEqual([]);
  });

  it('je Feld ein Satz, in der Reihenfolge des Formulars', () => {
    const diese = { ...BETRIEB, fach: 58, emergencySurcharge: 0.75, dueDays: 30, skontoProzent: 3, skontoTage: 10, vatRate: 0.1 };
    expect(konditionenAbweichungen(diese, BETRIEB)).toEqual([
      'Facharbeiter € 58,00/h (Betrieb € 68,00/h)',
      'Notdienstzuschlag 75 % (Betrieb 100 %)',
      'Zahlungsziel 30 Tage (Betrieb 14 Tage)',
      'Skonto 3 % in 10 Tagen (Betrieb keines)',
      'USt 10 % (Betrieb 20 %)',
    ]);
  });

  it('ein Skonto ohne Frist sagt nichts zu — und ist darum keine Abweichung', () => {
    expect(konditionenAbweichungen({ ...BETRIEB, skontoProzent: 3 }, BETRIEB)).toEqual([]);
    expect(konditionenAbweichungen({ ...BETRIEB, skontoProzent: 2, skontoTage: 1 }, { ...BETRIEB, skontoProzent: 2, skontoTage: 7 }))
      .toEqual(['Skonto 2 % in 1 Tag (Betrieb 2 % in 7 Tagen)']);
  });

  it('der Zuschlag aus dem Prozentfeld (35 / 100) gilt als gleich mit 0,35', () => {
    expect(konditionenAbweichungen({ ...BETRIEB, nightSurcharge: 35 / 100 }, { ...BETRIEB, nightSurcharge: 0.35 })).toEqual([]);
  });
});

describe('zahlungsbedingungen', () => {
  it('Zahlungsziel ab Rechnungsdatum, Skonto mit Betrag, Zahlbetrag ohne Rücklass', () => {
    expect(zahlungsbedingungen({
      konditionen: { dueDays: 14, skontoProzent: 3, skontoTage: 10 },
      rechnungsdatum: '2026-09-01', art: 'einzel', forderungBrutto: 1200, ruecklassBetrag: 60,
    })).toEqual({
      zahlungsziel: '2026-09-15',
      // 3 % vom Zahlbetrag 1.140 € (seit 10.10.2026 ohne den Rücklass).
      skonto: { skontoProzent: 3, skontoBis: '2026-09-11', betrag: 34.2 },
      skontoNichtFuerArt: false,
      zahlbetrag: 1140,
      zahlbetragMitSkonto: 1105.8,
    });
  });

  it('über den Monats- und Sommerzeitwechsel hinweg der richtige Kalendertag', () => {
    expect(zahlungsbedingungen({
      konditionen: { dueDays: 30 }, rechnungsdatum: '2026-10-15', art: 'einzel', forderungBrutto: 100,
    }).zahlungsziel).toBe('2026-11-14');
  });

  it('der Skonto endet spätestens mit dem Zahlungsziel', () => {
    expect(zahlungsbedingungen({
      konditionen: { dueDays: 7, skontoProzent: 2, skontoTage: 14 }, rechnungsdatum: '2026-09-01', art: 'einzel', forderungBrutto: 100,
    }).skonto?.skontoBis).toBe('2026-09-08');
  });

  it('auf einer Anzahlung kein Skonto — und das wird gesagt, wenn einer eingestellt ist', () => {
    const z = zahlungsbedingungen({
      konditionen: { dueDays: 14, skontoProzent: 2, skontoTage: 7 }, rechnungsdatum: '2026-09-01', art: 'anzahlung', forderungBrutto: 100,
    });
    expect(z.skonto).toBeNull();
    expect(z.skontoNichtFuerArt).toBe(true);
    expect(z.zahlbetragMitSkonto).toBeNull();
    expect(zahlungsbedingungen({
      konditionen: { dueDays: 14 }, rechnungsdatum: '2026-09-01', art: 'anzahlung', forderungBrutto: 100,
    }).skontoNichtFuerArt).toBe(false);
  });

  it('der Skonto an der Halbcent-Grenze wie die Datenbank: 2 % auf 106,75 € = 2,14 €', () => {
    const z = zahlungsbedingungen({
      konditionen: { dueDays: 14, skontoProzent: 2, skontoTage: 7 }, rechnungsdatum: '2026-09-01', art: 'einzel', forderungBrutto: 106.75,
    });
    expect(z.skonto?.betrag).toBe(2.14);
    expect(z.zahlbetragMitSkonto).toBe(104.61);
  });
});
