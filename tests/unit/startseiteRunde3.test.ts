import { describe, it, expect } from 'vitest';
import type { Invoice, Project, Wartung } from '@/types';
import { tageWort, tageWortDativ } from '@/lib/time';
import { endeUeberschritten, unterMindestmenge, wartungenOhneBaustelle } from '@/features/dashboard/start/regeln';
import { startseite, type Umfeld } from '@/features/dashboard/start/aufbau';

/**
 * Texte der Startseite aus dem Testbericht Runde 3 (06.10.2026): G2 (Dativ
 * nach „seit/in/von“), G3 (fehlende Menge statt „-1 Stk frei“), G6 („Dringend“
 * statt eines zweiten „Überfällig“).
 */

const HEUTE = '2026-10-06';
const JETZT = Date.parse('2026-10-06T10:00:00+02:00');

describe('Tage nach einer Präposition (G2)', () => {
  it('beugt im Dativ: seit 5 Tagen, von 25 Tagen — eins bleibt „1 Tag“', () => {
    expect(tageWortDativ(5)).toBe('5 Tagen');
    expect(tageWortDativ(25)).toBe('25 Tagen');
    expect(tageWortDativ(0)).toBe('0 Tagen');
    expect(tageWortDativ(20.5)).toBe('20,5 Tagen');
    expect(tageWortDativ(1)).toBe('1 Tag');
  });

  it('lässt den Nominativ dort, wo keine Präposition davorsteht', () => {
    expect(tageWort(5)).toBe('5 Tage');
    expect(tageWort(1)).toBe('1 Tag');
  });

  it('„Ende überschritten“ sagt „seit 5 Tagen“', () => {
    const p = { id: 'p1', projectNumber: 'PR-187', status: 'Aktiv', endDate: '2026-10-01', customerName: 'Max Musterkunde' } as Project;
    const a = endeUeberschritten([p], HEUTE)!;
    expect(a.zeilen[0].status).toEqual({ text: 'seit 5 Tagen', ton: 'fehl' });
  });

  it('eine Wartung in mehr als einer Woche steht „in 12 Tagen“ an', () => {
    const w = { id: 'w', companyId: 'b', customerId: 'k', customerName: 'Koller', anlage: 'Therme',
      intervallMonate: 12, faelligAm: '2026-10-18', aktiv: true } as Wartung;
    const a = wartungenOhneBaustelle([w], HEUTE)!;
    expect(a.zeilen[0].status?.text).toBe('in 12 Tagen');
  });

  it('Resturlaub „von 25 Tagen“, der Wert selbst bleibt „20 Tage“', () => {
    const umfeld: Umfeld = { rolle: 'monteur', heute: HEUTE, jetzt: JETZT, darf: () => true, urlaubEntscheiden: false };
    const s = startseite({ resturlaub: { rest: 20, anspruch: 25 } }, umfeld);
    expect(s.kennzahlen.find((k) => k.key === 'urlaub')).toMatchObject({ wert: '20 Tage', zusatz: 'von 25 Tagen' });
  });
});

describe('Unter Mindestmenge (G3)', () => {
  it('nennt eine fehlende Menge „1 Stk fehlt“ statt „-1 Stk frei“', () => {
    const a = unterMindestmenge([{ id: 'a', name: 'Pressfitting', unit: 'Stk', frei: -1, mindestmenge: 5 }])!;
    expect(a.zeilen[0].detail).toBe('1 Stk fehlt · Mindestmenge 5');
    expect(a.zeilen[0].detail).not.toMatch(/-\d/);
  });

  it('lässt null und positive Mengen als „frei“ stehen', () => {
    const a = unterMindestmenge([
      { id: 'b', name: 'Bogen', unit: 'Stk', frei: 0, mindestmenge: 5 },
      { id: 'c', name: 'Rohr', unit: 'm', frei: 2.5, mindestmenge: 10 },
    ])!;
    expect(a.zeilen.map((z) => z.detail)).toEqual(['0 Stk frei · Mindestmenge 5', '2,5 m frei · Mindestmenge 10']);
  });
});

describe('Handlungsbedarf der Leitung (G6)', () => {
  const umfeld: Umfeld = { rolle: 'leitung', heute: HEUTE, jetzt: JETZT, darf: () => true, urlaubEntscheiden: true };
  const ende = { id: 'p1', projectNumber: 'PR-187', status: 'Aktiv', endDate: '2026-10-01', customerName: 'Max' } as Project;
  const rechnung = { id: 'RE-1', invoiceNumber: 'RE-1', customerName: 'Kunde', paymentStatus: 'Offen', totalBrutto: 100,
    invoiceDate: '2026-08-01', dueDate: '2026-08-15', mahnstufe: 0 } as Invoice & { id: string };

  it('heißt der dringliche Abschnitt „Dringend“ — nicht wie die Kennzahl „Überfällig“', () => {
    const s = startseite({ projekte: [ende], unbezahlt: [rechnung] }, umfeld);
    const titel = s.abschnitte.map((a) => a.titel);
    expect(titel[0]).toBe('Dringend');
    const kennzahlen = s.kennzahlen.map((k) => k.label);
    for (const t of titel) expect(kennzahlen).not.toContain(t);
  });

  it('die Baustelle über dem Endtermin steht darin als „Ende überschritten“', () => {
    const s = startseite({ projekte: [ende] }, umfeld);
    const zeile = s.abschnitte[0].zeilen.find((z) => z.key === 'ende');
    expect(zeile?.status).toEqual({ text: 'Ende überschritten', ton: 'fehl' });
  });
});
