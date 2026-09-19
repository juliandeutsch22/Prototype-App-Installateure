import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, Customer, Project } from '@/types';
import AdminProjectsView from '@/features/projects/AdminProjectsView';

/**
 * Die Baustellenverwaltung — die vierte der bisher ungetesteten Kernansichten.
 *
 * Die Baustelle ist der Anker, an dem Zeiten, Material, Scheine und
 * Rechnungen hängen. Zwei Dinge daran sind mehr als Formularkosmetik: das
 * Stundenbudget (an ihm misst die Ampel der Nachkalkulation) und die
 * Zuordnung von Team und Projektleitung (sie entscheidet, wer die Baustelle
 * überhaupt sieht).
 */

const KUNDE: Customer & { id: string } = {
  id: 'k1', companyId: 'perl', name: 'Familie Huber',
} as Customer & { id: string };

const MONTEUR: AppUser = {
  id: 'u1', companyId: 'perl', uid: 'u1', name: 'Max Mustermann', email: 'max@perl.at',
  role: 'Mitarbeiter', active: true,
} as AppUser;

let baustellen: (Project & { id: string })[] = [];
let ladefehler = false;

/* Was die Serversuche nach einer Nummer zurückgibt — und womit sie gefragt wurde. */
let serverBaustellen: (Project & { id: string })[] = [];
let serverFehler = false;
const gefragtMit = vi.fn();

const lege = vi.fn();
const aendere = vi.fn();
const loesche = vi.fn();

/* Mit welcher Grenze zuletzt abonniert wurde — der Nachladeknopf hebt sie an. */
let letzteGrenze = 0;

vi.mock('@/lib/db/projects', () => ({
  subscribeRecentProjects: (
    _c: string,
    g: number,
    cb: (rows: (Project & { id: string })[]) => void,
  ) => {
    letzteGrenze = g;
    cb(baustellen);
    return () => undefined;
  },
  createProject: (c: string, data: unknown) => {
    lege(c, data);
    return Promise.resolve('neu');
  },
  updateProject: (id: string, data: unknown) => {
    aendere(id, data);
    return Promise.resolve();
  },
  deleteProject: (id: string) => {
    loesche(id);
    return Promise.resolve();
  },
  searchProjects: (c: string, begriff: string) => {
    gefragtMit(c, begriff);
    return serverFehler ? Promise.reject(new Error('kein Netz')) : Promise.resolve(serverBaustellen);
  },
}));

vi.mock('@/lib/db/users', () => ({
  listUsers: vi.fn(async () => {
    if (ladefehler) throw new Error('kein Netz');
    return [MONTEUR];
  }),
}));
let kundenBestand: (Customer & { id: string })[] = [KUNDE];
vi.mock('@/lib/db/customers', () => ({ listCustomers: vi.fn(async () => kundenBestand) }));

/*
  Die Stunden der Übersicht. Sie hängen an einer eigenen Abfrage, und diese
  Datei prüft nicht die Übersicht selbst (das tut
  `BaustellenUebersicht.test.tsx`), sondern DASS sie überhaupt geöffnet wird —
  und erst dann lädt.
*/
const listEntriesForProjects = vi.fn(async () => [
  {
    id: 'z1',
    companyId: 'perl',
    date: '2026-09-01',
    status: 'Anwesend',
    startTime: '07:00',
    endTime: '15:00',
    breakDuration: 0,
    userId: 'u1',
    userName: 'Max Mustermann',
    projectNumber: '2026-001',
  },
]);
vi.mock('@/lib/db/timeEntries', () => ({
  listEntriesForProjects: () => listEntriesForProjects(),
}));

