import { describe, it, expect, beforeEach } from 'vitest';
import { notifyNewOrder, notifyOrderReady } from '../../functions/src/notify';
import { neueDatenbank, type FakeDb } from './ersatz/firestore';
import { gesendet, messagingLeeren, tokenIstTot } from './ersatz/messaging';
import {
  loeseAus,
  protokollLeeren,
  type AenderungsEreignis,
  type SchreibEreignis,
} from './ersatz/funktionen';

/**
 * Die Push-Meldungen — und zwar die Frage, WER sie bekommt.
 *
 * Die ENTSCHEIDUNGEN (welcher Übergang zählt, welcher Text) liegen in
 * `notifyLogic.ts` und sind dort geprüft. Was hier fehlte, ist das
 * Zusammenspiel mit der Datenbank — und genau darin steckt das Risiko: die
 * Empfänger werden serverseitig aus dem MANDANTEN der Anforderung bestimmt.
 * Läuft das falsch, erfährt der halbe Betrieb, was ihn nichts angeht, und
 * niemand merkt es — eine Meldung, die zu viel ging, sieht aus wie eine
 * Meldung.
 */

let db: FakeDb;

const ANFORDERUNG = {
  companyId: 'perl',
  materialName: 'Eckventil',
  quantity: 2,
  projectNumber: 'B-001',
  userId: 'monteur',
  userName: 'Max',
  status: 'Offen',
};

function angelegt(order: Record<string, unknown>) {
  return {
    data: { exists: true, data: () => order },
    params: { id: 'o1' },
  } as unknown as SchreibEreignis<Record<string, unknown>>;
}

function geaendert(vorher: Record<string, unknown>, nachher: Record<string, unknown>) {
  return {
    data: { before: { data: () => vorher }, after: { data: () => nachher } },
    params: { id: 'o1' },
  } as AenderungsEreignis<Record<string, unknown>>;
}

/** Alle Tokens, die tatsächlich angeschrieben wurden. */
function empfaenger(): string[] {
  return [...new Set(gesendet.flatMap((s) => s.tokens))].sort();
}

beforeEach(() => {
  db = neueDatenbank();
  messagingLeeren();
  protokollLeeren();
  db.seed('users', {
    u1: { companyId: 'perl', uid: 'buero', role: 'Verwaltung' },
    u2: { companyId: 'perl', uid: 'chef', role: 'Geschäftsführung' },
    u3: { companyId: 'perl', uid: 'monteur', role: 'Mitarbeiter' },
    u4: { companyId: 'perl', uid: 'buch', role: 'Buchhaltung' },
    u5: { companyId: 'andere', uid: 'fremdBuero', role: 'Verwaltung' },
  });
  db.seed('userPrefs', {
    buero: { pushTokens: ['t-buero'] },
    chef: { pushTokens: ['t-chef'] },
    monteur: { pushTokens: ['t-monteur'] },
    buch: { pushTokens: ['t-buch'] },
    fremdBuero: { pushTokens: ['t-fremd'] },
    leiter: { pushTokens: ['t-leiter'] },
  });
});

describe('Eine neue Anforderung', () => {
  it('geht an Verwaltung und Leitung — und an sonst niemanden', async () => {
    await loeseAus(notifyNewOrder, angelegt(ANFORDERUNG));
    expect(empfaenger()).toEqual(['t-buero', 't-chef']);
  });

  it('geht NICHT an die fremde Firma', async () => {
    /*
      Die Empfänger kommen aus dem Mandanten der Anforderung, nie aus
      Client-Eingabe. Ohne diese Grenze erführe ein anderer Betrieb, welches
      Material hier bestellt wird.
    */
    await loeseAus(notifyNewOrder, angelegt(ANFORDERUNG));
    expect(empfaenger()).not.toContain('t-fremd');
  });

  it('geht nicht an den, der sie selbst gestellt hat', async () => {
    // Wer gerade auf „Anfordern" gedrückt hat, braucht keine Meldung darüber.
    await loeseAus(notifyNewOrder, angelegt({ ...ANFORDERUNG, userId: 'buero' }));
    expect(empfaenger()).toEqual(['t-chef']);
  });

  it('respektiert das Abbestellen', async () => {
    db.inhalt('userPrefs').set('buero', { pushTokens: ['t-buero'], notifyNewOrder: false });
    await loeseAus(notifyNewOrder, angelegt(ANFORDERUNG));
    expect(empfaenger()).toEqual(['t-chef']);
  });

  it('schreibt niemanden an, der kein Gerät registriert hat', async () => {
    db.inhalt('userPrefs').delete('chef');
    await loeseAus(notifyNewOrder, angelegt(ANFORDERUNG));
    expect(empfaenger()).toEqual(['t-buero']);
  });
});

