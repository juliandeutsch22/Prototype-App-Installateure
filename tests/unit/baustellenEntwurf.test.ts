/**
 * Der Entwurf der Baustellen-Stammdaten.
 *
 * WAS HIER AUF DEM SPIEL STEHT. An `gleich` hängt der Speichern-Balken der
 * Akte. Meldet er zu oft eine Änderung, steht er ständig da und niemand
 * glaubt ihm mehr; meldet er zu selten eine, verschwindet eine echte Eingabe
 * beim nächsten Neuladen — und zwar lautlos.
 */
import { describe, it, expect } from 'vitest';
import { alsEntwurf, gleich } from '@/features/projects/baustellenEntwurf';
import type { Project } from '@/types';

const BAUSTELLE: Project = {
  id: 'b1',
  companyId: 'perl',
  projectNumber: '2026-101',
  customerId: 'k1',
  customerName: 'Hausverwaltung Nord',
  address: 'Ringstraße 3',
  status: 'Aktiv',
  estimatedHours: 40,
  assignedEmployees: ['u1', 'u2'],
  projectManagers: ['u9'],
};

describe('Aus einer Baustelle wird ein Entwurf', () => {
  it('nimmt die Felder mit, die es gibt', () => {
    const e = alsEntwurf(BAUSTELLE);
    expect(e.projectNumber).toBe('2026-101');
    expect(e.customerId).toBe('k1');
    expect(e.estimatedHours).toBe('40');
    expect(e.assignedEmployees).toEqual(['u1', 'u2']);
  });

  it('macht aus „kein Budget" eine leere Eingabe und nicht eine Null', () => {
    /*
      Der Unterschied ist keine Kosmetik: `0` hiesse „null Stunden
      kalkuliert" und schaltete die Ampel der Projektauswertung scharf.
      Nicht gesetzt heisst, dass es keine Kalkulation gibt.
    */
    const { estimatedHours } = alsEntwurf({ ...BAUSTELLE, estimatedHours: undefined });
    expect(estimatedHours).toBe('');
  });

  it('behält ein Budget von wirklich null Stunden', () => {
    // Die Gegenprobe: eine Prüfung auf `if (p.estimatedHours)` verschluckte
    // die 0 — und die ist eine Aussage, keine Lücke.
    expect(alsEntwurf({ ...BAUSTELLE, estimatedHours: 0 }).estimatedHours).toBe('0');
  });

  it('macht aus fehlenden Listen leere Listen', () => {
    const e = alsEntwurf({ ...BAUSTELLE, assignedEmployees: undefined, projectManagers: undefined });
    expect(e.assignedEmployees).toEqual([]);
    expect(e.projectManagers).toEqual([]);
  });

  it('macht aus einer nicht festgelegten Abrechnung eine leere Wahl', () => {
    expect(alsEntwurf({ ...BAUSTELLE, billingMode: undefined }).billingMode).toBe('');
    expect(alsEntwurf({ ...BAUSTELLE, billingMode: 'Pauschal' }).billingMode).toBe('Pauschal');
  });
});

describe('Ob sich etwas geändert hat', () => {
  it('sagt nein, wenn nichts angefasst wurde', () => {
    expect(gleich(alsEntwurf(BAUSTELLE), alsEntwurf(BAUSTELLE))).toBe(true);
  });

  it('sagt ja bei jedem einzelnen Feld', () => {
    const a = alsEntwurf(BAUSTELLE);
    expect(gleich(a, { ...a, projectNumber: '2026-102' })).toBe(false);
    expect(gleich(a, { ...a, customerId: 'k2' })).toBe(false);
    expect(gleich(a, { ...a, address: 'Ringstraße 4' })).toBe(false);
    expect(gleich(a, { ...a, status: 'Pausiert' })).toBe(false);
    expect(gleich(a, { ...a, billingMode: 'Pauschal' })).toBe(false);
    expect(gleich(a, { ...a, estimatedHours: '41' })).toBe(false);
    expect(gleich(a, { ...a, description: 'Neu' })).toBe(false);
    expect(gleich(a, { ...a, startDate: '2026-01-01' })).toBe(false);
    expect(gleich(a, { ...a, endDate: '2026-02-01' })).toBe(false);
    expect(gleich(a, { ...a, contactName: 'Frau Huber' })).toBe(false);
    expect(gleich(a, { ...a, contactPhone: '+43 1 234' })).toBe(false);
  });

  it('sagt nein, wenn dieselben Leute in anderer Reihenfolge stehen', () => {
    /*
      DER GRUND FÜR DEN MENGENVERGLEICH. Wer einen Monteur abwählt und
      wieder anwählt, hat nichts geändert — er steht danach aber am Ende der
      Liste. Ein Vergleich nach Reihenfolge meldete eine Änderung, und der
      Speichern-Balken bliebe stehen, ohne dass es etwas zu speichern gibt.
    */
    const a = alsEntwurf(BAUSTELLE);
    expect(gleich(a, { ...a, assignedEmployees: ['u2', 'u1'] })).toBe(true);
    expect(gleich(a, { ...a, projectManagers: ['u9'] })).toBe(true);
  });

  it('sagt ja, sobald jemand dazukommt oder wegfällt', () => {
    // Die Gegenprobe zum Mengenvergleich: er darf nicht so grosszügig sein,
    // dass er eine echte Umbesetzung verschluckt.
    const a = alsEntwurf(BAUSTELLE);
    expect(gleich(a, { ...a, assignedEmployees: ['u1'] })).toBe(false);
    expect(gleich(a, { ...a, assignedEmployees: ['u1', 'u2', 'u3'] })).toBe(false);
    expect(gleich(a, { ...a, assignedEmployees: ['u1', 'u3'] })).toBe(false);
    expect(gleich(a, { ...a, projectManagers: [] })).toBe(false);
  });

  it('vergleicht nicht über die Schlüsselreihenfolge', () => {
    /*
      Ein Entwurf, der dieselben Werte in anderer Reihenfolge trägt, sagt
      dasselbe. Über `JSON.stringify` verglichen gälte er als geändert.
    */
    const a = alsEntwurf(BAUSTELLE);
    const umsortiert = Object.fromEntries(
      Object.entries(a).reverse(),
    ) as typeof a;
    expect(gleich(a, umsortiert)).toBe(true);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(umsortiert));
  });
});
