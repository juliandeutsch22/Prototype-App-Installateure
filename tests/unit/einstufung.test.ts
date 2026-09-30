import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  kostensatz, lehrjahr, lehrzeitEnde, satzklasse, satzklasseAm, verrechnungssatz,
} from '@/lib/einstufung';
import { assembleInvoice, INVOICE_DEFAULTS } from '@/features/invoices/assemble';
import { rechneBaustelle } from '@/features/costing/nachkalkulation';
import { calcMonthStats } from '@/lib/time';
import { buchungKonflikt } from '@/lib/tagesbuchungen';
import { lehreFehler } from '@/features/users/benutzerEntwurf';
import type { AppUser, InvoiceRates, TimeEntry } from '@/types';

/**
 * LEHRLINGE (Testbericht 30.09.2026, 4.1 Punkte 1–4).
 *
 * Vorher gingen die Stunden eines Lehrlings zum Facharbeitersatz auf die
 * Rechnung, solange niemand bei jeder Buchung „als Helfer“ anhakte, und für
 * die Berufsschule gab es keinen Status. Diese Datei hält fest, was jetzt
 * gilt: Satz aus der Einstufung, Sätze je Stufe ohne feste Vorgabe, und ein
 * Berufsschultag, der das Soll erfüllt und auf keine Rechnung geht.
 */

const MIGRATION = readFileSync('supabase/migrations/20260930400000_lehrlinge.sql', 'utf8');

describe('Das Lehrjahr', () => {
  it('ergibt sich aus Lehrbeginn und Lehrzeit — wie `app.lehrjahr` in der Datenbank', () => {
    const beginn = '2025-09-01';
    expect(lehrjahr(beginn, 36, '2025-09-01')).toBe(1);
    expect(lehrjahr(beginn, 36, '2026-08-31')).toBe(1);
    expect(lehrjahr(beginn, 36, '2026-09-01')).toBe(2);
    expect(lehrjahr(beginn, 36, '2027-09-01')).toBe(3);
    // Nach der Lehrzeit bleibt es beim letzten Lehrjahr, nicht beim vierten.
    expect(lehrjahr(beginn, 36, '2029-01-15')).toBe(3);
    // 3½ Jahre haben vier Lehrjahre, mehr als vier gibt es nicht.
    expect(lehrjahr(beginn, 42, '2028-10-01')).toBe(4);
    expect(lehrjahr(beginn, 48, '2031-10-01')).toBe(4);
    // Ein Schnuppertag vor dem Lehrbeginn ist kein 0. Lehrjahr.
    expect(lehrjahr(beginn, 36, '2025-08-20')).toBe(1);
  });

  it('zählt volle Jahre wie `age()` — auch über den 29. Februar', () => {
    expect(lehrjahr('2024-02-29', 36, '2025-02-28')).toBe(1);
    expect(lehrjahr('2024-02-29', 36, '2025-03-01')).toBe(2);
  });

  it('steht in der Datenbank mit derselben Obergrenze', () => {
    expect(MIGRATION).toContain('greatest(1, least(4, ceil(p_monate / 12.0)::integer))');
    expect(MIGRATION).toContain("extract(year from age(p_tag, p_beginn))::integer + 1");
    expect(MIGRATION).toContain('lehrzeit_monate between 24 and 48');
  });

  it('nennt das Ende der Lehrzeit', () => {
    expect(lehrzeitEnde('2025-09-01', 36)).toBe('2028-08-31');
    expect(lehrzeitEnde('2025-09-01', 42)).toBe('2029-02-28');
  });
});

describe('Der Satz einer Buchung', () => {
  it('folgt der Einstufung; ohne Einstufung Facharbeiter wie bisher', () => {
    expect(satzklasseAm({}, '2026-10-01')).toBe('facharbeiter');
    expect(satzklasseAm({ einstufung: 'obermonteur' }, '2026-10-01')).toBe('obermonteur');
    expect(satzklasseAm({ einstufung: 'helfer' }, '2026-10-01')).toBe('helfer');
    expect(
      satzklasseAm({ einstufung: 'lehrling', lehrbeginn: '2025-09-01', lehrzeitMonate: 36 }, '2026-10-01'),
    ).toBe('lj2');
  });

  it('der Helfer-Haken geht vor — er bleibt für Ausnahmen', () => {
    expect(satzklasse({ satz: 'obermonteur', isHelper: true })).toBe('helfer');
    expect(satzklasse({ satz: 'lj3' })).toBe('lj3');
    expect(satzklasse({})).toBe('facharbeiter');
  });

  it('die Datenbank kennt dieselben Sätze', () => {
    expect(MIGRATION).toContain("satz in ('facharbeiter', 'obermonteur', 'helfer', 'lj1', 'lj2', 'lj3', 'lj4')");
  });
});

describe('Sätze je Stufe — ohne feste Vorgabe', () => {
  const rates: InvoiceRates = { ...INVOICE_DEFAULTS, fach: 70, helper: 48 };

  it('leer heisst beim Obermonteur Facharbeiter-, beim Lehrling Helfersatz', () => {
    expect(verrechnungssatz('obermonteur', rates)).toBe(70);
    expect(verrechnungssatz('lj1', rates)).toBe(48);
  });

  it('ein eingetragener Satz gilt, auch 0', () => {
    const mit = { ...rates, stufen: { obermonteur: 78, lj1: 0, lj3: 40 } };
    expect(verrechnungssatz('obermonteur', mit)).toBe(78);
    expect(verrechnungssatz('lj1', mit)).toBe(0);
    expect(verrechnungssatz('lj3', mit)).toBe(40);
    expect(kostensatz('lj2', { fach: 42, helper: 30 })).toBe(30);
  });
});

