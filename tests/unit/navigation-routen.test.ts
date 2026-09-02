import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NAV } from '@/app/navigation';
import {
  canInvoice,
  canManageUsers,
  canManageProjects,
  canProcessOrders,
} from '@/lib/permissions';

/**
 * Jeder Reiter muss irgendwohin führen, und jede Ansicht muss bewacht sein.
 *
 * WAS HIER SCHIEFGING. Wer wohin darf, stand zweimal geschrieben: als `roles`
 * in `navigation.ts` und noch einmal als `RequireRole` an der Route in
 * `App.tsx`. Zwei Listen, die dasselbe behaupten, laufen auseinander — und sie
 * waren es bereits. Die Projektleitung sah fünf Einträge, die sie nicht
 * betreten konnte: Baustellen, Einsatzplanung, Anforderungen,
 * Benutzerverwaltung und Einstellungen. Ein Reiter, den die App selbst
 * anbietet und der dann „Kein Zugriff" sagt, lässt den Benutzer aussehen, als
 * hätte er etwas falsch gemacht.
 *
 * Die Doppelung ist weg: `RequireNav` liest Rolle und Modul aus demselben
 * Eintrag. Was bleibt, sind zwei Fehler, die man weiterhin machen kann — und
 * genau die stehen hier:
 *
 *  1. eine neue Ansicht anlegen und den Wächter vergessen,
 *  2. sich im Pfad vertippen, sodass `RequireNav` ins Leere greift.
 *
 * Der Test liest den Quelltext, statt zu rendern: ein gerendertes `<Routes>`
 * verrät nicht, welche Rolle ein Wächter durchlässt, ohne dass man jede Rolle
 * einzeln durchprobiert und dabei die halbe App samt Datenbankzugriffen
 * startet. Dieselbe Idee wie beim Index-Abgleich.
 */

const APP = readFileSync(resolve(__dirname, '../../src/app/App.tsx'), 'utf8');