describe('Eilzustellung', () => {
  it('erreicht zusätzlich die Projektleitung der Baustelle', async () => {
    // Sie fährt ohnehin hin und kann das Material mitnehmen.
    db.seed('projects', {
      p1: { companyId: 'perl', projectNumber: 'B-001', projectManagers: ['leiter'] },
    });
    await loeseAus(notifyNewOrder, angelegt({ ...ANFORDERUNG, isUrgent: true }));
    expect(empfaenger()).toEqual(['t-buero', 't-chef', 't-leiter']);
  });

  it('nimmt die Projektleitung einer FREMDEN Baustelle nicht', async () => {
    db.seed('projects', {
      p1: { companyId: 'andere', projectNumber: 'B-001', projectManagers: ['leiter'] },
    });
    await loeseAus(notifyNewOrder, angelegt({ ...ANFORDERUNG, isUrgent: true }));
    expect(empfaenger()).toEqual(['t-buero', 't-chef']);
  });

  it('kommt ohne zugeteilte Projektleitung ohne Fehler aus', async () => {
    db.seed('projects', { p1: { companyId: 'perl', projectNumber: 'B-001' } });
    await expect(
      loeseAus(notifyNewOrder, angelegt({ ...ANFORDERUNG, isUrgent: true })),
    ).resolves.toBeUndefined();
    expect(empfaenger()).toEqual(['t-buero', 't-chef']);
  });
});

describe('„Abholbereit"', () => {
  it('meldet sich beim Besteller', async () => {
    await loeseAus(notifyOrderReady, geaendert(ANFORDERUNG, { ...ANFORDERUNG, status: 'Abholbereit' }));
    expect(empfaenger()).toEqual(['t-monteur']);
  });

  it('meldet sich NICHT, wenn der Status gleich bleibt', async () => {
    // Sonst käme bei jeder Kleinigkeit am Dokument dieselbe Meldung erneut.
    const bereit = { ...ANFORDERUNG, status: 'Abholbereit' };
    await loeseAus(notifyOrderReady, geaendert(bereit, { ...bereit, quantity: 3 }));
    expect(gesendet).toHaveLength(0);
  });

  it('nimmt bei Eilzustellung die Projektleitung mit', async () => {
    db.seed('projects', {
      p1: { companyId: 'perl', projectNumber: 'B-001', projectManagers: ['leiter'] },
    });
    const eil = { ...ANFORDERUNG, isUrgent: true };
    await loeseAus(notifyOrderReady, geaendert(eil, { ...eil, status: 'Abholbereit' }));
    expect(empfaenger()).toEqual(['t-leiter', 't-monteur']);
  });
});

describe('Tote Tokens', () => {
  it('verschwinden aus den Einstellungen', async () => {
    /*
      Ohne das wächst die Liste mit jedem Gerätewechsel, und jeder Versand
      läuft in dieselben Fehler. Nach ein paar Jahren steht dort ein Dutzend
      Tokens, von denen zwei noch gehen.
    */
    db.inhalt('userPrefs').set('buero', { pushTokens: ['t-buero', 't-alt'] });
    tokenIstTot('t-alt');
    await loeseAus(notifyNewOrder, angelegt(ANFORDERUNG));
    expect(db.alles('userPrefs').buero.pushTokens).toEqual(['t-buero']);
  });

  it('lassen die gültigen stehen', async () => {
    tokenIstTot('t-chef');
    await loeseAus(notifyNewOrder, angelegt(ANFORDERUNG));
    expect(db.alles('userPrefs').buero.pushTokens).toEqual(['t-buero']);
    expect(db.alles('userPrefs').chef.pushTokens).toEqual([]);
  });
});