const authWert = {
  user: { uid: 'gf', companyId: 'perl', name: 'Chefin', role: 'Geschäftsführung' as const },
  company: { id: 'perl', name: 'Perl Installationen' },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

function zeige() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AdminProjectsView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

/**
 * Das Anlege-Formular aufklappen.
 *
 * SEIT DEM 18.09. STEHT ES NICHT MEHR OFFEN. Gemessen am Telefon begann die
 * Baustellenliste bei 1590 px — knapp drei Bildschirme unter der Kante, und
 * darüber eine leere Maske. Diese Ansicht wird zum NACHSCHLAGEN geöffnet.
 */
async function formOeffnen() {
  await userEvent.click(await screen.findByRole('button', { name: 'Neue Baustelle' }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 1, 9, 0, 0));
  baustellen = [];
  kundenBestand = [KUNDE];
  ladefehler = false;
  serverBaustellen = [];
  serverFehler = false;
  gefragtMit.mockClear();
  lege.mockClear();
  aendere.mockClear();
  loesche.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Baustellen — anlegen', () => {
  it('zeigt die Liste zuerst, nicht die leere Maske', async () => {
    /*
      GEMESSEN AM TELEFON: „Alle Baustellen" begann bei 1590 px — knapp drei
      Bildschirme Wischen an einer leeren Maske vorbei. Das offene Formular
      sparte beim Anlegen einen Klick und kostete beim Nachschauen jedes Mal
      drei Wischer; geöffnet wird dieser Reiter zum Nachschlagen.

      Fällt diese Prüfung, ist der Weg zurück — und zwar unbemerkt, weil eine
      Ansicht mit offenem Formular für sich weiter vernünftig aussieht.
    */
    zeige();
    await screen.findByRole('button', { name: 'Neue Baustelle' });
    expect(screen.queryByLabelText('Projektnummer')).not.toBeInTheDocument();
  });

  it('klappt das Formular auf und wieder zu', async () => {
    zeige();
    await formOeffnen();
    expect(screen.getByLabelText('Projektnummer')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByLabelText('Projektnummer')).not.toBeInTheDocument();
  });

  it('übernimmt den Kundennamen aus dem Stammdatensatz', async () => {
    /**
     * Der Kunde ist kein Textfeld mehr. Würde der Name hier frei getippt,
     * stünde auf der Rechnung ein anderer als in der Kundenakte — und die
     * Akte fände ihre eigene Baustelle nicht wieder.
     */
    zeige();
    await formOeffnen();
    /*
      GELEERT, WEIL DAS FELD SEIT DEM 18.09. VORBELEGT IST. Vorher stand es
      leer da und die Nummer wurde getippt; jetzt schlägt der Nummernkreis
      eine vor. Ohne das Leeren hinge das Getippte am Vorschlag —
      „B-2026-00012026-042" —, und genau so ist dieser Test beim Umbau auch
      gefallen.
    */
    const feld = await screen.findByLabelText('Projektnummer');
    await userEvent.clear(feld);
    await userEvent.type(feld, '2026-042');
    await userEvent.selectOptions(screen.getByLabelText('Kunde'), 'k1');
    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    await waitFor(() => expect(lege).toHaveBeenCalled());
    expect(lege.mock.calls[0][1]).toMatchObject({
      projectNumber: '2026-042',
      customerId: 'k1',
      customerName: 'Familie Huber',
    });
  });

  it('schlägt die nächste Nummer aus dem Nummernkreis vor', async () => {
    /*
      DER VORSCHLAG IST EIN VORSCHLAG UND KEIN ZWANG — manche Betriebe führen
      die Nummer des Bauträgers oder des Architekten. Deshalb steht er IM
      FELD und nicht nur daneben: ein Wert, den man überschreiben kann, muss
      dort stehen, wo man ihn überschreibt.
    */
    zeige();
    await formOeffnen();
    const feld = await screen.findByLabelText('Projektnummer');
    expect((feld as HTMLInputElement).value).toMatch(/^B-\d{4}-\d{4}$/);
  });

  it('lässt ein leeres Stundenbudget UNGESETZT, statt 0 daraus zu machen', async () => {
    /**
     * „Kein Budget" und „Budget null" sind zwei verschiedene Aussagen. Aus
     * einem leeren Feld eine 0 zu machen hieße, dass die Ampel der
     * Nachkalkulation jede Baustelle sofort als überzogen meldet.
     */
    zeige();
    await formOeffnen();
    await userEvent.type(await screen.findByLabelText('Projektnummer'), '2026-043');
    await userEvent.selectOptions(screen.getByLabelText('Kunde'), 'k1');
    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    await waitFor(() => expect(lege).toHaveBeenCalled());
    expect(lege.mock.calls[0][1].estimatedHours).toBeUndefined();
  });

  it('nimmt ein gesetztes Stundenbudget als Zahl mit', async () => {
    zeige();
    await formOeffnen();
    await userEvent.type(await screen.findByLabelText('Projektnummer'), '2026-044');
    await userEvent.selectOptions(screen.getByLabelText('Kunde'), 'k1');
    await userEvent.type(screen.getByLabelText(/Stundenbudget/), '40');
    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    await waitFor(() => expect(lege).toHaveBeenCalled());
    expect(lege.mock.calls[0][1].estimatedHours).toBe(40);
  });
});

