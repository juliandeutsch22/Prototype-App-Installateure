import { describe, it, expect } from 'vitest';
import {
  MODULE,
  aktiveModule,
  aktiveSchalter,
  istAn,
  zieheMit,
  folgenBeimAbschalten,
  schalter,
  type Modul,
} from '@/lib/module';
import { navForRole } from '@/app/navigation';

/**
 * Das Modulregister mit Unterfähigkeiten (SHK-Ausbau M01a, N02, E52).
 *
 * Zwei Dinge prüft diese Datei:
 *
 *  1. ERHALTUNG. Das Register ändert nichts an dem, was ein Betrieb heute
 *     sieht: dieselben neun Module mit denselben Kennungen und Standards,
 *     jede Rolle mit derselben Navigation. Diese Prüfungen sind vor und nach
 *     der Änderung grün — genau das sollen sie zeigen.
 *  2. DIE NEUE MECHANIK an einem Prüfregister, weil das echte heute noch
 *     keine Unterfähigkeit trägt: Sie gilt nur mit ihrem Modul, hat ihren
 *     eigenen Standard, geht mit dem Modul aus und kommt mit ihm zurück.
 */

describe('Erhaltung: was ein Betrieb heute sieht, bleibt', () => {
  it('dieselben neun Module mit denselben Kennungen, Standards und Abhängigkeiten', () => {
    expect(MODULE.map((m) => [m.id, m.standard, m.abhaengigVon ?? []])).toEqual([
      ['einsatzplanung', true, []],
      ['material', true, []],
      ['urlaub', true, []],
      ['scheine', true, []],
      ['angebote', true, []],
      ['rechnungen', true, []],
      ['nachkalkulation', true, ['rechnungen']],
      ['wartung', true, []],
      ['zeitkonten', true, []],
    ]);
  });

  it('jede Rolle hat dieselbe Navigation wie vor dem Register', () => {
    const vorher: Record<string, string[]> = {
      Mitarbeiter: ['/', '/time', '/material', '/my-schedule', '/my-projects', '/vacations', '/worksheets', '/settings'],
      Verwaltung: ['/', '/time', '/material', '/vacations', '/worksheets', '/customers', '/wartungen', '/anforderungen', '/lager', '/settings'],
      Buchhaltung: ['/', '/time', '/vacations', '/worksheets', '/quotes', '/customers', '/settings', '/invoices', '/accounting'],
      Projektleiter: ['/', '/time', '/material', '/vacations', '/worksheets', '/quotes', '/customers', '/wartungen', '/anforderungen', '/lager', '/admin-projects', '/assignments', '/settings'],
      Geschäftsführung: ['/', '/time', '/material', '/vacations', '/worksheets', '/quotes', '/customers', '/wartungen', '/anforderungen', '/lager', '/admin-projects', '/assignments', '/user-mgmt', '/settings', '/costing', '/invoices', '/accounting'],
      Administrator: ['/', '/time', '/material', '/vacations', '/worksheets', '/quotes', '/customers', '/wartungen', '/anforderungen', '/lager', '/admin-projects', '/assignments', '/user-mgmt', '/settings', '/costing', '/invoices', '/accounting'],
    };
    for (const [rolle, pfade] of Object.entries(vorher)) {
      expect(navForRole(rolle as never, undefined).map((n) => n.path), rolle).toEqual(pfade);
    }
  });

  it('aktiveModule liefert weiter nur Module — keine Unterfähigkeit landet in der Navigation', () => {
    const an = aktiveModule({ 'material.probe': true });
    expect([...an].every((id) => !id.includes('.'))).toBe(true);
    expect(an.size).toBe(9);
  });
});

describe('Folgen beim Abschalten — was sich nicht zurückholen lässt', () => {
  it('die Einsatzplanung sagt, dass die Kalender-Abos des ganzen Plans enden', () => {
    /*
      Die Seite „Module“ versprach „vorhandene Daten bleiben unangetastet“.
      Der Server beendet beim Abschalten der Einsatzplanung aber die Abos des
      Gesamtplans (Trigger `companies_gesamtplan_abo`). Das muss VORHER
      dastehen.
    */
    expect(folgenBeimAbschalten('einsatzplanung', undefined)).toEqual([
      'Die Kalender-Abos des ganzen Einsatzplans enden. Nach dem Wiedereinschalten richtet sie jeder neu ein.',
    ]);
  });

  it('die übrigen Module haben keine solche Folge — außer Material mit seinen Lagerorten (M04a, bewusst nachgezogen)', () => {
    for (const m of MODULE.filter((x) => x.id !== 'einsatzplanung' && x.id !== 'material')) {
      expect(folgenBeimAbschalten(m.id, undefined), m.id).toEqual([]);
    }
  });

  it('Material und die Lagerorte sagen vorher, dass Ware an weiteren Orten unsichtbar, aber nicht weg ist (M04a)', () => {
    const satz = expect.stringMatching(/nicht mehr zu sehen, aber nicht weg/);
    expect(folgenBeimAbschalten('material.lagerorte_fahrzeuglager', undefined)).toEqual([satz]);
    // Das Modul nimmt seine Unterfähigkeit mit — und damit ihre Folge.
    expect(folgenBeimAbschalten('material', undefined)).toEqual([satz]);
    // Schon abgeschaltet: keine Folge mehr beim Abschalten des Moduls.
    expect(folgenBeimAbschalten('material', { 'material.lagerorte_fahrzeuglager': false })).toEqual([]);
  });
});

