import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEffect } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, TimeEntry, Role, WorkSheet } from '@/types';
import TimeView from '@/features/time/TimeView';

const journalLaden = vi.fn();
vi.mock('@/lib/db/zeitjournal', () => ({ listZeitjournal: (...a: unknown[]) => journalLaden(...a) }));

/**
 * Der meistbenutzte Bildschirm der App — und bis jetzt ohne eigenen Test.
 *
 * Was hier geprüft wird, ist nicht die Zeitrechnung: die steht in
 * `time.test.ts` und ist dort gründlich abgedeckt. Geprüft wird die
 * VERDRAHTUNG, also genau die Naht, in der die bisher gemeldeten Fehler
 * lagen — welche Zahl in welcher Kachel landet, welcher Weg zum Saldo
 * genommen wird, und was passiert, wenn ein Ladevorgang scheitert.
 *
 * Der Saldo ist dabei der Punkt, an dem es wehtut: er steht am Ende auf einem
 * Lohnzettel.
 */

const MONTEUR: AppUser = {
  id: 'u1',
  companyId: 'perl',
  uid: 'u1',
  name: 'Max Mustermann',
  email: 'max@perl.at',
  role: 'Mitarbeiter',
  active: true,
  weeklyTargetHours: 40,
  yearlyVacationDays: 25,
  workDays: [1, 2, 3, 4, 5],
  appStartDate: '2026-06-01',
  initialOvertime: 0,
} as AppUser;

const eintrag = (over: Partial<TimeEntry> & { id: string }): TimeEntry & { id: string } =>
  ({
    companyId: 'perl',
    userId: 'u1',
    userName: 'Max Mustermann',
    status: 'Anwesend',
    startTime: '07:00',
    endTime: '15:00',
    breakDuration: 0,
    date: '2026-09-01',
    ...over,
  }) as TimeEntry & { id: string };

let eintraege: (TimeEntry & { id: string })[] = [];
let profilFehlerWerfen = false;
let marker: { vollstaendigAb: string } | null = null;
let rolle: Role = 'Mitarbeiter';

const abo = vi.fn();
const listeSeit = vi.fn();
const listeBereich = vi.fn();
const listeBilanzen = vi.fn();

/** Der Rueckruf des Live-Abos — damit ein Test einen zweiten Schnappschuss
 *  schicken kann, so wie Firestore es nach der Serverbestaetigung tut. */
let schnappschussSenden: ((rows: (TimeEntry & { id: string })[]) => void) | null = null;

vi.mock('@/lib/db/timeEntries', () => ({
  subscribeOwnEntriesInRange: (
    _company: string,
    _uid: string,
    von: string,
    bis: string,
    cb: (rows: (TimeEntry & { id: string })[]) => void,
  ) => {
    abo(von, bis);
    schnappschussSenden = cb;
    cb(eintraege);
    return () => undefined;
  },
  listOwnEntriesSince: (_company: string, _uid: string, ab: string) => {
    listeSeit(ab);
    return Promise.resolve(eintraege);
  },
  // Der Eintrittsmonat für den Saldo aus Bilanzen (Prüflauf 25.09.2026, P1-15).
  listOwnEntriesInRange: (_company: string, _uid: string, von: string, bis: string) => {
    listeBereich(von, bis);
    return Promise.resolve(eintraege.filter((e) => e.date >= von && e.date <= bis));
  },
  deleteTimeEntry: vi.fn(async () => undefined),
}));

/*
  Das eigene Geburtsdatum (Runde 3, M2) — ab Werk keines: dann ändert sich an
  der Ansicht nichts, wie vor der Prüfung.
*/
let geburtsdatum: string | null = null;
vi.mock('@/lib/db/arbeitszeitGrenzen', () => ({
  getGeburtsdatum: vi.fn(async () => geburtsdatum),
}));

vi.mock('@/lib/db/users', () => ({
  getUserByUid: vi.fn(async () => {
    if (profilFehlerWerfen) throw new Error('kein Netz');
    return { ...MONTEUR, role: rolle };
  }),
}));

vi.mock('@/lib/db/monatsbilanzen', () => ({
  monatVon: (d: string) => d.slice(0, 7),
  bilanzMarker: vi.fn(async () => marker),
  listBilanzen: vi.fn(async (_c: string, _u: string, ab: string) => {
    listeBilanzen(ab);
    return [];
  }),
}));

/*
  Das Formular hat seine eigenen Belange (und seine eigenen Tests). Hier geht
  es um die Ansicht drumherum — mit einer Ausnahme: was als VORBELEGUNG
  ankommt, ist genau die Naht, um die es beim Nachtragen geht. Der
  Doppelgänger schreibt sie deshalb sichtbar hin.
*/
/*
  Wie oft das Formular NEU AUFGESETZT wurde. Seine Felder werden mit
  `useState` initialisiert, und ein React-Zustand ändert sich nicht, weil eine
  Eigenschaft sich ändert — ohne neuen Schlüssel bliebe das Formular auf dem
  alten Stand stehen, und der Klick auf „Zeit nachtragen" täte sichtbar
  nichts. Genau das prüft der Zähler.
*/
let formularAufbauten = 0;
vi.mock('@/features/time/TimeForm', () => ({
  default: function Zeitformular({
    vorbelegung,
    entry,
  }: {
    vorbelegung?: Record<string, unknown> | null;
    entry?: { id: string };
  }) {
    useEffect(() => {
      formularAufbauten += 1;
    }, []);
    return (
      <div data-testid="zeitformular">
        {/* Welcher Eintrag bearbeitet wird — für die antippbare Zeile (Linie „Lot“). */}
        {entry ? `bearbeitet: ${entry.id}` : vorbelegung ? `vorbelegt: ${JSON.stringify(vorbelegung)}` : 'leer'}
      </div>
    );
  },
}));

