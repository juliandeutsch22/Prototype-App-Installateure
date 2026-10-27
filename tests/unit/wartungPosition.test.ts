import { describe, it, expect } from 'vitest';
import { wartungAlsPosition, wartungsVorschlaege } from '@/features/invoices/wartungPosition';
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
