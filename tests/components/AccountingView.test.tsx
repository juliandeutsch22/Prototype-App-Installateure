import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import userEvent from '@testing-library/user-event';
import type { AppUser, TimeEntry } from '@/types';
import AccountingView from '@/features/accounting/AccountingView';
import { mitSchreibtisch } from './schreibtisch';

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

vi.mock('@/lib/db/users', () => ({
  listUsers: vi.fn(async () => benutzer),
}));
vi.mock('@/lib/db/projects', () => ({
  // Die Ansicht laedt nur noch die Baustellen, die in den geladenen
  // Buchungen VORKOMMEN — nicht mehr den gesamten Bestand.
  listProjectsByNumbers: vi.fn(async () => []),
}));
/** Was die Ansicht als Buchungen vorfindet — je Test setzbar. */
let buchungen: (TimeEntry & { id: string })[] = eintraege;

vi.mock('@/lib/db/timeEntries', () => ({
  subscribeEntriesInRange: vi.fn(
    (
      _company: string,
      _from: string,
      _to: string,
      cb: (rows: (TimeEntry & { id: string })[]) => void,
    ) => {
      cb(buchungen);
      return () => undefined;
    },
  ),
  listEntriesInRange: vi.fn(async () => buchungen),
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


beforeEach(() => {
  benutzer = [monteur];
  buchungen = eintraege;
  // Fest auf den 31.08.2026, damit "heute" den Test nicht mit der Zeit
  // verschiebt. shouldAdvanceTime, weil userEvent intern Zeitgeber braucht.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 7, 31, 10, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

async function oeffneMitarbeiter() {
  // userEvent wartet intern ueber Zeitgeber. Ohne advanceTimers dreht es sich
  // gegen die eingefrorene Uhr fest und der Test laeuft nie zu Ende.
  const nutzer = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  // Der ToastProvider gehoert dazu: die Ansicht meldet Erfolge darueber.
  render(
    <ToastProvider>
      <AccountingView />
    </ToastProvider>,
  );
  const kopf = await screen.findByRole('button', { name: /Neu Eingestellt/ });
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
      wird unveraendert die ZAHL — nur eben dort, wo sie jetzt steht.
    */
    expect(screen.getByText(/von 80:00 Soll/)).toBeInTheDocument();
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

    const tabelle = screen.getByRole('table');
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

    const tabelle = screen.getByRole('table');
    expect(within(tabelle).getByText('Mo 10.08.')).toBeInTheDocument();
  });

  it('listet im Tagesnachweis nur Tage ab dem Eintritt', async () => {
    await oeffneMitarbeiter();

    const tabelle = screen.getByRole('table');
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

    const tabelle = screen.getByRole('table');
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

    const tabelle = screen.getByRole('table');
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

    const tabelle = screen.getByRole('table');
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
      <ToastProvider>
        <AccountingView />
      </ToastProvider>,
    );

    expect(await screen.findByText(/Kein Konto erscheint in dieser Auswertung/)).toBeInTheDocument();
    expect(screen.getByText(/Die Administration steht hier nie/)).toBeInTheDocument();
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
      <ToastProvider>
        <AccountingView />
      </ToastProvider>,
    );

    expect(await screen.findByText('Paula Leiter')).toBeInTheDocument();
    expect(screen.queryByText('führt kein Zeitkonto')).not.toBeInTheDocument();
    expect(screen.queryByText('kein Eintritt hinterlegt')).not.toBeInTheDocument();
    expect(screen.queryByText('Julian Deutsch')).not.toBeInTheDocument();
  });

  it('zeigt die Geschäftsführung, wenn ihr Zeitkonto eingeschaltet ist', async () => {
    benutzer = [{ ...gf, fuehrtZeitkonto: true }];
    render(
      <ToastProvider>
        <AccountingView />
      </ToastProvider>,
    );

    expect(await screen.findByText('Julian Deutsch')).toBeInTheDocument();
  });

  it('und die Administration nie — auch nicht mit gesetztem Haken', async () => {
    benutzer = [{ ...gf, id: 'ad', uid: 'ad', name: 'Ada Admin', role: 'Administrator', fuehrtZeitkonto: true }];
    render(
      <ToastProvider>
        <AccountingView />
      </ToastProvider>,
    );

    await screen.findByText(/Kein Konto erscheint in dieser Auswertung/);
    expect(screen.queryByText('Ada Admin')).not.toBeInTheDocument();
  });

  it('und die Geschäftsführung ohne Zeitkonto weiterhin nicht', async () => {
    benutzer = [gf];
    render(
      <ToastProvider>
        <AccountingView />
      </ToastProvider>,
    );

    await screen.findByText(/Kein Konto erscheint in dieser Auswertung/);
    expect(screen.queryByText('Julian Deutsch')).not.toBeInTheDocument();
  });

  it('sagt etwas anderes, wenn wirklich niemand angelegt ist', async () => {
    // „Noch keine Benutzer" und „keiner davon führt ein Zeitkonto" sind zwei
    // verschiedene Lagen mit zwei verschiedenen naechsten Schritten.
    benutzer = [];
    render(
      <ToastProvider>
        <AccountingView />
      </ToastProvider>,
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
    await nutzer.click(await screen.findByRole('button', { name: /Neu Eingestellt/ }));

    expect(screen.getByText(/von 72:00 Soll/)).toBeInTheDocument();
    const tabelle = screen.getByRole('table');
    expect(within(tabelle).getByRole('button', { name: 'Urlaubsantrag' })).toBeInTheDocument();
    expect(within(tabelle).getAllByRole('button', { name: 'Bearbeiten' })).toHaveLength(9);
  });
});

/**
 * AM SCHREIBTISCH EINE TABELLE: Ist, Soll und Saldo stehen Stelle unter
 * Stelle und lassen sich über alle Mitarbeiter vergleichen. Aufgeklappt wird
 * mit demselben Knopf, der Bereich darunter ist derselbe.
 */
describe('Mitarbeiteruebersicht am Schreibtisch', () => {
  const schreibtisch = mitSchreibtisch();

  async function zeichne() {
    schreibtisch();
    render(
      <ToastProvider>
        <AccountingView />
      </ToastProvider>,
    );
    const zeile = await screen.findByRole('row', { name: /Neu Eingestellt/ });
    return { zeile, tabelle: zeile.closest('table')! };
  }

  it('zeigt je Mitarbeiter eine Zeile mit Stand, Ist, Soll und Saldo', async () => {
    const { zeile, tabelle } = await zeichne();
    expect(within(tabelle).getAllByRole('columnheader').map((k) => k.textContent)).toEqual([
      'Mitarbeiter', 'Stand', 'Ist', 'Soll', 'Saldo',
    ]);
    const zellen = within(zeile).getAllByRole('cell');
    expect(zellen[1]).toHaveTextContent('heute offen');
    expect(zellen[2]).toHaveTextContent(/^80:00$/);
    // Ist rechtsbündig UND fett (docs/design/linie.md 4).
    expect(zellen[2]).toHaveClass('tabelle-zahl-stark');
    // Der laufende Monat bleibt als Zwischenstand gekennzeichnet.
    expect(zellen[3]).toHaveTextContent(/^80:00 bisher$/);
    expect(zellen[4]).toHaveTextContent('00:00');
  });

  it('klappt mit demselben Knopf auf — der Bereich steht als Zeile über alle Spalten', async () => {
    const nutzer = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { zeile } = await zeichne();
    const knopf = within(zeile).getByRole('button', { name: /Neu Eingestellt/ });
    // Genau ein Aufklappknopf je Mitarbeiter — nicht Karte und Zeile doppelt.
    expect(screen.getAllByRole('button', { name: /Neu Eingestellt/ })).toHaveLength(1);
    expect(knopf).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Saldo im Monat')).not.toBeInTheDocument();

    await nutzer.click(knopf);
    expect(knopf).toHaveAttribute('aria-expanded', 'true');
    const bereich = screen.getByText('Saldo im Monat').closest('td')!;
    expect(bereich).toHaveAttribute('colspan', '5');
    expect(within(bereich).getByRole('button', { name: 'Monat als CSV' })).toBeInTheDocument();
    expect(within(bereich).getByRole('button', { name: 'Bericht für Zeitraum' })).toBeInTheDocument();

    await nutzer.click(knopf);
    expect(knopf).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Saldo im Monat')).not.toBeInTheDocument();
  });
});

/**
 * Nach der Linie (docs/design/linie.md 1–3): „Zeit erfassen" ist die
 * Hauptaktion der Seite und steht im Seitenkopf; am Telefon stehen die
 * Mitarbeiter als Zeilen in der Monatskarte, nicht als Karten in der Karte.
 */
describe('Mitarbeiteruebersicht nach der Linie', () => {
  it('trägt „Zeit erfassen" im Seitenkopf und die Mitarbeiter als Zeilen', async () => {
    const kopf = await oeffneMitarbeiter();
    const knopf = screen.getByRole('button', { name: 'Zeit erfassen' });
    expect(knopf.closest('.seitenkopf')).not.toBeNull();

    const zeile = kopf.closest('.konto-zeile') as HTMLElement;
    expect(zeile).not.toBeNull();
    // Keine Karte in der Karte: die Zeile liegt in der Monatskarte, ohne
    // eigene Kartenfläche dazwischen.
    expect(zeile.closest('.karte-inhalt')).not.toBeNull();
    expect(zeile.parentElement!.closest('.karte, .karte-offen')).toBe(
      zeile.closest('.karte-inhalt')!.closest('.karte'),
    );
  });
});