function buchung(teil: Partial<TimeEntry> & { id: string }): TimeEntry & { id: string } {
  return {
    companyId: 'perl',
    date: '2026-10-05',
    status: 'Anwesend',
    startTime: '07:00',
    endTime: '11:00',
    breakDuration: 0,
    userId: 'u1',
    userName: 'Lena Lehrling',
    projectNumber: 'PR-2026-0001',
    ...teil,
  };
}

describe('Die Rechnung trennt nach Satz', () => {
  const rates: InvoiceRates = {
    ...INVOICE_DEFAULTS, fach: 70, helper: 48, stufen: { lj1: 0, lj2: 30 },
  };

  it('Lehrlingsstunden bekommen eine eigene Zeile zum Satz ihres Lehrjahrs', () => {
    const r = assembleInvoice('PR-2026-0001', [
      buchung({ id: 'f', userName: 'Franz Fach' }),
      buchung({ id: 'l', satz: 'lj2' }),
    ], rates);
    expect(r.positions.map((p) => [p.label, p.qty, p.unitPrice])).toEqual([
      ['Facharbeiterstunden', 4, 70],
      ['Lehrlingsstunden (2. Lehrjahr)', 4, 30],
    ]);
  });

  it('ein Lehrjahr zum Satz 0 steht nicht auf der Rechnung — die Buchung wird trotzdem verknüpft', () => {
    const r = assembleInvoice('PR-2026-0001', [buchung({ id: 'l1', satz: 'lj1' })], rates);
    expect(r.positions).toEqual([]);
    expect(r.linkedEntries).toEqual(['l1']);
  });

  it('ohne eigenen Satz zum Helfersatz, und der Haken geht vor', () => {
    const r = assembleInvoice('PR-2026-0001', [
      buchung({ id: 'l3', satz: 'lj3' }),
      buchung({ id: 'o', satz: 'obermonteur', isHelper: true, userName: 'Otto Ober' }),
    ], rates);
    expect(r.positions.map((p) => [p.label, p.qty, p.unitPrice])).toEqual([
      ['Helferstunden', 4, 48],
      ['Lehrlingsstunden (3. Lehrjahr)', 4, 48],
    ]);
  });

  it('ein Berufsschultag geht auf keine Rechnung', () => {
    const r = assembleInvoice('PR-2026-0001', [
      buchung({ id: 'b', status: 'Berufsschule', startTime: undefined, endTime: undefined }),
    ], rates);
    expect(r.positions).toEqual([]);
    expect(r.linkedEntries).toEqual([]);
  });
});

describe('Die Nachkalkulation rechnet je Satz', () => {
  it('Lehrlingsstunden zu ihrem Kostensatz, getrennt ausgewiesen', () => {
    const k = rechneBaustelle('PR-2026-0001', 'Kunde', [
      buchung({ id: 'f', userName: 'Franz Fach' }),
      buchung({ id: 'l', satz: 'lj1' }),
    ], [], undefined, { fach: 40, helper: 28, stufen: { lj1: 12 } });
    expect(k.fachStunden).toBe(4);
    expect(k.lehrlingStunden).toBe(4);
    expect(k.helferStunden).toBe(0);
    expect(k.personalkosten).toBe(4 * 40 + 4 * 12);
  });
});

describe('Berufsschule im Zeitkonto', () => {
  const lehrling: AppUser = {
    id: 'u1', uid: 'u1', companyId: 'perl', name: 'Lena Lehrling', email: 'l@perl.at',
    role: 'Mitarbeiter', weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5],
    appStartDate: '2025-09-01', einstufung: 'lehrling', lehrbeginn: '2025-09-01', lehrzeitMonate: 36,
  };

  it('erfüllt das Tagessoll und zählt als eigene Zeile', () => {
    // Oktober 2025: 23 Arbeitstage, der 26.10. ist ein Sonntag.
    const tage = ['2025-10-06', '2025-10-13'];
    const eintraege = tage.map((d, i) => buchung({
      id: `b${i}`, date: d, status: 'Berufsschule', startTime: undefined, endTime: undefined,
    }));
    const ohne = calcMonthStats(lehrling, [], [], 2025, 9, true);
    const mit = calcMonthStats(lehrling, eintraege, eintraege, 2025, 9, true);
    expect(mit.berufsschuleDays).toBe(2);
    expect(mit.berufsschuleMin).toBe(2 * 8 * 60);
    expect(mit.sollMin).toBe(ohne.sollMin - 2 * 8 * 60);
    expect(mit.istMin).toBe(0);
  });

  it('gilt für den ganzen Tag: daneben lässt sich keine Arbeitszeit buchen', () => {
    const schule = { status: 'Berufsschule' as const };
    expect(buchungKonflikt({ status: 'Anwesend', startTime: '07:00', endTime: '11:00' }, [schule])).toMatch(/Berufsschule/);
    expect(buchungKonflikt(schule, [{ status: 'Anwesend', startTime: '07:00', endTime: '11:00' }])).not.toBeNull();
  });
});

describe('Die Maske prüft Lehrbeginn und Lehrzeit', () => {
  it('beim Lehrling Pflicht, sonst gleichgültig', () => {
    expect(lehreFehler({ einstufung: 'helfer' })).toBeNull();
    expect(lehreFehler({ einstufung: 'lehrling', lehrbeginn: '', lehrzeitMonate: '36' })).toMatch(/Lehrbeginn/);
    expect(lehreFehler({ einstufung: 'lehrling', lehrbeginn: '2025-09-01', lehrzeitMonate: '60' })).toMatch(/Lehrzeit/);
    expect(lehreFehler({ einstufung: 'lehrling', lehrbeginn: '2025-09-01', lehrzeitMonate: '42' })).toBeNull();
  });
});
