import { describe, it, expect } from 'vitest';
import {
  assembleInvoice, norm, offeneBelegDaten, stichtagAbweichung, INVOICE_DEFAULTS,
} from '@/features/invoices/assemble';
import { NACHTZEIT_VORGABE } from '@/lib/lohnregeln';
import type { Material, TimeEntry, WorkSheet } from '@/types';

const entry = (over: Partial<TimeEntry> = {}): TimeEntry & { id: string } =>
  ({
    id: 'e1', companyId: 'c', date: '2025-06-02', status: 'Anwesend', userId: 'u1',
    startTime: '07:00', endTime: '16:30', breakDuration: 30, projectNumber: '2025-001',
    ...over,
  }) as TimeEntry & { id: string };

describe('Projektnummer-Abgleich', () => {
  it('gleicht das PR-Präfix an', () => {
    expect(norm('PR-2025-001')).toBe(norm('2025-001'));
    expect(norm(' pr-2025-001 ')).toBe('2025-001');
  });

  it('rechnet Stunden auch bei abweichendem Präfix ab', () => {
    // Der eigentliche Schaden: ohne Angleichung fielen diese Stunden
    // stillschweigend aus der Rechnung — der Umsatz wäre verloren.
    const res = assembleInvoice('PR-2025-001', [entry({ projectNumber: '2025-001' })]);
    expect(res.positions).toHaveLength(1);
    expect(res.positions[0].qty).toBe(9);
    expect(res.linkedEntries).toEqual(['e1']);
  });

  it('nimmt fremde Projekte NICHT mit auf', () => {
    const res = assembleInvoice('2025-001', [entry({ projectNumber: '2025-999' })]);
    expect(res.positions).toHaveLength(0);
  });
});

describe('Positionen', () => {
  it('trennt Fach- und Helferstunden mit eigenen Sätzen', () => {
    const res = assembleInvoice('2025-001', [
      entry(),
      entry({ id: 'e2', date: '2025-06-03', isHelper: true }),
    ]);
    const fach = res.positions.find((p) => p.label === 'Facharbeiterstunden');
    const helfer = res.positions.find((p) => p.label === 'Helferstunden');
    expect(fach?.unitPrice).toBe(INVOICE_DEFAULTS.fach);
    expect(helfer?.unitPrice).toBe(INVOICE_DEFAULTS.helper);
    expect(fach?.netto).toBe(9 * 65);
    expect(helfer?.netto).toBe(9 * 45);
  });

  it('verrechnet KEIN Material', () => {
    // Materialbestellungen sind interne Anforderungen des Monteurs an die
    // Projektleitung. Sie tragen keinen Preis und dürfen nie auf einer
    // Kundenrechnung landen.
    const res = assembleInvoice('2025-001', [entry()]);
    expect(res.positions).toHaveLength(1);
    expect(res.positions[0].unit).toBe('h');
    expect(res.linkedOrders).toEqual([]);
  });

  it('lässt bereits verrechnete Einträge aus', () => {
    const res = assembleInvoice('2025-001', [entry({ isBilled: true })]);
    expect(res.positions).toHaveLength(0);
  });

  it('rechnet USt und Brutto korrekt', () => {
    const res = assembleInvoice('2025-001', [entry()]);
    expect(res.totalNetto).toBe(585); // 9 h * 65
    expect(res.totalVat).toBe(117); // 20 %
    expect(res.totalBrutto).toBe(702);
  });

  it('übernimmt abweichende Sätze', () => {
    const res = assembleInvoice('2025-001', [entry()], {
      ...INVOICE_DEFAULTS,
      fach: 80,
      vatRate: 0,
    });
    expect(res.totalNetto).toBe(9 * 80);
    expect(res.totalVat).toBe(0);
    expect(res.totalBrutto).toBe(9 * 80);
  });
});