/*
  Die Krankmeldung zu einem Krank-Tag öffnet sich im Seitenfenster und lädt
  sich dort selbst.
*/
vi.mock('@/lib/db/abwesenheiten', () => ({
  getKrankmeldung: vi.fn(async (_c: string, id: string) => ({
    id, companyId: 'perl', userId: 'u1', userName: 'Max Mustermann', von: '2026-09-01', bis: '2026-09-03',
  })),
  krankmeldungSpeichern: vi.fn(),
  krankmeldungLoeschen: vi.fn(),
  listKrankmeldungenAb: vi.fn(async () => []),
}));

/**
 * „Bearbeiten“ ist seit der Linie „Lot“ die Zeile selbst (Regel 3): ihr
 * Titel ist der Knopf, für die Vorlesehilfe „… bearbeiten“. Geprüft wird
 * deshalb ein Knopf, dessen Name auf „bearbeiten“ endet — was die Tests
 * schützen (gesperrte Einträge lassen sich nicht öffnen, offene schon),
 * bleibt dasselbe.
 */
const BEARBEITEN = /bearbeiten$/;
/** Die Zeile zu einem Datum — jedes Mal neu gesucht, weil sie sich beim Nachladen neu aufbaut. */
const zeileVom = (datum: string) => screen.getByText(datum).closest('li') as HTMLElement;

/*
  Die eigenen Handwerksscheine der letzten zwei Wochen. Daraus entsteht der
  Hinweis „unterschriebener Schein ohne Zeiteintrag" — abgeleitet, nicht
  gespeichert.
*/
let eigeneScheine: (WorkSheet & { id: string })[] = [];
const listOwnWorkSheetsSince = vi.fn(async () => eigeneScheine);
vi.mock('@/lib/db/workSheets', () => ({
  listOwnWorkSheetsSince: () => listOwnWorkSheetsSince(),
}));

/**
 * EIN STABILES Objekt, nicht bei jedem Rendern ein neues.
 *
 * `useEffect([user])` haengt an der Identitaet. Gibt die Attrappe jedes Mal
 * ein frisches Objekt zurueck, laeuft der Effekt nach jedem Rendern erneut,
 * setzt Zustand, rendert wieder — und der Test haengt, ohne dass an der
 * Ansicht etwas falsch waere.
 */
const authWert = {
  user: { uid: 'u1', companyId: 'perl', name: 'Max Mustermann', role: 'Mitarbeiter' as Role },
  company: { id: 'perl', name: 'Perl Installationen' },
};

vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

function zeige() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <TimeView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  journalLaden.mockReset().mockResolvedValue({ zeilen: [], naechste: null });
  eigeneScheine = [];
  formularAufbauten = 0;
  listOwnWorkSheetsSince.mockClear();
  // Fest auf Dienstag, den 1. September 2026 — sonst verschiebt „diese Woche"
  // den Test mit der Zeit. NUR `Date` faelschen: ein vollstaendig
  // eingefrorener Zeitgeber laesst `waitFor` und userEvent haengen (siehe die
  // Falle in docs/UEBERGABE.md §4).
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 1, 9, 0, 0));
  eintraege = [];
  geburtsdatum = null;
  profilFehlerWerfen = false;
  marker = null;
  rolle = 'Mitarbeiter';
  authWert.user.role = 'Mitarbeiter';
  schnappschussSenden = null;
  abo.mockClear();
  listeSeit.mockClear();
  listeBereich.mockClear();
  listeBilanzen.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Zeiterfassung — verrechnete Einträge', () => {
  it('sperrt einen verrechneten Eintrag gegen Bearbeiten und Löschen', async () => {
    /**
     * DER GEFÄHRLICHSTE FALL DIESER ANSICHT. Ein verrechneter Eintrag ist die
     * Grundlage einer verschickten Rechnung. Ließe er sich nachträglich
     * ändern, stünde auf der Rechnung des Kunden etwas anderes als im System
     * — und niemand könnte den Unterschied erklären.
     */
    eintraege = [
      eintrag({ id: 'verrechnet', date: '2026-09-01', isBilled: true }),
      eintrag({ id: 'offen', date: '2026-08-31' }),
    ];
    zeige();

    const gesperrt = (await screen.findByText('01.09.2026')).closest('li') as HTMLElement;
    expect(within(gesperrt).getByText('verrechnet')).toBeInTheDocument();
    expect(within(gesperrt).queryByRole('button', { name: BEARBEITEN })).toBeNull();
    expect(within(gesperrt).queryByRole('button', { name: 'Löschen' })).toBeNull();

    // Der offene daneben bleibt bearbeitbar — sonst prüfte der Test nur, dass
    // es überhaupt keine Knöpfe gibt.
    const offen = screen.getByText('31.08.2026').closest('li') as HTMLElement;
    expect(within(offen).getByRole('button', { name: BEARBEITEN })).toBeInTheDocument();
  });
});