/** Ein Prüfregister mit Unterfähigkeiten — das echte trägt seit M04a genau eine (siehe unten). */
const PRUEF: Modul[] = [
  {
    id: 'material',
    name: 'Material und Lager',
    zweck: 'Material.',
    standard: true,
    betrifft: ['Lager'],
    unter: [
      { id: 'material.lagerorte', name: 'Lagerorte', zweck: 'Mehrere Orte.', standard: true, betrifft: ['Lagerorte'], folgen: ['Umlagerungen enden.'] },
      { id: 'material.scan', name: 'Scannen', zweck: 'Scan.', standard: false, betrifft: ['Scan'] },
    ],
  },
  {
    id: 'einsatzplanung',
    name: 'Einsatzplanung',
    zweck: 'Plan.',
    standard: true,
    betrifft: ['Plan'],
    unter: [
      {
        id: 'einsatzplanung.materialhinweise',
        name: 'Materialhinweise',
        zweck: 'Hinweise.',
        standard: true,
        abhaengigVon: ['material.lagerorte'],
        betrifft: ['Hinweise'],
      },
    ],
  },
];

describe('Die erste echte Unterfähigkeit (M04a)', () => {
  it('„Lagerorte und Fahrzeuglager“ hängt unter Material, ist ab Werk an und geht mit dem Modul aus', () => {
    expect(schalter('material.lagerorte_fahrzeuglager')?.name).toBe('Lagerorte und Fahrzeuglager');
    expect(istAn(undefined, 'material.lagerorte_fahrzeuglager')).toBe(true);
    expect(istAn({ material: false }, 'material.lagerorte_fahrzeuglager')).toBe(false);
    expect(istAn({ 'material.lagerorte_fahrzeuglager': false }, 'material')).toBe(true);
  });
});

describe('Unterfähigkeiten', () => {
  it('gelten mit ihrem eigenen Standard, solange nichts festgelegt ist', () => {
    const an = aktiveSchalter(undefined, PRUEF);
    expect(an.has('material.lagerorte')).toBe(true);
    expect(an.has('material.scan')).toBe(false);
  });

  it('folgen der Festlegung unter ihrer Kennung mit Punkt', () => {
    expect(istAn({ 'material.scan': true }, 'material.scan', PRUEF)).toBe(true);
    expect(istAn({ 'material.lagerorte': false }, 'material.lagerorte', PRUEF)).toBe(false);
  });

  it('sind aus, wenn ihr Modul aus ist — egal was für sie festgelegt ist', () => {
    const an = aktiveSchalter({ material: false, 'material.scan': true }, PRUEF);
    expect(an.has('material.scan')).toBe(false);
    expect(an.has('material.lagerorte')).toBe(false);
  });

  it('kommen mit dem Modul so zurück, wie sie festgelegt waren', () => {
    const festlegung = { 'material.scan': true, 'material.lagerorte': false };
    expect(aktiveSchalter({ ...festlegung, material: false }, PRUEF).has('material.scan')).toBe(false);
    const wieder = aktiveSchalter({ ...festlegung, material: true }, PRUEF);
    expect(wieder.has('material.scan')).toBe(true);
    expect(wieder.has('material.lagerorte')).toBe(false);
  });

  it('ziehen eine Abhängigkeit über Modulgrenzen nach (zwei Stufen tief)', () => {
    // Materialhinweise brauchen Lagerorte, Lagerorte brauchen Material.
    const an = aktiveSchalter({ material: false }, PRUEF);
    expect(an.has('einsatzplanung')).toBe(true);
    expect(an.has('einsatzplanung.materialhinweise')).toBe(false);
  });

  it('die Rückfrage nennt fremde Teile, die mitgehen, nicht die eigenen', () => {
    expect(zieheMit('material', undefined, PRUEF)).toEqual(['einsatzplanung.materialhinweise']);
    expect(zieheMit('material.lagerorte', undefined, PRUEF)).toEqual(['einsatzplanung.materialhinweise']);
  });

  it('nennt die Folgen eigener Teile, die an sind — und nicht die von Teilen, die schon aus sind', () => {
    expect(folgenBeimAbschalten('material', undefined, PRUEF)).toEqual(['Umlagerungen enden.']);
    expect(folgenBeimAbschalten('material', { 'material.lagerorte': false }, PRUEF)).toEqual([]);
  });

  it('lassen sich nachschlagen wie Module', () => {
    expect(schalter('material.scan', PRUEF)?.name).toBe('Scannen');
    expect(schalter('material', PRUEF)?.name).toBe('Material und Lager');
    expect(schalter('material.gibtsnicht', PRUEF)).toBeUndefined();
  });
});