describe('Baustellen — der Weg in die Akte', () => {
  /*
    HIER STANDEN DREI PRÜFUNGEN: „ändert die vorhandene Baustelle, statt eine
    zweite anzulegen", „lädt die Stunden erst beim Aufklappen" und „klappt
    wieder zu". Alle drei galten einer Liste, die zugleich Formular und
    Auswertung war. Beides steht jetzt in der Akte (`/admin-projects/:id`) und wird
    dort geprüft — die Zusicherungen sind nicht weggefallen, sie sind
    umgezogen. Was HIER bleibt, ist die Grenze zwischen den beiden Ansichten.
  */
  beforeEach(() => {
    baustellen = [
      {
        id: 'p1', companyId: 'perl', projectNumber: '2026-042',
        customerName: 'Familie Huber', customerId: 'k1', status: 'Aktiv',
      } as Project & { id: string },
    ];
  });

  it('führt aus der Zeile in die Akte, nicht in das Formular ganz oben', async () => {
    zeige();
    const zeile = (await screen.findByText(/2026-042/)).closest('li') as HTMLElement;
    expect(within(zeile).getByRole('link', { name: 'Akte' })).toHaveAttribute(
      'href', '/admin-projects/p1',
    );
  });

  it('legt aus diesem Formular nur an — ändern kann es nicht mehr', async () => {
    /*
      Die Gegenprobe zum Umzug. Bliebe hier ein Weg zum Ändern, gäbe es zwei
      Masken für dieselbe Baustelle, und die eine wüsste nichts von der
      anderen.
    */
    zeige();
    await formOeffnen();
    await screen.findByText(/2026-042/);
    expect(screen.getByText('Neue Baustelle')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^bearbeiten$/i })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Projektnummer/), '2026-999');
    await userEvent.selectOptions(screen.getByLabelText(/^Kunde/), 'k1');
    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    await waitFor(() => expect(lege).toHaveBeenCalled());
    expect(aendere).not.toHaveBeenCalled();
  });

  it('lädt für die Liste keine Stunden', async () => {
    /*
      Der Punkt, der beim Aufklappen galt und weiterhin gilt: zwanzig
      Baustellen im Voraus auszuwerten hiesse zwanzig Abfragen für die eine,
      die jemanden interessiert. Die Auswertung hängt jetzt an der Akte.
    */
    listEntriesForProjects.mockClear();
    zeige();
    await screen.findByText(/2026-042/);
    expect(listEntriesForProjects).not.toHaveBeenCalled();
  });
});