describe('Zeiterfassung — welcher Weg zum Saldo', () => {
  it('nimmt die Bilanzen, wenn der Marker den Eintrittsmonat abdeckt', async () => {
    marker = { vollstaendigAb: '2026-05' }; // vor dem Eintritt im Juni
    eintraege = [eintrag({ id: 'e1' })];
    zeige();

    await waitFor(() => expect(listeBilanzen).toHaveBeenCalled());
    expect(listeBilanzen).toHaveBeenCalledWith('2026-06');
    // Der Eintrittsmonat kommt aus den Einzelbuchungen ab dem Eintritt —
    // seine Bilanz zählt auch Tage davor (Prüflauf 25.09.2026, P1-15).
    expect(listeBereich).toHaveBeenCalledWith('2026-06-01', '2026-06-30');
  });

  it('fällt auf die Rohdaten zurück, wenn der Marker den Anfang NICHT abdeckt', async () => {
    /**
     * Der Rückfall ist die eigentliche Arbeit an dieser Stelle. Eine fehlende
     * Bilanz ist von einem Monat ohne Buchungen nicht zu unterscheiden — wer
     * sie ungeprüft summiert, bekommt bei lückenhaftem Bestand einen zu
     * NIEDRIGEN Saldo, ohne Fehlermeldung. Deckt der Marker erst den Juli ab,
     * fehlten Juni und alles davor.
     */
    marker = { vollstaendigAb: '2026-07' }; // NACH dem Eintritt im Juni
    eintraege = [eintrag({ id: 'e1' })];
    zeige();

    await waitFor(() => expect(listeSeit).toHaveBeenCalledWith('2026-06-01'));
    expect(listeBilanzen).not.toHaveBeenCalled();
  });

  it('fällt auch zurück, wenn es gar keinen Marker gibt', async () => {
    marker = null;
    eintraege = [eintrag({ id: 'e1' })];
    zeige();

    await waitFor(() => expect(listeSeit).toHaveBeenCalledWith('2026-06-01'));
    expect(listeBilanzen).not.toHaveBeenCalled();
  });

  it('zeigt der Geschäftsführung gar keine Saldo-Kachel', async () => {
    // Sie führt kein Zeitkonto; dort stand dauerhaft „— Kein Startdatum
    // konfiguriert", was wie ein Einrichtungsfehler aussieht.
    rolle = 'Geschäftsführung';
    authWert.user.role = 'Geschäftsführung';
    eintraege = [eintrag({ id: 'e1' })];
    zeige();

    await screen.findByText('Diese Woche');
    expect(screen.queryByText('Saldo')).toBeNull();
  });
});

describe('Zeiterfassung — wenn etwas nicht lädt', () => {
  it('sagt es, wenn das Stammdatenblatt nicht kommt', async () => {
    /**
     * Vorher stand hier `catch(() => undefined)`: der Saldo rechnete nicht,
     * und die Kachel behauptete „Kein Startdatum konfiguriert" — ein
     * Einrichtungsfehler, den niemand beheben kann, angezeigt für ein
     * Netzproblem.
     */
    profilFehlerWerfen = true;
    eintraege = [eintrag({ id: 'e1' })];
    zeige();

    const hinweis = await screen.findByRole('alert');
    expect(hinweis).toHaveTextContent('Dein Stammdatenblatt konnte nicht geladen werden.');
  });
});

describe('Zeiterfassung — die Kachel „Diese Woche“', () => {
  it('steht ohne die Kachel „Einträge“ da (Analyse 03.10.2026, Paket 1)', async () => {
    // Die Zahl der Buchungen sagte nichts und schob das Formular nach unten.
    eintraege = [eintrag({ id: 'e1' })];
    zeige();
    await screen.findByText('Diese Woche');
    expect(screen.queryByText('Einträge')).toBeNull();
    // Gegenprobe: die Liste der eigenen Einträge bleibt.
    expect(screen.getByText('Meine Einträge')).toBeInTheDocument();
  });

  it('summiert die TATSÄCHLICHE Kalenderwoche, nicht die letzte mit Buchungen', async () => {
    /**
     * Ein gemeldeter Fehler von früher: genommen wurde die neueste Woche MIT
     * Einträgen. Nach einer buchungsfreien Woche zeigte die Kachel deshalb
     * fremde Zahlen unter dem Label „Diese Woche".
     */
    eintraege = [
      eintrag({ id: 'diese', date: '2026-09-01', startTime: '07:00', endTime: '15:00' }),
      // Zwei Wochen vorher, acht Stunden — dürfen NICHT mitzählen.
      eintrag({ id: 'alte', date: '2026-08-18', startTime: '07:00', endTime: '15:00' }),
    ];
    zeige();

    const kachel = (await screen.findByText('Diese Woche')).closest('div') as HTMLElement;
    expect(within(kachel).getByText('08:00')).toBeInTheDocument();
  });
});

describe('Zeiterfassung — ältere Einträge', () => {
  it('weitet die ABFRAGE aus, statt nur mehr vom Geladenen zu zeigen', async () => {
    /**
     * Der Unterschied ist nicht kosmetisch: vorher lud die Ansicht ohnehin
     * alles und gab nur einen Ausschnitt frei — die Datenmenge blieb
     * dieselbe. Der Knopf muss den Zeitraum der Abfrage verschieben.
     */
    eintraege = [eintrag({ id: 'e1' })];
    zeige();
    await screen.findByText('Meine Einträge');

    const letzterAufruf = () => abo.mock.calls[abo.mock.calls.length - 1] as [string, string];
    const ersterZeitraum = letzterAufruf()[0];
    await userEvent.click(screen.getByRole('button', { name: 'Ältere Einträge laden' }));

    await waitFor(() => {
      expect(letzterAufruf()[0] < ersterZeitraum).toBe(true);
    });
  });
});

/**
 * Was eine Buchung KOSTET.
 *
 * Aus dem Betrieb gemeldet: „das Erfassen einer Zeitbuchung hat lange
 * gedauert, das muss schnell gehen." Die Ansicht holte danach zweimal den
 * ganzen Saldo — einmal auf den lokalen Schnappschuss, einmal auf die
 * Bestätigung des Servers — und dabei jedes Mal auch den laufenden Monat, der
 * längst geladen war.
 */
