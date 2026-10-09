import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import userEvent from '@testing-library/user-event';
import type { AppUser, TimeEntry } from '@/types';
import AccountingView from '@/features/accounting/AccountingView';

/**
 * Der Fehler, den dieser Test verhindert, ist wirklich passiert: die
 * Mitarbeiteruebersicht wies einem Mitarbeiter mit Eintritt zur Monatsmitte
 * Sollstunden fuer die Tage davor zu — und fuer alle Vormonate gleich mit. Ein
 * frisch eingestellter Monteur stand damit vom ersten Tag an mit Hunderten
 * Minusstunden da.
 *
 * Die Rechenformel war nie falsch. Falsch war die VERDRAHTUNG: das
 * Eintrittsdatum stand nicht einmal in der Signatur der Funktion, die die
 * Ansicht aufruft. Genau diese Luecke faengt kein Rechen-Test, sondern nur
 * einer, der die Ansicht tatsaechlich rendert.
 */

const monteur: AppUser = {
  id: 'u1',
  companyId: 'perl',
  uid: 'u1',
  name: 'Neu Eingestellt',
  email: 'neu@perl.at',
  role: 'Mitarbeiter',
  active: true,
  weeklyTargetHours: 40,
  yearlyVacationDays: 25,
  workDays: [1, 2, 3, 4, 5],
  // Eintritt zur Monatsmitte: der 17. August 2026 ist ein Montag.
  appStartDate: '2026-08-17',
};

const eintrag = (date: string): TimeEntry & { id: string } => ({
  id: `e-${date}`,
  companyId: 'perl',
  date,
  status: 'Anwesend',
  startTime: '07:00',
  endTime: '15:00',
  breakDuration: 0,
  userId: 'u1',
  userName: monteur.name,
});

// Ab Eintritt sauber gebucht: Mo-Fr je 8 Stunden, 17.-21. und 24.-28.
// Der 31. ist "heute" im Test und bleibt offen.
const eintraege = [
  '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
  '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28',
].map(eintrag);

/** Wen die Ansicht als Belegschaft vorfindet — je Test setzbar. */
let benutzer: AppUser[] = [monteur];

/** Anpassungen des Urlaubsanspruchs — je Test setzbar. */
let anpassungen: Array<{ id: string; userId: string; urlaubsjahr: number; tage: number; grund: string }> = [];
vi.mock('@/lib/db/urlaubsanspruch', () => ({
  listAnpassungen: vi.fn(async (_c: string, uid?: string) =>
    anpassungen.filter((a) => !uid || a.userId === uid)),
}));

vi.mock('@/lib/db/users', () => ({
  listUsers: vi.fn(async () => benutzer),
}));
/** Geburtsdaten und Begründungen der Arbeitszeitgrenzen (05.10.2026) — ab Werk leer. */
vi.mock('@/lib/db/arbeitszeitGrenzen', () => ({
  listGeburtsdaten: vi.fn(async () => new Map()),
  listBegruendungen: vi.fn(async () => []),
  setBegruendung: vi.fn(async () => undefined),
  removeBegruendung: vi.fn(async () => undefined),
}));
vi.mock('@/lib/db/projects', () => ({
  // Die Ansicht laedt nur noch die Baustellen, die in den geladenen
  // Buchungen VORKOMMEN — nicht mehr den gesamten Bestand.
  listProjectsByNumbers: vi.fn(async () => []),
}));
/** Was die Ansicht als Buchungen vorfindet — je Test setzbar. */
let buchungen: (TimeEntry & { id: string })[] = eintraege;
/** Der Rückruf der Live-Verbindung — damit ein Test eine neue Buchung „ankommen“ lassen kann (G12). */
let liveSenden: ((rows: (TimeEntry & { id: string })[]) => void) | null = null;
/** Wie oft die Karte „Arbeitszeitgrenzen“ ihre Buchungen geholt hat. */
let grenzAbfragen = 0;

vi.mock('@/lib/db/timeEntries', () => ({
  subscribeEntriesInRange: vi.fn(
    (
      _company: string,
      _from: string,
      _to: string,
      cb: (rows: (TimeEntry & { id: string })[]) => void,
    ) => {
      liveSenden = cb;
      cb(buchungen);
      return () => undefined;
    },
  ),
  listEntriesInRange: vi.fn(async () => {
    grenzAbfragen += 1;
    return buchungen;
  }),
  listEntriesForProjects: vi.fn(async () => buchungen),
  /*
    Der Urlaubsverlauf für den Übertrag — dieselben Buchungen, auf Urlaub
    gefiltert. Die echte Abfrage filtert serverseitig; hier ist das die
    ehrlichste Attrappe, weil sie liefert, was die Datenbank auch liefern
    würde, statt einer leeren Liste, die jeden Übertrag unsichtbar machte.
  */
  listUrlaubstage: vi.fn(async () => buchungen.filter((b) => b.status === 'Urlaub')),
  deleteTimeEntry: vi.fn(),
}));
/**
 * EIN Objekt, nicht bei jedem Aufruf ein neues.
 *
 * Die Ansicht haengt ihr Abonnement an die Identitaet von `user`. Im echten
 * Context ist das ein State-Wert und damit stabil; ein Mock, der jedes Mal
 * ein frisches Objekt liefert, loest dagegen eine Endlosschleife aus —
 * Effekt laeuft, setzt Zustand, rendert neu, neues user-Objekt, Effekt laeuft.
 */
