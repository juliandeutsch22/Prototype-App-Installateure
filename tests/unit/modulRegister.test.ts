import { describe, it, expect } from 'vitest';
import {
  MODULE,
  KERN,
  istKern,
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
 *  2. DIE NEUE MECHANIK an einem Prüfregister mit mehreren Stufen —
 *     unabhängig davon, was das echte trägt (seit M02a
 *     `angebote.online_annahme`, seit M03a drei unter „Material“, geprüft
 *     unten): Sie gilt nur mit ihrem Modul, hat ihren
 *     eigenen Standard, geht mit dem Modul aus und kommt mit ihm zurück.
 */

describe('Erhaltung: was ein Betrieb heute sieht, bleibt', () => {
  it('bestehende Module bleiben, Zeiterfassung wird mit demselben Standard schaltbar', () => {
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
      ['zeiterfassung', true, []],
    ]);
  });

  it('jede Rolle hat dieselbe Navigation wie vor dem Register — ohne die seither gebauten Unterfähigkeiten', () => {
    const vorher: Record<string, string[]> = {
      Mitarbeiter: ['/', '/time', '/material', '/my-schedule', '/my-projects', '/vacations', '/worksheets', '/settings'],
      Verwaltung: ['/', '/time', '/material', '/vacations', '/worksheets', '/customers', '/wartungen', '/anforderungen', '/lager', '/settings'],
      Buchhaltung: ['/', '/time', '/vacations', '/worksheets', '/quotes', '/customers', '/settings', '/invoices', '/accounting'],
      Projektleiter: ['/', '/time', '/material', '/vacations', '/worksheets', '/quotes', '/customers', '/wartungen', '/anforderungen', '/lager', '/admin-projects', '/assignments', '/settings'],
      Geschäftsführung: ['/', '/time', '/material', '/vacations', '/worksheets', '/quotes', '/customers', '/wartungen', '/anforderungen', '/lager', '/admin-projects', '/assignments', '/user-mgmt', '/settings', '/costing', '/invoices', '/accounting'],
      Administrator: ['/', '/time', '/material', '/vacations', '/worksheets', '/quotes', '/customers', '/wartungen', '/anforderungen', '/lager', '/admin-projects', '/assignments', '/user-mgmt', '/settings', '/costing', '/invoices', '/accounting'],
    };
    /*
      Seither gebaut, je schaltbar (bewusst nachgezogen): der Auftragseingang
      (M02b). Ohne ihn steht jede Navigation da wie vor dem Register; mit
      ihm kommt genau sein Eintrag dazu, für jede Rolle, die Kunden liest.
    */
    const ohneNeue = { 'baustellen.auftragseingang': false };
    for (const [rolle, pfade] of Object.entries(vorher)) {
      expect(navForRole(rolle as never, ohneNeue).map((n) => n.path), rolle).toEqual(pfade);
      const mit = navForRole(rolle as never, undefined).map((n) => n.path);
      expect(mit.filter((p) => !pfade.includes(p)), rolle).toEqual(rolle === 'Mitarbeiter' ? [] : ['/eingaenge']);
      expect(mit.filter((p) => p !== '/eingaenge'), rolle).toEqual(pfade);
    }
  });

  it('aktiveModule liefert weiter nur Module — keine Unterfähigkeit landet in der Navigation', () => {
    const an = aktiveModule({ 'material.probe': true });
    expect([...an].every((id) => !id.includes('.'))).toBe(true);
    expect(an.size).toBe(10);
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
    // Die Angebote nennen seit M02a die Folge ihrer Unterfähigkeit, Material seit M04a die der Lagerorte — eigene Fälle unten.
    for (const m of MODULE.filter((x) => x.id !== 'einsatzplanung' && x.id !== 'angebote' && x.id !== 'material' && x.id !== 'zeiterfassung')) {
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

/*
  DER KERN MIT SEINEN TEILEN (M02b): Kunden und Baustellen sind nicht
  abschaltbar (E51, V1), ihre Unterfähigkeiten schon — die erste ist der
  Auftragseingang. Der Kern zählt nicht zu den neun Modulen.
*/
describe('Der Kern (M02b)', () => {
  it('Baustellen, Kunden und (seit M06b) Zeiterfassung — immer an, auch wenn jemand sie in die Festlegung schreibt', () => {
    expect(KERN.map((k) => k.id)).toEqual(['baustellen', 'kunden']);
    for (const id of ['baustellen', 'kunden'] as const) {
      expect(istKern(id)).toBe(true);
      expect(istAn(undefined, id)).toBe(true);
      expect(istAn({ [id]: false }, id)).toBe(true);
      // Nichts geht mit, und die Rückfrage hat nichts zu sagen.
      expect(zieheMit(id, undefined)).toEqual([]);
    }
    expect(istKern('angebote')).toBe(false);
  });

  it('zählt nicht zu den Modulen: „Eingeschaltet: N von 9“ und die Navigation bleiben', () => {
    expect(aktiveModule(undefined).size).toBe(10);
    expect([...aktiveModule(undefined)]).not.toContain('baustellen');
    expect(MODULE.map((m) => m.id)).not.toContain('baustellen');
  });

  it('baustellen.auftragseingang: Standard an, einzeln abschaltbar, ohne Folge, die nicht zurückkommt', () => {
    expect(schalter('baustellen.auftragseingang')).toMatchObject({ name: 'Auftragseingang', standard: true });
    expect(istAn(undefined, 'baustellen.auftragseingang')).toBe(true);
    expect(istAn({ 'baustellen.auftragseingang': false }, 'baustellen.auftragseingang')).toBe(false);
    // Die Festlegung des Kerns selbst schaltet seine Teile nicht ab — es gibt sie nicht.
    expect(istAn({ baustellen: false }, 'baustellen.auftragseingang')).toBe(true);
    expect(folgenBeimAbschalten('baustellen.auftragseingang', undefined)).toEqual([]);
    expect(schalter('baustellen')?.name).toBe('Baustellen');
  });

  /*
    FREIE ZEITFELDER (M06b, N01): Teil der Zeiterfassung, Standard an, einzeln
    abschaltbar, ohne Folge, die nicht zurückkommt (die Werte bleiben).
  */
  it('zeiterfassung.freie_zeitfelder: Standard an, einzeln abschaltbar, Teil der Zeiterfassung', () => {
    expect(schalter('zeiterfassung.freie_zeitfelder')).toMatchObject({ name: 'Freie Zeitfelder', standard: true });
    expect(istAn(undefined, 'zeiterfassung.freie_zeitfelder')).toBe(true);
    expect(istAn({ 'zeiterfassung.freie_zeitfelder': false }, 'zeiterfassung.freie_zeitfelder')).toBe(false);
    expect(istAn({ zeiterfassung: false }, 'zeiterfassung.freie_zeitfelder')).toBe(false);
    expect(folgenBeimAbschalten('zeiterfassung.freie_zeitfelder', undefined)).toEqual([]);
    expect(aktiveModule(undefined).size).toBe(10);
  });

  it('jede Unterfähigkeit des Kerns trägt dessen Kennung vor dem Punkt — so liest sie der Server', () => {
    for (const k of KERN) {
      for (const f of k.unter) expect(f.id.split('.')[0], f.id).toBe(k.id);
    }
  });
});

/** Ein Prüfregister mit Unterfähigkeiten über zwei Stufen — unabhängig davon, was das echte gerade trägt. */
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

describe('Lagerorte und Fahrzeuglager (M04a)', () => {
  it('„Lagerorte und Fahrzeuglager“ hängt unter Material, ist ab Werk an und geht mit dem Modul aus', () => {
    expect(schalter('material.lagerorte_fahrzeuglager')?.name).toBe('Lagerorte und Fahrzeuglager');
    expect(istAn(undefined, 'material.lagerorte_fahrzeuglager')).toBe(true);
    expect(istAn({ material: false }, 'material.lagerorte_fahrzeuglager')).toBe(false);
    expect(istAn({ 'material.lagerorte_fahrzeuglager': false }, 'material')).toBe(true);
  });
});

describe('Materialbereitschaft und Bestellvorschläge (M04b)', () => {
  it('hängen unter Material, sind ab Werk an, gehen mit dem Modul aus und einzeln aus', () => {
    for (const t of ['material.materialbereitschaft', 'material.bestellvorschlaege'] as const) {
      expect(istAn(undefined, t)).toBe(true);
      expect(istAn({ material: false }, t)).toBe(false);
      expect(istAn({ [t]: false }, t)).toBe(false);
      expect(istAn({ [t]: false }, 'material')).toBe(true);
      // Abschalten nimmt nur Ansichten weg — keine Folge über das Verschwinden hinaus.
      expect(folgenBeimAbschalten(t, undefined)).toEqual([]);
    }
    expect(schalter('material.materialbereitschaft')?.name).toBe('Materialbereitschaft');
    expect(schalter('material.bestellvorschlaege')?.name).toBe('Bestellvorschläge');
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

/*
  M03a: DIE UNTERFÄHIGKEITEN DER GROSSHÄNDLERKATALOGE. Standard an — was ein
  Betrieb heute sieht, sieht er weiter, und mit dem Modul „Material“ gehen
  sie aus. GEGENPROBE: vor M03a gab es keine.
*/
describe('Material: Kataloge, Preisvergleich, Preisverlauf (M03a)', () => {
  const TEILE = ['material.katalogversionen', 'material.lieferantenvergleich', 'material.katalogpreisverlauf'] as const;

  it('stehen unter „Material“, eingeschaltet, solange nichts festgelegt ist', () => {
    // Neben ihnen stehen seit M04a „Lagerorte und Fahrzeuglager“, seit M04b Bereitschaft und Vorschläge (eigene Fälle).
    expect(MODULE.find((m) => m.id === 'material')!.unter!.map((f) => [f.id, f.standard])).toEqual([
      ...TEILE.map((t) => [t, true]),
      ['material.lagerorte_fahrzeuglager', true],
      ['material.materialbereitschaft', true],
      ['material.bestellvorschlaege', true],
    ]);
    for (const t of TEILE) expect(istAn(undefined, t)).toBe(true);
  });

  it('gehen mit dem Modul aus und einzeln aus, ohne das Modul zu berühren', () => {
    for (const t of TEILE) expect(istAn({ material: false }, t)).toBe(false);
    expect(istAn({ 'material.lieferantenvergleich': false }, 'material.lieferantenvergleich')).toBe(false);
    expect(istAn({ 'material.lieferantenvergleich': false }, 'material')).toBe(true);
    expect(istAn({ 'material.lieferantenvergleich': false }, 'material.katalogpreisverlauf')).toBe(true);
  });

  it('ziehen beim Abschalten nichts mit und haben keine Folge über das Verschwinden hinaus', () => {
    for (const t of TEILE) {
      expect(zieheMit(t, undefined)).toEqual([]);
      expect(folgenBeimAbschalten(t, undefined)).toEqual([]);
      expect(schalter(t)?.betrifft.length).toBeGreaterThan(0);
    }
  });
});

/*
  LIEGENSCHAFTEN (M02c, A09): die erste Unterfähigkeit der Kunden — „Optional“
  und damit ab Werk AUS (E51). Eingeschaltet kommt genau ihr Eintrag dazu;
  ausgeschaltet bleibt alles wie vorher. Keine Folge, die sich nicht
  zurückholen ließe — die Daten bleiben.
*/
describe('kunden.liegenschaften (M02c)', () => {
  it('steht unter den Kunden, Standard aus, ohne Folgen', () => {
    const kunden = KERN.find((k) => k.id === 'kunden')!;
    expect(kunden.unter.map((f) => f.id)).toEqual(['kunden.liegenschaften']);
    expect(schalter('kunden.liegenschaften')).toMatchObject({ name: 'Liegenschaften und Tops', standard: false });
    expect(istAn(undefined, 'kunden.liegenschaften')).toBe(false);
    expect(istAn({ 'kunden.liegenschaften': true }, 'kunden.liegenschaften')).toBe(true);
    // Eine Festlegung zum Kern selbst nimmt seinem Teil nichts.
    expect(istAn({ kunden: false, 'kunden.liegenschaften': true }, 'kunden.liegenschaften')).toBe(true);
    expect(folgenBeimAbschalten('kunden.liegenschaften', { 'kunden.liegenschaften': true })).toEqual([]);
    expect(zieheMit('kunden.liegenschaften', { 'kunden.liegenschaften': true })).toEqual([]);
  });

  it('ab Werk keine neue Navigation; eingeschaltet genau „Liegenschaften“ für das Büro', () => {
    for (const rolle of ['Mitarbeiter', 'Verwaltung', 'Buchhaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator'] as const) {
      const ohne = navForRole(rolle, undefined).map((n) => n.path);
      const mit = navForRole(rolle, { 'kunden.liegenschaften': true }).map((n) => n.path);
      expect(ohne, rolle).not.toContain('/liegenschaften');
      expect(mit.filter((p) => !ohne.includes(p)), rolle).toEqual(rolle === 'Mitarbeiter' ? [] : ['/liegenschaften']);
    }
  });
});
