/**
 * Die Weichen in `lib/functions.ts` — die außerhalb der Datenschicht.
 *
 * Vier sind umgezogen: „Urlaub entscheiden", die Vorausfüllung des
 * Handwerksscheins und der DSGVO-Auszug wurden Datenbankfunktionen, das
 * Anlegen eines Betriebs eine Edge Function. Die Ansichten merken davon
 * nichts — sie bekommen in beiden Fällen `{ data }` mit demselben Inhalt.
 *
 * WARUM DAS EINEN EIGENEN TEST BRAUCHT. Die achtzehn Weichen in `lib/db/`
 * hält `datenschichtVertrag.test.ts` zusammen — der prüft aber nur Dateien
 * unter `src/lib/db/`. Diese vier liegen in `lib/functions.ts`, weil der
 * Aufrufer dort schon immer gesucht hat. Ohne diesen Test stünden sie
 * ungeprüft da: ein vertauschter Zweig bliebe still, bis in Stufe 8 der
 * Schalter umgelegt wird und die Genehmigung ins Leere ruft.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const nutztPostgres = vi.fn<[], boolean>();
const entscheiden = vi.fn();
const vorbereiten = vi.fn();
const auszug = vi.fn();
const betriebAnlegen = vi.fn();
/*
  `httpsCallable` bekommt den Namen der Function als zweites Argument; er
  landet im Aufruf, damit ein vertauschter Name auffällt — beide Weichen
  benutzen denselben Ersatz.
*/
const alsFunction = vi.fn();

vi.mock('@/lib/db/quelle', () => ({ nutztPostgres: () => nutztPostgres() }));
vi.mock('@/lib/db/vacations', () => ({ entscheiden: (d: unknown) => entscheiden(d) }));
vi.mock('@/lib/db/workSheets', () => ({
  vorbereiten: (p: string, d: string) => vorbereiten(p, d),
}));
vi.mock('@/lib/db/company', () => ({ auszug: () => auszug() }));
vi.mock('@/lib/db/plattform', () => ({ betriebAnlegen: (d: unknown) => betriebAnlegen(d) }));
vi.mock('@/lib/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_f: unknown, name: string) => (d: unknown) => alsFunction(name, d),
}));

const EINGABE = {
  vacationId: 'v1',
  entscheidung: 'Genehmigt' as const,
  grund: '',
  entscheiderName: 'Chef',
};
const ZAHLEN = { status: 'Genehmigt', angelegt: 5, uebersprungen: 0, entfernt: 0 };

const SCHEIN_EINGABE = { projectNumber: '2026-041', datum: '2026-03-10' };
const STUNDEN = { zeiten: [{ datum: '2026-03-10', mitarbeiter: 'Auer', minuten: 240 }] };
const BETRIEB_EINGABE = {
  name: 'Gruber Installationen', companyId: 'gruber',
  adminEmail: 'chef@gruber.at', adminName: 'Franz Gruber',
};
const ANGELEGT = {
  companyId: 'gruber', ersterAdminUid: 'uid-1',
  passwortLink: 'https://example.test/reset?token=abc',
};
const AUSZUG = {
  companyId: 'perl', exportedAt: '2026-03-10T08:00:00.000Z',
  anzahl: { users: 3 }, data: { users: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
  entscheiden.mockResolvedValue(ZAHLEN);
  vorbereiten.mockResolvedValue(STUNDEN);
  auszug.mockResolvedValue(AUSZUG);
  betriebAnlegen.mockResolvedValue(ANGELEGT);
  alsFunction.mockImplementation((name: string) => Promise.resolve({
    data: { urlaubEntscheiden: ZAHLEN, scheinVorbereiten: STUNDEN,
            exportCompanyData: AUSZUG, betriebAnlegen: ANGELEGT }[name],
  }));
});

async function funktionen() {
  return import('@/lib/functions');
}

async function callUrlaubEntscheiden() {
  return (await funktionen()).callUrlaubEntscheiden;
}

async function callScheinVorbereiten() {
  return (await funktionen()).callScheinVorbereiten;
}

async function callExportCompanyData() {
  return (await funktionen()).callExportCompanyData;
}