describe('Zeiterfassung — was eine Buchung an Abfragen kostet', () => {
  it('rechnet den Saldo NICHT neu, wenn sich inhaltlich nichts geaendert hat', async () => {
    marker = null;
    eintraege = [eintrag({ id: 'e1' })];
    zeige();
    await waitFor(() => expect(listeSeit).toHaveBeenCalled());
    const vorher = listeSeit.mock.calls.length;

    // Zweiter Schnappschuss, derselbe Inhalt, neues Array — genau das schickt
    // Firestore, wenn der Server eine Buchung bestaetigt, die lokal schon galt.
    await act(async () => {
      schnappschussSenden?.([eintrag({ id: 'e1' })]);
    });

    expect(listeSeit.mock.calls.length).toBe(vorher);
  });

  it('rechnet den Saldo SEHR WOHL neu, wenn eine Buchung dazukommt', async () => {
    // Sonst prueft der Test daneben nur, dass ueberhaupt nichts mehr passiert.
    marker = null;
    eintraege = [eintrag({ id: 'e1' })];
    zeige();
    await waitFor(() => expect(listeSeit).toHaveBeenCalled());
    const vorher = listeSeit.mock.calls.length;

    await act(async () => {
      schnappschussSenden?.([eintrag({ id: 'e1' }), eintrag({ id: 'e2', date: '2026-08-31' })]);
    });

    await waitFor(() => expect(listeSeit.mock.calls.length).toBeGreaterThan(vorher));
  });

  it('holt den laufenden Monat nicht ein zweites Mal vom Server', async () => {
    /**
     * Er liegt im Fenster des Live-Abos — das reicht drei Monate zurueck.
     * Wird er trotzdem geholt, ist das eine Netzrunde je Buchung, auf die der
     * Monteur wartet.
     */
    marker = { vollstaendigAb: '2026-05' }; // Bilanzen sind brauchbar
    eintraege = [eintrag({ id: 'e1' })];
    zeige();

    await waitFor(() => expect(listeBilanzen).toHaveBeenCalled());
    expect(listeSeit).not.toHaveBeenCalled();
  });
});

/**
 * Offene Nachtragungen — unterschriebene Scheine ohne Zeiteintrag.
 *
 * DIE RECHNUNG RECHNET IHRE STUNDEN AUS DEN ZEITEINTRÄGEN, nicht vom Schein;
 * der Schein liefert nur das Material. Eine nie gebuchte Stunde wird also nie
 * verrechnet — nicht „später korrigiert", sondern nie. Und zugleich fehlt die
 * Arbeitszeitaufzeichnung nach § 26 AZG.
 */
describe('Offene Nachtragungen', () => {
  const schein = (
    id: string,
    datum: string,
    p: Partial<WorkSheet> = {},
  ): WorkSheet & { id: string } =>
    ({
      id,
      companyId: 'perl',
      projectNumber: '2026-042',
      customerName: 'Familie Huber',
      datum,
      status: 'Unterschrieben',
      abrechnung: 'Regie',
      zeiten: [
        { datum, mitarbeiter: 'Max Mustermann', von: '08:00', bis: '11:00', pauseMin: 0, minuten: 180 },
      ],
      material: [],
      erstelltVonUid: 'u1',
      erstelltVonName: 'Max Mustermann',
      ...p,
    }) as WorkSheet & { id: string };

  it('setzt das Formular neu auf, sonst täte der Knopf sichtbar nichts', async () => {
    /*
      Die Felder des Formulars werden mit `useState` INITIALISIERT. Ein
      React-Zustand ändert sich nicht, weil eine Eigenschaft sich ändert —
      ohne neuen Schlüssel bliebe „07:00 bis 16:00" stehen, obwohl auf dem
      Schein „08:00 bis 11:00" steht. Der Monteur tippte auf den Knopf, sähe
      keine Änderung und trüge die Zeit von Hand ein.
    */
    eintraege = [];
    eigeneScheine = [schein('s1', '2026-08-31')];
    const nutzer = userEvent.setup();
    zeige();

    await screen.findByRole('button', { name: 'Zeit nachtragen' });
    const vorher = formularAufbauten;
    await nutzer.click(screen.getByRole('button', { name: 'Zeit nachtragen' }));
    await waitFor(() => expect(formularAufbauten).toBeGreaterThan(vorher));
  });

  it('meldet einen Schein, für den keine Zeit gebucht ist', async () => {
    eintraege = [];
    eigeneScheine = [schein('s1', '2026-08-31')];
    zeige();

    expect(
      await screen.findByText(/wartet noch auf deine Zeitbuchung/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Familie Huber/)).toBeInTheDocument();
    expect(screen.getByText(/03:00 Std beim Kunden/)).toBeInTheDocument();
  });

  it('schweigt, sobald die Zeit gebucht ist', async () => {
    eintraege = [
      {
        id: 'e1',
        companyId: 'perl',
        userId: 'u1',
        date: '2026-08-31',
        status: 'Anwesend',
        projectNumber: '2026-042',
        startTime: '07:00',
        endTime: '16:00',
        breakDuration: 30,
      } as TimeEntry & { id: string },
    ];
    eigeneScheine = [schein('s1', '2026-08-31')];
    zeige();

    await screen.findByTestId('zeitformular');
    expect(screen.queryByText(/wartet noch auf deine Zeitbuchung/)).not.toBeInTheDocument();
  });

  /*
    DIE MINUTEN WERDEN NICHT VERGLICHEN. Der Arbeitstag ist regelmässig länger
    als die Zeit beim Kunden — Anfahrt, andere Baustellen, Rüstzeit. Ein
    Wächter, der jede Abweichung meldet, schlüge ständig zu Recht an und würde
    nach einer Woche weggeklickt.
  */
  it('meckert nicht, wenn der Eintrag länger ist als der Schein', async () => {
    eintraege = [
      {
        id: 'e1',
        companyId: 'perl',
        userId: 'u1',
        date: '2026-08-31',
        status: 'Anwesend',
        projectNumber: '2026-042',
        startTime: '07:00',
        endTime: '17:00',
        breakDuration: 30,
      } as TimeEntry & { id: string },
    ];
    eigeneScheine = [schein('s1', '2026-08-31')];
    zeige();

    await screen.findByTestId('zeitformular');
    expect(screen.queryByText(/wartet noch auf deine Zeitbuchung/)).not.toBeInTheDocument();
  });

  it('übernimmt Datum, Baustelle und Zeitspanne ins Formular', async () => {
    // Abtippen ist genau die Reibung, an der das Nachtragen scheitert.
    eintraege = [];
    eigeneScheine = [schein('s1', '2026-08-31')];
    const nutzer = userEvent.setup();
    zeige();

    await nutzer.click(await screen.findByRole('button', { name: 'Zeit nachtragen' }));
    const formular = await screen.findByTestId('zeitformular');
    expect(formular.textContent).toContain('"date":"2026-08-31"');
    expect(formular.textContent).toContain('"projectNumber":"2026-042"');
    expect(formular.textContent).toContain('"startTime":"08:00"');
    expect(formular.textContent).toContain('"endTime":"11:00"');
  });

  it('sagt im „i“, was noch zu ergänzen ist', async () => {
    /*
      Anfahrt und Fahrzeug (Kennzeichen) kennt der Schein nicht — und genau
      deshalb wird der Eintrag NICHT automatisch erzeugt. Stünde das nirgends,
      wäre der Hinweis eine Aufforderung ohne Anleitung.
    */
    eintraege = [];
    eigeneScheine = [schein('s1', '2026-08-31')];
    const nutzer = userEvent.setup();
    zeige();

    await nutzer.click(
      await screen.findByRole('button', { name: /offene Nachtragungen/i }),
    );
    /*
      Der ganze Hinweiskasten, nicht ein einzelner Treffer: „Fahrzeug
      (Kennzeichen)" steht bewusst zweimal darin — einmal in der Begründung,
      warum NICHT automatisch gebucht wird, und einmal in der Aufzählung
      dessen, was zu ergänzen ist.
    */
    const kasten = (await screen.findByRole('alert')).textContent ?? '';
    expect(kasten).toMatch(/Fahrzeug \(Kennzeichen\)/);
    expect(kasten).toMatch(/Anfahrt/);
    expect(kasten).toMatch(/§ 26 AZG/);
  });

  it('führt einen reinen Materialschein nicht als Nachtrag', async () => {
    // Dafür war niemand stundenlang dort — es gibt nichts nachzutragen.
    eintraege = [];
    eigeneScheine = [schein('s1', '2026-08-31', { zeiten: [] })];
    zeige();

    await screen.findByTestId('zeitformular');
    expect(screen.queryByText(/wartet noch auf deine Zeitbuchung/)).not.toBeInTheDocument();
  });

  it('bleibt still, wenn die Scheine nicht geladen werden können', async () => {
    // Der Hinweis ist eine Zusatzangabe. Gebucht werden muss auch dann.
    listOwnWorkSheetsSince.mockRejectedValueOnce(new Error('offline'));
    eintraege = [];
    eigeneScheine = [schein('s1', '2026-08-31')];
    zeige();

    await screen.findByTestId('zeitformular');
    expect(screen.queryByText(/wartet noch auf deine Zeitbuchung/)).not.toBeInTheDocument();
  });
});