/**
 * Ein Einsatz ganz in der Nachtzeit: 21:30–06:00 mit 30 Minuten Pause sind
 * acht Nachtstunden. Seit M35 trägt das Kennzeichen nur die Stunden in der
 * Nachtzeit; ein Tageseinsatz mit Haken hätte hier keine.
 */
const NACHT = { isNightWork: true, startTime: '21:30', endTime: '06:00' } as const;

describe('Zuschläge', () => {
  it('schlägt Nachtarbeit auf den Stundensatz auf', () => {
    const res = assembleInvoice('2025-001', [entry({ ...NACHT })]);
    expect(res.positions).toHaveLength(1);
    expect(res.positions[0].unitPrice).toBe(65 * 1.5);
    expect(res.positions[0].label).toContain('Nachtarbeit +50 %');
  });

  it('addiert Nacht- und Notdienstzuschlag', () => {
    const res = assembleInvoice('2025-001', [entry({ ...NACHT, isEmergency: true })]);
    // 65 * (1 + 0.5 + 1) = 162.50 — die Zuschläge addieren sich auf den
    // Grundsatz, sie multiplizieren sich NICHT (das ergäbe 195,00).
    expect(res.positions[0].unitPrice).toBe(162.5);
    expect(res.positions[0].label).toContain('Notdienst +100 %');
    expect(res.positions[0].label).toContain('Nachtarbeit +50 %');
  });

  it('weist jede Kombination als eigene Position aus', () => {
    const res = assembleInvoice('2025-001', [
      entry({ id: 'e1' }),
      entry({ id: 'e2', date: '2025-06-03', ...NACHT }),
      entry({ id: 'e3', date: '2025-06-04', isEmergency: true }),
      entry({ id: 'e4', date: '2025-06-05', isHelper: true, ...NACHT }),
    ]);
    expect(res.positions).toHaveLength(4);
    // Feste Reihenfolge: Facharbeiter vor Helfer, Grundleistung vor Zuschlag.
    expect(res.positions.map((p) => p.label)).toEqual([
      'Facharbeiterstunden',
      'Facharbeiterstunden (Nachtarbeit +50 %)',
      'Facharbeiterstunden (Notdienst +100 %)',
      'Helferstunden (Nachtarbeit +50 %)',
    ]);
  });

  it('fasst gleich gekennzeichnete Einträge zu einer Position zusammen', () => {
    const res = assembleInvoice('2025-001', [
      entry({ id: 'e1', isEmergency: true }),
      entry({ id: 'e2', date: '2025-06-03', isEmergency: true }),
    ]);
    expect(res.positions).toHaveLength(1);
    expect(res.positions[0].qty).toBe(18);
  });

  it('rechnet einen Nachteinsatz über Mitternacht korrekt ab', () => {
    // 22:00–06:00 ohne Pause: acht Stunden, nicht null.
    const res = assembleInvoice('2025-001', [
      entry({ startTime: '22:00', endTime: '06:00', breakDuration: 0, isNightWork: true }),
    ]);
    expect(res.positions[0].qty).toBe(8);
    expect(res.totalNetto).toBe(8 * 65 * 1.5);
  });

  it('folgt den Zuschlägen des Betriebs', () => {
    const res = assembleInvoice('2025-001', [entry({ isEmergency: true })], {
      ...INVOICE_DEFAULTS,
      emergencySurcharge: 0.25,
      vatRate: 0,
    });
    expect(res.positions[0].unitPrice).toBe(65 * 1.25);
    expect(res.positions[0].label).toContain('Notdienst +25 %');
  });
});