describe('Baustellen — löschen', () => {
  it('hält die Zeile auf einer Zeile — höchstens vier Elemente rechts', async () => {
    /*
      GEMESSEN AUF 375 px (iPhone XS): mit Budget-Marke, Zustand, „Schein",
      „Akte" und dem ✕ waren es FÜNF Elemente; das letzte rutschte allein in
      eine zweite Zeile, unter einer leeren Lücke. Erst das ✕ zu verschieben
      half nicht — dann rutschte das Menü. Fünf passen schlicht nicht.

      `ListRow` sagt es selbst: „Wo es mehr als zwei Aktionen gibt, gehört
      alles Seltene in ein RowMenu." Diese Prüfung hält die Zahl fest, damit
      die sechste Ergänzung nicht wieder still umbricht.
    */
    baustellen = [
      {
        id: 'p1', companyId: 'perl', projectNumber: '2026-042',
        customerName: 'Familie Huber', status: 'Aktiv', estimatedHours: 54,
      } as Project & { id: string },
    ];
    zeige();

    const zeile = (await screen.findByText(/2026-042/)).closest('li') as HTMLElement;
    const rechts = zeile.lastElementChild as HTMLElement;
    expect(rechts.children.length).toBeLessThanOrEqual(4);

    // „Schein nachtragen" ist nicht weg, es steht im Menü.
    await userEvent.click(
      within(zeile).getByRole('button', { name: /Weitere Aktionen für Baustelle 2026-042/ }),
    );
    expect(await screen.findByRole('menuitem', { name: 'Schein nachtragen' })).toBeInTheDocument();
  });

  it('fragt vorher nach', async () => {
    // An einer Baustelle haengen Zeiten, Scheine und Rechnungen. Ein Loeschen
    // ohne Rueckfrage waere hier besonders teuer.
    baustellen = [
      {
        id: 'p1', companyId: 'perl', projectNumber: '2026-042',
        customerName: 'Familie Huber', status: 'Aktiv',
      } as Project & { id: string },
    ];
    zeige();

    /*
      LÖSCHEN LIEGT SEIT DEM 18.09. IM ZEILENMENÜ. Als ✕ in der Zeile passte
      es auf 375 px nicht mehr daneben und rutschte allein in eine zweite
      Zeile — die einzige unumkehrbare Aktion stand damit am auffälligsten da.
    */
    const zeile = (await screen.findByText(/2026-042/)).closest('li') as HTMLElement;
    await userEvent.click(
      within(zeile).getByRole('button', { name: /Weitere Aktionen für Baustelle 2026-042/ }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Löschen' }));

    const dialog = await screen.findByRole('dialog');
    expect(loesche).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: /löschen/i }));
    await waitFor(() => expect(loesche).toHaveBeenCalledWith('p1'));
  });
});

describe('Baustellen — wenn etwas nicht lädt', () => {
  it('sagt es, statt eine leere Belegschaft zu zeigen', async () => {
    // Sonst liesse sich eine Baustelle ohne Mannschaft anlegen, und niemand
    // wuesste, dass die Liste nur nicht geladen hat.
    ladefehler = true;
    zeige();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Die Belegschaft konnte nicht geladen werden.',
    );
  });
});

/**
 * Die Baustellenliste sagt, wie weit sie reicht.
 *
 * Sie holte fest die jüngsten 300 und schwieg dazu. Ab der 301. Baustelle
 * fielen die ÄLTESTEN heraus, ohne dass irgendwo etwas stand — die Baustelle
 * von vor drei Jahren war in der Verwaltung schlicht nicht mehr auffindbar,
 * und nichts unterschied das von „gibt es nicht".
 *
 * Genau diese Fehlerform hat „Sichtbare Grenzen" überall herausgenommen; hier
 * wurde sie übersehen, weil die Ansicht ein Live-Abo verwendet und damit
 * nicht ins Muster der einmal ladenden Listen passte.
 */
describe('Wie weit die Baustellenliste reicht', () => {
  const viele = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      ({
        id: `p${i}`,
        companyId: 'perl',
        projectNumber: `B-${String(i).padStart(4, '0')}`,
        customerName: 'Familie Huber',
        status: 'Aktiv',
      }) as Project & { id: string },
    );

  it('schweigt, solange die Grenze nicht greift', async () => {
    baustellen = viele(12);
    zeige();
    await screen.findByText(/Alle Baustellen/);
    expect(screen.queryByRole('button', { name: /Weitere Baustellen laden/ })).not.toBeInTheDocument();
  });

  it('sagt es, sobald die Grenze erreicht ist — OHNE den alten Suchsatz', async () => {
    /*
      DER SATZ IST AM 19.09. GEFALLEN. Er lautete „Nach Kunde und Adresse wird
      nur in diesen gesucht; eine Baustellennummer geht auf den Server" und
      war unter Firestore genau richtig: dort ging wirklich nur die Nummer an
      den Server.

      Jetzt geht jede Eingabe hin und sucht über Nummer, Kunde und Adresse im
      ganzen Bestand. Die Grenze gilt nur noch für das, was OHNE Suchbegriff
      angezeigt wird — der Knopf bleibt deshalb stehen, der Satz nicht.
    */
    baustellen = viele(300);
    zeige();
    await screen.findByText(/Alle Baustellen/);
    expect(screen.getByRole('button', { name: /Weitere Baustellen laden/ })).toBeInTheDocument();
    expect(screen.queryByText(/nur in diesen gesucht/)).toBeNull();
    expect(screen.queryByText(/Baustellennummer geht auf den Server/)).toBeNull();
  });

  it('holt beim Nachladen tatsächlich mehr', async () => {
    baustellen = viele(300);
    const nutzer = userEvent.setup();
    zeige();
    await screen.findByText(/Alle Baustellen/);
    expect(letzteGrenze).toBe(300);

    await nutzer.click(screen.getByRole('button', { name: /Weitere Baustellen laden/ }));
    expect(letzteGrenze).toBe(600);
  });
});

