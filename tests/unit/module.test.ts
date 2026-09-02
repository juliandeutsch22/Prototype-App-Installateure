import { describe, it, expect } from 'vitest';
import { MODULE, aktiveModule, zieheMit, modul } from '@/lib/module';
import { navForRole, tabBarForRole, canAccess } from '@/app/navigation';

/**
 * Module: welche Bereiche ein Betrieb benutzt.
 *
 * Die gefährlichen Fehler sind hier nicht die offensichtlichen. Ein Tab, der
 * nicht verschwindet, fällt sofort auf. Was NICHT auffällt:
 *
 *  - eine Ansicht, die noch erreichbar ist, weil nur die Navigation filtert
 *  - ein Modul, das ohne seine Abhängigkeit weiterläuft und dann für jede
 *    Zeile „keine Aussage" meldet
 *  - ein Kernbereich, den jemand versehentlich abschalten kann
 *
 * Genau diese drei stehen hier.
 */

describe('Welche Module gelten', () => {
  it('nimmt ohne Festlegung die Standardwerte', () => {
    const an = aktiveModule(undefined);
    // Alles an, ausser der KI-Erfassung: die braucht hinterlegte Zugaenge.
    expect(an.has('rechnungen')).toBe(true);
    expect(an.has('material')).toBe(true);
    expect(an.has('ki')).toBe(false);
  });

  it('folgt der Festlegung des Betriebs', () => {
    const an = aktiveModule({ material: false });
    expect(an.has('material')).toBe(false);
    expect(an.has('rechnungen')).toBe(true);
  });

  it('schaltet ein Modul mit ab, dessen Grundlage fehlt', () => {
    /**
     * Die Nachkalkulation braucht einen Erlös, und der kommt aus den
     * Rechnungen. Ohne sie zeigte sie für jede Baustelle „keine Aussage" —
     * eine Ansicht, die nur mitteilt, dass sie nichts mitteilen kann.
     */
    const an = aktiveModule({ rechnungen: false });
    expect(an.has('rechnungen')).toBe(false);
    expect(an.has('nachkalkulation')).toBe(false);
  });

  it('laesst ein Modul aus, das technisch nicht eingerichtet ist', () => {
    // Die KI-Erfassung ohne hinterlegte Zugaenge: ein Schalter, der nichts
    // bewirkt, ist schlimmer als keiner.
    expect(aktiveModule({ ki: true }).has('ki')).toBe(false);
  });

  it('sagt VORHER, was mit abgeschaltet wuerde', () => {
    // Ueberraschung ist bei Einstellungen das Gegenteil von Kontrolle.
    expect(zieheMit('rechnungen', undefined)).toEqual(['nachkalkulation']);
    expect(zieheMit('material', undefined)).toEqual([]);
  });

  it('kennt keinen Schalter fuer den Kern', () => {
    /**
     * Zeiterfassung, Kunden, Baustellen, Benutzer und Einstellungen stehen
     * bewusst NICHT in der Modulliste. Ein Schalter, mit dem man die Anlage
     * unbenutzbar macht, ist kein Freiheitsgrad, sondern eine Falle.
     */
    const ids = MODULE.map((m) => m.id);
    for (const kern of ['zeit', 'kunden', 'baustellen', 'benutzer', 'einstellungen']) {
      expect(ids).not.toContain(kern);
    }
  });

  it('gibt jedem Modul einen Zweck und eine Wirkung', () => {
    // Ein Schalter ohne Erklaerung ist eine Zumutung: niemand weiss, was
    // passiert, wenn er ihn umlegt.
    for (const m of MODULE) {
      expect(m.zweck.length).toBeGreaterThan(10);
      expect(m.betrifft.length).toBeGreaterThan(0);
      expect(modul(m.id)).toBeDefined();
    }
  });
});

describe('Navigation folgt den Modulen', () => {
  it('blendet die Eintraege eines abgeschalteten Moduls aus', () => {
    const mit = navForRole('Geschäftsführung', undefined).map((i) => i.path);
    const ohne = navForRole('Geschäftsführung', { material: false }).map((i) => i.path);
    expect(mit).toContain('/material');
    expect(ohne).not.toContain('/material');
    // Der Kern bleibt.
    expect(ohne).toContain('/time');
    expect(ohne).toContain('/admin-projects');
    expect(ohne).toContain('/settings');
  });

  it('macht die Adresse zu, nicht nur den Eintrag unsichtbar', () => {
    /**
     * DER FEHLER, DEN MAN SONST MACHT. Den Eintrag auszublenden nimmt nur den
     * Weg weg, nicht die Adresse: ein Lesezeichen, ein alter Link oder der
     * Zurueck-Knopf fuehren weiter hinein.
     *
     * `canAccess` ist nicht nur eine Auskunft fuer Tests — `RequireNav` ruft
     * genau diese Funktion auf, bevor es eine Ansicht durchlaesst.
     */
    expect(canAccess('Geschäftsführung', '/material', undefined)).toBe(true);
    expect(canAccess('Geschäftsführung', '/material', { material: false })).toBe(false);
  });

  it('laesst die Rollengrenze unberuehrt', () => {
    // Module sind eine Umfangsentscheidung, keine Rechteverwaltung. Ein
    // eingeschaltetes Modul oeffnet niemandem etwas.
    expect(canAccess('Mitarbeiter', '/invoices', undefined)).toBe(false);
  });
});

describe('Die mobile Leiste ist ausgesucht, nicht abgeschnitten', () => {
  it('stellt der Buchhaltung die Rechnungen unten hin', () => {
    /**
     * Vorher nahm das Layout die ersten vier Eintraege der Liste. Das war
     * keine Entscheidung, sondern ein Nebeneffekt der Reihenfolge: bei der
     * Buchhaltung stand „Urlaub" unten, und die Rechnungen — das, worin sie
     * den ganzen Tag arbeitet — lagen unter „Mehr".
     */
    const { unten } = tabBarForRole('Buchhaltung', undefined);
    expect(unten.map((i) => i.path)).toContain('/invoices');
  });

  it('gibt dem Monteur Start, Zeit, Plan und Material', () => {
    const { unten } = tabBarForRole('Mitarbeiter', undefined);
    expect(unten.map((i) => i.path)).toEqual(['/', '/time', '/my-schedule', '/material']);
  });

  it('haelt die Leiste voll, wenn ein Modul fehlt', () => {
    /**
     * Faellt ein Wunscheintrag weg, rueckt der naechste nach. Eine Leiste mit
     * drei Symbolen und einer Luecke saehe kaputt aus.
     */
    const { unten } = tabBarForRole('Mitarbeiter', { material: false, einsatzplanung: false });
    expect(unten).toHaveLength(4);
    expect(unten.map((i) => i.path)).not.toContain('/material');
    expect(unten.map((i) => i.path)).not.toContain('/my-schedule');
  });

  it('legt niemanden doppelt in Leiste und Mehr', () => {
    for (const rolle of ['Mitarbeiter', 'Buchhaltung', 'Geschäftsführung'] as const) {
      const { unten, mehr } = tabBarForRole(rolle, undefined);
      const doppelt = unten.filter((i) => mehr.includes(i));
      expect(doppelt).toEqual([]);
      // Zusammen ergeben sie genau das, was die Rolle sehen darf.
      expect(unten.length + mehr.length).toBe(navForRole(rolle, undefined).length);
    }
  });
});
