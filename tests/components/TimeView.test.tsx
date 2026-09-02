import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, TimeEntry, Role } from '@/types';
import TimeView from '@/features/time/TimeView';

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
  deleteTimeEntry: vi.fn(async () => undefined),
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

// Das Formular hat seine eigenen Belange (und seine eigenen Tests). Hier geht
// es um die Ansicht drumherum.
vi.mock('@/features/time/TimeForm', () => ({
  default: () => <div data-testid="zeitformular" />,
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
    <ToastProvider>
      <TimeView />
    </ToastProvider>,
  );
}

beforeEach(() => {
  // Fest auf Dienstag, den 1. September 2026 — sonst verschiebt „diese Woche"
  // den Test mit der Zeit. NUR `Date` faelschen: ein vollstaendig
  // eingefrorener Zeitgeber laesst `waitFor` und userEvent haengen (siehe die
  // Falle in docs/UEBERGABE.md §4).
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 1, 9, 0, 0));
  eintraege = [];
  profilFehlerWerfen = false;
  marker = null;
  rolle = 'Mitarbeiter';
  authWert.user.role = 'Mitarbeiter';
  schnappschussSenden = null;
  abo.mockClear();
  listeSeit.mockClear();
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

    const gesperrt = (await screen.findByText('2026-09-01')).closest('li') as HTMLElement;
    expect(within(gesperrt).getByText('verrechnet')).toBeInTheDocument();
    expect(within(gesperrt).queryByRole('button', { name: 'Bearbeiten' })).toBeNull();
    expect(within(gesperrt).queryByRole('button', { name: 'Löschen' })).toBeNull();

    // Der offene daneben bleibt bearbeitbar — sonst prüfte der Test nur, dass
    // es überhaupt keine Knöpfe gibt.
    const offen = screen.getByText('2026-08-31').closest('li') as HTMLElement;
    expect(within(offen).getByRole('button', { name: 'Bearbeiten' })).toBeInTheDocument();
  });
});

describe('Zeiterfassung — welcher Weg zum Saldo', () => {
  it('nimmt die Bilanzen, wenn der Marker den Eintrittsmonat abdeckt', async () => {
    marker = { vollstaendigAb: '2026-05' }; // vor dem Eintritt im Juni
    eintraege = [eintrag({ id: 'e1' })];
    zeige();

    await waitFor(() => expect(listeBilanzen).toHaveBeenCalled());
    expect(listeBilanzen).toHaveBeenCalledWith('2026-06');
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

    await screen.findByText('Einträge');
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

describe('Zeiterfassung — die Kachel „Diese Woche"', () => {
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
