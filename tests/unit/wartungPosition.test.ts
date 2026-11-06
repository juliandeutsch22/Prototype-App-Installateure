import { describe, it, expect } from 'vitest';
import {
  ohneWartungskennung, wartungAlsPosition, wartungAlsVorschauzeile, wartungenDerPositionen, wartungsKennung,
  wartungsVorschlaege,
} from '@/features/invoices/wartungPosition';
import type { Invoice } from '@/types';

/**
 * Der vereinbarte Preis einer Wartung auf der Rechnung (Testbericht Runde 6,
 * M9): „Gaskessel Heizraum“, 180 € netto je Wartung, kam nie auf eine
 * Rechnung.
 */
const KESSEL = { id: 'w1', anlage: 'Gaskessel Heizraum', preis: 180, ausgefuehrtAm: '2026-10-20' };

const rechnung = (extra: Partial<Invoice>) => ({
  invoiceNumber: 'RE-2026-1600', projectNumber: 'PR-2026-0197', paymentStatus: 'Offen' as const,
  positions: [{ label: 'Wartung Gaskessel Heizraum laut Vereinbarung', qty: 1, unit: 'Pauschale', unitPrice: 180, netto: 180 }],
  ...extra,
});

describe('wartungsVorschlaege', () => {
  it('schlägt die Wartung zum vereinbarten Preis vor, mit dem Tag der Ausführung', () => {
    const [v] = wartungsVorschlaege([KESSEL], [], 'PR-2026-0197');
    expect(v).toEqual({
      schluessel: 'wartung:w1', label: 'Wartung Gaskessel Heizraum laut Vereinbarung', preis: 180,
      schonAuf: null, am: '2026-10-20',
    });
    expect(wartungAlsPosition(v)).toEqual({
      label: 'Wartung Gaskessel Heizraum laut Vereinbarung', qty: 1, unit: 'Pauschale', unitPrice: 180, netto: 180,
    });
  });

  it('nennt die gültige Rechnung, auf der sie schon steht — auch mit „PR-“ anders geschrieben', () => {
    const [v] = wartungsVorschlaege([KESSEL], [rechnung({ projectNumber: '2026-0197' })], 'PR-2026-0197');
    expect(v.schonAuf).toBe('RE-2026-1600');
  });

  it('Gegenprobe: eine stornierte Rechnung gibt sie wieder frei, eine andere Baustelle zählt nicht', () => {
    expect(wartungsVorschlaege([KESSEL], [rechnung({ paymentStatus: 'Storniert' })], 'PR-2026-0197')[0].schonAuf).toBeNull();
    expect(wartungsVorschlaege([KESSEL], [rechnung({ projectNumber: 'PR-2026-0001' })], 'PR-2026-0197')[0].schonAuf).toBeNull();
  });

  it('ohne Preis, mit null Euro oder ohne Anlage gibt es keinen Vorschlag', () => {
    expect(wartungsVorschlaege([{ ...KESSEL, preis: null }], [], 'PR-2026-0197')).toEqual([]);
    expect(wartungsVorschlaege([{ ...KESSEL, preis: 0 }], [], 'PR-2026-0197')).toEqual([]);
    expect(wartungsVorschlaege([{ ...KESSEL, anlage: ' ' }], [], 'PR-2026-0197')).toEqual([]);
  });

  it('nur eingeplant: kein Leistungstag', () => {
    expect(wartungsVorschlaege([{ ...KESSEL, ausgefuehrtAm: null }], [], 'PR-2026-0197')[0].am).toBeNull();
  });
});

