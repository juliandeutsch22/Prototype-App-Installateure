import { describe, it, expect, beforeEach } from 'vitest';
import { exportCompanyData } from '../../functions/src/export';
import { jedesDokument, EXPORTABLE } from '../../functions/src/mandantendaten';
import { neueDatenbank, type FakeDb } from './ersatz/firestore';
import { HttpsError, type AufrufKontext } from './ersatz/funktionen';

/**
 * Der DSGVO-Export — die Function, nicht die Liste.
 *
 * Die LISTE der Sammlungen gleicht `tests/unit/mandantenexport.test.ts` schon
 * gegen `firestore.rules` ab; sie schlägt fehl, wenn eine dazukommt. Was
 * dieser Test dazulegt, ist das VERHALTEN: Wer darf. Ob wirklich alles
 * mitkommt. Ob die Mandantengrenze hält. Und ob das seitenweise Blättern
 * mehr als eine Seite schafft — das ist keine Feinheit, sondern der
 * Unterschied zwischen einem vollständigen Export und einem, der nach 500
 * Zeiteinträgen aufhört und trotzdem Erfolg meldet.
 */

let db: FakeDb;

function ruf(auth: { role: string; companyId?: string } | null = { role: 'Geschäftsführung' }) {
  return exportCompanyData({
    data: {},
    auth: auth
      ? { uid: 'chef', token: { companyId: auth.companyId ?? 'perl', role: auth.role } }
      : undefined,
  } as AufrufKontext<unknown>) as Promise<{
    companyId: string;
    anzahl: Record<string, number>;
    data: Record<string, Array<Record<string, unknown>>>;
  }>;
}

async function scheitert(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toThrow(HttpsError);
  await p.catch((e) => expect((e as HttpsError).code).toBe(code));
}

beforeEach(() => {
  db = neueDatenbank();
  db.seed('companies', { perl: { name: 'Perl Installationen' }, andere: { name: 'Fremd' } });
});

describe('Wer den Export ziehen darf', () => {
  it('niemand ohne Anmeldung', async () => {
    await scheitert(ruf(null), 'unauthenticated');
  });

  it('nicht die Buchhaltung', async () => {
    // Der Export enthält JEDE Sammlung — Löhne, Kundenstamm, Kalkulation.
    await scheitert(ruf({ role: 'Buchhaltung' }), 'permission-denied');
  });

  it('nicht der Monteur', async () => {
    await scheitert(ruf({ role: 'Mitarbeiter' }), 'permission-denied');
  });

  it('die Geschäftsführung und die Administration', async () => {
    await expect(ruf({ role: 'Geschäftsführung' })).resolves.toBeTruthy();
    await expect(ruf({ role: 'Administrator' })).resolves.toBeTruthy();
  });
});

describe('Was im Export landet', () => {
  it('nimmt das Firmendokument über die Kennung mit, nicht über ein Feld', async () => {
    // Es hängt als einziges an der Dokument-ID. Ein Export ohne Firmendaten
    // wäre ein Wiederanlauf ohne Briefkopf und Bankverbindung.
    const r = await ruf();
    expect(r.data.companies).toEqual([{ id: 'perl', name: 'Perl Installationen' }]);
  });

  it('lässt die fremde Firma draußen', async () => {
    db.seed('customers', {
      k1: { companyId: 'perl', name: 'Huber' },
      k2: { companyId: 'andere', name: 'Fremdkunde' },
    });
    const r = await ruf();
    expect(r.data.customers).toEqual([{ id: 'k1', companyId: 'perl', name: 'Huber' }]);
  });

  it('lässt die Push-Tokens weg', async () => {
    /*
      Sie sind Kanäle auf die Geräte einzelner Mitarbeiter, kein
      Geschäftsdatum. Für einen Wiederanlauf taugen sie nichts — beim nächsten
      Anmelden entstehen sie neu —, in einer abgelegten Datei wären sie nur
      ein Risiko.
    */
    db.seed('userPrefs', {
      p1: { companyId: 'perl', userId: 'm1', pushTokens: ['geheim'], theme: 'dunkel' },
    });
    const r = await ruf();
    expect(r.data.userPrefs[0]).toEqual({ id: 'p1', companyId: 'perl', userId: 'm1', theme: 'dunkel' });
    expect(JSON.stringify(r.data)).not.toContain('geheim');
  });

  it('nimmt die Nummernkreise mit', async () => {
    /*
      Der folgenreichste Punkt der ganzen Liste. Ein Wiederanlauf ohne sie
      begänne den Rechnungszähler bei null — und der Betrieb hätte zwei
      Rechnungen mit derselben Nummer in den Büchern.
    */
    db.seed('counters', { perl_invoices: { companyId: 'perl', lastSeq: 1042, year: 2026 } });
    const r = await ruf();
    expect(r.data.counters[0]).toMatchObject({ lastSeq: 1042 });
    expect(EXPORTABLE).toContain('counters');
  });
});

describe('Seitenweise blättern', () => {
  it('holt mehr als eine Seite — und jedes Dokument genau einmal', async () => {
    /*
      Die Seitengröße ist 500. Ein Fehler in der Fortsetzung sähe von außen
      wie Erfolg aus: der Export liefe durch, meldete eine Zahl und hätte den
      Rest der Zeiteinträge einfach nicht dabei. Bei drei Jahren Betrieb sind
      das gemessen 15.660 Dokumente.
    */
    const eintraege: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < 1201; i++) {
      eintraege[`e${String(i).padStart(5, '0')}`] = { companyId: 'perl', nr: i };
    }
    db.seed('timeEntries', eintraege);

    const gesehen: string[] = [];
    await jedesDokument(db as never, 'perl', (sammlung, zeile) => {
      if (sammlung === 'timeEntries') gesehen.push(zeile.id as string);
    });

    expect(gesehen).toHaveLength(1201);
    expect(new Set(gesehen).size).toBe(1201);
  });
});

describe('Die Größengrenze', () => {
  it('bricht mit einer verständlichen Meldung ab, statt an Firebase zu scheitern', async () => {
    /*
      Firebase deckelt die Antwort bei 10 MB. Ohne eigene Grenze bekäme der
      Aufrufer einen abgebrochenen Aufruf ohne Text — die unangenehmste Art,
      eine Grenze zu erklären. Hier steht stattdessen der Weg, der
      funktioniert: die nächtliche Ausleitung.
    */
    const gross: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < 40; i++) {
      gross[`d${i}`] = { companyId: 'perl', text: 'x'.repeat(300_000) };
    }
    db.seed('projects', gross);
    await scheitert(ruf(), 'resource-exhausted');
  });
});
