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
 *  2. DIE NEUE MECHANIK an einem Prüfregister mit mehreren Stufen — das
 *     echte trägt seit M02a genau eine Unterfähigkeit
 *     (`angebote.online_annahme`): Sie gilt nur mit ihrem Modul, hat ihren
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

  it('die übrigen Module haben keine solche Folge', () => {
    // Die Angebote nennen seit M02a die Folge ihrer Unterfähigkeit — eigener Fall unten.
    for (const m of MODULE.filter((x) => x.id !== 'einsatzplanung' && x.id !== 'angebote')) {
      expect(folgenBeimAbschalten(m.id, undefined), m.id).toEqual([]);
    }
  });

  it('die Angebote und die Annahme per Link sagen, dass offene Links nicht mehr antworten (M02a)', () => {
    /*
      Abgeschaltet antwortet der Server auf einen Link wie auf einen
      unbekannten (`app.modul_aktiv` in `angebot_link_abruf`); gelöscht oder
      widerrufen wird nichts. Wer die Angebote abschaltet, schaltet die
      Unterfähigkeit mit ab und muss das ebenso erfahren.
    */
    const folge = ['Offene Annahme-Links funktionieren nicht mehr: Der Kunde sieht dieselbe Meldung wie bei einem ungültigen Link. Nach dem Wiedereinschalten gelten sie wieder bis zu ihrem Ablaufdatum.'];
    expect(folgenBeimAbschalten('angebote.online_annahme', undefined)).toEqual(folge);
    expect(folgenBeimAbschalten('angebote', undefined)).toEqual(folge);
    // Gegenprobe: ist sie schon aus, geht beim Abschalten der Angebote nichts mehr mit.
    expect(folgenBeimAbschalten('angebote', { 'angebote.online_annahme': false })).toEqual([]);
  });
});

describe('Die erste Unterfähigkeit des echten Registers (M02a)', () => {
  it('angebote.online_annahme: Standard an, nur mit den Angeboten', () => {
    expect(schalter('angebote.online_annahme')).toMatchObject({ name: 'Annahme per Link', standard: true });
    expect(istAn(undefined, 'angebote.online_annahme')).toBe(true);
    expect(istAn({ angebote: false }, 'angebote.online_annahme')).toBe(false);
    expect(istAn({ 'angebote.online_annahme': false }, 'angebote.online_annahme')).toBe(false);
    expect(istAn({ 'angebote.online_annahme': false }, 'angebote')).toBe(true);
  });

  it('jede Unterfähigkeit trägt die Kennung ihres Moduls vor dem Punkt — so liest sie der Server', () => {
    /*
      `app.modul_aktiv` leitet das Modul einer Unterfähigkeit aus ihrer
      Kennung ab (Teil vor dem Punkt), die App aus der Stelle im Register.
      Beides ist dasselbe, solange diese Regel gilt.
    */
    for (const m of MODULE) {
      for (const f of m.unter ?? []) expect(f.id.split('.')[0], f.id).toBe(m.id);
    }
  });
});

/** Ein Prüfregister mit Unterfähigkeiten über zwei Stufen — das echte trägt nur eine, ohne Abhängigkeit. */
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