/*
  M01e/W04: „schon verrechnet“ über die Kennung der Wartung, nicht über den
  Text der Zeile. Für Rechnungen von vor der Umstellung (ohne
  Wartungsabdeckung) bleibt der Textabgleich als Rückfall.
*/
describe('wartungsVorschlaege über die Abdeckung (M01e)', () => {
  const MIT_KENNUNG = (extra: Partial<Invoice> = {}) => rechnung({
    linkedWartungen: ['w1'],
    positions: [{ label: 'Kesselservice Heizraum', qty: 1, unit: 'Pauschale', unitPrice: 180, netto: 180 }],
    ...extra,
  });

  it('erkennt die Wartung an ihrer Kennung — auch nach dem Umbenennen der Anlage und mit anderem Zeilentext', () => {
    const umbenannt = { ...KESSEL, anlage: 'Gasbrennwertgerät Keller' };
    expect(wartungsVorschlaege([umbenannt], [MIT_KENNUNG()], 'PR-2026-0197')[0].schonAuf).toBe('RE-2026-1600');
  });

  it('Gegenprobe: ein Storno gibt sie frei, eine andere Baustelle zählt nicht', () => {
    expect(wartungsVorschlaege([KESSEL], [MIT_KENNUNG({ paymentStatus: 'Storniert' })], 'PR-2026-0197')[0].schonAuf).toBeNull();
    expect(wartungsVorschlaege([KESSEL], [MIT_KENNUNG({ projectNumber: 'PR-2026-0001' })], 'PR-2026-0197')[0].schonAuf).toBeNull();
  });

  it('Rückfall für Altrechnungen ohne Wartungsabdeckung: der Text', () => {
    // `rechnung()` trägt die Zeile „Wartung Gaskessel Heizraum laut Vereinbarung“ und keine Abdeckung.
    expect(wartungsVorschlaege([KESSEL], [rechnung({})], 'PR-2026-0197')[0].schonAuf).toBe('RE-2026-1600');
    expect(wartungsVorschlaege([KESSEL], [rechnung({ linkedWartungen: [] })], 'PR-2026-0197')[0].schonAuf).toBe('RE-2026-1600');
  });

  it('kein Rückfall, wenn die Rechnung eine Wartungsabdeckung trägt — auch bei gleichem Text', () => {
    // Die Rechnung verrechnet die Wartung w2; dass die Zeile wie die von w1 heisst, macht w1 nicht verrechnet.
    const andere = rechnung({ linkedWartungen: ['w2'] });
    expect(wartungsVorschlaege([KESSEL], [andere], 'PR-2026-0197')[0].schonAuf).toBeNull();
  });

  it('zählt Durchgänge: zwei auf derselben Baustelle brauchen zwei Rechnungen', () => {
    const zweimal = { ...KESSEL, durchgaenge: 2 };
    // Der erste Durchgang ist verrechnet (hier auf einer Altrechnung) — der zweite bleibt offen.
    expect(wartungsVorschlaege([zweimal], [rechnung({})], 'PR-2026-0197')[0].schonAuf).toBeNull();
    expect(wartungsVorschlaege([zweimal], [MIT_KENNUNG()], 'PR-2026-0197')[0].schonAuf).toBeNull();
    const beide = [
      MIT_KENNUNG({ invoiceNumber: 'RE-2025-0900', invoiceDate: '2025-03-04' }),
      // Die Altrechnung ohne Abdeckung zählt über den Text mit.
      rechnung({ invoiceNumber: 'RE-2026-1600', invoiceDate: '2026-03-05' }),
    ];
    expect(wartungsVorschlaege([zweimal], beide, 'PR-2026-0197')[0].schonAuf).toBe('RE-2026-1600');
  });
});

describe('die Kennung reist mit der Zeile (M01e)', () => {
  const [v] = wartungsVorschlaege([KESSEL], [], 'PR-2026-0197');

  it('die übernommene Zeile trägt sie, die gedruckte nicht', () => {
    expect(wartungsKennung(v)).toBe('w1');
    expect(wartungAlsVorschauzeile(v)).toEqual({ ...wartungAlsPosition(v), wartungId: 'w1' });
    expect(ohneWartungskennung([wartungAlsVorschauzeile(v)])).toEqual([wartungAlsPosition(v)]);
  });

  it('nur Zeilen, die noch dastehen, bringen ihre Wartung auf die Rechnung — umformuliert oder nicht', () => {
    const zeile = { ...wartungAlsVorschauzeile(v), label: 'Kesselservice' };
    const andere = { label: 'Anfahrt', qty: 1, unit: 'Pauschale', unitPrice: 30, netto: 30 };
    expect(wartungenDerPositionen([andere, zeile, { ...zeile }])).toEqual(['w1']);
    expect(wartungenDerPositionen([andere])).toEqual([]);
  });
});