async function callBetriebAnlegen() {
  return (await funktionen()).callBetriebAnlegen;
}

describe('Urlaub entscheiden — dieselbe Antwort aus zwei Datenbanken', () => {
  it('unter Postgres fragt die Datenbank, nicht die Cloud Function', async () => {
    nutztPostgres.mockReturnValue(true);
    const antwort = await (await callUrlaubEntscheiden())(EINGABE);

    expect(entscheiden).toHaveBeenCalledWith(EINGABE);
    expect(alsFunction).not.toHaveBeenCalled();
    // Die Ansicht liest `data` — die Hülle muss also auch hier stehen.
    expect(antwort).toEqual({ data: ZAHLEN });
  });

  it('unter Firestore die Cloud Function, nicht die Datenbank', async () => {
    nutztPostgres.mockReturnValue(false);
    const antwort = await (await callUrlaubEntscheiden())(EINGABE);

    expect(alsFunction).toHaveBeenCalledWith('urlaubEntscheiden', EINGABE);
    expect(entscheiden).not.toHaveBeenCalled();
    expect(antwort).toEqual({ data: ZAHLEN });
  });
});

describe('Schein vorbereiten — dieselben Stunden aus zwei Datenbanken', () => {
  it('unter Postgres fragt die Datenbank, nicht die Cloud Function', async () => {
    nutztPostgres.mockReturnValue(true);
    const antwort = await (await callScheinVorbereiten())(SCHEIN_EINGABE);

    // Die Datenbankfunktion nimmt zwei Argumente, die Function ein Objekt.
    expect(vorbereiten).toHaveBeenCalledWith('2026-041', '2026-03-10');
    expect(alsFunction).not.toHaveBeenCalled();
    expect(antwort).toEqual({ data: STUNDEN });
  });

  it('unter Firestore die Cloud Function, nicht die Datenbank', async () => {
    nutztPostgres.mockReturnValue(false);
    const antwort = await (await callScheinVorbereiten())(SCHEIN_EINGABE);

    expect(alsFunction).toHaveBeenCalledWith('scheinVorbereiten', SCHEIN_EINGABE);
    expect(vorbereiten).not.toHaveBeenCalled();
    expect(antwort).toEqual({ data: STUNDEN });
  });
});

describe('Betriebsauszug — derselbe Bestand aus zwei Datenbanken', () => {
  it('unter Postgres fragt die Datenbank, nicht die Cloud Function', async () => {
    nutztPostgres.mockReturnValue(true);
    const antwort = await (await callExportCompanyData())();

    expect(auszug).toHaveBeenCalled();
    expect(alsFunction).not.toHaveBeenCalled();
    expect(antwort).toEqual({ data: AUSZUG });
  });

  it('unter Firestore die Cloud Function, nicht die Datenbank', async () => {
    nutztPostgres.mockReturnValue(false);
    const antwort = await (await callExportCompanyData())();

    expect(alsFunction).toHaveBeenCalledWith('exportCompanyData', {});
    expect(auszug).not.toHaveBeenCalled();
    expect(antwort).toEqual({ data: AUSZUG });
  });
});

describe('Betrieb anlegen — Edge Function statt Cloud Function', () => {
  it('unter Postgres die Edge Function, nicht die Cloud Function', async () => {
    nutztPostgres.mockReturnValue(true);
    const antwort = await (await callBetriebAnlegen())(BETRIEB_EINGABE);

    expect(betriebAnlegen).toHaveBeenCalledWith(BETRIEB_EINGABE);
    expect(alsFunction).not.toHaveBeenCalled();
    expect(antwort).toEqual({ data: ANGELEGT });
  });

  it('unter Firestore die Cloud Function, nicht die Edge Function', async () => {
    nutztPostgres.mockReturnValue(false);
    const antwort = await (await callBetriebAnlegen())(BETRIEB_EINGABE);

    expect(alsFunction).toHaveBeenCalledWith('betriebAnlegen', BETRIEB_EINGABE);
    expect(betriebAnlegen).not.toHaveBeenCalled();
    expect(antwort).toEqual({ data: ANGELEGT });
  });
});