/**
 * Die Suche, die über die geladene Liste hinausreicht.
 *
 * Die Liste zeigt die jüngsten dreihundert. Eine Baustelle von vor vier
 * Jahren steht nicht darin, und im Browser zu filtern kann sie folglich nicht
 * finden — das Feld lieferte einfach kein Ergebnis, und nichts unterschied
 * das von „gibt es nicht". Nach der NUMMER lässt sich dagegen exakt fragen.
 *
 * Warum nur nach der Nummer und nicht nach Kunde und Adresse, steht in
 * `baustellenSuche.ts` und ist in `tests/unit/baustellenSuche.test.ts`
 * geprüft. Hier geht es um die Ansicht: fragt sie den Server, zeigt sie den
 * Treffer, und sagt sie vorher, wie weit sie reicht?
 */
describe('Baustellen — Suche über die Liste hinaus', () => {
  const geladene = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      ({
        id: `p${i}`,
        companyId: 'perl',
        projectNumber: `2026-${String(i).padStart(3, '0')}`,
        customerName: 'Familie Huber',
        status: 'Aktiv',
      }) as Project & { id: string },
    );

  /** Die alte, abgeschlossene Baustelle, die nur der Server kennt. */
  const ALT = {
    id: 'alt',
    companyId: 'perl',
    projectNumber: '2022-007',
    customerName: 'Hausverwaltung Berger',
    status: 'Abgeschlossen',
  } as Project & { id: string };

  it('fragt den Server bei JEDER Eingabe', async () => {
    baustellen = geladene(10);
    const nutzer = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    zeige();
    await nutzer.type(await screen.findByLabelText('Suche'), '2022-007');

    await waitFor(() => expect(gefragtMit).toHaveBeenCalledWith('perl', '2022-007'));
  });

  it('auch bei Kunde oder Adresse — und das ist der Gewinn', async () => {
    /*
      BIS ZUM 19.09. STAND HIER DAS GEGENTEIL: „fragt NICHT bei Kunde oder
      Adresse". Firestore konnte nur Anfänge einer sortierten Spalte
      vergleichen, also ging eine BAUSTELLENNUMMER an den Server und
      „Seestraße" nicht — eine Abfrage danach hätte verlässlich nichts
      gefunden und wäre ein falsches Versprechen über der örtlichen Suche
      gewesen.

      Die Datenbank sucht über Nummer, Kunde und Adresse, auch mitten im
      Wort. Mit der Einschränkung ist auch der Hinweissatz gefallen, der sie
      erklärte.
    */
    baustellen = geladene(10);
    const nutzer = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    zeige();
    await nutzer.type(await screen.findByLabelText('Suche'), 'Berger');

    await waitFor(() => expect(gefragtMit).toHaveBeenCalledWith('perl', 'Berger'));
    expect(screen.queryByText(/nur im geladenen Bestand/)).toBeNull();
  });

  it('zeigt die gefundene Baustelle, obwohl sie nicht geladen ist', async () => {
    baustellen = geladene(10);
    serverBaustellen = [ALT];
    const nutzer = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    zeige();
    await nutzer.type(await screen.findByLabelText('Suche'), '2022-007');

    expect(await screen.findByText(/Hausverwaltung Berger/)).toBeInTheDocument();
    expect(
      screen.getByText(/Eine Baustelle ausserhalb der geladenen Liste gefunden/),
    ).toBeInTheDocument();
  });

  it('lässt den Servertreffer am Statusfilter vorbei', async () => {
    /*
      Die Ansicht steht auf „Aktiv & pausiert"; die gesuchte alte Baustelle ist
      abgeschlossen. Sie deshalb zu verschweigen wäre wieder das leere
      Ergebnis, das wie ein Befund aussieht — und wer eine Nummer eintippt,
      meint genau diese Baustelle.
    */
    baustellen = geladene(10);
    serverBaustellen = [ALT];
    const nutzer = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    zeige();
    await nutzer.type(await screen.findByLabelText('Suche'), '2022-007');

    expect(await screen.findByText(/Hausverwaltung Berger/)).toBeInTheDocument();
  });

  it('zählt eine bereits geladene Baustelle nicht als Fund vom Server', async () => {
    // Sonst behauptete die Zeile einen Gewinn, den es nicht gab.
    baustellen = geladene(10);
    serverBaustellen = [baustellen[3]];
    const nutzer = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    zeige();
    await nutzer.type(await screen.findByLabelText('Suche'), '2026-003');

    await waitFor(() => expect(gefragtMit).toHaveBeenCalled());
    /*
      Genau die Zählzeile, nicht der Hinweis darüber: der kündigt die
      Serversuche an und enthält dieselben Worte. Ein zu weiter Ausdruck
      träfe ihn und wäre damit blind für das, was hier geprüft wird.
    */
    expect(screen.queryByText(/Baustellen? ausserhalb der geladenen Liste gefunden/))
      .not.toBeInTheDocument();
  });

  it('lässt bei einem Fehlschlag die örtliche Suche stehen', async () => {
    /*
      Was geladen ist, ist wegen eines gescheiterten Serveraufrufs nicht
      falsch. Die Liste zu leeren wäre der schlechtere Zustand: sie behauptete
      dann, es gebe die Baustelle nicht.
    */
    baustellen = geladene(10);
    serverFehler = true;
    const nutzer = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    zeige();
    await nutzer.type(await screen.findByLabelText('Suche'), '2026-003');

    // Die Zeile der Baustelle, nicht der Hinweis über dem Feld: dort steht die
    // Nummer in Klammern hinter dem Kundennamen.
    expect(await screen.findByText('(2026-003)')).toBeInTheDocument();
    expect(screen.queryByText(/Baustellen? ausserhalb der geladenen Liste gefunden/))
      .not.toBeInTheDocument();
  });
});