/**
 * Zuschlagsstunden im eigenen Zeitkonto.
 *
 * Nacht und Notdienst gehen seit dem 08.09.2026 in die Lohnausleitung ein —
 * der Zuschlag ist ein Anspruch nach Kollektivvertrag. Sichtbar war er damit
 * aber nur, wenn das Büro eine CSV zog: der Mann selbst konnte nicht prüfen,
 * ob überhaupt gezählt wird, was er gearbeitet hat.
 */
describe('Zuschlagsstunden', () => {
  it('zeigt sie als eigene Kachel, aufgeschlüsselt im Beipacktext', async () => {
    eintraege = [
      eintrag({ id: 'n1', isNightWork: true, startTime: '22:00', endTime: '06:00' }),
      eintrag({ id: 'n2', date: '2026-09-02', isEmergency: true }),
    ];
    zeige();

    expect(await screen.findByText('Zuschlag')).toBeInTheDocument();
    expect(screen.getByText(/Nacht 08:00 · Notdienst 08:00/)).toBeInTheDocument();
  });

  /*
    DER WERT IST DIE VEREINIGUNG, NICHT DIE SUMME. Der Rohrbruch um zwei Uhr
    früh trägt beide Kennzeichen; addiert stünde er doppelt da, und niemand
    sähe der Kachel an, warum sie mehr zeigt, als der Mann gearbeitet hat.
  */
  it('zählt die Stunde mit beiden Kennzeichen nur einmal', async () => {
    // Ganz in der Nachtzeit — seit M35 zählt nur die (Testbericht 30.09.2026).
    eintraege = [eintrag({ id: 'n1', isNightWork: true, isEmergency: true, startTime: '22:00', endTime: '06:00' })];
    zeige();

    const kachel = (await screen.findByText('Zuschlag')).parentElement;
    // 8 h, nicht 16 h — die Stunde trägt beide Kennzeichen, ist aber eine.
    expect(kachel).toHaveTextContent('08:00');
    expect(kachel).not.toHaveTextContent('16:00');
    expect(screen.getByText(/08:00 beides/)).toBeInTheDocument();
  });

  /*
    Eine Kachel, die bei den allermeisten dauerhaft „0:00" zeigt, nimmt auf
    dem Telefon die Breite weg, die Saldo und Wochensumme brauchen — und sagt
    nichts.
  */
  it('bleibt weg, wenn keine anfielen', async () => {
    eintraege = [eintrag({ id: 'e1' })];
    zeige();

    await screen.findByText('Diese Woche');
    expect(screen.queryByText('Zuschlag')).not.toBeInTheDocument();
  });

  it('zählt Urlaub und Krankenstand nicht mit', async () => {
    // Ein Abwesenheitstag trägt kein Kennzeichen — stünde er drin, wäre die
    // Zuschlagszeit höher als die Arbeitszeit.
    eintraege = [eintrag({ id: 'k1', status: 'Krank', isNightWork: true })];
    zeige();

    await screen.findByText('Diese Woche');
    expect(screen.queryByText('Zuschlag')).not.toBeInTheDocument();
  });
});