const authWert = {
  user: {
    uid: 'chefin',
    email: 'chefin@perl.at',
    name: 'Petra Perl',
    role: 'Geschäftsführung' as const,
    companyId: 'perl',
    docId: 'chefin',
  },
  company: { id: 'perl', name: 'Perl Installationen GmbH' },
  loading: false,
  error: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  resetPassword: vi.fn(),
  reloadCompany: vi.fn(),
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

/** Der Gesamtsaldo seit Eintritt — dieselbe Ladefunktion wie in der Zeiterfassung. */
const zeitguthabenLaden = vi.fn(async () => ({ saldoH: 12.5, hasConfig: true, daysWithoutEntry: 0 }));
vi.mock('@/features/vacations/zeitguthaben', () => ({
  zeitguthabenLaden: (...a: unknown[]) => zeitguthabenLaden(...(a as [])),
}));

/*
  DAS ZEITFORMULAR ALS ATTRAPPE. Geprüft wird hier, WO es erscheint (im
  Seitenfenster) und für WEN — das Formular selbst prüfen die Tests der
  Zeiterfassung. Es lädt Baustellen und Geburtsdaten, die diese Datei nicht
  nachbildet.
*/
vi.mock('@/features/time/TimeForm', () => ({
  default: ({
    entry,
    onCancel,
    vorbelegung,
  }: {
    entry?: { id: string };
    onCancel?: () => void;
    vorbelegung?: { userId?: string; date?: string } | null;
  }) => (
    <div>
      <p>Formular für {entry ? entry.id : 'neu'}</p>
      {/* Runde 4: „Zeit erfassen“ am Tag gibt Person und Tag mit. */}
      {vorbelegung && <p>Vorbelegt: {vorbelegung.userId ?? '–'} am {vorbelegung.date ?? '–'}</p>}
      <button type="button" onClick={onCancel}>Abbrechen</button>
    </div>
  ),
}));


beforeEach(() => {
  anpassungen = [];
  benutzer = [monteur];
  buchungen = eintraege;
  liveSenden = null;
  grenzAbfragen = 0;
  // Fest auf den 31.08.2026, damit "heute" den Test nicht mit der Zeit
  // verschiebt. shouldAdvanceTime, weil userEvent intern Zeitgeber braucht.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 7, 31, 10, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

/*
  SEIT RUNDE 4 (Auftrag 3.5) steht der Tagesnachweis im Seitenfenster der
  Person, als Liste statt als Tabelle (das Fenster ist 440 px breit). Geprüft
  wird weiter der Tagesnachweis — beim Namen gesucht.
*/
const tagesnachweis = () => screen.getByRole('list', { name: /Tagesnachweis/ });

/*
  DER NAME DER PERSON IN DER LISTE. Seit Runde 4 trägt auch jeder Tag im
  Streifen den Namen im `aria-label` („Neu Eingestellt, Mo 17.08. · …“) —
  gesucht wird deshalb der Knopf mit dem Namen (`.ue-person`), der das
  Seitenfenster öffnet wie bisher der Kopf der Karte.
*/
async function personKnopf(name: string): Promise<HTMLElement> {
  const knoepfe = await screen.findAllByRole('button', { name: new RegExp(`^${name}`) });
  const k = knoepfe.find((b) => b.classList.contains('ue-person'));
  if (!k) throw new Error(`Kein Namensknopf für ${name}`);
  return k;
}

/** Das Seitenfenster der Person („Person im Monat“). */
const fenster = () => screen.getByRole('dialog', { name: /Neu Eingestellt, August 2026/ });

async function oeffneMitarbeiter() {
  // userEvent wartet intern ueber Zeitgeber. Ohne advanceTimers dreht es sich
  // gegen die eingefrorene Uhr fest und der Test laeuft nie zu Ende.
  const nutzer = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  // Der ToastProvider gehoert dazu: die Ansicht meldet Erfolge darueber.
  render(
    <MemoryRouter>
      <ToastProvider>
        <AccountingView />
      </ToastProvider>
    </MemoryRouter>,
  );
  const kopf = await personKnopf('Neu Eingestellt');
  await nutzer.click(kopf);
  return kopf;
}

describe('Mitarbeiteruebersicht — Eintritt zur Monatsmitte', () => {
  it('rechnet die Tage VOR dem Eintritt nicht ins Soll', async () => {
    await oeffneMitarbeiter();

    /**
     * Vom 17. bis GESTERN (30.8., ein Sonntag) liegen 10 Werktage, also 80
     * Stunden Soll — nicht die 168 des ganzen Monats, und auch nicht die 88
     * inklusive des heutigen 31.
     *
     * Der heutige Tag zaehlt nicht mit: er ist noch nicht vorbei. Diese
     * Erwartung stand hier vorher auf 88:00 und hielt damit denselben Fehler
     * im Kleinen fest, der im Betrieb als „00:00 von 176:00 · −176:00" am
     * Monatsanfang auffiel.
     */
    /*
      Das Soll steht seit dem Umbau nicht mehr als eigene Kennzahl da, sondern
      als Herleitung unter dem Saldo: „80:00 von 80:00 Soll bisher". Geprueft
      wird unveraendert die ZAHL — nur eben dort, wo sie jetzt steht. Seit
      Runde 4 im Seitenfenster; auf der Seite steht dieselbe Zahl in der
      Zeile („Soll bisher“) und in der Kennzahl „Gebucht bisher“.
    */
    expect(within(fenster()).getByText(/von 80:00 Soll/)).toHaveTextContent('80:00 von 80:00 Soll bisher');
  });

  it('zeigt keinen Minus-Saldo, wenn ab Eintritt vollstaendig gebucht wurde', async () => {
    await oeffneMitarbeiter();

    // 10 gebuchte Tage a 8 Stunden = 80 Stunden Ist, und genau 80 Stunden
    // Soll bis gestern. Der Saldo ist damit ausgeglichen — und eben nicht
    // -168:00 und auch nicht -08:00 fuer den laufenden Tag.
    // `nextElementSibling` und nicht `previous`: die Beschriftung steht jetzt
    // ueber der Zahl, nicht darunter.
    const saldo = screen.getByText('Saldo im Monat').nextElementSibling;
    expect(saldo).toHaveTextContent('00:00');
  });

  it('setzt den Saldo ruhig — Tinte, halbfett, kein Rot (Rückmeldung 24.09.2026)', async () => {
    // „Der Saldo zu fett und gross, und das Rot mit dem Rot direkt darunter."
    // Die Farbe trägt der Punkt in der Kopfzeile, nicht die grosse Zahl.
    await oeffneMitarbeiter();
    const saldo = screen.getByText('Saldo im Monat').nextElementSibling as HTMLElement;
    expect(saldo.className).toMatch(/text-ink/);
    expect(saldo.className).not.toMatch(/text-(danger|success)|font-bold|text-\[2rem\]/);
  });

  it('fuehrt keinen Tag vor dem Eintritt als fehlende Buchung', async () => {
    await oeffneMitarbeiter();

    // Der 3. bis 14. August liegen vor dem Eintritt und duerfen nirgends als
    // Versaeumnis auftauchen.
    const luecken = screen.queryByText(/Arbeitstage ohne Buchung/);
    expect(luecken?.textContent ?? '').not.toMatch(/1[0-9] Arbeitstage/);
    expect(screen.queryByText(/03\.08\./)).not.toBeInTheDocument();
  });

  it('fuehrt auch keinen FEIERTAG vor dem Eintritt', async () => {
    /*
      Der Nachweis beginnt beim Eintritt — dafuer gibt es das Datum. Ein Tag
      ohne Buchung kam trotzdem herein, wenn er ein Feiertag war: bei einem
      Eintritt am 17. August stand dort „Sa 15.08. Mariä Himmelfahrt", ein
      Tag, an dem die Person noch gar nicht im Betrieb war.
    */
    await oeffneMitarbeiter();

    const tabelle = tagesnachweis();
    expect(within(tabelle).queryByText('Sa 15.08.')).not.toBeInTheDocument();
    expect(within(tabelle).queryByText(/Mariä Himmelfahrt/)).not.toBeInTheDocument();
  });

  it('zeigt eine BUCHUNG vor dem Eintritt trotzdem', async () => {
    /*
      Der Feiertagsfilter darf nicht zum Buchungsfilter werden. Eine Zeit vor
      dem Eintritt ist eine Merkwuerdigkeit in den Daten — falsches
      Eintrittsdatum, falscher Mitarbeiter, vertippter Tag. Die soll man
      SEHEN. Sie wegzufiltern hiesse zudem, sie aus der Liste zu nehmen,
      waehrend der Fuss sie weiterzaehlt: genau der Widerspruch, der in
      dieser Ansicht gerade behoben wurde.
    */
    buchungen = [...eintraege, eintrag('2026-08-10')];
    await oeffneMitarbeiter();

    const tabelle = tagesnachweis();
    expect(within(tabelle).getByText('Mo 10.08.')).toBeInTheDocument();
  });

  it('listet im Tagesnachweis nur Tage ab dem Eintritt', async () => {
    await oeffneMitarbeiter();

    const tabelle = tagesnachweis();
    expect(within(tabelle).getByText('Mo 17.08.')).toBeInTheDocument();
    expect(within(tabelle).queryByText('Mo 03.08.')).not.toBeInTheDocument();
  });
});

/**
 * Was dasteht, wenn die Liste leer ist.
 *
 * AUS DEM BETRIEB GEMELDET: die Geschäftsführung bucht eine Zeit und liest
 * danach, es gebe keine Mitarbeiter. Die Aussage war richtig — ohne
 * eingeschaltetes Zeitkonto erscheint die Geschäftsführung hier nicht —, aber
 * sie klang nach einem Fehler, wo eine Erklärung hingehört.
 */
/**
 * MEHRERE BUCHUNGEN AN EINEM TAG — und was die Übersicht davon zeigt.
 *
 * AUS DEM BETRIEB GEMELDET: „die zweite Zeitbuchung an einem Tag erscheint
 * zwar in der Projektauswertung, aber wird in der Mitarbeiterübersicht nicht
 * angezeigt."
 *
 * Der Tagesnachweis nahm mit `find` die ERSTE Buchung des Tages. Das war
 * richtig, solange je Tag nur eine möglich war; seit ein Monteur mehrere
 * Baustellen an einem Tag buchen kann, ist es falsch — und besonders
 * unangenehm, weil der Fuß trotzdem ALLE zählte: „4 Einträge · 31:00" über
 * drei sichtbaren Zeilen. Die vierte Buchung war weder zu sehen noch zu
 * bearbeiten oder zu löschen.
 */
describe('Mitarbeiteruebersicht — mehrere Buchungen an einem Tag', () => {
  const zweiterEinsatz: TimeEntry & { id: string } = {
    id: 'e-zweiter',
    companyId: 'perl',
    date: '2026-08-17',
    status: 'Anwesend',
    startTime: '16:00',
    endTime: '19:00',
    breakDuration: 0,
    userId: 'u1',
    userName: monteur.name,
    projectNumber: 'B-2026-0002',
    customerName: 'Zweite Baustelle',
    isEmergency: true,
  };

  beforeEach(() => {
    buchungen = [...eintraege, zweiterEinsatz];
  });

  it('zeigt BEIDE Buchungen des Tages, nicht nur die erste', async () => {
    await oeffneMitarbeiter();

    const tabelle = tagesnachweis();
    // Zweimal derselbe Tag — einmal je Buchung.
    expect(within(tabelle).getAllByText('Mo 17.08.')).toHaveLength(2);
    expect(within(tabelle).getByText('Zweite Baustelle')).toBeInTheDocument();
  });

  it('zählt im Fuß nicht mehr, als es zeigt', async () => {
    /*
      DER WIDERSPRUCH, DER GEMELDET WURDE. Der Fuß zählte alle Einträge, die
      Liste zeigte weniger. Eine Ansicht, die sich selbst widerspricht,
      kostet mehr Vertrauen als eine, die etwas gar nicht kann.
    */
    await oeffneMitarbeiter();

    const tabelle = tagesnachweis();
    expect(within(tabelle).getByText('11 Einträge')).toBeInTheDocument();
    // 10 Tage à 08:00 plus der zweite Einsatz mit 03:00.
    /*
      Gezählt werden die Zeilen mit „Bearbeiten" — das sind genau die
      Buchungen. Eine feste Zeilenzahl wäre brittle: der Nachweis führt auch
      Feiertage ohne Buchung (im August 2026 der 15.).
    */
    expect(within(tabelle).getAllByRole('button', { name: 'Bearbeiten' })).toHaveLength(11);
  });

  it('zeigt den Notdienst-Haken — er hängt an einem Zuschlag', async () => {
    /*
      GEMELDET: „Notdienst wurde angehakt, aber das scheint nicht auf."
      Gespeichert war er; gezeigt wurde er nur in der eigenen Zeitübersicht.
      Wer ihn hier nicht sieht, schreibt die Stunde ohne den Zuschlag von
      +100 % in die Rechnung — und das fällt niemandem auf, weil die Zahl
      plausibel aussieht.
    */
    await oeffneMitarbeiter();

    const tabelle = tagesnachweis();
    expect(within(tabelle).getByText('Notdienst')).toBeInTheDocument();
  });
});

describe('Mitarbeiteruebersicht — die leere Liste erklaert sich', () => {
  const gf: AppUser = {
    ...monteur,
    id: 'gf', uid: 'gf', name: 'Julian Deutsch', role: 'Geschäftsführung',
  } as AppUser;

  it('sagt, WARUM niemand dasteht, wenn es nur Leitung gibt', async () => {
    benutzer = [gf];
    render(
      <MemoryRouter>
        <ToastProvider>
          <AccountingView />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Kein Konto erscheint in dieser Auswertung/)).toBeInTheDocument();
    expect(screen.getByText(/Der Administrator steht hier nie/)).toBeInTheDocument();
    expect(screen.getByText(/Geschäftsführung nur, wenn es in ihrer Benutzerakte eingeschaltet ist/)).toBeInTheDocument();
  });

  /*
    DIE PROJEKTLEITUNG FÜHRT EIN ZEITKONTO — entschieden am 24.09.2026.

    Vorher stand sie hier als „führt kein Zeitkonto“ und bekam trotzdem
    „17 Tage fehlen“ (Prüflauf F12). Jetzt hat sie ein Soll und einen Saldo
    wie alle, die Zeit buchen.
  */
  it('zeigt die Projektleitung mit Saldo, wie jedes Zeitkonto', async () => {
    const pl: AppUser = {
      ...monteur,
      id: 'pl', uid: 'pl', name: 'Paula Leiter', role: 'Projektleiter',
    } as AppUser;
    benutzer = [gf, pl];
    render(
      <MemoryRouter>
        <ToastProvider>
          <AccountingView />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(await personKnopf('Paula Leiter')).toBeInTheDocument();
    expect(screen.queryByText('führt kein Zeitkonto')).not.toBeInTheDocument();
    // Seit Runde 4 Teil der Zeile („Projektleiter · …“) — deshalb als Ausschnitt gesucht.
    expect(screen.queryByText(/kein Eintritt hinterlegt/)).not.toBeInTheDocument();
    expect(screen.queryByText('Julian Deutsch')).not.toBeInTheDocument();
  });

  it('zeigt die Geschäftsführung, wenn ihr Zeitkonto eingeschaltet ist', async () => {
    benutzer = [{ ...gf, fuehrtZeitkonto: true }];
    render(
      <MemoryRouter>
        <ToastProvider>
          <AccountingView />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(await personKnopf('Julian Deutsch')).toBeInTheDocument();
  });

  it('und die Administration nie — auch nicht mit gesetztem Haken', async () => {
    benutzer = [{ ...gf, id: 'ad', uid: 'ad', name: 'Ada Admin', role: 'Administrator', fuehrtZeitkonto: true }];
    render(
      <MemoryRouter>
        <ToastProvider>
          <AccountingView />
        </ToastProvider>
      </MemoryRouter>,
    );

    await screen.findByText(/Kein Konto erscheint in dieser Auswertung/);
    expect(screen.queryByText('Ada Admin')).not.toBeInTheDocument();
  });

  it('und die Geschäftsführung ohne Zeitkonto weiterhin nicht', async () => {
    benutzer = [gf];
    render(
      <MemoryRouter>
        <ToastProvider>
          <AccountingView />
        </ToastProvider>
      </MemoryRouter>,
    );

    await screen.findByText(/Kein Konto erscheint in dieser Auswertung/);
    expect(screen.queryByText('Julian Deutsch')).not.toBeInTheDocument();
  });

  it('sagt etwas anderes, wenn wirklich niemand angelegt ist', async () => {
    // „Noch keine Benutzer" und „keiner davon führt ein Zeitkonto" sind zwei
    // verschiedene Lagen mit zwei verschiedenen naechsten Schritten.
    benutzer = [];
    render(
      <MemoryRouter>
        <ToastProvider>
          <AccountingView />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Noch keine Benutzer angelegt.')).toBeInTheDocument();
  });
});

/**
 * Soll bisher mit Abwesenheiten — und ein Tag aus einem Antrag.
 *
 * Gefunden im Prüflauf vom 24.09.2026: vom Soll bis gestern wurden die
 * Krank- und Urlaubstage des GANZEN Monats abgezogen, auch die, die noch
 * kommen. Hier: Urlaub am 28. (im Soll), krank heute am 31. (noch nicht im
 * Soll). Richtig sind 9 Solltage, also 72:00 — vorher standen 64:00 da.
 */
describe('Mitarbeiteruebersicht — Abwesenheiten im Soll', () => {
  it('zieht nur ab, was im Soll steckt, und führt beim Antragstag zum Antrag', async () => {
    buchungen = [
      ...eintraege.slice(0, 9),
      { ...eintrag('2026-08-28'), id: 'u-28', status: 'Urlaub', startTime: undefined, endTime: undefined, vacationId: 'v1' },
      { ...eintrag('2026-08-31'), id: 'k-31', status: 'Krank', startTime: undefined, endTime: undefined, krankmeldungId: 'k1' },
    ];
    const nutzer = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <MemoryRouter>
        <ToastProvider>
          <AccountingView />
        </ToastProvider>
      </MemoryRouter>,
    );
    await nutzer.click(await personKnopf('Neu Eingestellt'));

    expect(within(fenster()).getByText(/von 72:00 Soll/)).toBeInTheDocument();
    const tabelle = tagesnachweis();
    expect(within(tabelle).getByRole('button', { name: 'Urlaubsantrag' })).toBeInTheDocument();
    expect(within(tabelle).getAllByRole('button', { name: 'Bearbeiten' })).toHaveLength(9);
  });
});

describe('Gesamtsaldo neben dem Monatssaldo (Testbericht 30.09.2026, M8)', () => {
  it('zeigt den Stand seit Eintritt und den Start-Saldo darin', async () => {
    benutzer = [{ ...monteur, initialOvertime: 5 }];
    await oeffneMitarbeiter();
    // Runde 5, G6: der Wert, darunter klein „seit …“ — das Wort „Gesamtsaldo“ steht nur in der Beschriftung.
    await waitFor(() =>
      expect(screen.getByTestId('gesamtsaldo')).toHaveTextContent('+12:30seit 17.08.2026 · darin Start-Saldo +05:00'));
    expect(screen.getByTestId('gesamtsaldo').closest('.pf-kennzahl')?.textContent?.match(/Gesamtsaldo/g)).toHaveLength(1);
    expect(zeitguthabenLaden).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u1' }), expect.any(Boolean));
  });


  // Testbericht Runde 5, G6: „Tagessoll 08:00“ war der Durchschnitt eines eigenen Solls je Wochentag.
  it('nennt ein eigenes Tagessoll je Wochentag, nicht den Durchschnitt', async () => {
    benutzer = [{ ...monteur, weeklyTargetHours: 40, tagessoll: { '1': 8.5, '2': 8.5, '3': 8.5, '4': 8.5, '5': 6 } }];
    await oeffneMitarbeiter();
    expect(await screen.findByText(/Tagessoll Mo 08:30, Di 08:30, Mi 08:30, Do 08:30, Fr 06:00 Std/)).toBeInTheDocument();
    expect(screen.queryByText(/Tagessoll 08:00 Std/)).toBeNull();
  });

  it('Gegenprobe: ohne eigenes Tagessoll bleibt die Zeile, wie sie war', async () => {
    benutzer = [{ ...monteur, weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5] }];
    await oeffneMitarbeiter();
    expect(await screen.findByText(/Tagessoll 08:00 Std · Wochenstunden 40:00 Std/)).toBeInTheDocument();
  });

  it('lädt erst beim Öffnen des Seitenfensters', async () => {
    zeitguthabenLaden.mockClear();
    render(
      <MemoryRouter>
        <ToastProvider>
          <AccountingView />
        </ToastProvider>
      </MemoryRouter>,
    );
    await personKnopf('Neu Eingestellt');
    expect(zeitguthabenLaden).not.toHaveBeenCalled();
  });
});

describe('Im Supportzugang (Testbericht 30.09.2026, M40)', () => {
  it('steht „nicht einsehbar“ statt fehlender Tage und eines Saldos', async () => {
    // Zeitbuchungen liest der Support nicht — die Liste kommt leer an.
    buchungen = [];
    (authWert as { einblick?: unknown }).einblick = { company_id: 'perl', stufe: 'ansehen' };
    try {
      const nutzer = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(
        <MemoryRouter>
          <ToastProvider>
            <AccountingView />
          </ToastProvider>
        </MemoryRouter>,
      );
      const kopf = await personKnopf('Neu Eingestellt');
      expect(kopf).toHaveTextContent('nicht einsehbar');
      expect(kopf).not.toHaveTextContent(/fehlen|ohne Buchung|−|-\d/);
      expect(screen.getByText(/Im Supportzugang sind Zeitbuchungen/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Monats-CSV' })).not.toBeInTheDocument();
      // Keine Kennzahlen, keine Woche (Auftrag 3.2): alles käme aus verschlossenen Buchungen.
      expect(screen.queryByText('Tage ohne Buchung')).not.toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Ansicht' })).not.toBeInTheDocument();
      await nutzer.click(kopf);
      expect(screen.getByRole('dialog')).toHaveTextContent('Zeitbuchungen, Urlaube und Krankenstände sind im Supportzugang nicht einsehbar.');
      expect(screen.queryByText('Saldo im Monat')).not.toBeInTheDocument();
      // Ohne Zeitbuchungen keine Prüfung der Grenzen — sie entwarnte fälschlich.
      expect(screen.queryByText(/Arbeitszeitgrenzen/)).not.toBeInTheDocument();
      expect(grenzAbfragen).toBe(0);
    } finally {
      delete (authWert as { einblick?: unknown }).einblick;
    }
  });
});

describe('Mitarbeiteruebersicht — angepasster Urlaubsanspruch (Plan 10.3)', () => {
  it('rechnet die Anpassung in den Resturlaub und nennt sie', async () => {
    await oeffneMitarbeiter();
    const ohne = screen.getByTestId('resturlaub').textContent ?? '';
    expect(ohne).not.toMatch(/Anspruch angepasst/);
    // Runde 5, G6: „Resturlaub“ nur als Beschriftung, nicht noch einmal im Wert.
    expect(ohne.match(/Resturlaub/g)).toHaveLength(1);
    cleanup();

    anpassungen = [{ id: 'a1', userId: 'u1', urlaubsjahr: 2026, tage: -6.25, grund: 'Unbezahlter Urlaub' }];
    await oeffneMitarbeiter();
    const mit = screen.getByTestId('resturlaub').textContent ?? '';
    expect(mit).toMatch(/Anspruch angepasst: −6,25 Tage/);
    const zahl = (t: string) => Number(t.match(/Resturlaub(-?[\d,]+)\s*Tage?/)![1].replace(',', '.'));
    expect(zahl(mit)).toBeCloseTo(zahl(ohne) - 6.25, 2);
  });
});

describe('Mitarbeiteruebersicht — Arbeitszeitgrenzen nach dem Buchen (Runde 3, G12)', () => {
  it('eine neue Buchung auf derselben Seite prüft die Karte neu, ohne Neuladen', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <AccountingView />
        </ToastProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Im August 2026 wurde keine Grenze überschritten.')).toBeInTheDocument();
    const vorher = grenzAbfragen;

    // Das Büro bucht 13 Stunden — die Live-Verbindung meldet den neuen Stand.
    buchungen = [...eintraege, { ...eintrag('2026-08-31'), id: 'neu', startTime: '05:00', endTime: '18:00' }];
    act(() => liveSenden!(buchungen));

    expect(await screen.findByText(/13:00 Std\. am 31\.08\. — höchstens 12 Std\./)).toBeInTheDocument();
    expect(grenzAbfragen).toBe(vorher + 1);
  });

  it('Gegenprobe: ein Schnappschuss ohne Änderung prüft nicht neu', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <AccountingView />
        </ToastProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Im August 2026 wurde keine Grenze überschritten.')).toBeInTheDocument();
    const vorher = grenzAbfragen;
    act(() => liveSenden!([...buchungen]));
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(grenzAbfragen).toBe(vorher);
  });
});

/** Zeigt die Adresse, damit ein Test sieht, was in ihr steht (Lesezeichen, „Zurück“). */
function Adresse() {
  const ort = useLocation();
  return <p data-testid="adresse">{ort.search}</p>;
}

function zeichneSeite(start = '/accounting') {
  const nutzer = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(
    <MemoryRouter initialEntries={[start]}>
      <ToastProvider>
        <AccountingView />
        <Adresse />
      </ToastProvider>
    </MemoryRouter>,
  );
  return nutzer;
}

/** Ein Feld des Streifens bzw. eine Zelle der Woche — beim `aria-label` gesucht (Person, Tag, Zustand). */
const tagKnopf = (muster: RegExp) => screen.getByRole('button', { name: muster });

describe('Mitarbeiterübersicht: der Monat als Streifen (Runde 4, Auftrag 3.3)', () => {
  /*
    BIS RUNDE 4 STAND HIER DAS RASTER (Linie „Lot“, E9) mit Stunden in jeder
    Zelle und Bernstein-Rand am fehlenden Tag. Geschützt bleibt dasselbe:
    der fehlende Tag ist erkennbar, Ist und Soll stehen am Tag (jetzt im
    Tooltip und `aria-label`), Wochenende und die Zeit vor dem Eintritt sind
    frei, nicht fehlend. Die Stunden selbst stehen in der Woche (unten).
  */
  it('der fehlende Tag ist Bernstein, der gebuchte nennt Zeit, Stunden und Soll', async () => {
    // Am 20.08. fehlt die Buchung.
    buchungen = eintraege.filter((e) => e.date !== '2026-08-20');
    zeichneSeite();
    await personKnopf('Neu Eingestellt');
    expect(tagKnopf(/^Neu Eingestellt, Do 20\.08\. · keine Buchung · Soll 8:00$/)).toHaveClass('st-fehlt');
    expect(tagKnopf(/^Neu Eingestellt, Mi 19\.08\. · 07:00–15:00 · 8:00 Std\. · Soll 8:00$/)).toHaveClass('st-ok');
    // Vor dem Eintritt und am Wochenende: frei, kein Knopf — nichts zu tun.
    expect(screen.queryByRole('button', { name: /Mo 10\.08\./ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sa 22\.08\./ })).not.toBeInTheDocument();
    // Heute (31.08.) ist offen, nicht fehlend.
    expect(tagKnopf(/^Neu Eingestellt, Mo 31\.08\. · noch nichts gebucht$/)).toHaveClass('st-zukunft');
    // Die Zeile: Stand und die Summen daneben.
    expect(await personKnopf('Neu Eingestellt')).toHaveTextContent('1 Tag ohne Buchung');
  });

  it('Gegenprobe: alles gebucht — kein Feld in Bernstein, die Person „vollständig“', async () => {
    zeichneSeite();
    expect(await personKnopf('Neu Eingestellt')).toHaveTextContent('Mitarbeiter · heute offen');
    expect(document.querySelector('.st-fehlt')).toBeNull();
  });

  it('die Gruppen: mit Tagen ohne Buchung zuerst, absteigend; dann vollständig', async () => {
    const zweite = { ...monteur, id: 'u2', uid: 'u2', name: 'Anna Zweite' } as AppUser;
    const dritte = { ...monteur, id: 'u3', uid: 'u3', name: 'Bert Dritter' } as AppUser;
    benutzer = [monteur, zweite, dritte];
    buchungen = [
      ...eintraege, // Neu Eingestellt: vollständig
      ...eintraege.filter((e) => e.date !== '2026-08-20').map((e) => ({ ...e, id: `${e.id}-2`, userId: 'u2' })), // 1 Tag
      ...eintraege.filter((e) => e.date < '2026-08-25').map((e) => ({ ...e, id: `${e.id}-3`, userId: 'u3' })), // 4 Tage
    ];
    zeichneSeite();
    await personKnopf('Neu Eingestellt');
    const gruppen = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(gruppen).toEqual(['Mit Tagen ohne Buchung · 2', 'Vollständig · 1']);
    const namen = Array.from(document.querySelectorAll('.ue-name')).map((n) => n.textContent);
    expect(namen).toEqual(['Bert Dritter', 'Anna Zweite', 'Neu Eingestellt']);
  });

  it('die Zeile öffnet das Seitenfenster, ein Feld öffnet es mit dem Tag markiert', async () => {
    buchungen = eintraege.filter((e) => e.date !== '2026-08-20');
    const nutzer = zeichneSeite();
    await nutzer.click(await personKnopf('Neu Eingestellt'));
    expect(within(fenster()).getByText('Saldo im Monat')).toBeInTheDocument();
    expect(fenster().querySelector('[data-markiert="ja"]')).toBeNull();
    await nutzer.click(within(fenster()).getByRole('button', { name: 'Schließen' }));

    await nutzer.click(tagKnopf(/Do 20\.08\. · keine Buchung/));
    const markiert = fenster().querySelector('[data-markiert="ja"]');
    expect(markiert).toHaveClass('pf-zeile-markiert');
    expect(markiert).toHaveTextContent('Do 20.08.');
    expect(markiert).toHaveTextContent('Soll 8:00');
  });

  /*
    „ZEIT ERFASSEN“ AM TAG OHNE BUCHUNG (Entscheidung R4-0, Frage 3): das
    bisherige Formular, mit Person und Tag vorbelegt — im SELBEN Fenster;
    danach steht wieder die Person da.
  */
  it('„Zeit erfassen“ am fehlenden Tag öffnet das Formular vorbelegt und führt zur Person zurück', async () => {
    buchungen = eintraege.filter((e) => e.date !== '2026-08-20');
    const nutzer = zeichneSeite();
    await personKnopf('Neu Eingestellt');
    await nutzer.click(tagKnopf(/Do 20\.08\. · keine Buchung/));
    await nutzer.click(within(fenster()).getByRole('button', { name: 'Zeit erfassen für Do 20.08.' }));
    const formular = screen.getByRole('dialog', { name: 'Zeit erfassen' });
    expect(within(formular).getByRole('heading', { name: 'Zeit für Neu Eingestellt erfassen' })).toBeInTheDocument();
    expect(within(formular).getByText('Vorbelegt: u1 am 2026-08-20')).toBeInTheDocument();
    // Dasselbe Fenster, kein zweites darüber.
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await nutzer.click(within(formular).getByRole('button', { name: 'Abbrechen' }));
    expect(within(fenster()).getByText('Saldo im Monat')).toBeInTheDocument();
  });

  it('Gegenprobe: die Hauptaktion der Seite erfasst ohne Vorbelegung', async () => {
    const nutzer = zeichneSeite();
    await personKnopf('Neu Eingestellt');
    await nutzer.click(screen.getByRole('button', { name: 'Zeit erfassen' }));
    expect(screen.queryByText(/Vorbelegt:/)).not.toBeInTheDocument();
  });

  it('die Legende nennt die Zustände in Wörtern, ohne Kürzel', async () => {
    zeichneSeite();
    await personKnopf('Neu Eingestellt');
    // Eine Zeile mit kurzen Wörtern (Wunsch des Betriebs, 09.10.2026) — die Erklärung steht in der Seitenhilfe.
    const legende = screen.getByRole('list', { name: 'Legende' });
    expect(within(legende).getAllByRole('listitem').map((l) => l.textContent)).toEqual([
      'gebucht', 'ohne Buchung', 'abwesend', 'frei', 'Grenze überschritten',
    ]);
    expect(screen.queryByText(/Darüberfahren zeigt Stunden und Soll/)).not.toBeInTheDocument();
    expect(screen.queryByText(/K Krank|ZA Zeitausgleich/)).not.toBeInTheDocument();
  });

  it('erklärt die Felder in „Hilfe zu dieser Seite“', async () => {
    const nutzer = zeichneSeite();
    await personKnopf('Neu Eingestellt');
    await nutzer.click(screen.getByRole('button', { name: 'Hilfe zu dieser Seite' }));
    expect(await screen.findByText(/„abwesend“ heißt Urlaub, Krankenstand, Berufsschule/)).toBeInTheDocument();
    expect(screen.getByText(/Darüberfahren zeigt\s+Stunden und Soll des Tages, ein Tipp öffnet ihn/)).toBeInTheDocument();
  });

  it('der Tooltip ist ein eigenes Element, kein `title`', async () => {
    const nutzer = zeichneSeite();
    await personKnopf('Neu Eingestellt');
    const feld = tagKnopf(/Mi 19\.08\./);
    expect(feld).not.toHaveAttribute('title');
    await nutzer.hover(feld);
    expect(document.querySelector('.tipp')).toHaveTextContent('Mi 19.08. · 07:00–15:00 · 8:00 Std. · Soll 8:00');
    await nutzer.unhover(feld);
    expect(document.querySelector('.tipp')).toBeNull();
  });
});

describe('Mitarbeiterübersicht: Kennzahlen (Runde 4, Auftrag 3.2)', () => {
  const luecke = () => {
    const zweite = { ...monteur, id: 'u2', uid: 'u2', name: 'Anna Zweite' } as AppUser;
    benutzer = [monteur, zweite];
    buchungen = [
      ...eintraege,
      ...eintraege.filter((e) => e.date !== '2026-08-20' && e.date !== '2026-08-21').map((e) => ({ ...e, id: `${e.id}-2`, userId: 'u2' })),
    ];
  };

  it('„Tage ohne Buchung“ zählt und filtert mit einem Klick, ein zweiter hebt den Filter auf (?nur=offen)', async () => {
    luecke();
    const nutzer = zeichneSeite();
    await personKnopf('Neu Eingestellt');
    const kennzahl = screen.getByRole('button', { name: /^Tage ohne Buchung/ });
    expect(kennzahl).toHaveTextContent('2');
    expect(kennzahl).toHaveTextContent('bei 1 von 2 Personen');
    expect(kennzahl).toHaveAttribute('aria-pressed', 'false');

    await nutzer.click(kennzahl);
    expect(kennzahl).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('adresse')).toHaveTextContent('?nur=offen');
    expect(document.querySelectorAll('.ue-name')).toHaveLength(1);

    await nutzer.click(kennzahl);
    expect(screen.getByTestId('adresse')).toHaveTextContent(/^$/);
    expect(document.querySelectorAll('.ue-name')).toHaveLength(2);
  });

  it('die Startseite filtert weiter über ?filter=luecken&monat=JJJJ-MM', async () => {
    luecke();
    zeichneSeite('/accounting?filter=luecken&monat=2026-08');
    await personKnopf('Anna Zweite');
    expect(screen.getByRole('button', { name: /^Tage ohne Buchung/ })).toHaveAttribute('aria-pressed', 'true');
    expect(Array.from(document.querySelectorAll('.ue-name')).map((n) => n.textContent)).toEqual(['Anna Zweite']);
    expect(screen.getByRole('button', { name: /August 2026/ })).toBeInTheDocument();
  });

  it('„Gebucht bisher“ ist die Summe der Zeilen', async () => {
    luecke();
    zeichneSeite();
    await personKnopf('Neu Eingestellt');
    // 80:00 + 64:00 gebucht; Soll je 80:00.
    expect(screen.getByText('144:00')).toBeInTheDocument();
    expect(screen.getByText('von 160:00 Soll · alle Personen')).toBeInTheDocument();
  });

  it('der Fall steht in der Karte und als Tag im Streifen — mit EINER Prüfung, ohne eigene Kennzahl', async () => {
    buchungen = [...eintraege.filter((e) => e.date !== '2026-08-25'), { ...eintrag('2026-08-25'), startTime: '05:00', endTime: '18:00' }];
    zeichneSeite();
    expect(await screen.findByText(/13:00 Std\. am 25\.08\. — höchstens 12 Std\./)).toBeInTheDocument();
    // Die Kennzahl „Arbeitszeitgrenzen“ ist weg (Wunsch des Betriebs, 09.10.2026); Karte und Streifen bleiben.
    expect(screen.queryByRole('button', { name: /^Arbeitszeitgrenzen/ })).toBeNull();
    expect(tagKnopf(/Di 25\.08\. · 05:00–18:00 · 13:00 Std\..*höchstens 12 Std\./)).toHaveClass('st-grenze');
    // Karte und Streifen lesen dieselbe Prüfung: eine Abfrage, nicht zwei.
    expect(grenzAbfragen).toBe(1);
  });

  it('Gegenprobe: ohne Fall ist der Tag nur gebucht', async () => {
    zeichneSeite();
    expect(await screen.findByText('Im August 2026 wurde keine Grenze überschritten.')).toBeInTheDocument();
    expect(tagKnopf(/Di 25\.08\./)).toHaveClass('st-ok');
  });
});

describe('Mitarbeiterübersicht: Monat und Jahr (Runde 4, Auftrag 3.2)', () => {
  it('ein Klick auf den Titel öffnet die bisherige Auswahl — auch 2022', async () => {
    const nutzer = zeichneSeite();
    await personKnopf('Neu Eingestellt');
    const titel = screen.getByRole('button', { name: /August 2026/ });
    expect(titel).toHaveTextContent('Dieser Monat · Stand Mo 31.08.');
    expect(screen.queryByLabelText('Jahr')).not.toBeInTheDocument();
    await nutzer.click(titel);
    const jahr = screen.getByLabelText('Jahr');
    expect(Array.from((jahr as HTMLSelectElement).options).map((o) => o.value)).toEqual(['2026', '2025', '2024', '2023', '2022']);
    expect(Array.from((screen.getByLabelText('Monat') as HTMLSelectElement).options).map((o) => o.textContent)).toEqual([
      'Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
    ]);
    await nutzer.selectOptions(jahr, '2022');
    await nutzer.selectOptions(screen.getByLabelText('Monat'), '2');
    expect(screen.getByRole('button', { name: /März 2022/ })).toBeInTheDocument();
  });

  it('‹ › blättern monatsweise über den Jahreswechsel und laden das neue Jahr', async () => {
    const nutzer = zeichneSeite('/accounting?monat=2026-01');
    await personKnopf('Neu Eingestellt');
    const abo = vi.mocked((await import('@/lib/db/timeEntries')).subscribeEntriesInRange);
    abo.mockClear();
    await nutzer.click(screen.getByRole('button', { name: 'Voriger Monat' }));
    expect(screen.getByRole('button', { name: /Dezember 2025/ })).toHaveTextContent('Dezember 2025');
    expect(abo).toHaveBeenCalledWith('perl', '2025-01-01', '2025-12-31', expect.any(Function), expect.any(Function));
    await nutzer.click(screen.getByRole('button', { name: 'Nächster Monat' }));
    expect(screen.getByRole('button', { name: /Jänner 2026/ })).toBeInTheDocument();
  });

  it('Gegenprobe: nicht über die Auswahl hinaus — Jänner 2022 hat kein ‹, Dezember des laufenden Jahres kein ›', async () => {
    zeichneSeite('/accounting?monat=2022-01');
    await screen.findByRole('button', { name: /Jänner 2022/ });
    expect(screen.getByRole('button', { name: 'Voriger Monat' })).toBeDisabled();
    cleanup();
    zeichneSeite('/accounting?monat=2026-12');
    await screen.findByRole('button', { name: /Dezember 2026/ });
    expect(screen.getByRole('button', { name: 'Nächster Monat' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Voriger Monat' })).toBeEnabled();
  });
});

describe('Mitarbeiterübersicht: die Woche (Runde 4, Auftrag 3.4)', () => {
  it('?ansicht=woche zeigt die laufende Woche mit Stunden, Von–Bis und „fehlt“, darunter die Summen', async () => {
    // Heute ist Mo 31.08.; die Woche davor (24.–30.08.) über ‹.
    buchungen = eintraege.filter((e) => e.date !== '2026-08-26');
    const nutzer = zeichneSeite('/accounting?ansicht=woche');
    await personKnopf('Neu Eingestellt');
    expect(screen.getByRole('button', { name: /Diese Woche/ })).toHaveTextContent('KW 36');
    await nutzer.click(screen.getByRole('button', { name: 'Vorige Woche' }));
    expect(screen.getByRole('button', { name: /Letzte Woche/ })).toBeInTheDocument();
    const gebucht = tagKnopf(/^Neu Eingestellt, Di 25\.08\./);
    expect(gebucht).toHaveClass('mw-zelle');
    expect(gebucht).toHaveTextContent('8:00');
    expect(gebucht).toHaveTextContent('07:00–15:00');
    expect(tagKnopf(/^Neu Eingestellt, Mi 26\.08\. · keine Buchung/)).toHaveTextContent('fehlt');
    // Gruppe und Stand der Woche, Summen der Woche: 4 × 8 gebucht, 5 × 8 Soll.
    expect(screen.getByRole('heading', { name: 'Mit Tagen ohne Buchung in dieser Woche · 1' })).toBeInTheDocument();
    const zeile = (await personKnopf('Neu Eingestellt')).parentElement!;
    expect(zeile).toHaveTextContent('1 Tag fehlt');
    expect(zeile).toHaveTextContent('32:00');
    expect(zeile).toHaveTextContent('40:00');
    expect(zeile).toHaveTextContent('-08:00');
  });

  it('die Abwesenheit steht als Wort; der Umschalter setzt ?ansicht=woche und zurück', async () => {
    buchungen = [...eintraege.filter((e) => e.date !== '2026-08-27'), { ...eintrag('2026-08-27'), status: 'Zeitausgleich', startTime: undefined, endTime: undefined }];
    const nutzer = zeichneSeite('/accounting?monat=2026-08');
    await personKnopf('Neu Eingestellt');
    await nutzer.click(screen.getByRole('button', { name: 'Woche' }));
    expect(screen.getByTestId('adresse')).toHaveTextContent('ansicht=woche');
    await nutzer.click(screen.getByRole('button', { name: 'Vorige Woche' }));
    expect(tagKnopf(/^Neu Eingestellt, Do 27\.08\./)).toHaveTextContent('Zeitausgleich');
    expect(tagKnopf(/^Neu Eingestellt, Do 27\.08\./)).toHaveClass('mw-zelle-weg');
    await nutzer.click(screen.getByRole('button', { name: 'Monat' }));
    expect(screen.getByTestId('adresse')).not.toHaveTextContent('ansicht');
    expect(document.querySelector('.streifen')).not.toBeNull();
  });
});

/*
  EIN TABULATORSCHRITT JE REIHE (Auftrag 8): die Reihe merkt sich den Tag,
  auf dem man zuletzt stand. Nach ‹ › steht dieser Tag nicht mehr in der
  Reihe — dann muss sie wieder auf heute bzw. den ersten Tag zeigen, sonst
  ist sie mit der Tastatur nicht mehr zu erreichen (Prüfung Runde 4).
*/
describe('Mitarbeiterübersicht: Tastatur nach dem Blättern', () => {
  const tabStopps = (reihe: string) =>
    within(screen.getByRole('group', { name: reihe }))
      .getAllByRole('button')
      .filter((b) => b.tabIndex === 0);

  it('der Streifen bleibt nach ‹ › mit Tab erreichbar', async () => {
    const nutzer = zeichneSeite();
    await personKnopf('Neu Eingestellt');
    tagKnopf(/^Neu Eingestellt, Mi 19\.08\./).focus();
    await nutzer.keyboard('{ArrowRight}');
    expect(tabStopps('Neu Eingestellt, Tage des Monats').map((b) => b.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/Do 20\.08\./),
    ]);
    await nutzer.click(screen.getByRole('button', { name: 'Nächster Monat' }));
    expect(tabStopps('Neu Eingestellt, Tage des Monats')).toHaveLength(1);
  });

  it('die Woche bleibt nach ‹ › mit Tab erreichbar', async () => {
    const nutzer = zeichneSeite('/accounting?ansicht=woche');
    await personKnopf('Neu Eingestellt');
    tagKnopf(/^Neu Eingestellt, Mo 31\.08\./).focus();
    await nutzer.keyboard('{ArrowRight}');
    await nutzer.click(screen.getByRole('button', { name: 'Vorige Woche' }));
    expect(tabStopps('Neu Eingestellt, Tage der Woche')).toHaveLength(1);
  });

  it('Gegenprobe: ohne Blättern bleibt der zuletzt fokussierte Tag der Tabulatorschritt', async () => {
    const nutzer = zeichneSeite();
    await personKnopf('Neu Eingestellt');
    tagKnopf(/^Neu Eingestellt, Mi 19\.08\./).focus();
    await nutzer.keyboard('{ArrowLeft}');
    expect(tabStopps('Neu Eingestellt, Tage des Monats').map((b) => b.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/Di 18\.08\./),
    ]);
  });
});

describe('Mitarbeiterübersicht in der Linie „Lot“ (E9)', () => {
  it('im Supportzugang gibt es keinen Streifen — ohne Buchungen stünde jeder Tag als fehlend da', async () => {
    buchungen = [];
    (authWert as { einblick?: unknown }).einblick = { company_id: 'perl', stufe: 'ansehen' };
    try {
      zeichneSeite();
      await personKnopf('Neu Eingestellt');
      expect(document.querySelector('.streifen')).toBeNull();
      // Und die Monats-CSV auch nicht im ⋯ der Seite: es gibt das ⋯ gar nicht.
      expect(screen.queryByRole('button', { name: /Weitere Aktionen für Mitarbeiterübersicht/ })).not.toBeInTheDocument();
    } finally {
      delete (authWert as { einblick?: unknown }).einblick;
    }
  });

  it('Gegenprobe: ausserhalb des Supportzugangs gibt es den Streifen', async () => {
    zeichneSeite();
    await personKnopf('Neu Eingestellt');
    expect(document.querySelector('.streifen')).not.toBeNull();
  });

  it('die Monats-CSV steht im ⋯ der Seite', async () => {
    const nutzer = zeichneSeite();
    await personKnopf('Neu Eingestellt');
    await nutzer.click(screen.getByRole('button', { name: /Weitere Aktionen für Mitarbeiterübersicht/ }));
    expect(screen.getByRole('menuitem', { name: 'Monats-CSV' })).toBeInTheDocument();
  });

  it('„Zeit erfassen“ öffnet das Seitenfenster, die Liste bleibt stehen', async () => {
    const nutzer = zeichneSeite();
    await personKnopf('Neu Eingestellt');
    await nutzer.click(screen.getByRole('button', { name: 'Zeit erfassen' }));
    const formular = screen.getByRole('dialog', { name: 'Zeit erfassen' });
    expect(within(formular).getByRole('heading', { name: 'Zeit für einen Mitarbeiter erfassen' })).toBeInTheDocument();
    expect(within(formular).getByText('Formular für neu')).toBeInTheDocument();
    await nutzer.click(within(formular).getByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByRole('dialog', { name: 'Zeit erfassen' })).not.toBeInTheDocument();
  });

  /*
    BEARBEITEN IM SELBEN FENSTER (Auftrag 3.5): vorher öffnete „Bearbeiten“
    das Seitenfenster neben der aufgeklappten Zeile; jetzt steht das
    Formular im Fenster der Person, danach wieder die Person.
  */
  it('„Bearbeiten“ im Tagesnachweis öffnet den Eintrag im selben Fenster, danach wieder die Person', async () => {
    await oeffneMitarbeiter();
    const nutzer = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await nutzer.click(within(tagesnachweis()).getAllByRole('button', { name: 'Bearbeiten' })[0]);
    const formular = screen.getByRole('dialog', { name: 'Eintrag korrigieren' });
    expect(within(formular).getByRole('heading', { name: 'Eintrag von Neu Eingestellt korrigieren' })).toBeInTheDocument();
    expect(within(formular).getByText(/Formular für e-2026-08-/)).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await nutzer.click(within(formular).getByRole('button', { name: 'Abbrechen' }));
    expect(within(fenster()).getByText('Saldo im Monat')).toBeInTheDocument();
  });

  it('„Löschen“ fragt nach wie bisher', async () => {
    await oeffneMitarbeiter();
    const nutzer = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await nutzer.click(within(tagesnachweis()).getAllByRole('button', { name: 'Löschen' })[0]);
    expect(screen.getByText('Eintrag löschen?')).toBeInTheDocument();
    expect(screen.getByText('Der Eintrag von Neu Eingestellt vom 17.08.2026 wird endgültig entfernt.')).toBeInTheDocument();
  });

  it('Fussleiste: „Monat als CSV“, „Bericht für Zeitraum“ und „Zeit erfassen“ für die Person', async () => {
    await oeffneMitarbeiter();
    const nutzer = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    expect(within(fenster()).getByRole('button', { name: 'Monat als CSV' })).toBeInTheDocument();
    await nutzer.click(within(fenster()).getByRole('button', { name: 'Bericht für Zeitraum' }));
    expect(screen.getByRole('dialog', { name: 'Bericht exportieren' })).toBeInTheDocument();
  });
});
