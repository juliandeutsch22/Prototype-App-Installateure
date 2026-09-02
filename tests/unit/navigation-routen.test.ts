import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NAV, UNTER, unterseitenFuer } from '@/app/navigation';
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

/**
 * Alle `path="…"` aus den `<Route>`-Zeilen, ohne Sammel- und Login-Route.
 *
 * `/material/*` zählt als `/material`: der Reiter heißt so, die Unterseiten
 * hängen darunter.
 */
const ROUTEN_PFADE = [...APP.matchAll(/<Route\s+path="([^"]+)"/g)]
  .map((m) => m[1].replace(/\/\*$/, ''))
  .filter((p) => p !== '*' && p !== '' && p !== '/login');

/** Alle Pfade, die per `RequireNav path="…"` bewacht werden. */
const BEWACHT = [...APP.matchAll(/<RequireNav path="([^"]+)"/g)].map((m) => m[1]);

/** Alte Adressen, die nur noch auf ihr neues Ziel umleiten. */
const UMLEITUNGEN = [
  ...APP.matchAll(/<Route path="([^"]+)" element=\{<Navigate to="([^"]+)"/g),
].map((m) => ({ von: m[1], nach: m[2] }));

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
     * jemand entschieden hätte. Umleitungen zählen nicht — sie zeigen nichts,
     * sie schicken weiter, und am Ziel steht der Wächter.
     */
    const umgeleitet = UMLEITUNGEN.map((u) => u.von);
    const ungeschuetzt = ROUTEN_PFADE.filter(
      (p) => !BEWACHT.includes(p) && !(p in OHNE_REITER) && !umgeleitet.includes(p),
    );
    expect(ungeschuetzt).toEqual([]);
  });

  it('haelt die alten Adressen am Leben', () => {
    /**
     * WARUM DAS EIN TEST IST. In bereits ZUGESTELLTEN Push-Meldungen stehen
     * die alten Adressen — sie liegen auf den Telefonen und lassen sich nicht
     * mehr ändern. Wer eine davon antippt, landete ohne Umleitung wortlos auf
     * der Startseite und suchte dann die Anforderung, die ihn hergerufen
     * hatte. Dasselbe gilt für Lesezeichen im Büro.
     */
    const ziel = (von: string) => UMLEITUNGEN.find((u) => u.von === von)?.nach;
    expect(ziel('/order')).toBe('/material/anfordern');
    expect(ziel('/admin-orders')).toBe('/material/anforderungen');
    expect(ziel('/stock')).toBe('/material/lager');
    expect(ziel('/notifications')).toBe('/settings/meldungen');
    expect(ziel('/modules')).toBe('/settings/module');
  });

  it('leitet nur auf Adressen um, die es gibt', () => {
    // Eine Umleitung ins Leere wäre schlimmer als gar keine: sie sieht aus,
    // als sei sie gepflegt.
    for (const u of UMLEITUNGEN) {
      if (u.nach === '/') continue;
      const basis = '/' + u.nach.split('/')[1];
      const stueck = u.nach.split('/')[2];
      expect(NAV.some((i) => i.path === basis)).toBe(true);
      expect(UNTER[basis]?.some((s) => s.pfad === stueck)).toBe(true);
    }
  });
});

describe('Unterreiter — mehrere Ansichten unter einem Eintrag', () => {
  it('haengt jede Unterseite an einen Eintrag, den es gibt', () => {
    for (const basis of Object.keys(UNTER)) {
      expect(NAV.some((i) => i.path === basis)).toBe(true);
    }
  });

  it('laesst den Monteur unter Einstellungen nur seine Meldungen sehen', () => {
    /**
     * Der Reiter steht ihm offen, weil die Meldungen ihm gehören. Die Sätze
     * des Betriebs und die Module gehören ihm nicht — und weil nur eine
     * Unterseite übrigbleibt, sieht er auch keine Leiste, sondern direkt
     * seine Seite.
     */
    expect(unterseitenFuer('/settings', 'Mitarbeiter').map((s) => s.pfad)).toEqual(['meldungen']);
    expect(unterseitenFuer('/settings', 'Geschäftsführung').map((s) => s.pfad)).toEqual([
      'meldungen',
      'saetze',
      'module',
    ]);
  });

  it('gibt der Projektleitung die Saetze und die Module NICHT', () => {
    // Dieselbe Grenze wie in firestore.rules: im Firmendokument stehen der
    // Stundensatz und die Modulliste.
    expect(unterseitenFuer('/settings', 'Projektleiter').map((s) => s.pfad)).toEqual(['meldungen']);
  });

  it('laesst den Monteur Material anfordern, aber kein Lager fuehren', () => {
    expect(unterseitenFuer('/material', 'Mitarbeiter').map((s) => s.pfad)).toEqual(['anfordern']);
    expect(unterseitenFuer('/material', 'Verwaltung').map((s) => s.pfad)).toEqual([
      'anfordern',
      'anforderungen',
      'lager',
    ]);
  });

  it('gibt jeder Rolle mindestens eine Unterseite je Reiter, den sie sieht', () => {
    /**
     * Sonst entstünde genau das zurück, was wir gerade beseitigt haben: ein
     * Reiter, der angeklickt werden will und dann nichts zeigt.
     */
    for (const basis of Object.keys(UNTER)) {
      const eintrag = NAV.find((i) => i.path === basis)!;
      for (const rolle of eintrag.roles) {
        expect(unterseitenFuer(basis, rolle).length).toBeGreaterThan(0);
      }
    }
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

  it('laesst die Projektleitung planen, verwalten und Material fuehren', () => {
    // Das ist ihre Arbeit. Die Firestore-Regeln erlauben es ihr längst
    // (`isLeadership()`); nur die Route sperrte sie aus.
    for (const p of ['/admin-projects', '/assignments', '/material']) {
      expect(rollen(p)).toContain('Projektleiter');
    }
    expect(unterseitenFuer('/material', 'Projektleiter').map((s) => s.pfad)).toEqual([
      'anfordern',
      'anforderungen',
      'lager',
    ]);
  });

  it('haelt die Projektleitung aus Geld und Rechtevergabe heraus', () => {
    /**
     * Drei Grenzen, drei Gründe:
     *
     *  - Rechnungen und Zeitkonten: Umsatz und Löhne sind nicht Sache der
     *    Bauleitung. Bei den Zeitkonten kommt Art. 9 DSGVO dazu —
     *    Krankenstände sind Gesundheitsdaten.
     *  - Nachkalkulation: zeigt die Marge.
     *  - Benutzerverwaltung: wer Rollen vergibt, vergibt sie auch an sich.
     */
    for (const p of ['/invoices', '/accounting', '/costing', '/user-mgmt']) {
      expect(rollen(p)).not.toContain('Projektleiter');
    }
    // Die Einstellungen stehen ihr offen — aber nur mit den Meldungen darin,
    // nicht mit den Sätzen des Betriebs.
    expect(rollen('/settings')).toContain('Projektleiter');
    expect(unterseitenFuer('/settings', 'Projektleiter').map((s) => s.pfad)).toEqual(['meldungen']);
  });

  it('gibt jeder Rolle die eigene Zeit, den eigenen Urlaub und die eigenen Meldungen', () => {
    // Auch die Buchhaltung wird krank und nimmt Urlaub.
    for (const p of ['/time', '/vacations', '/settings', '/']) {
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