/**
 * Was kommt, steht in der Liste — und ein Tag aus einem Antrag führt zum Antrag.
 *
 * Gefunden im Prüflauf vom 24.09.2026: die Liste lud nur bis heute. Eine
 * Krankmeldung bis Freitag oder ein Urlaub im nächsten Monat standen im
 * Zeitkonto, aber nirgends zu sehen — und der Hinweis in der Maske, in der
 * Liste auf „Krankmeldung" zu tippen, lief ins Leere.
 */
describe('Zeiterfassung — Abwesenheiten, die noch kommen', () => {
  function zeigeMitRouter() {
    return render(
      <MemoryRouter>
        <ToastProvider>
          <TimeView />
        </ToastProvider>
      </MemoryRouter>,
    );
  }

  it('lädt ein Jahr voraus', async () => {
    zeigeMitRouter();
    await screen.findByText('Meine Einträge');
    const [, bis] = abo.mock.calls[abo.mock.calls.length - 1] as [string, string];
    const inElfMonaten = new Date();
    inElfMonaten.setMonth(inElfMonaten.getMonth() + 11);
    expect(bis > inElfMonaten.toISOString().slice(0, 10)).toBe(true);
  });

  it('bietet bei einem Tag aus einem genehmigten Antrag den Antrag an — nicht Bearbeiten und Löschen', async () => {
    eintraege = [eintrag({ id: 'u1', status: 'Urlaub', startTime: undefined, endTime: undefined, vacationId: 'v1' })];
    zeigeMitRouter();
    expect(await screen.findByRole('button', { name: 'Urlaubsantrag' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: BEARBEITEN })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument();
  });
});

describe('Zeiterfassung — vom Büro gebuchter Zeitausgleich (Prüflauf 25.09.2026, P1-26)', () => {
  /*
    Einen gebuchten Zeitausgleich ändert nur das Büro; die Datenbank lehnt
    Bearbeiten und Löschen durch den Monteur ab. Vorher standen die Knöpfe
    trotzdem da und brachten nur eine Fehlermeldung.
  */
  it('zeigt dem Monteur keine Knöpfe, die die Datenbank ablehnt', async () => {
    eintraege = [
      eintrag({
        id: 'za',
        date: '2026-09-01',
        status: 'Zeitausgleich',
        startTime: '',
        endTime: '',
      }),
      eintrag({ id: 'offen', date: '2026-08-31' }),
    ];
    zeige();

    const za = (await screen.findByText('01.09.2026')).closest('li') as HTMLElement;
    expect(within(za).getByText('vom Büro gebucht')).toBeInTheDocument();
    expect(within(za).queryByRole('button', { name: BEARBEITEN })).toBeNull();
    expect(within(za).queryByRole('button', { name: 'Löschen' })).toBeNull();

    const offen = screen.getByText('31.08.2026').closest('li') as HTMLElement;
    expect(within(offen).getByRole('button', { name: BEARBEITEN })).toBeInTheDocument();
  });

  it('lässt sie der Buchhaltung', async () => {
    rolle = 'Buchhaltung';
    authWert.user.role = 'Buchhaltung';
    eintraege = [
      eintrag({ id: 'za', date: '2026-09-01', status: 'Zeitausgleich', startTime: '', endTime: '' }),
    ];
    zeige();

    const za = (await screen.findByText('01.09.2026')).closest('li') as HTMLElement;
    expect(within(za).getByRole('button', { name: BEARBEITEN })).toBeInTheDocument();
    expect(within(za).getByRole('button', { name: 'Löschen' })).toBeInTheDocument();
  });
});

/*
  DIE GANZE ZEILE ÖFFNET DEN EINTRAG (Linie „Lot“, Regel 3). Vorher trug jede
  Zeile „Bearbeiten“ und „Löschen“ nebeneinander — am Handy zwei kleine
  Textknöpfe unter den Stunden. Jetzt ist die Zeile das Ziel; Löschen bleibt
  ein eigener Knopf mit Rückfrage.
*/
describe('Zeiterfassung — die Zeile öffnet den Eintrag (Linie „Lot“)', () => {
  it('ein Tipp auf die Zeile setzt das Formular auf den Eintrag und holt es ins Bild', async () => {
    const rollen = vi.fn();
    const vorher = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = rollen;
    try {
      eintraege = [eintrag({ id: 'offen', date: '2026-08-31' })];
      const { container } = zeige();
      await screen.findByText('31.08.2026');
      expect(screen.getByTestId('zeitformular')).toHaveTextContent('leer');

      await userEvent.click(within(zeileVom('31.08.2026')).getByRole('button', { name: BEARBEITEN }));

      expect(screen.getByTestId('zeitformular')).toHaveTextContent('bearbeitet: offen');
      expect(screen.getByRole('heading', { name: 'Eintrag bearbeiten' })).toBeInTheDocument();
      // Am Handy steht das Formular über der Liste: ohne Sprung täte der Tipp sichtbar nichts.
      expect(rollen).toHaveBeenCalled();
      expect(container.querySelector('#zeit-formular')).toHaveFocus();
    } finally {
      Element.prototype.scrollIntoView = vorher;
    }
  });

  it('Gegenprobe: Löschen bleibt ein eigenes Ziel — mit Rückfrage, ohne das Formular zu öffnen', async () => {
    eintraege = [eintrag({ id: 'offen', date: '2026-08-31' })];
    zeige();
    await screen.findByText('31.08.2026');
    await userEvent.click(within(zeileVom('31.08.2026')).getByRole('button', { name: 'Löschen' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Eintrag löschen?');
    expect(screen.getByTestId('zeitformular')).toHaveTextContent('leer');
  });

  it('die Krankmeldung eines Krank-Tags öffnet sich im Seitenfenster, mit ihren Handgriffen', async () => {
    eintraege = [
      eintrag({ id: 'k1', date: '2026-09-01', status: 'Krank', startTime: undefined, endTime: undefined, krankmeldungId: 'm1' }),
    ];
    zeige();
    // Gegenprobe: zu, solange niemand tippt.
    expect(screen.queryByRole('dialog', { name: 'Krankmeldung' })).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: 'Krankmeldung' }));
    const fenster = await screen.findByRole('dialog', { name: 'Krankmeldung' });
    expect(await within(fenster).findByText('01.09.2026 – 03.09.2026')).toBeInTheDocument();
    expect(within(fenster).getByRole('button', { name: 'Ende ändern' })).toBeInTheDocument();

    await userEvent.click(within(fenster).getByRole('button', { name: 'Schließen' }));
    expect(screen.queryByRole('dialog', { name: 'Krankmeldung' })).toBeNull();
  });
});

describe('Zeiterfassung — „Zu meinen Einträgen“ (Prüflauf 25.09.2026, P4-16)', () => {
  it('rollt nicht nur hin, sondern nimmt den Fokus mit', async () => {
    /*
      Vorher rollte nur das Bild. Tastatur und Vorlesehilfe blieben oben am
      Knopf, und der nächste Tab ging durch die ganze Maske, über die man
      gerade gesprungen war.
    */
    const rollen = vi.fn();
    const vorher = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = rollen;
    try {
      const { container } = zeige();
      await userEvent.click(await screen.findByRole('button', { name: /Zu meinen Einträgen/ }));
      const ziel = container.querySelector('#meine-eintraege') as HTMLElement;
      expect(rollen).toHaveBeenCalled();
      expect(ziel).toHaveFocus();
      // Fokussierbar per Programm, aber kein eigener Tab-Stopp.
      expect(ziel).toHaveAttribute('tabindex', '-1');
    } finally {
      Element.prototype.scrollIntoView = vorher;
    }
  });
});


/*
  DIE WOCHEN KLAPPEN AUF UND ZU (Rückmeldung vom 28.09.2026: „sonst ist es
  immer eine einzige lange Wurst an Daten"). Offen ist die neueste Woche und
  jede Woche mit einer doppelten Buchung — der Hinweis oben schickt dorthin.
*/
describe('Zeiterfassung — Wochen zum Aufklappen', () => {
  it('zeigt die neueste Woche offen und ältere zugeklappt mit Summe und Anzahl', async () => {
    eintraege = [
      eintrag({ id: 'diese', date: '2026-09-01', startTime: '07:00', endTime: '15:00' }),
      eintrag({ id: 'alte', date: '2026-08-18', startTime: '07:00', endTime: '15:00' }),
    ];
    zeige();

    expect(await screen.findByText('01.09.2026')).toBeInTheDocument();
    expect(screen.queryByText('18.08.2026')).toBeNull();

    const knoepfe = screen.getAllByRole('button', { expanded: false });
    const alteWoche = knoepfe.find((k) => /1 Eintrag/.test(k.textContent ?? ''))!;
    expect(alteWoche).toHaveTextContent('08:00');

    await userEvent.click(alteWoche);
    expect(alteWoche).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('18.08.2026')).toBeInTheDocument();

    // Und wieder zu — die eigene Wahl gilt vor der Voreinstellung.
    await userEvent.click(alteWoche);
    expect(screen.queryByText('18.08.2026')).toBeNull();
  });

  it('öffnet eine ältere Woche von selbst, wenn darin doppelt gebucht ist', async () => {
    eintraege = [
      eintrag({ id: 'diese', date: '2026-09-01', startTime: '07:00', endTime: '15:00' }),
      eintrag({ id: 'd1', date: '2026-08-18', startTime: '07:00', endTime: '15:00' }),
      eintrag({ id: 'd2', date: '2026-08-18', startTime: '07:00', endTime: '15:00' }),
    ];
    zeige();

    expect(await screen.findAllByText('18.08.2026')).toHaveLength(2);
  });
});