/**
 * WENN DIE KUNDENAUSWAHL AN IHRER GRENZE ENDET.
 *
 * `listCustomers` hatte schon immer eine Grenze — einen Standardwert von 500,
 * der nirgends stand. Damit war sie die einzige Liste, die noch
 * stillschweigend abschnitt: der Wächter `abfragegrenzen` liess sie durch,
 * weil sie eine Grenze HAT.
 *
 * Der Schaden wäre nicht die Kundenliste, sondern dieses Auswahlfeld: fehlt
 * ein Kunde, legt jemand die Baustelle ohne Kunden an oder tippt den Namen
 * von Hand — genau die Dublette, gegen die die Kundenstammdaten eingeführt
 * wurden.
 */
describe('Baustellen — Kundenauswahl an der Grenze', () => {
  it('sagt es, sobald die Grenze erreicht ist', async () => {
    kundenBestand = Array.from({ length: 500 }, (_, i) =>
      ({ id: `k${i}`, companyId: 'perl', name: `Kunde ${i}` }) as Customer & { id: string },
    );
    zeige();
    await formOeffnen();

    expect(await screen.findByText(/nur die ersten 500 Kunden/)).toBeInTheDocument();
  });

  it('schweigt bei einem gewöhnlichen Kundenstamm', async () => {
    zeige();
    await formOeffnen();
    await screen.findByLabelText('Kunde');
    expect(screen.queryByText(/nur die ersten/)).not.toBeInTheDocument();
  });
});