/** Alle `path="…"` aus den `<Route>`-Zeilen, ohne Sammel- und Login-Route. */
const ROUTEN_PFADE = [...APP.matchAll(/<Route\s+path="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((p) => p !== '*' && p !== '/*' && p !== '/login');

/** Alle Pfade, die per `RequireNav path="…"` bewacht werden. */
const BEWACHT = [...APP.matchAll(/<RequireNav path="([^"]+)"/g)].map((m) => m[1]);

/**
 * Routen, die absichtlich keinen Reiter haben, weil sie nur aus einer anderen
 * Ansicht heraus geöffnet werden. Wer hier etwas einträgt, nimmt sich die
 * Prüfung — deshalb steht neben jedem Eintrag der Grund.
 */
const OHNE_REITER: Record<string, string> = {
  // Ein EINZELNER Schein, immer zu einem bestimmten Tag aus Liste oder
  // Einsatzplan heraus geöffnet. Ein Reiter „neuer Schein" ohne gewählten Tag
  // wäre sinnlos. Rollen und Modul stehen dort ausgeschrieben.
  '/worksheet': 'wird aus Liste und Einsatzplan heraus geöffnet',
};

describe('Navigation und Routen sagen dasselbe', () => {
  it('liest ueberhaupt Routen aus der Datei', () => {
    // Schutz vor dem stillsten Fehler dieses Tests: eine Umformatierung von
    // App.tsx, nach der das Muster nichts mehr findet — dann liefe jede
    // folgende Prüfung durch, ohne etwas zu prüfen.
    expect(ROUTEN_PFADE.length).toBeGreaterThan(15);
    expect(ROUTEN_PFADE).toContain('/invoices');
    expect(BEWACHT.length).toBeGreaterThan(15);
  });

  it.each(NAV.map((i) => [i.path, i.label] as const))(
    'zu „%s" (%s) gehoert eine bewachte Route',
    (pfad) => {
      expect(ROUTEN_PFADE).toContain(pfad);
      expect(BEWACHT).toContain(pfad);
    },
  );

  it('bewacht keinen Pfad, den die Navigation nicht kennt', () => {
    /**
     * Ein vertippter Pfad in `RequireNav` fände keinen Eintrag. Der Wächter
     * sperrt dann zwar sicherheitshalber alle aus — aber das merkt man erst
     * im Betrieb, und zwar als Ansicht, die für niemanden mehr aufgeht.
     */
    const unbekannt = BEWACHT.filter((p) => !NAV.some((i) => i.path === p));
    expect(unbekannt).toEqual([]);
  });

  it('laesst keine Ansicht ohne Waechter stehen', () => {
    /**
     * Eine Route ohne `RequireNav` und ohne Eintrag in der Ausnahmeliste ist
     * eine offene Tür: erreichbar für jede angemeldete Rolle, ohne dass es
     * jemand entschieden hätte.
     */
    const ungeschuetzt = ROUTEN_PFADE.filter(
      (p) => !BEWACHT.includes(p) && !(p in OHNE_REITER),
    );
    expect(ungeschuetzt).toEqual([]);
  });

  it('haelt die Ausnahmeliste kurz und begruendet', () => {
    // Wächst sie, ist der Schutz ausgehöhlt — dann lieber die Ansicht in die
    // Navigation aufnehmen.
    expect(Object.keys(OHNE_REITER).length).toBeLessThanOrEqual(2);
    for (const grund of Object.values(OHNE_REITER)) {
      expect(grund.length).toBeGreaterThan(10);
    }
  });
});

describe('Wer wohin darf — die Entscheidungen, die dahinterstehen', () => {
  function rollen(pfad: string) {
    return NAV.find((i) => i.path === pfad)!.roles;
  }

  it('laesst die Projektleitung planen, verwalten und Material anfordern', () => {
    // Das ist ihre Arbeit. Die Firestore-Regeln erlauben es ihr längst
    // (`isLeadership()`); nur die Route sperrte sie aus.
    for (const p of ['/admin-projects', '/assignments', '/admin-orders', '/order', '/stock']) {
      expect(rollen(p)).toContain('Projektleiter');
    }
  });

  it('haelt die Projektleitung aus Geld und Rechtevergabe heraus', () => {
    /**
     * Drei Grenzen, drei Gründe:
     *
     *  - Rechnungen und Zeitkonten: Umsatz und Löhne sind nicht Sache der
     *    Bauleitung. Bei den Zeitkonten kommt Art. 9 DSGVO dazu —
     *    Krankenstände sind Gesundheitsdaten.
     *  - Nachkalkulation: zeigt die Marge.
     *  - Benutzerverwaltung und Einstellungen: wer Rollen vergibt oder
     *    Stundensätze festlegt, entscheidet über den Betrieb, nicht über eine
     *    Baustelle.
     */
    for (const p of ['/invoices', '/accounting', '/costing', '/user-mgmt', '/settings', '/modules']) {
      expect(rollen(p)).not.toContain('Projektleiter');
    }
  });

  it('gibt jeder Rolle die eigene Zeit und den eigenen Urlaub', () => {
    // Auch die Buchhaltung wird krank und nimmt Urlaub.
    for (const p of ['/time', '/vacations', '/notifications', '/']) {
      expect(rollen(p)).toHaveLength(6);
    }
  });

  it('sagt dasselbe wie die Knopf-Freigaben in permissions.ts', () => {
    /**
     * DIE DRITTE STELLE. Neben Navigation und Route entscheidet
     * `permissions.ts`, welche KNÖPFE eine Rolle innerhalb einer Ansicht
     * sieht. Auch dort stand die Projektleitung drin, wo sie nicht hingehört:
     * `canInvoice` liess sie zu, obwohl die Firestore-Regel ihr das Lesen
     * einer Rechnung verweigert — die Ansicht hätte ihr also Knöpfe
     * angeboten, die serverseitig scheitern mussten.
     */
    expect(canInvoice('Projektleiter')).toBe(false);
    expect(canManageUsers('Projektleiter')).toBe(false);
    // Und das, was sie sehr wohl darf, bleibt ihr:
    expect(canManageProjects('Projektleiter')).toBe(true);
    expect(canProcessOrders('Projektleiter')).toBe(true);
    // Die Buchhaltung rechnet weiterhin ab, ohne Baustellen zu verwalten.
    expect(canInvoice('Buchhaltung')).toBe(true);
    expect(canManageProjects('Buchhaltung')).toBe(false);
  });
});