/*
  KOMMENDES STEHT FÜR SICH (Rückmeldung vom 29.09.2026). Die Liste lädt ein
  Jahr voraus; eingetragener Urlaub im Jänner stand deshalb ganz oben, und
  die laufende Woche kam erst darunter. Die Uhr steht auf Dienstag, den
  01.09.2026 — die laufende Woche reicht bis Sonntag, den 06.09.
*/
describe('Zeiterfassung — kommende Wochen', () => {
  const urlaub = (id: string, date: string) =>
    eintrag({ id, date, status: 'Urlaub', startTime: undefined, endTime: undefined });

  it('bündelt alles nach dieser Woche zugeklappt — die laufende Woche bleibt offen', async () => {
    eintraege = [
      urlaub('jaenner', '2027-01-04'),
      urlaub('okt', '2026-10-05'),
      eintrag({ id: 'heute', date: '2026-09-01', startTime: '07:00', endTime: '15:00' }),
      // Freitag dieser Woche: noch nicht da, gehört aber zur laufenden Woche.
      urlaub('freitag', '2026-09-04'),
    ];
    zeige();

    expect(await screen.findByText('01.09.2026')).toBeInTheDocument();
    expect(screen.getByText('04.09.2026')).toBeInTheDocument();
    expect(screen.queryByText('05.10.2026')).toBeNull();
    expect(screen.queryByText('04.01.2027')).toBeNull();

    const kopf = screen.getByRole('button', { name: /Kommende Wochen/ });
    expect(kopf).toHaveAttribute('aria-expanded', 'false');
    expect(kopf).toHaveTextContent('2 Einträge');
    expect(kopf).toHaveTextContent('bis 04.01.2027');

    // Der Abschnitt steht über der laufenden Woche.
    const knoepfe = screen.getAllByRole('button', { expanded: true }).concat(kopf);
    const woche = knoepfe.find((k) => /KW 36 \/ 2026/.test(k.textContent ?? ''))!;
    expect(woche).toHaveAttribute('aria-expanded', 'true');
    expect(kopf.compareDocumentPosition(woche) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Aufgeklappt: der nächste Tag zuerst.
    await userEvent.click(kopf);
    const oktober = screen.getByText('05.10.2026');
    const jaenner = screen.getByText('04.01.2027');
    expect(oktober.compareDocumentPosition(jaenner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('ohne Kommendes gibt es den Abschnitt nicht', async () => {
    eintraege = [eintrag({ id: 'heute', date: '2026-09-01', startTime: '07:00', endTime: '15:00' })];
    zeige();
    expect(await screen.findByText('01.09.2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Kommende Wochen/ })).toBeNull();
  });

  it('steht nur Kommendes da, ist es offen', async () => {
    eintraege = [urlaub('okt', '2026-10-05')];
    zeige();
    expect(await screen.findByText('05.10.2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Kommende Wochen/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('öffnet sich von selbst, wenn darin doppelt gebucht ist', async () => {
    eintraege = [
      eintrag({ id: 'heute', date: '2026-09-01', startTime: '07:00', endTime: '15:00' }),
      urlaub('d1', '2026-10-05'),
      eintrag({ id: 'd2', date: '2026-10-05', startTime: '07:00', endTime: '15:00' }),
    ];
    zeige();
    expect(await screen.findAllByText('05.10.2026')).toHaveLength(2);
  });
});

describe('Zeiterfassung — vom Büro gebucht, über der Grenze für Jugendliche (Runde 3, M2)', () => {
  /*
    „Der Lehrling selbst ... kann die vom Büro gebuchte Zeit bearbeiten oder
    löschen.“ Gesperrt wird in der Datenbank; hier stehen die Knöpfe gar
    nicht erst da, und der Grund steht hinter dem „i“.
  */
  const buero = (over: Partial<TimeEntry> & { id: string }) => eintrag({ angelegtVon: 'buero', ...over });

  it('ohne Bearbeiten und Löschen, mit dem Grund', async () => {
    geburtsdatum = '2010-03-15';
    eintraege = [
      buero({ id: 'lang', date: '2026-09-01', startTime: '07:00', endTime: '17:00', breakDuration: 30 }),
      buero({ id: 'frueh', date: '2026-08-31', startTime: '05:00', endTime: '10:00' }),
    ];
    zeige();
    await screen.findByText('01.09.2026');
    // Neu gesucht: kommt das Geburtsdatum, baut die Zeile sich ohne Knopf neu auf.
    await waitFor(() => expect(within(zeileVom('01.09.2026')).getByText('vom Büro gebucht')).toBeInTheDocument());
    const lang = zeileVom('01.09.2026');
    expect(within(lang).queryByRole('button', { name: BEARBEITEN })).toBeNull();
    expect(within(lang).queryByRole('button', { name: 'Löschen' })).toBeNull();
    const frueh = screen.getByText('31.08.2026').closest('li') as HTMLElement;
    expect(within(frueh).getByText('vom Büro gebucht')).toBeInTheDocument();

    await userEvent.setup({ advanceTimers: () => undefined }).click(
      within(lang).getByRole('button', { name: /vom Büro gebucht/ }),
    );
    expect(await screen.findByText(/nur das Büro/)).toBeInTheDocument();
  });

  it('Gegenprobe: selbst gebucht, innerhalb der Grenze oder erwachsen — die Knöpfe bleiben', async () => {
    geburtsdatum = '2010-03-15';
    eintraege = [
      eintrag({ id: 'selbst', date: '2026-09-01', startTime: '07:00', endTime: '17:00', angelegtVon: 'u1' }),
      buero({ id: 'kurz', date: '2026-08-31', startTime: '07:00', endTime: '15:00' }),
    ];
    zeige();
    await screen.findByText('01.09.2026');
    // Erst wenn das Geburtsdatum da ist, könnte etwas verschwinden — also darauf warten.
    await act(async () => { await Promise.resolve(); });
    const selbst = zeileVom('01.09.2026');
    expect(within(selbst).getByRole('button', { name: BEARBEITEN })).toBeInTheDocument();
    const kurz = screen.getByText('31.08.2026').closest('li') as HTMLElement;
    expect(within(kurz).getByRole('button', { name: 'Löschen' })).toBeInTheDocument();
  });

  it('Gegenprobe: erwachsen — die vom Büro gebuchte lange Zeit bleibt bearbeitbar', async () => {
    geburtsdatum = '1990-01-01';
    eintraege = [buero({ id: 'lang', date: '2026-09-01', startTime: '07:00', endTime: '17:00' })];
    zeige();
    await screen.findByText('01.09.2026');
    await act(async () => { await Promise.resolve(); });
    const lang = zeileVom('01.09.2026');
    expect(within(lang).getByRole('button', { name: BEARBEITEN })).toBeInTheDocument();
    expect(within(lang).queryByText('vom Büro gebucht')).toBeNull();
  });

  it('der Berufsschultag nennt seine Unterrichtszeit (M1)', async () => {
    eintraege = [eintrag({ id: 's1', date: '2026-09-01', status: 'Berufsschule', startTime: undefined, endTime: undefined, unterrichtMin: 450 })];
    zeige();
    expect(await screen.findByText(/Berufsschule · Unterricht 07:30 Std/)).toBeInTheDocument();
  });
});


describe('Zeitbuchungsprotokoll auf Abruf', () => {
  it('lädt erst beim Öffnen und beschränkt Monteure auf eigene Buchungen', async () => {
    zeige();
    await screen.findByRole('heading', { name: 'Zeiterfassung' });
    expect(journalLaden).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Weitere Aktionen für Zeiterfassung' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Änderungsprotokoll' }));
    expect(await screen.findByRole('dialog', { name: 'Änderungsprotokoll' })).toBeInTheDocument();
    await waitFor(() => expect(journalLaden).toHaveBeenCalledWith('perl', 'u1', null));
  });
  it('zeigt dem Büro das Betriebsprotokoll', async () => {
    authWert.user.role = 'Buchhaltung';
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Weitere Aktionen für Zeiterfassung' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Änderungsprotokoll' }));
    await waitFor(() => expect(journalLaden).toHaveBeenCalledWith('perl', undefined, null));
  });
});