/*
  STICHTAG „LEISTUNG BIS“ (23.10.2026): eine Baustelle über Wochen wird in
  Etappen verrechnet. Was nach dem Stichtag liegt, bleibt offen.
*/
describe('Stichtag', () => {
  const schein = (over: Partial<WorkSheet>): WorkSheet & { id: string } =>
    ({
      id: 's1', companyId: 'c', projectNumber: '2025-001', datum: '2025-06-02',
      status: 'Unterschrieben', zeiten: [], material: [{ name: 'Rohr', menge: 2, einheit: 'm' }],
      ...over,
    }) as WorkSheet & { id: string };
  const katalog = [{ id: 'k', companyId: 'c', name: 'Rohr', stock: 0, unit: 'm', verkaufspreis: 5 }] as Material[];
  const zeiten = [entry(), entry({ id: 'e2', date: '2025-06-20' })];
  const scheine = [schein({}), schein({ id: 's2', datum: '2025-06-21' })];

  it('nimmt nur Stunden und Scheine bis zum Stichtag', () => {
    const res = assembleInvoice('2025-001', zeiten, INVOICE_DEFAULTS, { scheine, katalog },
      NACHTZEIT_VORGABE, '2025-06-15');
    expect(res.linkedEntries).toEqual(['e1']);
    expect(res.linkedWorkSheets).toEqual(['s1']);
    expect(res.positions.find((p) => p.unit === 'h')?.qty).toBe(9);
    expect(res.positions.find((p) => p.label === 'Rohr')?.qty).toBe(2);
    expect(res.leistung).toEqual({ von: '2025-06-02', bis: '2025-06-02' });
  });

  it('nimmt den Stichtag selbst noch mit', () => {
    const res = assembleInvoice('2025-001', zeiten, INVOICE_DEFAULTS, { scheine, katalog },
      NACHTZEIT_VORGABE, '2025-06-20');
    expect(res.linkedEntries).toEqual(['e1', 'e2']);
    expect(res.linkedWorkSheets).toEqual(['s1']);
  });

  it('ohne Stichtag bleibt alles wie bisher: alles Offene', () => {
    const res = assembleInvoice('2025-001', zeiten, INVOICE_DEFAULTS, { scheine, katalog });
    expect(res.linkedEntries).toEqual(['e1', 'e2']);
    expect(res.linkedWorkSheets).toEqual(['s1', 's2']);
    expect(res.positions.find((p) => p.label === 'Rohr')?.qty).toBe(4);
    expect(res.leistung).toEqual({ von: '2025-06-02', bis: '2025-06-21' });
  });

  it('kennt die Tage aller offenen Belege — ohne Verrechnetes und Entwürfe', () => {
    const daten = offeneBelegDaten('2025-001', [
      ...zeiten,
      entry({ id: 'e3', date: '2025-06-25', isBilled: true }),
      entry({ id: 'e4', date: '2025-06-26', projectNumber: '2025-999' }),
    ], [
      ...scheine,
      schein({ id: 's3', datum: '2025-06-27', status: 'Entwurf' }),
      schein({ id: 's4', datum: '2025-06-28' }),
    ], new Set(['s4']));
    expect(daten.sort()).toEqual(['2025-06-02', '2025-06-02', '2025-06-20', '2025-06-21']);
  });

  it('meldet, was nach dem gewählten Tag in der Vorschau steht und was davor fehlt', () => {
    const daten = ['2025-06-02', '2025-06-20', '2025-06-21'];
    expect(stichtagAbweichung(daten, null, '2025-06-21')).toEqual({ zuViel: 0, fehlt: 0 });
    expect(stichtagAbweichung(daten, null, '2025-06-30')).toEqual({ zuViel: 0, fehlt: 0 });
    expect(stichtagAbweichung(daten, null, '2025-06-15')).toEqual({ zuViel: 2, fehlt: 0 });
    expect(stichtagAbweichung(daten, '2025-06-15', '2025-06-15')).toEqual({ zuViel: 0, fehlt: 0 });
    expect(stichtagAbweichung(daten, '2025-06-15', '2025-06-20')).toEqual({ zuViel: 0, fehlt: 1 });
    // Ein halb getipptes Datum löst nichts aus.
    expect(stichtagAbweichung(daten, null, '2025-06')).toEqual({ zuViel: 0, fehlt: 0 });
  });
});
